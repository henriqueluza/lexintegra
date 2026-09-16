import { criarGateway } from './criar-gateway.js';
import { AbacatePayGateway } from './abacatepay.gateway.js';
import { ErroDoGateway, PagamentosDesligados } from './gateway.js';
import {
  GatewayPagamentoDesligado,
  GatewayPagamentoFalso,
} from './gateway-falso.js';

/* Hifen, e nao travessao: e o que o gateway aceita (ver `texto-do-gateway.ts`). */
const PIX = {
  valorCentavos: 370_000,
  externalId: 'checkout-1',
  descricao: 'LexIntegra - 2 servicos',
  expiraEmSegundos: 1800,
};

const PRODUTO = {
  externalId: 'lex_produto-1_abc',
  nome: 'Parecer',
  descricao: 'Parecer em PDF',
  precoCentavos: 250_000,
};

describe('GatewayPagamentoFalso', () => {
  it('cria cobranca PIX com imagem e codigo', async () => {
    const gateway = new GatewayPagamentoFalso();

    const cobranca = await gateway.criarCobrancaPix(PIX);

    expect(cobranca.valorCentavos).toBe(370_000);
    expect(cobranca.brCodeBase64).toMatch(/^data:image\/png;base64,/);
    expect(cobranca.brCode).toContain(cobranca.cobrancaId);
    expect(Date.parse(cobranca.expiraEm)).toBeGreaterThan(Date.now());
  });

  /** A retentativa do mesmo carrinho depende disto, como no gateway real. */
  it('devolve a mesma cobranca para o mesmo externalId', async () => {
    const gateway = new GatewayPagamentoFalso();

    const primeira = await gateway.criarCobrancaPix(PIX);
    const segunda = await gateway.criarCobrancaPix(PIX);

    expect(segunda.cobrancaId).toBe(primeira.cobrancaId);
    expect(gateway.cobrancas.size).toBe(1);
  });

  it('garante produto uma vez por externalId', async () => {
    const gateway = new GatewayPagamentoFalso();

    const primeiro = await gateway.garantirProduto(PRODUTO);
    const segundo = await gateway.garantirProduto(PRODUTO);

    expect(segundo).toBe(primeiro);
    expect(gateway.produtos.size).toBe(1);
  });

  it('checkout hospedado soma o preco dos produtos cadastrados', async () => {
    const gateway = new GatewayPagamentoFalso();
    const id = await gateway.garantirProduto(PRODUTO);

    const checkout = await gateway.criarCheckoutHospedado({
      itens: [{ produtoGatewayId: id, quantidade: 2 }],
      externalId: 'checkout-2',
      urlRetorno: 'http://localhost:4200/checkout',
      urlConclusao: 'http://localhost:4200/checkout?id=checkout-2',
    });

    expect(checkout.valorCentavos).toBe(500_000);
    expect(checkout.url).toBe('http://localhost:4200/checkout?id=checkout-2');
    expect(gateway.cobrancas.get(checkout.cobrancaId)?.origem).toBe(
      'hospedado',
    );
  });

  it('checkout hospedado com produto desconhecido falha', async () => {
    const gateway = new GatewayPagamentoFalso();

    await expect(
      gateway.criarCheckoutHospedado({
        itens: [{ produtoGatewayId: 'prod_nenhum', quantidade: 1 }],
        externalId: 'checkout-3',
        urlRetorno: 'u',
        urlConclusao: 'u',
      }),
    ).rejects.toBeInstanceOf(ErroDoGateway);
  });

  it('simula falha nas proximas operacoes', async () => {
    const gateway = new GatewayPagamentoFalso();
    gateway.falharProximas(2);

    await expect(gateway.criarCobrancaPix(PIX)).rejects.toBeInstanceOf(
      ErroDoGateway,
    );
    await expect(gateway.garantirProduto(PRODUTO)).rejects.toBeInstanceOf(
      ErroDoGateway,
    );
    await expect(gateway.criarCobrancaPix(PIX)).resolves.toBeDefined();
  });

  it('forca outro valor na cobranca, para o teste de divergencia', async () => {
    const gateway = new GatewayPagamentoFalso();
    gateway.forcarValor(1);

    expect((await gateway.criarCobrancaPix(PIX)).valorCentavos).toBe(1);
  });

  /**
   * O FALSO PRECISA RECUSAR O QUE O REAL RECUSA, e este e o caso que provou por
   * que: na rodada do sandbox de 16/09/2026, `LexIntegra — 2 servico(s)` voltou
   * com HTTP 400, "Disallowed character in description". Aqui passava, e por isso
   * a suite inteira passava.
   */
  describe('texto recusado pelo gateway', () => {
    it('recusa a descricao da cobranca com travessao', async () => {
      const gateway = new GatewayPagamentoFalso();

      await expect(
        gateway.criarCobrancaPix({ ...PIX, descricao: 'LexIntegra — 2' }),
      ).rejects.toThrow(/Disallowed character in description: —/);
      expect(gateway.cobrancas.size).toBe(0);
    });

    it.each([
      ['nome', { ...PRODUTO, nome: 'Parecer — completo' }],
      ['descricao', { ...PRODUTO, descricao: 'Analise…' }],
    ])('recusa o produto com %s fora do permitido', async (_caso, produto) => {
      const gateway = new GatewayPagamentoFalso();

      await expect(gateway.garantirProduto(produto)).rejects.toThrow(
        ErroDoGateway,
      );
      expect(gateway.produtos.size).toBe(0);
    });

    it('aceita acento, que o sandbox nao reprovou', async () => {
      const gateway = new GatewayPagamentoFalso();

      await expect(
        gateway.garantirProduto({
          ...PRODUTO,
          nome: 'Elaboração de Contrato Social',
        }),
      ).resolves.toMatch(/^prod_falso_/);
    });
  });

  describe('estorno', () => {
    /**
     * O contrato da porta: a segunda chamada e SUCESSO com `jaEstornado`, nunca
     * erro e nunca estorno duplo. E o que torna segura a reentrega do outbox.
     */
    it('e idempotente', async () => {
      const gateway = new GatewayPagamentoFalso();
      const { cobrancaId } = await gateway.criarCobrancaPix(PIX);
      const pedido = {
        cobrancaId,
        origem: 'transparente' as const,
        motivo: 'x',
      };

      expect(await gateway.estornar(pedido)).toEqual({
        sucesso: true,
        jaEstornado: false,
      });
      expect(await gateway.estornar(pedido)).toEqual({
        sucesso: true,
        jaEstornado: true,
      });
      expect(gateway.estornos).toHaveLength(2);
    });

    it('reporta cobranca inexistente sem lancar', async () => {
      const gateway = new GatewayPagamentoFalso();

      expect(
        await gateway.estornar({
          cobrancaId: 'nenhuma',
          origem: 'hospedado',
          motivo: 'x',
        }),
      ).toEqual({ sucesso: false, motivo: 'cobranca inexistente' });
    });

    it('reporta falha simulada sem lancar', async () => {
      const gateway = new GatewayPagamentoFalso();
      const { cobrancaId } = await gateway.criarCobrancaPix(PIX);
      gateway.falharProximas(1);

      expect(
        await gateway.estornar({
          cobrancaId,
          origem: 'transparente',
          motivo: 'x',
        }),
      ).toEqual({ sucesso: false, motivo: 'falha simulada' });
      expect(gateway.cobrancas.get(cobrancaId)?.estornada).toBe(false);
    });
  });
});

