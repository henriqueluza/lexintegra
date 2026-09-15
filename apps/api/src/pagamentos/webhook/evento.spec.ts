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

  /** Evento que nao nos interessa nao e erro: 200, e o gateway para de mandar. */
  it.each([
    'subscription.completed',
    'transfer.completed',
    'checkout.disputed',
  ])('ignora %s', (nome) => {
    expect(lerEvento({ ...TRANSPARENTE, event: nome, data: {} })).toEqual({
      tipo: 'ignorado',
      eventoId: 'log_abc123xyz',
      nome,
      devMode: true,
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
