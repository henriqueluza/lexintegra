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
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import type { EstornoResumo } from 'shared';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { NovoEvento } from '../outbox/evento.js';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  COLECAO_PAGAMENTOS,
  type DocumentoPagamento,
} from '../pagamentos/pagamento.js';
import {
  escreverProdutosContratados,
  escreverReunioesCanceladas,
  eventosDasReunioesCanceladas,
  futurasACancelar,
  lerProdutosDoCliente,
  lerReunioes,
  versaoDasReunioes,
  type ReuniaoLida,
} from '../pedidos/encerramento.js';
import { exigirSemContestacao } from '../pedidos/pausa.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';
import { agora as agora_ } from '../relogio.js';
import {
  ehIntegral,
  eventoIntegral,
  exigirElegivel,
  type Leitura,
} from './decisao.js';
import {
  COLECAO_ESTORNOS,
  paraResumo,
  type DocumentoEstorno,
} from './estorno.js';

/**
 * O estorno (ADR-12 e `docs/decisoes.md`, 3.3): decidido pelo administrador,
 * validado no SERVIDOR, e so com as tres condicoes juntas — pedido em
 * `solicitado` (nenhum trabalho iniciado, e portanto nenhum entregavel enviado),
 * nenhuma reuniao com inicio ja passado, e o pedido fora de contestacao. Anexos
 * do cliente nao bloqueiam. A recusa diz qual condicao falhou.
 *
 * O QUE VAI JUNTO, na mesma transacao: as reunioes futuras do pedido
 * (canceladas com devolucao) e o produto em `produtosContratados`, a nao ser que
 * outro pedido ativo do cliente o tenha.
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
    agora: number = agora_(),
  ): Promise<EstornoResumo> {
    const resultado = await this.db.runTransaction(async (transacao) => {
      const leitura = await this.ler(transacao, pedidoId);
      exigirElegivel(leitura, agora);
      const integral = ehIntegral(pedidoId, leitura);
      const futuras = futurasACancelar(leitura.reunioes, agora);

      /*
       * UM LOTE SO para o outbox: o integral e os `METHOD:CANCEL` das futuras.
       * Dois registros seguidos poriam a leitura do segundo depois da escrita
       * do primeiro, e o Firestore recusa a transacao inteira.
       */
      const novos: NovoEvento[] = [
        ...(integral ? [eventoIntegral(leitura)] : []),
        ...eventosDasReunioesCanceladas(pedidoId, futuras),
      ];
      const eventos =
        novos.length === 0
          ? []
          : await this.outbox.registrarSeAusenteEmLote(transacao, novos);

      const estorno = this.escrever(transacao, pedidoId, leitura, {
        motivo,
        adminUid,
        integral,
        futuras,
        agora,
      });
      return { estorno, eventos };
    });

    for (const id of resultado.eventos) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(id);
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
      const [estornoDoc, pedidoDoc] = [
        await transacao.get(referencia),
        await transacao.get(this.db.collection(COLECAO_PEDIDOS).doc(pedidoId)),
      ];
      const atual = estornoDoc.data() as DocumentoEstorno | undefined;

      if (atual === undefined) {
        throw new NotFoundException('Estorno nao encontrado.');
      }
      /*
       * Pausado por contestacao, nem a devolucao manual se registra: se o
       * cliente ganhar o chargeback, o dinheiro volta pelo meio de pagamento, e
       * registrar uma devolucao manual agora seria devolver duas vezes.
       */
      const pedido = pedidoDoc.data() as DocumentoPedido | undefined;
      if (pedido !== undefined) exigirSemContestacao(pedido);
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
    const reunioes = await lerReunioes(transacao, documento.ref);
    const produtos = await lerProdutosDoCliente(
      transacao,
      this.db,
      pedido.clienteId,
    );

    return {
      reunioes,
      produtos,
      pedido,
      estados: entregaveis.docs.map(
        (e) => (e.data() as DocumentoEntregavel).estado,
      ),
      irmaos: irmaos.docs,
      estornosDosIrmaos,
      pagamento: pagamento.data() as DocumentoPagamento | undefined,
    };
  }

  private escrever(
    transacao: Transaction,
    pedidoId: string,
    leitura: Leitura,
    decisao: {
      motivo: string;
      adminUid: string;
      integral: boolean;
      futuras: readonly ReuniaoLida[];
      agora: number;
    },
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

    const pedidoRef = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    transacao.create(this.referencia(pedidoId), estorno);
    transacao.update(pedidoRef, {
      situacao: 'estornado',
      estornadoEm: FieldValue.serverTimestamp(),
      estornadoPor: decisao.adminUid,
      ...versaoDasReunioes(decisao.futuras),
    });
    escreverReunioesCanceladas(
      transacao,
      this.db,
      pedidoRef,
      decisao.futuras,
      decisao.adminUid,
      decisao.agora,
    );
    escreverProdutosContratados(
      transacao,
      leitura.produtos,
      new Set([pedidoId]),
    );

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
