import { EventoIlegivel, lerEvento } from './evento.js';

/*
 * Payloads a partir da documentacao da API v2 (docs.abacatepay.com, consultada em
 * 14/09/2026). Ainda nao conferidos contra um evento real do sandbox.
 */
const TRANSPARENTE = {
  id: 'log_abc123xyz',
  event: 'transparent.completed',
  apiVersion: 2,
  devMode: true,
  data: {
    id: 'pix_char_1',
    amount: 370_000,
    paidAmount: 370_000,
    status: 'PAID',
    externalId: 'checkout-1',
    customer: { name: 'mascarado', taxId: '***' },
  },
};

const HOSPEDADO = {
  id: 'log_def456',
  event: 'checkout.completed',
  apiVersion: 2,
  devMode: true,
  data: {
    checkout: {
      id: 'bill_1',
      externalId: 'checkout-2',
      amount: 500_000,
      paidAmount: 520_000,
      status: 'PAID',
    },
    customer: { id: 'cust_1' },
  },
};

describe('lerEvento', () => {
  it('le o pagamento do PIX transparente, com a cobranca em data', () => {
    expect(lerEvento(TRANSPARENTE)).toEqual({
      tipo: 'pagamento',
      eventoId: 'log_abc123xyz',
      nome: 'transparent.completed',
      devMode: true,
      cobranca: {
        id: 'pix_char_1',
        externalId: 'checkout-1',
        valorCentavos: 370_000,
        origem: 'transparente',
      },
    });
  });

  /**
   * O valor que conta e o COBRADO (`amount`), e nao o pago: juros de parcelamento
   * do cartao sao da pessoa com a operadora, e nao diferenca de preco do pedido.
   */
  it('le o pagamento do checkout hospedado, com a cobranca aninhada', () => {
    expect(lerEvento(HOSPEDADO)).toMatchObject({
      tipo: 'pagamento',
      cobranca: {
        id: 'bill_1',
        externalId: 'checkout-2',
        valorCentavos: 500_000,
        origem: 'hospedado',
      },
    });
  });

  it.each([
    ['transparent.refunded', 'transparente'],
    ['checkout.refunded', 'hospedado'],
  ])('le o estorno %s', (nome, origem) => {
    expect(
      lerEvento({
        ...TRANSPARENTE,
        event: nome,
        data: { transparent: TRANSPARENTE.data },
      }),
    ).toMatchObject({ tipo: 'estorno', nome, cobranca: { origem } });
  });

  /** Evento documentado que nao e deste sistema nao e erro: 200, e ruido. */
  it.each([
    'subscription.completed',
    'subscription.renewed',
    'transfer.completed',
    'payout.failed',
  ])('ignora %s como irrelevante', (nome) => {
    expect(lerEvento({ ...TRANSPARENTE, event: nome, data: {} })).toEqual({
      tipo: 'ignorado',
      motivo: 'irrelevante',
      eventoId: 'log_abc123xyz',
      nome,
      devMode: true,
      cobrancaId: null,
    });
  });

  /**
   * Chargeback nao muda estado, mas nao e ruido: sai como contestacao, com o id
   * da cobranca quando ela vem legivel — mesmo sem `externalId` nem `amount`.
   */
  it.each(['checkout.disputed', 'transparent.disputed'])(
    'separa %s como contestacao, com o id da cobranca',
    (nome) => {
      expect(
        lerEvento({
          ...TRANSPARENTE,
          event: nome,
          data: { checkout: { id: 'bill_9' } },
        }),
      ).toMatchObject({
        tipo: 'ignorado',
        motivo: 'contestacao',
        cobrancaId: 'bill_9',
      });
    },
  );

  /**
   * O CASO QUE NAO PODE SER SILENCIOSO: um nome fora das listas pode ser o cartao
   * pago chegando com um nome que a documentacao nao mostrou.
   */
  it('marca nome desconhecido como desconhecido, e nao como ruido', () => {
    expect(
      lerEvento({ ...TRANSPARENTE, event: 'checkout.paid' }),
    ).toMatchObject({
      tipo: 'ignorado',
      motivo: 'desconhecido',
      nome: 'checkout.paid',
      cobrancaId: 'pix_char_1',
    });
  });

  it.each([
    ['sem id', { ...TRANSPARENTE, id: undefined }],
    ['sem devMode', { ...TRANSPARENTE, devMode: undefined }],
    ['devMode que nao e booleano', { ...TRANSPARENTE, devMode: 'true' }],
    ['corpo nulo', null],
  ])('recusa envelope %s', (_caso, corpo) => {
    expect(() => lerEvento(corpo)).toThrow(EventoIlegivel);
  });

  /**
   * Pagamento sem o id do checkout, ou sem valor, nao pode virar pedido. Falha com
   * mensagem, e o controlador transforma isso em alerta critico.
   */
  it.each([
    ['sem externalId', { ...TRANSPARENTE.data, externalId: undefined }],
    ['sem amount', { ...TRANSPARENTE.data, amount: undefined }],
    ['amount fracionado', { ...TRANSPARENTE.data, amount: 3700.5 }],
    ['data que nao e objeto', 'texto'],
  ])('recusa pagamento %s', (_caso, data) => {
    expect(() => lerEvento({ ...TRANSPARENTE, data })).toThrow(
      /transparent.completed sem cobranca/,
    );
  });
});
