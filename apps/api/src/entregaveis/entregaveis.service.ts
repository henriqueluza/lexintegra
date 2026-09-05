import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  TRANSICAO_DO_EVENTO,
  transicaoPermitida,
  type EventoDeTransicao,
} from 'shared';
import { COLECAO_PEDIDOS } from '../pedidos/pedidos.service.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  idDaTransicao,
  SUBCOLECAO_ENTREGAVEIS,
  SUBCOLECAO_TRANSICOES,
  type ArquivoEntregavel,
  type DocumentoEntregavel,
  type DocumentoTransicao,
  type EntregavelResumo,
} from './entregavel.js';

interface Alvo {
  readonly pedidoId: string;
  readonly entregavelId: string;
}

interface Contexto {
  readonly entregavel: DocumentoEntregavel;
  readonly clienteId: string;
  readonly revisoesPermitidas: number;
}

/**
 * A maquina de estados do entregavel (ADR-11, regra inviolavel 14).
 *
 * NAO EXISTE `mudarEstado(destino)`. O servico so aceita EVENTOS DE DOMINIO, e a
 * aresta de cada um vem de `TRANSICAO_DO_EVENTO`, em `packages/shared`. E a
 * diferenca entre "mude para entregue" — que e a transicao manual que o ADR-11
 * proibe — e "o cliente confirmou".
 *
 * `entregue` tem DUAS travas, e as duas sao necessarias:
 *
 *   1. so e alcancavel a partir de `em_elaboracao`, com `arquivoAtual` existindo.
 *      No diagrama do ADR-11, "cliente revisa o PDF" nao e estado: o upload nao
 *      transiciona, entao sem o campo a confirmacao seria aceita num entregavel
 *      que nunca teve arquivo.
 *   2. so o CLIENTE DO PEDIDO pode dispara-la. Advogado e administrador nao tem
 *      caminho — nao por convencao de rota, mas porque o servico compara
 *      `atorUid` com `pedido.clienteId` dentro da transacao.
 *
 * Nenhum efeito colateral dentro da transacao (regra inviolavel 2): so escrita de
 * documento e de trilha. Notificacao ao advogado no pedido de revisao e evento de
 * outbox da Etapa 7, quando existir o template do e-mail — registrar o tipo agora
 * produziria documento de outbox que nunca sai.
 */
@Injectable()
export class EntregaveisService {
  private readonly log = new Logger('Entregaveis');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /** Advogado comeca o trabalho: `solicitado` -> `em_elaboracao`. */
  iniciarTrabalho(alvo: Alvo, advogadoUid: string): Promise<EntregavelResumo> {
    return this.aplicar('iniciar-trabalho', alvo, advogadoUid);
  }

  /** Advogado retoma depois de revisao pedida: `em_revisao` -> `em_elaboracao`. */
  retomarTrabalho(alvo: Alvo, advogadoUid: string): Promise<EntregavelResumo> {
    return this.aplicar('retomar-trabalho', alvo, advogadoUid);
  }

  /** Cliente confirma: `em_elaboracao` -> `entregue`. Estado final. */
  confirmarEntrega(alvo: Alvo, clienteUid: string): Promise<EntregavelResumo> {
    return this.aplicar('confirmar-entrega', alvo, clienteUid);
  }

  /** Cliente pede revisao: `em_elaboracao` -> `em_revisao`, consumindo saldo. */
  pedirRevisao(alvo: Alvo, clienteUid: string): Promise<EntregavelResumo> {
    return this.aplicar('pedir-revisao', alvo, clienteUid);
  }

