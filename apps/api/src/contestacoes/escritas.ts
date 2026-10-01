import {
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import type { NovoResultadoContestacao } from 'shared';
import {
  COLECAO_ESTORNOS,
  type DocumentoEstorno,
} from '../estornos/estorno.js';
import {
  escreverReunioesCanceladas,
  versaoDasReunioes,
  type ReuniaoLida,
} from '../pedidos/encerramento.js';
import { situacaoDe, type DocumentoPedido } from '../pedidos/pedido.js';

/**
 * As escritas da contestacao, separadas do servico pela mesma razao de
 * `pedidos/encerramento.ts`: sao funcoes de transacao, e a transacao e a
 * decisao sao de quem chama. TODA LEITURA ANTES DE TODA ESCRITA — nada aqui le.
 */

/** Quem cancela as reunioes futuras na pausa: nenhuma pessoa, o sistema. */
export const ATOR_DA_PAUSA = 'sistema:contestacao';

/**
 * A pausa: o marcador em cada pedido da cobranca e as reunioes futuras
 * canceladas com devolucao.
 */
export function escreverPausa(
  transacao: Transaction,
  db: Firestore,
  pedidos: readonly QueryDocumentSnapshot[],
  futuras: ReadonlyMap<string, readonly ReuniaoLida[]>,
  cobrancaId: string,
  agora: number,
): void {
  for (const pedido of pedidos) {
    const doPedido = futuras.get(pedido.id) ?? [];
    transacao.update(pedido.ref, {
      contestacao: { cobrancaId, abertaEm: FieldValue.serverTimestamp() },
      ...versaoDasReunioes(doPedido),
    });
    escreverReunioesCanceladas(
      transacao,
      db,
      pedido.ref,
      doPedido,
      ATOR_DA_PAUSA,
      agora,
    );
  }
}

/**
 * O fim da pausa. Na perdida, o pedido que ainda nao estava estornado passa a
 * estar — inclusive o cancelado, que e o caso provavel.
 */
export function escreverFimDaPausa(
  transacao: Transaction,
  pedidos: readonly QueryDocumentSnapshot[],
  perdida: boolean,
  adminUid: string,
): void {
  for (const pedido of pedidos) {
    const virouEstorno =
      perdida && situacaoDe(pedido.data() as DocumentoPedido) !== 'estornado';
    transacao.update(pedido.ref, {
      contestacao: null,
      ...(virouEstorno
        ? {
            situacao: 'estornado',
            estornadoEm: FieldValue.serverTimestamp(),
            estornadoPor: adminUid,
          }
        : {}),
    });
  }
}

/**
 * O estorno de cada pedido da contestacao perdida, com execucao
 * `contestacao` — o dinheiro ja voltou pelo meio de pagamento. O que ja
 * existia:
 * - pendente (manual ou pelo gateway) passa a `contestacao`: devolver agora
 *   seria devolver duas vezes;
 * - ja devolvido (manual executado, gateway confirmado) fica como esta, e volta
 *   na lista que vira alerta.
 */
export function escreverEstornosDaPerda(
  transacao: Transaction,
  db: Firestore,
  pedidos: readonly QueryDocumentSnapshot[],
  estornos: readonly (DocumentoEstorno | undefined)[],
  decisao: NovoResultadoContestacao,
  adminUid: string,
): string[] {
  const devolvidosAntes: string[] = [];
  pedidos.forEach((pedido, indice) => {
    const existente = estornos[indice];
    const ref = db.collection(COLECAO_ESTORNOS).doc(pedido.id);
    if (existente === undefined) {
      transacao.create(ref, novoEstorno(pedido, decisao, adminUid));
    } else if (
      existente.execucao === 'manual_pendente' ||
      existente.execucao === 'gateway_pendente'
    ) {
      transacao.update(ref, { execucao: 'contestacao' });
    } else if (existente.execucao !== 'contestacao') {
      devolvidosAntes.push(pedido.id);
    }
  });
  return devolvidosAntes;
}

function novoEstorno(
  pedido: QueryDocumentSnapshot,
  decisao: NovoResultadoContestacao,
  adminUid: string,
): DocumentoEstorno {
  const dados = pedido.data() as DocumentoPedido;
  return {
    pedidoId: pedido.id,
    pagamentoId: dados.pagamentoId,
    clienteId: dados.clienteId,
    produto: dados.snapshot.nome,
    valorCentavos: dados.snapshot.precoCentavos,
    motivo: `Contestacao perdida: ${decisao.nota}`,
    execucao: 'contestacao',
    solicitadoPor: adminUid,
    solicitadoEm: FieldValue.serverTimestamp(),
  };
}
