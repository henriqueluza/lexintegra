import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  conferirPolitica,
  POLITICA_UPLOAD,
  prefixoDoFluxo,
  type PedidoDeUpload,
} from 'shared';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_PEDIDOS } from '../pedidos/pedido.js';
import { FILA_DE_VARREDURA, type FilaDeVarredura } from '../varredura/fila.js';
import { EntregaveisService } from './entregaveis.service.js';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from './entregavel.js';

const FLUXO = 'entregavel-advogado' as const;

/** Mais tempo que o anexo do cliente: o teto deste fluxo e maior. */
const VALIDADE_DA_ESCRITA_SEGUNDOS = 900;

/**
 * SEGUNDO dos dois fluxos de upload: o ENTREGAVEL, enviado pelo advogado
 * (arquitetura 6.2 e 7.3).
 *
 * SERVICO PROPRIO, E NAO UM PARAMETRO EM `AnexosService`. A arquitetura 6.2 e
 * explicita: "sao dois fluxos de upload distintos, com regras de autorizacao e de
 * retencao proprias, e nao devem compartilhar o mesmo endpoint nem o mesmo bucket
 * logico". O que difere:
 *
 *   - quem envia: o advogado ATRIBUIDO (conferido dentro da transacao por
 *     `EntregaveisService`), nao o cliente;
 *   - efeito: grava `arquivoAtual` e sobe a VERSAO — o anexo nao tem efeito
 *     nenhum sobre o estado do entregavel;
 *   - prefixo: `entregaveis/{pedidoId}/{entregavelId}/`;
 *   - retencao: 30 dias a partir de `entregue` (a do anexo nao esta definida);
 *   - politica: ⚠️ PROVISORIA — ver `POLITICA_UPLOAD` em `packages/shared`, e o
 *     item 6 da secao 0.2 do plano de execucao. jpg/pdf/5 MB vale para o CLIENTE.
 *
 * O que os dois COMPARTILHAM, por regra: a porta de armazenamento e o portao de
 * leitura. O portao e a ponta oposta — quem serve, nao quem envia — e a regra
 * inviolavel 6 manda a checagem de `limpo` viver num lugar unico.
 */
@Injectable()
export class UploadDeEntregavelService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
    @Inject(FILA_DE_VARREDURA) private readonly fila: FilaDeVarredura,
    private readonly entregaveis: EntregaveisService,
  ) {}

  /**
   * Emite a URL de escrita e grava `arquivoAtual` em `pendente_upload`.
   *
   * `registrarArquivo` faz a conferencia de estado e de ATRIBUICAO dentro da
   * transacao — e por isso ele e chamado antes de a URL sair. Emitir primeiro e
   * conferir depois entregaria uma URL de escrita valida a um advogado que a
   * transacao vai recusar.
   */
  async pedirEnvio(
    alvo: { pedidoId: string; entregavelId: string },
    advogadoUid: string,
    arquivo: PedidoDeUpload,
  ): Promise<{ url: string; versao: number; validoPorSegundos: number }> {
    const problema = conferirPolitica(FLUXO, [arquivo]);
    if (problema !== null) throw new BadRequestException(problema);

    /*
     * O caminho inclui a VERSAO, que so se conhece depois de gravar. Por isso a
     * gravacao vem primeiro e o caminho e montado a partir do resultado dela —
     * versoes diferentes do mesmo entregavel sao objetos diferentes, e nao
     * sobrescrita. Sobrescrever apagaria o arquivo que o cliente ja aceitou.
     */
    const versao = await this.proximaVersao(alvo);
    const caminho = `${prefixoDoFluxo(FLUXO, alvo.pedidoId, alvo.entregavelId)}/v${String(versao)}`;

    await this.entregaveis.registrarArquivo(
      alvo,
      {
        nome: arquivo.nome,
        tipo: arquivo.tipo,
        tamanhoBytes: arquivo.tamanhoBytes,
        caminho,
      },
      advogadoUid,
    );

    const url = await this.armazenamento.urlDeEscrita({
      objeto: { balde: 'quarentena', caminho },
      tipo: arquivo.tipo,
      tamanhoMaximoBytes: POLITICA_UPLOAD[FLUXO].tamanhoMaximoBytes,
      validadeSegundos: VALIDADE_DA_ESCRITA_SEGUNDOS,
    });

    return { url, versao, validoPorSegundos: VALIDADE_DA_ESCRITA_SEGUNDOS };
  }

  async confirmarEnvio(
    alvo: { pedidoId: string; entregavelId: string },
    advogadoUid: string,
  ): Promise<void> {
    const referencia = this.referencia(alvo);
    const documento = await referencia.get();
    if (!documento.exists) {
      throw new NotFoundException('Entregavel nao encontrado.');
    }

    const arquivo = (documento.data() as DocumentoEntregavel).arquivoAtual;
    if (arquivo === null) {
      throw new ConflictException('Nenhum envio pendente neste entregavel.');
    }

    /*
     * So quem enviou confirma. Sem isto, outro advogado — ou o mesmo, numa
     * requisicao repetida fora de ordem — poderia confirmar um envio que nao fez,
     * enfileirando varredura de um objeto que talvez nem exista.
     */
    if (arquivo.enviadoPor !== advogadoUid) {
      throw new ConflictException(
        'Apenas quem enviou o arquivo pode confirmar o envio.',
      );
    }

    await referencia.update({
      'arquivoAtual.estado': 'pendente_scan',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    await this.fila.enfileirar({
      fluxo: FLUXO,
      pedidoId: alvo.pedidoId,
      alvoId: alvo.entregavelId,
      caminho: arquivo.caminho,
    });
  }

  private async proximaVersao(alvo: {
    pedidoId: string;
    entregavelId: string;
  }): Promise<number> {
    const documento = await this.referencia(alvo).get();
    if (!documento.exists) {
      throw new NotFoundException('Entregavel nao encontrado.');
    }

    const atual = (documento.data() as DocumentoEntregavel).arquivoAtual;
    return (atual?.versao ?? 0) + 1;
  }

  private referencia(alvo: {
    pedidoId: string;
    entregavelId: string;
  }): FirebaseFirestore.DocumentReference {
    return this.db
      .collection(COLECAO_PEDIDOS)
      .doc(alvo.pedidoId)
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .doc(alvo.entregavelId);
  }
}