  /**
   * Upload do advogado. NAO muda estado, e por isso nao escreve em `transicoes` —
   * a trilha registra mudanca de estado, e `arquivoAtual.versao` e a trilha do
   * arquivo.
   *
   * O caminho no bucket, o hash e o resultado do antivirus sao da Etapa 11. O que
   * existe aqui e o fato de dominio de que o ADR-11 depende: ha versao entregue
   * esperando o cliente decidir.
   */
  async registrarArquivo(
    alvo: Alvo,
    arquivo: { nome: string },
    advogadoUid: string,
  ): Promise<EntregavelResumo> {
    return this.db.runTransaction(async (transacao) => {
      const referencia = this.referencia(alvo);
      const { entregavel } = await this.ler(transacao, alvo);

      if (entregavel.estado !== 'em_elaboracao') {
        throw new ConflictException(
          `So e possivel enviar arquivo com o entregavel em elaboracao; ele esta em ${entregavel.estado}.`,
        );
      }

      const arquivoAtual: ArquivoEntregavel = {
        nome: arquivo.nome,
        versao: (entregavel.arquivoAtual?.versao ?? 0) + 1,
        enviadoPor: advogadoUid,
        enviadoEm: FieldValue.serverTimestamp(),
      };

      transacao.update(referencia, {
        arquivoAtual,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      this.log.log(
        `entregavel ${alvo.pedidoId}/${alvo.entregavelId} recebeu a versao ${arquivoAtual.versao}`,
      );
      return resumo(alvo.entregavelId, { ...entregavel, arquivoAtual });
    });
  }

  private async aplicar(
    evento: EventoDeTransicao,
    alvo: Alvo,
    atorUid: string,
  ): Promise<EntregavelResumo> {
    const { de, para } = TRANSICAO_DO_EVENTO[evento];

    return this.db.runTransaction(async (transacao) => {
      const contexto = await this.ler(transacao, alvo);
      const { entregavel } = contexto;

      if (entregavel.estado !== de || !transicaoPermitida(de, para)) {
        throw new ConflictException(
          `Nao e possivel ${evento} com o entregavel em ${entregavel.estado}.`,
        );
      }

      this.conferirGuardas(evento, contexto, atorUid);

      const sequencia = entregavel.transicoes + 1;
      const referencia = this.referencia(alvo);

      transacao.update(referencia, {
        estado: para,
        revisoesUsadas:
          evento === 'pedir-revisao'
            ? entregavel.revisoesUsadas + 1
            : entregavel.revisoesUsadas,
        transicoes: sequencia,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      /*
       * `create` e nao `set`: o id sai do contador lido nesta transacao, entao
       * duas chamadas concorrentes calculam a MESMA sequencia e a segunda estoura
       * em vez de sobrescrever a trilha da primeira (regra inviolavel 4).
       */
      transacao.create(
        referencia
          .collection(SUBCOLECAO_TRANSICOES)
          .doc(idDaTransicao(sequencia)),
        {
          de: entregavel.estado,
          para,
          evento,
          por: 'sistema',
          atorUid,
          em: FieldValue.serverTimestamp(),
        } satisfies DocumentoTransicao,
      );

      this.log.log(
        `entregavel ${alvo.pedidoId}/${alvo.entregavelId}: ${de} -> ${para} por ${evento}`,
      );

      return resumo(alvo.entregavelId, {
        ...entregavel,
        estado: para,
        revisoesUsadas:
          evento === 'pedir-revisao'
            ? entregavel.revisoesUsadas + 1
            : entregavel.revisoesUsadas,
      });
    });
  }

  /**
   * As guardas que a maquina de estados sozinha nao expressa.
   *
   * Estao aqui e nao na interface porque a interface esconde botao, e esconder
   * botao nao impede uma chamada com curl. O ADR-11 e explicito: a contagem de
   * revisoes usadas e validada no servidor.
   */
  private conferirGuardas(
    evento: EventoDeTransicao,
    contexto: Contexto,
    atorUid: string,
  ): void {
    if (evento === 'iniciar-trabalho' || evento === 'retomar-trabalho') return;

    if (atorUid !== contexto.clienteId) {
      throw new ForbiddenException(
        'Apenas o cliente do pedido pode confirmar a entrega ou pedir revisao.',
      );
    }

    if (contexto.entregavel.arquivoAtual === null) {
      throw new ConflictException(
        'O entregavel ainda nao tem arquivo enviado pelo advogado.',
      );
    }

    if (
      evento === 'pedir-revisao' &&
      contexto.entregavel.revisoesUsadas >= contexto.revisoesPermitidas
    ) {
      throw new ConflictException(
        `Saldo de revisoes esgotado: ${contexto.revisoesPermitidas} contratada(s).`,
      );
    }
  }

  /**
   * Le entregavel e pedido, nesta ordem e sempre os dois, ANTES de qualquer
   * escrita — o Firestore recusa leitura depois de escrita na transacao. Ler o
   * pedido so quando o evento e do cliente economizaria uma leitura e criaria um
   * caminho em que a ordem depende do evento, que e onde esse erro nasce.
   */
  private async ler(transacao: Transaction, alvo: Alvo): Promise<Contexto> {
    const documento = await transacao.get(this.referencia(alvo));
    const documentoPedido = await transacao.get(
      this.db.collection(COLECAO_PEDIDOS).doc(alvo.pedidoId),
    );

    if (!documento.exists || !documentoPedido.exists) {
      throw new NotFoundException('Entregavel nao encontrado.');
    }

    const dadosPedido = documentoPedido.data() as {
      clienteId: string;
      snapshot: { numeroRevisoesPermitidas: number };
    };

    return {
      entregavel: documento.data() as DocumentoEntregavel,
      clienteId: dadosPedido.clienteId,
      /*
       * O saldo vem do SNAPSHOT do pedido, nunca do produto vivo (regra
       * inviolavel 5). Um cliente que comprou com duas revisoes contratadas
       * continua com duas mesmo que o administrador mude o catalogo para cinco.
       */
      revisoesPermitidas: dadosPedido.snapshot.numeroRevisoesPermitidas,
    };
  }

  private referencia(alvo: Alvo): DocumentReference {
    return this.db
      .collection(COLECAO_PEDIDOS)
      .doc(alvo.pedidoId)
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .doc(alvo.entregavelId);
  }
}

function resumo(id: string, dados: DocumentoEntregavel): EntregavelResumo {
  return {
    id,
    nome: dados.nome,
    ordem: dados.ordem,
    estado: dados.estado,
    revisoesUsadas: dados.revisoesUsadas,
    temArquivo: dados.arquivoAtual !== null,
  };
}