describe('GatewayPagamentoDesligado', () => {
  const gateway = new GatewayPagamentoDesligado();

  it('recusa criar cobranca, produto e checkout', async () => {
    await expect(gateway.criarCobrancaPix()).rejects.toBeInstanceOf(
      PagamentosDesligados,
    );
    await expect(gateway.garantirProduto()).rejects.toBeInstanceOf(
      PagamentosDesligados,
    );
    await expect(gateway.criarCheckoutHospedado()).rejects.toBeInstanceOf(
      PagamentosDesligados,
    );
  });

  /** O contrato da porta: estorno reporta, nao lanca. */
  it('reporta o estorno como falha', async () => {
    expect(await gateway.estornar()).toMatchObject({ sucesso: false });
  });
});

describe('criarGateway', () => {
  const base = {
    segredoWebhook: 's',
    chaveHmacWebhook: 'h',
    devModeEsperado: true,
  };

  it('desligado', () => {
    expect(
      criarGateway({ ...base, modo: 'desligado', chaveApi: null }),
    ).toBeInstanceOf(GatewayPagamentoDesligado);
  });

  it('sandbox sem chave usa o falso', () => {
    expect(
      criarGateway({ ...base, modo: 'sandbox', chaveApi: null }),
    ).toBeInstanceOf(GatewayPagamentoFalso);
  });

  it('sandbox com chave usa o AbacatePay', () => {
    expect(
      criarGateway({ ...base, modo: 'sandbox', chaveApi: 'abc_dev_teste' }),
    ).toBeInstanceOf(AbacatePayGateway);
  });
});
