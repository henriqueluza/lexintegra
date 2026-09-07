import { ForbiddenException, Injectable } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  STATUS_ANEXO_SEM_ARQUIVO,
  type AnexoResumo,
  type EnvioDeAnexos,
  type TipoAnexo,
} from 'shared';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { paraIso, SUBCOLECAO_ANEXOS } from '../pedidos/pedido.js';

interface DocumentoAnexo {
  nome: string;
  tipo: TipoAnexo;
  tamanhoBytes: number;
  status: typeof STATUS_ANEXO_SEM_ARQUIVO;
  enviadoPor: string;
  criadoEm: FieldValue;
}

const TETO = 100;

/**
 * ===================================================================
 * PLACEHOLDER DA ETAPA 9 — O UPLOAD DE VERDADE E A ETAPA 11.
 * ===================================================================
 *
 * Este servico grava METADADO: nome, tipo e tamanho declarados pelo navegador.
 * Nenhum byte vai para bucket nenhum, nenhuma URL assinada e emitida, e nada aqui
 * fala com o Cloud Storage.
 *
 * O QUE A ETAPA 11 ENCAIXA NESTE MESMO PONTO (ver `docs/plano-de-execucao.md`,
 * Etapa 11, e `docs/arquitetura.md` 7.3):
 *
 *   1. `registrar` passa a emitir URL assinada de escrita para o bucket de
 *      QUARENTENA, e o documento nasce com `status: 'pendente_upload'`.
 *   2. Uma confirmacao do navegador move o documento para `pendente_scan` e
 *      enfileira a varredura no Cloud Tasks.
 *   3. O veredito do ClamAV, mais a conferencia de magic bytes, leva o documento
 *      a `limpo` (com o objeto movido para o bucket de arquivos) ou o descarta.
 *
 * O `status` de agora NAO E, e nao pode virar, `limpo` — ver
 * `STATUS_ANEXO_SEM_ARQUIVO` em `packages/shared`. E a regra inviolavel 6
 * continuando a valer sobre um documento que ainda nao tem arquivo: quando a
 * emissao de link existir, ela vai perguntar pelo status, e o placeholder ja
 * responde "nao".
 *
 * QUEM ENVIA E SO O CLIENTE. A arquitetura 6.2 e explicita: sao dois fluxos de
 * upload distintos, com autorizacao e retencao proprias, e nao devem compartilhar
 * endpoint. O entregavel do advogado tem caminho proprio
 * (`EntregaveisService.registrarArquivo`) e nao passa por aqui.
 */
@Injectable()
export class AnexosService {
  constructor(private readonly acesso: AcessoPedidoService) {}

  async registrar(
    pedidoId: string,
    quem: QuemAcessa,
    envio: EnvioDeAnexos,
  ): Promise<AnexoResumo[]> {
    const { referencia, pedido } = await this.acesso.exigir(pedidoId, quem);

    /*
     * `exigir` ja recusou quem nao alcanca o pedido — mas ele deixa passar o
     * advogado atribuido e o administrador, que PODEM LER o cartao e nao podem
     * anexar documento de apoio em nome do cliente. Um anexo gravado por outra
     * pessoa apareceria na tela do cliente como se ele mesmo tivesse enviado.
     */
    if (quem.uid !== pedido.clienteId) {
      throw new ForbiddenException(
        'Apenas o cliente do pedido pode anexar arquivos de apoio.',
      );
    }

    const colecao = referencia.collection(SUBCOLECAO_ANEXOS);

    /*
     * Um `set` por anexo, sem transacao. Sao no maximo tres documentos
     * independentes: nao ha invariante entre eles que uma falha no meio quebre —
     * o cliente reenvia o que faltou, e o que entrou continua valendo. Uma
     * transacao aqui daria atomicidade sobre algo que nao precisa dela.
     */
    const gravados = await Promise.all(
      envio.anexos.map(async (anexo) => {
        const documento = colecao.doc();
        await documento.set({
          nome: anexo.nome,
          tipo: anexo.tipo,
          tamanhoBytes: anexo.tamanhoBytes,
          status: STATUS_ANEXO_SEM_ARQUIVO,
          enviadoPor: quem.uid,
          criadoEm: FieldValue.serverTimestamp(),
        } satisfies DocumentoAnexo);

        return {
          id: documento.id,
          nome: anexo.nome,
          tipo: anexo.tipo,
          tamanhoBytes: anexo.tamanhoBytes,
          status: STATUS_ANEXO_SEM_ARQUIVO,
          enviadoPor: quem.uid,
          criadoEm: null,
        } satisfies AnexoResumo;
      }),
    );

    return gravados;
  }

  /**
   * Lista os anexos do pedido. Alcancavel pelo cliente, pelo advogado atribuido e
   * pelo administrador — ler o que o cliente enviou e justamente o que o item
   * 2.6.2 pede que o advogado consiga fazer.
   */
  async listar(pedidoId: string, quem: QuemAcessa): Promise<AnexoResumo[]> {
    const { referencia } = await this.acesso.exigir(pedidoId, quem);

    const pagina = await referencia
      .collection(SUBCOLECAO_ANEXOS)
      .orderBy('criadoEm')
      .limit(TETO)
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoAnexo;
      return {
        id: documento.id,
        nome: dados.nome,
        tipo: dados.tipo,
        tamanhoBytes: dados.tamanhoBytes,
        status: dados.status,
        enviadoPor: dados.enviadoPor,
        criadoEm: paraIso(dados.criadoEm),
      };
    });
  }
}
