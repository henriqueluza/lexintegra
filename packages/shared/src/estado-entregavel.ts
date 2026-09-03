/**
 * ADR-11 e regra inviolavel 14: os quatro estados do entregavel e as transicoes
 * entre eles sao CODIGO, nao dado configuravel. O administrador configura apenas
 * o numero de revisoes permitidas por produto — um inteiro, nao uma lista de
 * estados.
 *
 * Vive em packages/shared porque a interface precisa renderizar o chip de estado
 * (docs/design.md, Direcao B) com exatamente os mesmos valores que o servidor
 * valida. Duas listas em lugares diferentes divergem.
 */
export const ESTADOS_ENTREGAVEL = [
  'solicitado',
  'em_elaboracao',
  'em_revisao',
  'entregue',
] as const;

export type EstadoEntregavel = (typeof ESTADOS_ENTREGAVEL)[number];

/**
 * Transicoes validas. Cada uma e disparada por um evento de dominio — inicio do
 * trabalho pelo advogado, upload de arquivo, confirmacao do cliente ou pedido de
 * revisao. Nao existe transicao manual feita por administrador ou advogado.
 *
 * `entregue` e terminal e so e alcancado por confirmacao do cliente apos upload,
 * nunca por escrita direta de campo. Essa e a trava do ADR-11.
 */
export const TRANSICOES_VALIDAS: Readonly<
  Record<EstadoEntregavel, readonly EstadoEntregavel[]>
> = {
  solicitado: ['em_elaboracao'],
  em_elaboracao: ['em_revisao', 'entregue'],
  em_revisao: ['em_elaboracao'],
  entregue: [],
};

export function transicaoPermitida(
  de: EstadoEntregavel,
  para: EstadoEntregavel,
): boolean {
  return TRANSICOES_VALIDAS[de].includes(para);
}
