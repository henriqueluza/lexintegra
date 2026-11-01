/**
 * O codigo curto do pedido, para o assunto da sala do Teams (`feat/ligar-teams`).
 *
 * POR QUE EXISTE. O assunto da sala fica visivel a quem tiver o link e no
 * calendario da conta organizadora do escritorio, e por isso nao pode levar
 * nome, produto nem nenhum dado do cliente (LGPD). Ainda assim, quem opera a
 * conta organizadora precisa saber de que pedido e cada sala. O codigo curto
 * resolve as duas coisas: identifica o pedido para quem tem acesso ao painel e
 * nao diz nada a quem nao tem.
 *
 * A FORMA: os 6 ultimos caracteres da cobranca, um hifen e o numero do item.
 * O id do pedido e `{cobrancaId}_{nnn}` (regra inviolavel 4), entao
 * `pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001` vira `fWCFnW-001`.
 *
 * NAO E IDENTIFICADOR. Dois pedidos podem, em tese, ter o mesmo codigo curto;
 * nada no sistema procura por ele. O que identifica a sala e o `externalId`.
 */
export function codigoCurtoDoPedido(pedidoId: string): string {
  const separador = pedidoId.lastIndexOf('_');
  /* Fora do formato (so em teste e dado ficticio): o id inteiro, sem cortar. */
  if (separador <= 0) return pedidoId;

  const cobranca = pedidoId.slice(0, separador);
  const item = pedidoId.slice(separador + 1);
  return `${cobranca.slice(-6)}-${item}`;
}
