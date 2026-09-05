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

/**
 * Os eventos de dominio que MUDAM o estado, e a aresta que cada um percorre.
 *
 * ADR-11: "cada uma tem exatamente um evento de dominio que a dispara". Este mapa
 * e essa frase em codigo — o servidor nao aceita um estado de destino vindo do
 * cliente, aceita um EVENTO, e a aresta sai daqui. E a diferenca entre "mude para
 * entregue" (que seria transicao manual, proibida) e "o cliente confirmou".
 *
 * Vive em `shared` pelo mesmo motivo do mapa acima: a interface precisa decidir
 * quais acoes oferecer a partir do estado atual, e uma segunda copia divergiria.
 */
export const EVENTOS_DE_TRANSICAO = [
  'iniciar-trabalho',
  'retomar-trabalho',
  'confirmar-entrega',
  'pedir-revisao',
] as const;

export type EventoDeTransicao = (typeof EVENTOS_DE_TRANSICAO)[number];

export const TRANSICAO_DO_EVENTO: Readonly<
  Record<
    EventoDeTransicao,
    { readonly de: EstadoEntregavel; readonly para: EstadoEntregavel }
  >
> = {
  'iniciar-trabalho': { de: 'solicitado', para: 'em_elaboracao' },
  'retomar-trabalho': { de: 'em_revisao', para: 'em_elaboracao' },
  'confirmar-entrega': { de: 'em_elaboracao', para: 'entregue' },
  'pedir-revisao': { de: 'em_elaboracao', para: 'em_revisao' },
};

/**
 * Os dois eventos que NAO mudam estado, e por isso nao aparecem no mapa acima.
 *
 * `criar-pedido` e a origem da trilha (nao ha estado anterior). `enviar-arquivo`
 * e a consequencia direta do ADR-11: no diagrama, "cliente revisa o PDF" nao e
 * um estado — o entregavel permanece em `em_elaboracao` enquanto o cliente
 * decide. O upload grava `arquivoAtual`, e e a existencia desse campo que
 * habilita `confirmar-entrega`. Sem ele, `entregue` seria alcancavel por quem
 * chamasse a confirmacao antes de existir arquivo.
 */
export const EVENTOS_SEM_TRANSICAO = [
  'criar-pedido',
  'enviar-arquivo',
] as const;

export const EVENTOS_ENTREGAVEL = [
  ...EVENTOS_SEM_TRANSICAO,
  ...EVENTOS_DE_TRANSICAO,
] as const;

export type EventoEntregavel = (typeof EVENTOS_ENTREGAVEL)[number];
