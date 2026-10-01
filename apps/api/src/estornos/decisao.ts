import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { impedimentoDoEstorno, type EstadoEntregavel } from 'shared';
import type { NovoEvento } from '../outbox/evento.js';
import type { DocumentoPagamento } from '../pagamentos/pagamento.js';
import {
  paraElegibilidade,
  type ProdutosDoCliente,
  type ReuniaoLida,
} from '../pedidos/encerramento.js';
import { conflitoDoPedido } from '../pedidos/pausa.js';
import { situacaoDe, type DocumentoPedido } from '../pedidos/pedido.js';
import type { DocumentoEstorno } from './estorno.js';

/**
 * As decisoes do estorno sobre o que a transacao leu: elegibilidade, se e
 * integral, e o evento do integral. Funcoes puras, fora de
 * `EstornosService`, que fica com a leitura e a escrita.
 */

/** O que a transacao leu, antes de escrever qualquer coisa. */
export interface Leitura {
  readonly pedido: DocumentoPedido;
  readonly estados: readonly EstadoEntregavel[];
  readonly irmaos: readonly DocumentSnapshot[];
  /** O estorno de cada OUTRO pedido da cobranca, se houver. */
  readonly estornosDosIrmaos: readonly {
    readonly pedidoId: string;
    readonly estorno: DocumentoEstorno | undefined;
  }[];
  readonly pagamento: DocumentoPagamento | undefined;
  readonly reunioes: readonly ReuniaoLida[];
  readonly produtos: ProdutosDoCliente;
}

/**
 * Integral quando TODOS os outros pedidos da cobranca ja estao estornados e
 * NENHUM estorno anterior foi devolvido a mao — um devolvido a mao mais o
 * integral seria dinheiro devolvido duas vezes. E so para pagamento confirmado,
 * que e o unico com cobranca a estornar.
 */
export function ehIntegral(pedidoId: string, leitura: Leitura): boolean {
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

export function exigirElegivel(leitura: Leitura, agora: number): void {
  const motivo = impedimentoDoEstorno(
    paraElegibilidade(leitura.pedido, leitura.estados, leitura.reunioes, agora),
  );
  if (motivo !== null) throw conflitoDoPedido(motivo);
}

export function eventoIntegral(leitura: Leitura): NovoEvento {
  const pagamento = leitura.pagamento as DocumentoPagamento;
  return {
    tipo: 'estorno-integral',
    destinatarioUid: leitura.pedido.clienteId,
    estorno: {
      pagamentoId: leitura.pedido.pagamentoId,
      cobrancaId: pagamento.cobrancaId,
      origem: pagamento.origem,
    },
  };
}
