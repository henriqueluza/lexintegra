/**
 * As formas de pagamento que a conta do AbacatePay aceita (painel do
 * escritorio, conferido pelo responsavel pelo projeto em 01/11/2026).
 *
 * UMA FONTE SO. O rodape, o checkout, o teto de parcelas do produto e o enum do
 * checkout leem daqui. Anunciar uma bandeira que o checkout recusa e propaganda
 * enganosa; com a lista num lugar so, mudar a conta e mudar este arquivo — e o
 * teste, que trava a lista de proposito.
 *
 * A BANDEIRA NAO E VALIDADA NO SERVIDOR, e nao ha como: o cartao vai pelo
 * checkout hospedado do AbacatePay (ADR-19) e o numero nunca passa pela API.
 * Quem recusa a bandeira e a pagina do gateway. Esta lista diz o que o site
 * ANUNCIA, e tem que bater com o painel.
 *
 * AS PARCELAS, SIM, DESDE NOVEMBRO DE 2026. O pedido de checkout hospedado leva
 * `card.maxInstallments` (`abacatepay.gateway.ts`), calculado no servidor por
 * `parcelasDoCarrinho` (`tipo-cobranca.ts`): so assinatura parcela, e a pagina
 * do gateway nao oferece mais que o teto da cobranca.
 * `PARCELAS_MAXIMAS_NO_CARTAO` e o teto do que o produto pode anunciar, e o
 * esquema do produto e os dois adaptadores do gateway o impoem.
 *
 * ESTE ARQUIVO NAO IMPORTA ZOD: e lido pelo rodape, que esta em toda pagina
 * publica (ver `carrinho.ts`).
 */

export const METODOS_PAGAMENTO = ['pix', 'cartao'] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

export const BANDEIRAS_DO_CARTAO = ['visa', 'mastercard'] as const;
export type BandeiraDoCartao = (typeof BANDEIRAS_DO_CARTAO)[number];

/** Carteiras digitais que a pagina hospedada oferece dentro do metodo cartao. */
export const CARTEIRAS_DO_CARTAO = ['apple-pay', 'google-pay'] as const;
export type CarteiraDoCartao = (typeof CARTEIRAS_DO_CARTAO)[number];

export type MarcaDePagamento = 'pix' | BandeiraDoCartao | CarteiraDoCartao;

/** O nome acessivel de cada marca, como o leitor de tela vai ler. */
export const NOME_DA_MARCA: Readonly<Record<MarcaDePagamento, string>> = {
  pix: 'Pix',
  visa: 'Visa',
  mastercard: 'Mastercard',
  'apple-pay': 'Apple Pay',
  'google-pay': 'Google Pay',
};

/** A ordem em que o site mostra as marcas: o Pix, depois o que vem com o cartao. */
export const MARCAS_ACEITAS: readonly MarcaDePagamento[] = [
  'pix',
  ...BANDEIRAS_DO_CARTAO,
  ...CARTEIRAS_DO_CARTAO,
];

/** As marcas que dependem do cartao estar ligado (`PAGAMENTOS_CARTAO`). */
export const MARCAS_DO_CARTAO: readonly MarcaDePagamento[] = [
  ...BANDEIRAS_DO_CARTAO,
  ...CARTEIRAS_DO_CARTAO,
];

/** AbacatePay: parcelamento em ate 12x no cartao (`card.maxInstallments`). O Pix e a vista. */
export const PARCELAS_MAXIMAS_NO_CARTAO = 12;
