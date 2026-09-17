import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { OrigemDaCobranca } from './gateway/gateway.js';

/**
 * O documento de pagamento (arquitetura 5.1 e 5.2): um por cobranca confirmada
 * pelo gateway, com N pedidos pendurados.
 *
 * O ID E O DA COBRANCA, e nao o do evento do webhook (errata do ADR-04 na Etapa
 * 8). O ADR dizia "o ID do evento vira o ID do documento de pagamento", mas o
 * evento que o AbacatePay manda tem id de LOG: dois eventos distintos sobre a
 * mesma cobranca — a confirmacao e uma reentrega com outro log, por exemplo —
 * teriam ids diferentes e produziriam dois pagamentos. A chave natural do fato
 * "esta cobranca foi paga" e a cobranca. O id do evento fica registrado no campo.
 */
export const COLECAO_PAGAMENTOS = 'pagamentos';

/**
 * - `confirmado`: pagamento, pedidos e conta criados.
 * - `divergente`: o valor cobrado nao e o total congelado. Nenhum pedido.
 * - `conflito_de_conta`: o e-mail e conta de advogado ou administrador. Nenhum pedido.
 * - `orfao`: nao ha checkout com esse id — apagado pela TTL, ou desconhecido.
 *
 * Os tres ultimos emitem alerta critico e ficam para o administrador resolver:
 * houve dinheiro, e nao ha pedido. Nao sao erro de requisicao — o gateway recebe
 * 200, porque reentregar nao mudaria nada.
 */
export type SituacaoPagamento =
  'confirmado' | 'divergente' | 'conflito_de_conta' | 'orfao';

export interface DocumentoPagamento {
  situacao: SituacaoPagamento;
  cobrancaId: string;
  origem: OrigemDaCobranca;
  valorCentavos: number;
  /** O `externalId` da cobranca. Pode nao existir mais (TTL). */
  checkoutId: string;
  eventoId: string;
  devMode: boolean;
  registradoEm: Timestamp | FieldValue;

  /* Os campos abaixo so existem em `confirmado`. */
  clienteId?: string;
  pedidoIds?: string[];
  /**
   * A EVIDENCIA DO ACEITE DA REGRA DE ESTORNO (ADR-12), copiada do checkout. O
   * checkout some pela TTL depois de 48 horas; o pagamento fica. Sem a copia, a
   * prova de que o cliente aceitou "estorno so em solicitado" desapareceria junto
   * com o carrinho.
   */
  termosVersao?: string;
  termosAceitosEm?: Timestamp | FieldValue | null;
  /** O QR de um carrinho que mudou foi pago mesmo assim. O administrador decide estornar. */
  checkoutSubstituido?: boolean;
  /** O estado do estorno integral pelo gateway, quando houver (Etapa 8, ADR-12). */
  estornoGateway?: 'solicitado' | 'confirmado';
}
