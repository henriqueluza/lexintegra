import {
  eventoNoFormatoReal,
  TRANSPARENTE_COMPLETED_REAL,
} from '../../arnes-webhook.js';
import { EventoIlegivel, lerEvento } from './evento.js';

/*
 * O EVENTO REAL, capturado na rodada do sandbox de 16/09/2026 (ver
 * `arnes-webhook.ts`). Ele vem primeiro porque foi ele que derrubou o parser: sem
 * `id` na raiz, e com a cobranca em `data.transparent`. O parser antigo exigia o
 * `id` e respondia 422 a todo pagamento real.
 */
describe('lerEvento com o payload real do sandbox', () => {
  it('le o transparent.completed real, sem id na raiz', () => {
    expect(lerEvento(TRANSPARENTE_COMPLETED_REAL)).toEqual({
      tipo: 'pagamento',
      eventoId: 'transparent.completed:pix_char_czxa1U3t5ZpHDY6p65fWCFnW',
      nome: 'transparent.completed',
      devMode: true,
      cobranca: {
        id: 'pix_char_czxa1U3t5ZpHDY6p65fWCFnW',
        externalId: 'b104a4d7fe57637ab90266f713496966449a8947',
        valorCentavos: 1_160_000,
        origem: 'transparente',
      },
    });
  });

  /**
   * O `id` na raiz continua valendo quando vier — a documentacao o mostra, e nao
   * ha motivo para recusar um envelope que o traga.
   */
  it('usa o id da raiz como trilha, quando ele vier', () => {
    expect(
      lerEvento({ ...TRANSPARENTE_COMPLETED_REAL, id: 'log_1' }),
    ).toMatchObject({ tipo: 'pagamento', eventoId: 'log_1' });
  });

  /**
   * A cobranca e procurada PRIMEIRO sob a chave do prefixo do evento. Um
   * `data.checkout` que tambem casasse nao pode ganhar de `data.transparent` num
   * `transparent.*`.
   */
  it('procura a cobranca primeiro na chave do prefixo do evento', () => {
    const evento = eventoNoFormatoReal({
      cobrancaId: 'pix_certo',
      checkoutId: 'checkout-certo',
      valorCentavos: 100,
    });
    const data = evento['data'] as Record<string, unknown>;

    expect(
      lerEvento({
        ...evento,
        data: {
          checkout: { id: 'bill_errado', externalId: 'outro', amount: 999 },
          ...data,
        },
      }),
    ).toMatchObject({ cobranca: { id: 'pix_certo', valorCentavos: 100 } });
  });

  /**
   * Por analogia ao observado, `checkout.completed` (cartao) em `data.checkout`, e
   * os estornos sob a chave do proprio prefixo. Nao observados ainda — os testes
   * fixam a leitura, e o roteiro do sandbox confere o formato.
   */
  it.each([
    ['checkout.completed', 'pagamento', 'hospedado'],
    ['transparent.refunded', 'estorno', 'transparente'],
    ['checkout.refunded', 'estorno', 'hospedado'],
  ])('le %s no mesmo formato', (nome, tipo, origem) => {
    expect(
      lerEvento(
        eventoNoFormatoReal({
          evento: nome,
          cobrancaId: 'cobranca-1',
          checkoutId: 'checkout-1',
          valorCentavos: 500_000,
        }),
      ),
    ).toMatchObject({
      tipo,
      eventoId: `${nome}:cobranca-1`,
      cobranca: { id: 'cobranca-1', externalId: 'checkout-1', origem },
    });
  });

  /**
   * `data.customer` tem `id` e NAO e a cobranca. Num evento ignorado sem cobranca
   * legivel, o alerta nao pode apontar para o cliente.
   */
  it('nunca toma o id do customer pelo da cobranca', () => {
    expect(
      lerEvento({
        event: 'checkout.disputed',
        devMode: true,
        data: { customer: { id: 'cust_123', name: null } },
      }),
    ).toMatchObject({
      motivo: 'contestacao',
      cobrancaId: null,
      eventoId: 'checkout.disputed:sem-cobranca',
    });
  });

  /**
   * O primeiro alerta da rodada foi "envelope fora do formato (id, devMode)": o
   * corpo que o `abacatepay listen` encaminhou tinha perdido o `devMode`. Sem ele,
   * continua ilegivel — e a trava de ambiente, e nao pode ter valor presumido.
   */
  it('continua recusando o envelope sem devMode', () => {
    const { devMode: _devMode, ...semDevMode } = TRANSPARENTE_COMPLETED_REAL;

    expect(() => lerEvento(semDevMode)).toThrow(/devMode/);
  });
});

/*
 * Payloads a partir da documentacao da API v2 (docs.abacatepay.com, consultada em
 * 14/09/2026), com `id` na raiz. O evento real veio sem ele (bloco acima); estes
 * continuam como prova de que o envelope documentado tambem e aceito.
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

  /*
   * "Sem id" SAIU desta lista: recusar envelope sem `id` era exatamente o defeito
   * que o evento real do sandbox expos (ver o bloco do payload real, acima).
   */
  it.each([
    ['sem event', { ...TRANSPARENTE, event: undefined }],
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
