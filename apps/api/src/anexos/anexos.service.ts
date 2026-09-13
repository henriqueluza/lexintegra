import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import {
  conferirPolitica,
  POLITICA_UPLOAD,
  prefixoDoFluxo,
  type AnexoResumo,
  type PedidoDeUpload,
} from 'shared';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';
import type { DocumentoArquivo } from '../arquivos/arquivo.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { paraIso, SUBCOLECAO_ANEXOS } from '../pedidos/pedido.js';
import { FILA_DE_VARREDURA, type FilaDeVarredura } from '../varredura/fila.js';

const FLUXO = 'anexo-cliente' as const;

/** Dez minutos para o navegador subir o arquivo. Curto o bastante para uma URL
 * vazada nao valer amanha; longo o bastante para 5 MB numa conexao ruim. */
const VALIDADE_DA_ESCRITA_SEGUNDOS = 600;

const TETO = 100;

/**
 * PRIMEIRO dos dois fluxos de upload: os arquivos de apoio do CLIENTE
 * (item 2.3.3, arquitetura 6.2 e 7.3).
 *
 * O ARQUIVO NUNCA PASSA PELA API. O navegador recebe uma URL assinada e escreve
 * DIRETO no bucket de quarentena — o que economiza exatamente o recurso que o
 * Cloud Run cobra. A API emite, valida e decide; ela nao transporta bytes.
 *
 * O QUE SEPARA ESTE FLUXO DO ENTREGAVEL DO ADVOGADO (arquitetura 6.2: "nao devem
 * compartilhar o mesmo endpoint nem o mesmo bucket logico"):
 *
 *   - autorizacao: aqui e o CLIENTE DO PEDIDO; la, o advogado atribuido;
 *   - politica: aqui jpg/pdf, 5 MB, 3 por envio — CONFIRMADA na reuniao; la,
 *     provisoria (0.2, item 6);
 *   - prefixo: `anexos/{pedidoId}/`; la, `entregaveis/{pedidoId}/{id}/`;
 *   - efeito: aqui, nenhum sobre o estado do entregavel; la, versao nova;
 *   - retencao: a dos entregaveis e de 30 dias a partir de `entregue`; a DESTES
 *     nao esta definida em lugar nenhum, e e pendencia do controlador — por isso
 *     o job de retencao nao os toca.
 */
@Injectable()
export class AnexosService {
  constructor(
    private readonly acesso: AcessoPedidoService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
    @Inject(FILA_DE_VARREDURA) private readonly fila: FilaDeVarredura,
  ) {}

  /**
   * Emite as URLs de escrita e cria os registros em `pendente_upload`.
   *
   * O REGISTRO NASCE ANTES DO ARQUIVO. Um objeto no bucket sem documento
   * correspondente e um arquivo que ninguem sabe de quem e — e que nenhum job de
   * retencao alcanca. Na ordem inversa, uma falha entre as duas escritas deixaria
   * lixo permanente na quarentena.
   */
  async pedirEnvio(
    pedidoId: string,
    quem: QuemAcessa,
    arquivos: readonly PedidoDeUpload[],
  ): Promise<{ id: string; url: string; validoPorSegundos: number }[]> {
    const { referencia, pedido } = await this.acesso.exigir(pedidoId, quem);

    /*
     * `exigir` deixa passar o advogado atribuido e o administrador, que PODEM LER
     * o cartao. Anexar em nome do cliente e outra coisa: o arquivo apareceria na
     * tela dele como se ele mesmo tivesse enviado.
     */
    if (quem.uid !== pedido.clienteId) {
      throw new ForbiddenException(
        'Apenas o cliente do pedido pode anexar arquivos de apoio.',
      );
    }

    /*
     * A validacao do SERVIDOR, contra a politica DESTE fluxo. A tela valida antes
     * com a mesma funcao, mas o `POST` e alcancavel com curl — e a URL assinada
     * que sai daqui carrega tipo e tamanho maximo na assinatura, entao um pedido
     * aceito aqui e o teto que o Cloud Storage vai impor.
     */
    const problema = conferirPolitica(FLUXO, arquivos);
    if (problema !== null) throw new BadRequestException(problema);

    const colecao = referencia.collection(SUBCOLECAO_ANEXOS);

    return Promise.all(
      arquivos.map(async (arquivo) => {
        const documento = colecao.doc();
        const caminho = `${prefixoDoFluxo(FLUXO, pedidoId)}/${documento.id}`;

        await documento.set({
          nome: arquivo.nome,
          tipo: arquivo.tipo,
          tamanhoBytes: arquivo.tamanhoBytes,
          estado: 'pendente_upload',
          fluxo: FLUXO,
          caminho,
          enviadoPor: quem.uid,
          criadoEm: FieldValue.serverTimestamp(),
        } satisfies DocumentoArquivo);

        const url = await this.armazenamento.urlDeEscrita({
          objeto: { balde: 'quarentena', caminho },
          tipo: arquivo.tipo,
          tamanhoMaximoBytes: POLITICA_UPLOAD[FLUXO].tamanhoMaximoBytes,
          validadeSegundos: VALIDADE_DA_ESCRITA_SEGUNDOS,
        });

        return {
          id: documento.id,
          url,
          validoPorSegundos: VALIDADE_DA_ESCRITA_SEGUNDOS,
        };
      }),
    );
  }

  /**
   * O navegador confirma que subiu. Passa a `pendente_scan` e enfileira.
   *
   * A CONFIRMACAO E DO NAVEGADOR e nao um gatilho do bucket, e isso e uma
   * escolha: um gatilho do Cloud Storage seria um segundo artefato de deploy com
   * logica de dominio (arquitetura 3.1), que e justamente o que a API unica
   * evita. O preco e um arquivo que sobe e nunca e confirmado — e a regra de
   * ciclo de vida de 7 dias da quarentena, ja declarada no Terraform, o varre.
   */
  async confirmarEnvio(
    pedidoId: string,
    anexoId: string,
    quem: QuemAcessa,
  ): Promise<void> {
    const { referencia, pedido } = await this.acesso.exigir(pedidoId, quem);

    if (quem.uid !== pedido.clienteId) {
      throw new ForbiddenException(
        'Apenas o cliente do pedido pode confirmar o envio.',
      );
    }

    const alvo = referencia.collection(SUBCOLECAO_ANEXOS).doc(anexoId);
    const documento = await alvo.get();
    if (!documento.exists) throw new NotFoundException('Anexo nao encontrado.');

    const anexo = documento.data() as DocumentoArquivo;

    await alvo.update({
      estado: 'pendente_scan',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // Depois do commit, nunca dentro (regra inviolavel 2).
    await this.fila.enfileirar({
      fluxo: FLUXO,
      pedidoId,
      alvoId: anexoId,
      caminho: anexo.caminho,
    });
  }

  async listar(pedidoId: string, quem: QuemAcessa): Promise<AnexoResumo[]> {
    const { referencia } = await this.acesso.exigir(pedidoId, quem);

    const pagina = await referencia
      .collection(SUBCOLECAO_ANEXOS)
      .orderBy('criadoEm')
      .limit(TETO)
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as DocumentoArquivo;
      return {
        id: documento.id,
        nome: dados.nome,
        tipo: dados.tipo,
        tamanhoBytes: dados.tamanhoBytes,
        estado: dados.estado,
        enviadoPor: dados.enviadoPor,
        criadoEm: paraIso(dados.criadoEm),
      };
    });
  }
}
