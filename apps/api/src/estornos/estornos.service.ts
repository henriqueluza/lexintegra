import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  podeEstornar,
  type EstadoEntregavel,
  type EstornoResumo,
} from 'shared';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  COLECAO_PAGAMENTOS,
  type DocumentoPagamento,
} from '../pagamentos/pagamento.js';
import {
  COLECAO_PEDIDOS,
  situacaoDe,
  type DocumentoPedido,
} from '../pedidos/pedido.js';
import {
  COLECAO_ESTORNOS,
  paraResumo,
  type DocumentoEstorno,
} from './estorno.js';

/** O que a transacao leu, antes de escrever qualquer coisa. */
interface Leitura {
  readonly pedido: DocumentoPedido;
  readonly estados: readonly EstadoEntregavel[];
  readonly irmaos: readonly DocumentSnapshot[];
  /** O estorno de cada OUTRO pedido da cobranca, se houver. */
  readonly estornosDosIrmaos: readonly {
    readonly pedidoId: string;
    readonly estorno: DocumentoEstorno | undefined;
  }[];
  readonly pagamento: DocumentoPagamento | undefined;
}

/**
 * O estorno (ADR-12): so com o pedido sem trabalho iniciado, decidido pelo
 * administrador, validado no SERVIDOR.
 *
 * "Tentativa de estorno com pedido em `em_elaboracao` e rejeitada no servidor" e
 * criterio de aceite da Etapa 8 — e a interface esconder o botao nao conta. A
 * elegibilidade sai de `podeEstornar`, a mesma funcao que a tela usa, lida DENTRO
 * da transacao: uma checagem antes dela poderia ler um pedido que o advogado
 * comecou a trabalhar no meio. `EntregaveisService` le a situacao do pedido na
 * transacao dele, e a corrida entre as duas termina com uma reexecutando.
 *
 * O GATEWAY SO ESTORNA A COBRANCA INTEIRA (errata do ADR-12 na Etapa 8). Entao:
 *
 * - estorno de um pedido isolado e REGISTRADO (`manual_pendente`), e o escritorio
 *   devolve o valor por fora; `registrarExecucaoManual` anota a devolucao;
 * - quando o ultimo pedido da cobranca e estornado — e nenhum estorno anterior ja
 *   foi devolvido a mao, senao o integral devolveria duas vezes —, os pendentes
 *   manuais sao absorvidos e o estorno integral nasce no OUTBOX, na mesma
 *   transacao (regra inviolavel 3). Nenhuma chamada ao gateway sai daqui (regra
 *   inviolavel 20): quem chama e o despachante, com arrendamento e reentrega.
 */
