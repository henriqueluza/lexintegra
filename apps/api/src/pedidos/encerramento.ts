import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  reunioesACancelarJunto,
  type EstadoEntregavel,
  type PedidoParaElegibilidade,
} from 'shared';
import { COLECAO_CLIENTES } from '../clientes/cliente.js';
import { COLECAO_DISPONIBILIDADES } from '../disponibilidades/slot.js';
import type { NovoEvento } from '../outbox/evento.js';
import { eventosDeCancelamento } from '../reunioes/convites-no-outbox.js';
import {
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from '../reunioes/reuniao.js';
import { contestacaoAberta } from './pausa.js';
import { COLECAO_PEDIDOS, situacaoDe, type DocumentoPedido } from './pedido.js';

/**
 * O que acontece com o resto do pedido quando ele deixa de valer: cancelamento
 * pelo cliente, estorno pelo administrador, contestacao perdida
 * (`docs/decisoes.md`, 3.3 e 5.4).
 *
 * - as reunioes FUTURAS sao canceladas junto, com devolucao ao saldo, e o
 *   `METHOD:CANCEL` sai para quem recebeu o convite;
 * - `produtosContratados` do cliente passa a refletir so os pedidos ATIVOS: o
 *   produto sai, a nao ser que outro pedido ativo do mesmo cliente tenha o
 *   mesmo produto.
 *
 * FUNCOES DE TRANSACAO, e nao um servico: quem chama ja tem a transacao aberta e
 * a decisao de negocio dela. TODA LEITURA ANTES DE TODA ESCRITA — por isso as
 * leituras (`lerReunioes`, `lerProdutosDoCliente`) e as escritas
 * (`escreverReunioesCanceladas`, `escreverProdutosContratados`) sao separadas,
 * como `preparar` e `gravar` em `PedidosService`.
 */

export interface ReuniaoLida {
  readonly id: string;
  readonly dados: DocumentoReuniao;
  /** Para `reunioesACancelarJunto`, que olha estado e inicio. */
  readonly estado: DocumentoReuniao['estado'];
  readonly inicio: string;
}

export async function lerReunioes(
  transacao: Transaction,
  pedidoRef: DocumentReference,
): Promise<ReuniaoLida[]> {
  const pagina = await transacao.get(pedidoRef.collection(SUBCOLECAO_REUNIOES));
  return pagina.docs.map((documento) => {
    const dados = documento.data() as DocumentoReuniao;
    return {
      id: documento.id,
      dados,
      estado: dados.estado,
      inicio: dados.inicio,
    };
  });
}

/** O que `impedimentoDoEstorno` e `impedimentoDoCancelamento` leem. */
export function paraElegibilidade(
  pedido: DocumentoPedido,
  estados: readonly EstadoEntregavel[],
  reunioes: readonly ReuniaoLida[],
  agora: number,
): PedidoParaElegibilidade {
  return {
    situacao: situacaoDe(pedido),
    estados,
    reunioes,
    contestacaoAberta: contestacaoAberta(pedido),
    agora,
  };
}

/** As reunioes que vao junto com o pedido. */
export function futurasACancelar(
  reunioes: readonly ReuniaoLida[],
  agora: number,
): ReuniaoLida[] {
  return reunioesACancelarJunto(reunioes, agora);
}

/**
 * Os `cancelamento-reuniao` das futuras, com o `sequence` que a reuniao vai ter
 * depois do cancelamento. So das que ja chegaram ao calendario de alguem
 * (`sequenceComunicada`), pela mesma razao de `CancelamentoDeReuniaoService`:
 * cancelar o que nunca foi convidado mandaria um `CANCEL` para um `UID` que
 * ninguem viu.
 */
export function eventosDasReunioesCanceladas(
  pedidoId: string,
  futuras: readonly ReuniaoLida[],
): NovoEvento[] {
  return futuras
    .filter((r) => r.dados.sequenceComunicada !== null)
    .flatMap((r) =>
      eventosDeCancelamento(
        { pedidoId, reuniaoId: r.id },
        { ...r.dados, sequence: r.dados.sequence + 1 },
      ),
    );
}

/**
 * Cancela as futuras com devolucao: o crédito volta ao saldo do pedido — que,
 * cancelado ou estornado, nao agenda mais, mas o saldo e a verdade do que foi
 * usado. Libera o slot. Quem chama escreve o pedido (e deve incrementar
 * `reunioesVersao`, ver `DocumentoPedido`).
 */
export function escreverReunioesCanceladas(
  transacao: Transaction,
  db: Firestore,
  pedidoRef: DocumentReference,
  futuras: readonly ReuniaoLida[],
  atorUid: string,
  agora: number,
): void {
  for (const reuniao of futuras) {
    transacao.update(
      pedidoRef.collection(SUBCOLECAO_REUNIOES).doc(reuniao.id),
      {
        estado: 'cancelada_com_devolucao',
        sequence: reuniao.dados.sequence + 1,
        canceladoEm: Timestamp.fromMillis(agora),
        canceladoPor: atorUid,
      },
    );
    transacao.update(
      db.collection(COLECAO_DISPONIBILIDADES).doc(reuniao.dados.slotId),
      { reserva: null },
    );
  }
}

/** O cliente e os pedidos dele, lidos para recalcular `produtosContratados`. */
export interface ProdutosDoCliente {
  readonly clienteRef: DocumentReference;
  readonly existe: boolean;
  readonly pedidos: readonly QueryDocumentSnapshot[];
}

export async function lerProdutosDoCliente(
  transacao: Transaction,
  db: Firestore,
  clienteId: string,
): Promise<ProdutosDoCliente> {
  const clienteRef = db.collection(COLECAO_CLIENTES).doc(clienteId);
  const [cliente, pedidos] = [
    await transacao.get(clienteRef),
    await transacao.get(
      db.collection(COLECAO_PEDIDOS).where('clienteId', '==', clienteId),
    ),
  ];
  return { clienteRef, existe: cliente.exists, pedidos: pedidos.docs };
}

/**
 * Os nomes de produto dos pedidos ATIVOS, tirando os que estao sendo
 * encerrados nesta transacao. O nome e o do SNAPSHOT (regra inviolavel 5), que
 * e o que a confirmacao do pagamento grava.
 */
export function produtosAtivos(
  pedidos: readonly QueryDocumentSnapshot[],
  encerrados: ReadonlySet<string>,
): string[] {
  const nomes = pedidos
    .filter((p) => !encerrados.has(p.id))
    .map((p) => p.data() as DocumentoPedido)
    .filter((p) => situacaoDe(p) === 'ativo')
    .map((p) => p.snapshot.nome);
  return [...new Set(nomes)];
}

/**
 * Sem documento de cliente (pedido semeado a mao, dado antigo), nada e escrito:
 * criar um cliente so com `produtosContratados` seria pior que nao atualizar.
 */
export function escreverProdutosContratados(
  transacao: Transaction,
  leitura: ProdutosDoCliente,
  encerrados: ReadonlySet<string>,
): void {
  if (!leitura.existe) return;
  transacao.update(leitura.clienteRef, {
    produtosContratados: produtosAtivos(leitura.pedidos, encerrados),
  });
}

/** O incremento que serializa operacoes de reuniao do pedido (Etapa 10). */
export function versaoDasReunioes(futuras: readonly ReuniaoLida[]): {
  reunioesVersao?: FieldValue;
} {
  return futuras.length === 0
    ? {}
    : { reunioesVersao: FieldValue.increment(1) };
}
