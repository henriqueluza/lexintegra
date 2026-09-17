/**
 * O FORMATO REAL DO WEBHOOK do AbacatePay, para os testes e o simulador.
 *
 * `TRANSPARENTE_COMPLETED_REAL` e o `transparent.completed` de um PIX capturado
 * no painel de Webhook Logs na rodada do sandbox de 16/09/2026 — VERBATIM. E o
 * que ele prova que a documentacao nao provava: NAO ha `id` na raiz do envelope, e
 * a cobranca vem em `data.transparent`. Os testes escritos so a partir da
 * documentacao usavam `id` na raiz e a cobranca direto em `data`, e passavam; o
 * evento real voltava 422.
 *
 * Sem dado pessoal: em modo dev, `customer` e o pagador vieram nulos. Os ids sao
 * do sandbox.
 *
 * Arnes de teste, e nao codigo de producao: fora da cobertura
 * (`jest.config.mjs`), e sem import nenhum, para `scripts/simular-webhook.mjs`
 * poder le-lo com `node` puro.
 */
export const TRANSPARENTE_COMPLETED_REAL = {
  event: 'transparent.completed',
  apiVersion: 2,
  devMode: true,
  data: {
    transparent: {
      id: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW',
      externalId: 'b104a4d7fe57637ab90266f713496966449a8947',
      amount: 1160000,
      paidAmount: null,
      platformFee: 80,
      status: 'PAID',
      items: [],
      methods: [],
      frequency: 'ONE_TIME',
      coupons: [],
      devMode: true,
      customerId: null,
      createdAt: '2026-09-16T12:25:50.816Z',
      updatedAt: '2026-09-16T12:26:17.131Z',
      receiptUrl: null,
      metadata: {
        checkoutId: 'b104a4d7fe57637ab90266f713496966449a8947',
      },
    },
    customer: {
      id: '',
      name: null,
      email: null,
      taxId: null,
    },
    payerInformation: {
      method: 'PIX',
      utms: {
        source: null,
        medium: null,
        campaign: null,
        term: null,
        content: null,
      },
      PIX: {
        name: null,
        taxId: null,
        isSameAsCustomer: true,
      },
    },
  },
};

export interface EventoReal {
  /** `transparent.completed` por padrao. */
  readonly evento?: string;
  readonly cobrancaId: string;
  readonly checkoutId: string;
  readonly valorCentavos: number;
}

/**
 * O mesmo formato do evento real, apontando para uma cobranca e um checkout
 * nossos. A cobranca vai sob a chave do PREFIXO do evento, como no real:
 * `transparent.*` em `data.transparent`. Para `checkout.*` (cartao), a chave
 * `data.checkout` e analogia — ainda nao observada no sandbox.
 */
export function eventoNoFormatoReal(
  opcoes: EventoReal,
): Record<string, unknown> {
  const evento = opcoes.evento ?? 'transparent.completed';
  const chave = evento.split('.')[0] ?? 'transparent';
  const real = TRANSPARENTE_COMPLETED_REAL;
  /* So a cobranca nova: sobrar o `transparent` do real esconderia erro de ordem na leitura. */
  const { transparent: cobrancaReal, ...resto } = real.data;
  return {
    ...real,
    event: evento,
    data: {
      ...resto,
      [chave]: {
        ...cobrancaReal,
        id: opcoes.cobrancaId,
        externalId: opcoes.checkoutId,
        amount: opcoes.valorCentavos,
        status: evento.endsWith('.refunded') ? 'REFUNDED' : 'PAID',
        metadata: { checkoutId: opcoes.checkoutId },
      },
    },
  };
}