@Injectable()
export class EstornosService {
  private readonly log = new Logger('Estornos');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
  ) {}

  async estornar(
    pedidoId: string,
    motivo: string,
    adminUid: string,
  ): Promise<EstornoResumo> {
    const resultado = await this.db.runTransaction(async (transacao) => {
      const leitura = await this.ler(transacao, pedidoId);
      const integral = this.ehIntegral(pedidoId, leitura);
      const idEvento = integral
        ? await this.registrarIntegral(transacao, leitura)
        : null;

      const estorno = this.escrever(transacao, pedidoId, leitura, {
        motivo,
        adminUid,
        integral,
      });
      return { estorno, idEvento };
    });

    if (resultado.idEvento !== null) {
      await this.enfileirador.enfileirarPorId(resultado.idEvento);
    }
    this.log.log(
      `pedido ${pedidoId} estornado por ${adminUid} (${resultado.estorno.execucao})`,
    );
    return paraResumo(resultado.estorno);
  }

  /** O escritorio devolveu o valor por fora do gateway, e o administrador registra. */
  async registrarExecucaoManual(
    pedidoId: string,
    adminUid: string,
    observacao: string,
  ): Promise<EstornoResumo> {
    return this.db.runTransaction(async (transacao) => {
      const referencia = this.referencia(pedidoId);
      const atual = (await transacao.get(referencia)).data() as
        DocumentoEstorno | undefined;

      if (atual === undefined) {
        throw new NotFoundException('Estorno nao encontrado.');
      }
      if (atual.execucao !== 'manual_pendente') {
        throw new ConflictException(
          `Este estorno nao esta pendente de devolucao manual (${atual.execucao}).`,
        );
      }

      const atualizado: DocumentoEstorno = {
        ...atual,
        execucao: 'manual_executado',
        executadoPor: adminUid,
        executadoEm: FieldValue.serverTimestamp(),
        observacao,
      };
      transacao.set(referencia, atualizado);
      return paraResumo(atualizado);
    });
  }

  /** O painel: o que o escritorio ainda precisa devolver a mao. */
  async listarPendentes(): Promise<EstornoResumo[]> {
    const pagina = await this.db
      .collection(COLECAO_ESTORNOS)
      .where('execucao', '==', 'manual_pendente')
      .orderBy('solicitadoEm', 'desc')
      .limit(200)
      .get();
    return pagina.docs.map((documento) =>
      paraResumo(documento.data() as DocumentoEstorno),
    );
  }

  /**
   * TODA LEITURA ANTES DE TODA ESCRITA. O pedido, os entregaveis dele, os pedidos
   * da mesma cobranca, os estornos desses pedidos e o pagamento — e so depois a
   * decisao.
   */
  private async ler(
    transacao: Transaction,
    pedidoId: string,
  ): Promise<Leitura> {
    const documento = await transacao.get(
      this.db.collection(COLECAO_PEDIDOS).doc(pedidoId),
    );
    if (!documento.exists)
      throw new NotFoundException('Pedido nao encontrado.');
    const pedido = documento.data() as DocumentoPedido;

    const entregaveis = await transacao.get(
      documento.ref.collection(SUBCOLECAO_ENTREGAVEIS),
    );
    if ((await transacao.get(this.referencia(pedidoId))).exists) {
      throw new ConflictException('Este pedido ja foi estornado.');
    }

    const irmaos = await transacao.get(
      this.db
        .collection(COLECAO_PEDIDOS)
        .where('pagamentoId', '==', pedido.pagamentoId),
    );
    const estornosDosIrmaos: Leitura['estornosDosIrmaos'][number][] = [];
    for (const irmao of irmaos.docs) {
      if (irmao.id === pedidoId) continue;
      const estorno = await transacao.get(this.referencia(irmao.id));
      estornosDosIrmaos.push({
        pedidoId: irmao.id,
        estorno: estorno.data() as DocumentoEstorno | undefined,
      });
    }

    const pagamento = await transacao.get(
      this.db.collection(COLECAO_PAGAMENTOS).doc(pedido.pagamentoId),
    );

    return {
      pedido,
      estados: entregaveis.docs.map(
        (e) => (e.data() as DocumentoEntregavel).estado,
      ),
      irmaos: irmaos.docs,
      estornosDosIrmaos,
      pagamento: pagamento.data() as DocumentoPagamento | undefined,
    };
  }

  /**
   * Integral quando TODOS os outros pedidos da cobranca ja estao estornados e
   * NENHUM estorno anterior foi devolvido a mao — um devolvido a mao mais o
   * integral seria dinheiro devolvido duas vezes. E so para pagamento confirmado,
   * que e o unico com cobranca a estornar.
   */
  private ehIntegral(pedidoId: string, leitura: Leitura): boolean {
    this.exigirElegivel(leitura);
    const outros = leitura.irmaos.filter((irmao) => irmao.id !== pedidoId);
    return (
      leitura.pagamento?.situacao === 'confirmado' &&
      outros.every(
        (irmao) => situacaoDe(irmao.data() as DocumentoPedido) === 'estornado',
      ) &&
      leitura.estornosDosIrmaos.every(
        ({ estorno }) => estorno?.execucao !== 'manual_executado',
      )
    );
  }

  private exigirElegivel(leitura: Leitura): void {
    if (!podeEstornar(situacaoDe(leitura.pedido), leitura.estados)) {
      throw new ConflictException(
        'Estorno so e permitido com o pedido em solicitado, sem trabalho ' +
          'iniciado (ADR-12).',
      );
    }
  }

  private async registrarIntegral(
    transacao: Transaction,
    leitura: Leitura,
  ): Promise<string> {
    const pagamento = leitura.pagamento as DocumentoPagamento;
    return this.outbox.registrarSeAusente(transacao, {
      tipo: 'estorno-integral',
      destinatarioUid: leitura.pedido.clienteId,
      estorno: {
        pagamentoId: leitura.pedido.pagamentoId,
        cobrancaId: pagamento.cobrancaId,
        origem: pagamento.origem,
      },
    });
  }

  private escrever(
    transacao: Transaction,
    pedidoId: string,
    leitura: Leitura,
    decisao: { motivo: string; adminUid: string; integral: boolean },
  ): DocumentoEstorno {
    const { pedido } = leitura;
    const estorno: DocumentoEstorno = {
      pedidoId,
      pagamentoId: pedido.pagamentoId,
      clienteId: pedido.clienteId,
      produto: pedido.snapshot.nome,
      valorCentavos: pedido.snapshot.precoCentavos,
      motivo: decisao.motivo,
      execucao: decisao.integral ? 'gateway_pendente' : 'manual_pendente',
      solicitadoPor: decisao.adminUid,
      solicitadoEm: FieldValue.serverTimestamp(),
    };

    transacao.create(this.referencia(pedidoId), estorno);
    transacao.update(this.db.collection(COLECAO_PEDIDOS).doc(pedidoId), {
      situacao: 'estornado',
      estornadoEm: FieldValue.serverTimestamp(),
      estornadoPor: decisao.adminUid,
    });

    if (decisao.integral) {
      this.absorverPendentes(transacao, leitura);
      transacao.update(
        this.db.collection(COLECAO_PAGAMENTOS).doc(pedido.pagamentoId),
        { estornoGateway: 'solicitado' },
      );
    }
    return estorno;
  }

  /** Os estornos manuais ainda pendentes passam a ser cobertos pelo integral. */
  private absorverPendentes(transacao: Transaction, leitura: Leitura): void {
    for (const { pedidoId, estorno } of leitura.estornosDosIrmaos) {
      if (estorno?.execucao !== 'manual_pendente') continue;
      transacao.update(this.referencia(pedidoId), {
        execucao: 'gateway_pendente',
      });
    }
  }

  private referencia(pedidoId: string): DocumentReference {
    return this.db.collection(COLECAO_ESTORNOS).doc(pedidoId);
  }
}
