import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { EstornoResumo, ExecucaoEstorno } from 'shared';
import { paraIso } from '../pedidos/pedido.js';

/**
 * O registro de um estorno (ADR-12). UM POR PEDIDO, com o id do pedido (regra
 * inviolavel 4): um segundo pedido de estorno do mesmo pedido estoura no `create`.
 *
 * Coleção RAIZ, e nao subcolecao do pagamento: o painel do administrador lista os
 * pendentes de todos os pagamentos, e consulta sobre subcolecao exigiria indice
 * de grupo de colecoes — que o Firestore nao cria sozinho nem para campo unico.
 */
export const COLECAO_ESTORNOS = 'estornos';

export interface DocumentoEstorno {
  pedidoId: string;
  pagamentoId: string;
  clienteId: string;
  /** O nome congelado no snapshot, para a linha do painel. */
  produto: string;
  /** O preco congelado no snapshot — e o que foi pago por este pedido. */
  valorCentavos: number;
  motivo: string;
  execucao: ExecucaoEstorno;
  solicitadoPor: string;
  solicitadoEm: Timestamp | FieldValue;
  executadoPor?: string;
  executadoEm?: Timestamp | FieldValue;
  /** A anotacao de quem registrou a devolucao manual. */
  observacao?: string;
}

export function paraResumo(dados: DocumentoEstorno): EstornoResumo {
  return {
    pedidoId: dados.pedidoId,
    pagamentoId: dados.pagamentoId,
    produto: dados.produto,
    valorCentavos: dados.valorCentavos,
    motivo: dados.motivo,
    execucao: dados.execucao,
    solicitadoEm: paraIso(dados.solicitadoEm),
  };
}
