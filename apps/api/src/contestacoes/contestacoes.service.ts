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
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import type {
  ContestacaoResumo,
  EstadoContestacao,
  NovoResultadoContestacao,
} from 'shared';
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
import {
  COLECAO_ESTORNOS,
  type DocumentoEstorno,
} from '../estornos/estorno.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import type { NovoEvento } from '../outbox/evento.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { COLECAO_PAGAMENTOS } from '../pagamentos/pagamento.js';
import {
  escreverProdutosContratados,
  eventosDasReunioesCanceladas,
  futurasACancelar,
  lerProdutosDoCliente,
  lerReunioes,
  type ProdutosDoCliente,
  type ReuniaoLida,
} from '../pedidos/encerramento.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';
import { agora as agora_ } from '../relogio.js';
import {
  escreverEstornosDaPerda,
  escreverFimDaPausa,
  escreverPausa,
} from './escritas.js';
import {
  COLECAO_CONTESTACOES,
  paraResumo,
  type DocumentoContestacao,
} from './contestacao.js';

/**
 * A contestacao (chargeback) e a pausa dos pedidos (`docs/decisoes.md`, 5.4).
 *
 * ABRE PELO WEBHOOK (`checkout.disputed`, `transparent.disputed`), na mesma
 * transacao para todos os pedidos da cobranca — a contestacao e da COBRANCA, e
 * um carrinho de tres produtos e uma cobranca so:
 *
 * - cada pedido ganha o marcador `contestacao` e fica pausado (`pausa.ts`);
 * - as reunioes futuras sao canceladas COM devolucao ao saldo, e o
 *   `METHOD:CANCEL` sai para quem tinha o convite;
 * - o cliente recebe e-mail pelo outbox (`pausa-contestacao`).
 *
 * FECHA PELO ADMINISTRADOR, que registra o resultado depois de responder no
 * painel do AbacatePay — a API do gateway nao documenta evento de desfecho:
 *
 * - ganha: o marcador sai e os pedidos seguem normais (as reunioes desmarcadas
 *   voltaram ao saldo, e o cliente remarca);
 * - perdida: os pedidos viram `estornado`, com estorno de execucao
 *   `contestacao` — o dinheiro ja voltou pelo meio de pagamento, entao nao ha
 *   devolucao manual nem pelo gateway — e o produto sai de
 *   `produtosContratados`.
 *
 * Nenhum dinheiro se move aqui, e nenhuma chamada ao gateway sai daqui (regra
 * inviolavel 20).
 */
