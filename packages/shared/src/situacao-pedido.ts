import type { EstadoEntregavel } from './estado-entregavel.js';

/**
 * A situacao do PEDIDO, e as regras de estorno e cancelamento do ADR-12.
 *
 * NAO E O ESTADO DO ENTREGAVEL. Os quatro estados do ADR-11 dizem em que ponto
 * esta o trabalho em cada entregavel; a situacao diz se o pedido ainda vale. Sao
 * perguntas diferentes, e um pedido cancelado tem entregaveis parados em
 * `solicitado` para sempre — que e exatamente o que o torna cancelavel.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: o cartao do cliente usa `podeCancelar` para
 * decidir se mostra o botao. A decisao que vale e a do servidor, que usa as MESMAS
 * funcoes dentro da transacao.
 */

export const SITUACOES_PEDIDO = ['ativo', 'cancelado', 'estornado'] as const;

export type SituacaoPedido = (typeof SITUACOES_PEDIDO)[number];

/**
 * "Trabalho iniciado" e o que o ADR-12 usa para separar o que pode ser desfeito
 * do que nao pode: "a partir do momento em que o status avanca para
 * `em_elaboracao`, o pedido deixa de ser elegivel a estorno".
 *
 * TODOS os entregaveis precisam estar em `solicitado`. Um pedido de dois
 * entregaveis com um deles em elaboracao ja e servico personalizado em execucao.
 * Lista vazia NAO conta como sem trabalho: um pedido sem entregavel e documento
 * corrompido, e o que se faz com ele e olhar, e nao devolver dinheiro.
 */
export function semTrabalhoIniciado(
  estados: readonly EstadoEntregavel[],
): boolean {
  return (
    estados.length > 0 && estados.every((estado) => estado === 'solicitado')
  );
}

/**
 * O cliente cancela (ADR-12, "cancelamento sem estorno"): so o pedido ativo e sem
 * trabalho iniciado. Cancelar nao devolve dinheiro — a devolucao e o estorno, que
 * e acao do administrador.
 */
export function podeCancelar(
  situacao: SituacaoPedido,
  estados: readonly EstadoEntregavel[],
): boolean {
  return situacao === 'ativo' && semTrabalhoIniciado(estados);
}

/**
 * O administrador estorna: pedido ativo OU cancelado, sem trabalho iniciado. O
 * cancelado entra porque cancelar e estornar sao atos distintos — quem cancelou
 * e depois pediu o dinheiro de volta ao escritorio precisa poder ser estornado.
 */
export function podeEstornar(
  situacao: SituacaoPedido,
  estados: readonly EstadoEntregavel[],
): boolean {
  return (
    (situacao === 'ativo' || situacao === 'cancelado') &&
    semTrabalhoIniciado(estados)
  );
}

/**
 * Como a devolucao do dinheiro acontece (ADR-12, errata da Etapa 8).
 *
 * O AbacatePay so estorna a COBRANCA INTEIRA, e um carrinho de dois produtos e
 * uma cobranca so. Por isso:
 *
 * - `manual_pendente`: o estorno de um pedido isolado e registrado aqui, e o
 *   escritorio devolve o valor por fora do gateway.
 * - `manual_executado`: o administrador registrou que devolveu.
 * - `gateway_pendente`: todos os pedidos da cobranca foram estornados, e o estorno
 *   integral foi pedido ao gateway pelo outbox.
 * - `gateway_confirmado`: o gateway confirmou pelo webhook.
 */
export const EXECUCOES_ESTORNO = [
  'manual_pendente',
  'manual_executado',
  'gateway_pendente',
  'gateway_confirmado',
] as const;

export type ExecucaoEstorno = (typeof EXECUCOES_ESTORNO)[number];