@Injectable()
export class ContestacoesService {
  private readonly log = new Logger('Contestacoes');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly outbox: OutboxService,
    private readonly enfileirador: EnfileiradorDeEventos,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
  ) {}

  /**
   * IDEMPOTENTE: uma segunda entrega do mesmo chargeback encontra o documento e
   * nao faz nada. Devolve se abriu agora.
   */
  async abrir(
    cobrancaId: string,
    eventoId: string,
    agora: number = agora_(),
  ): Promise<boolean> {
    const resultado = await this.db.runTransaction(async (transacao) => {
      const referencia = this.referencia(cobrancaId);
      if ((await transacao.get(referencia)).exists) return null;

      const pedidos = await this.pedidosDaCobranca(transacao, cobrancaId);
      const pagamentoRef = this.db
        .collection(COLECAO_PAGAMENTOS)
        .doc(cobrancaId);
      const pagamento = await transacao.get(pagamentoRef);
      const futuras = new Map<string, ReuniaoLida[]>();
      for (const pedido of pedidos) {
        futuras.set(
          pedido.id,
          futurasACancelar(await lerReunioes(transacao, pedido.ref), agora),
        );
      }

      const ids = await this.registrarEventos(
        transacao,
        cobrancaId,
        pedidos,
        futuras,
      );

      transacao.create(
        referencia,
        novaContestacao(cobrancaId, eventoId, pedidos),
      );
      escreverPausa(transacao, this.db, pedidos, futuras, cobrancaId, agora);
      if (pagamento.exists) {
        transacao.update(pagamentoRef, { contestacao: 'aberta' });
      }
      return { ids, pedidos: pedidos.length };
    });

    if (resultado === null) {
      this.log.log(`contestacao da cobranca ${cobrancaId} ja estava aberta`);
      return false;
    }
    for (const id of resultado.ids) {
      // Depois do commit, nunca dentro (regra inviolavel 2).
      await this.enfileirador.enfileirarPorId(id);
    }
    this.log.log(
      `contestacao aberta na cobranca ${cobrancaId}: ${String(resultado.pedidos)} pedido(s) pausado(s)`,
    );
    return true;
  }

  async resolver(
    cobrancaId: string,
    decisao: NovoResultadoContestacao,
    adminUid: string,
  ): Promise<ContestacaoResumo> {
    const { resumo, devolvidosAntes } = await this.db.runTransaction(
      async (transacao) =>
        this.resolverNaTransacao(transacao, cobrancaId, decisao, adminUid),
    );

    /*
     * Pedido que o escritorio JA tinha devolvido (a mao ou pelo gateway) e cuja
     * contestacao foi perdida: o cliente recebeu duas vezes. Nada aqui desfaz
     * isso — e alerta, para alguem cobrar a diferenca.
     */
    for (const pedidoId of devolvidosAntes) {
      this.alertas.emitir({
        nivel: 'critico',
        assunto: 'pagamento.contestacao-sobre-estorno',
        detalhe:
          `contestacao perdida na cobranca ${cobrancaId}, e o pedido ` +
          `${pedidoId} ja tinha sido devolvido pelo escritorio.`,
      });
    }
    this.log.log(
      `contestacao da cobranca ${cobrancaId} encerrada (${decisao.resultado}) por ${adminUid}`,
    );
    return resumo;
  }

  async listar(
    estado: EstadoContestacao = 'aberta',
  ): Promise<ContestacaoResumo[]> {
    const pagina = await this.db
      .collection(COLECAO_CONTESTACOES)
      .where('estado', '==', estado)
      .orderBy('abertaEm', 'desc')
      .limit(200)
      .get();
    return pagina.docs.map((d) => paraResumo(d.data() as DocumentoContestacao));
  }

  private async resolverNaTransacao(
    transacao: Transaction,
    cobrancaId: string,
    decisao: NovoResultadoContestacao,
    adminUid: string,
  ): Promise<{ resumo: ContestacaoResumo; devolvidosAntes: string[] }> {
    const referencia = this.referencia(cobrancaId);
    const atual = (await transacao.get(referencia)).data() as
      DocumentoContestacao | undefined;
    if (atual === undefined) {
      throw new NotFoundException('Contestacao nao encontrada.');
    }
    if (atual.estado !== 'aberta') {
      throw new ConflictException(
        `Esta contestacao ja foi encerrada (${atual.estado}).`,
      );
    }

    const pedidos = await this.pedidosDaCobranca(transacao, cobrancaId);
    const pagamentoRef = this.db.collection(COLECAO_PAGAMENTOS).doc(cobrancaId);
    const pagamento = await transacao.get(pagamentoRef);
    const perdida = decisao.resultado === 'perdida';
    const estornos = perdida ? await this.lerEstornos(transacao, pedidos) : [];
    const produtos = perdida ? await this.lerProdutos(transacao, pedidos) : [];

    const encerrado: DocumentoContestacao = {
      ...atual,
      estado: decisao.resultado,
      resolvidaEm: FieldValue.serverTimestamp(),
      resolvidaPor: adminUid,
      nota: decisao.nota,
    };
    transacao.set(referencia, encerrado);
    if (pagamento.exists) {
      transacao.update(pagamentoRef, { contestacao: decisao.resultado });
    }

    escreverFimDaPausa(transacao, pedidos, perdida, adminUid);
    const devolvidosAntes = perdida
      ? escreverEstornosDaPerda(
          transacao,
          this.db,
          pedidos,
          estornos,
          decisao,
          adminUid,
        )
      : [];
    const encerrados = new Set(pedidos.map((p) => p.id));
    for (const leitura of produtos) {
      escreverProdutosContratados(transacao, leitura, encerrados);
    }

    return { resumo: paraResumo(encerrado), devolvidosAntes };
  }

  private async registrarEventos(
    transacao: Transaction,
    cobrancaId: string,
    pedidos: readonly QueryDocumentSnapshot[],
    futuras: ReadonlyMap<string, readonly ReuniaoLida[]>,
  ): Promise<string[]> {
    const clientes = new Set(
      pedidos.map((p) => (p.data() as DocumentoPedido).clienteId),
    );
    const novos: NovoEvento[] = [
      ...[...clientes].map((destinatarioUid) => ({
        tipo: 'pausa-contestacao' as const,
        destinatarioUid,
        cobrancaId,
      })),
      ...pedidos.flatMap((p) =>
        eventosDasReunioesCanceladas(p.id, futuras.get(p.id) ?? []),
      ),
    ];
    return novos.length === 0
      ? []
      : this.outbox.registrarSeAusenteEmLote(transacao, novos);
  }

  /** O id do pagamento E o da cobranca (errata do ADR-04). */
  private async pedidosDaCobranca(
    transacao: Transaction,
    cobrancaId: string,
  ): Promise<QueryDocumentSnapshot[]> {
    const pagina = await transacao.get(
      this.db
        .collection(COLECAO_PEDIDOS)
        .where('pagamentoId', '==', cobrancaId),
    );
    return pagina.docs;
  }

  private async lerEstornos(
    transacao: Transaction,
    pedidos: readonly QueryDocumentSnapshot[],
  ): Promise<(DocumentoEstorno | undefined)[]> {
    const lidos: (DocumentoEstorno | undefined)[] = [];
    for (const pedido of pedidos) {
      const doc = await transacao.get(
        this.db.collection(COLECAO_ESTORNOS).doc(pedido.id),
      );
      lidos.push(doc.data() as DocumentoEstorno | undefined);
    }
    return lidos;
  }

  private async lerProdutos(
    transacao: Transaction,
    pedidos: readonly QueryDocumentSnapshot[],
  ): Promise<ProdutosDoCliente[]> {
    const clientes = new Set(
      pedidos.map((p) => (p.data() as DocumentoPedido).clienteId),
    );
    const lidos: ProdutosDoCliente[] = [];
    for (const clienteId of clientes) {
      lidos.push(await lerProdutosDoCliente(transacao, this.db, clienteId));
    }
    return lidos;
  }

  private referencia(cobrancaId: string): DocumentReference {
    return this.db.collection(COLECAO_CONTESTACOES).doc(cobrancaId);
  }
}

function novaContestacao(
  cobrancaId: string,
  eventoId: string,
  pedidos: readonly QueryDocumentSnapshot[],
): DocumentoContestacao {
  return {
    cobrancaId,
    estado: 'aberta',
    eventoId,
    pedidoIds: pedidos.map((p) => p.id),
    clienteId:
      (pedidos[0]?.data() as DocumentoPedido | undefined)?.clienteId ?? null,
    abertaEm: FieldValue.serverTimestamp(),
  };
}
