import { AbacatePayGateway } from './abacatepay.gateway.js';
import { ErroDoGateway } from './gateway.js';

/*
 * TESTES DE CONTRATO. As respostas abaixo foram escritas a partir da
 * documentacao da API v2 (docs.abacatepay.com, consultada em 14/09/2026), e
 * ainda NAO foram conferidas contra o sandbox de verdade — o roteiro esta em
 * `docs/runbooks/checkout-sandbox.md`. Quando a conferencia acontecer, e aqui que
 * uma divergencia de formato vira teste vermelho.
 */

const CHAVE = 'abc_dev_chave-de-teste';

interface Requisicao {
  readonly url: string;
  readonly metodo: string;
  readonly cabecalhos: Record<string, string>;
  readonly corpo: unknown;
}

type Resposta = { status: number; corpo: unknown } | Error;

function fetchFalso(respostas: Resposta[]): {
  executar: typeof fetch;
  requisicoes: Requisicao[];
} {
  const requisicoes: Requisicao[] = [];
  const fila = [...respostas];

  const executar = ((url: string, init: RequestInit) => {
    requisicoes.push({
      url,
      metodo: init.method ?? 'GET',
      cabecalhos: init.headers as Record<string, string>,
      corpo:
        init.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const proxima = fila.shift();
    if (proxima === undefined) {
      return Promise.reject(new Error('resposta nao programada'));
    }
    if (proxima instanceof Error) return Promise.reject(proxima);
    return Promise.resolve(
      new Response(
        typeof proxima.corpo === 'string'
          ? proxima.corpo
          : JSON.stringify(proxima.corpo),
        { status: proxima.status },
      ),
    );
  }) as unknown as typeof fetch;

  return { executar, requisicoes };
}

function gatewayCom(
  respostas: Resposta[],
  devModeEsperado = true,
): { gateway: AbacatePayGateway; requisicoes: Requisicao[] } {
  const { executar, requisicoes } = fetchFalso(respostas);
  return {
    gateway: new AbacatePayGateway(CHAVE, {
      fetch: executar,
      base: 'https://gateway.test/v2',
      devModeEsperado,
    }),
    requisicoes,
  };
}

const ok = (data: unknown): Resposta => ({
  status: 200,
  corpo: { data, success: true, error: null },
});

const PIX_DA_DOC = {
  id: 'pix_char_abc123xyz',
  amount: 370_000,
  status: 'PENDING',
  devMode: true,
  brCode: '00020160014BR.GOV.BCB.PIX070503***6304ABCD',
  brCodeBase64: 'data:image/png;base64,iVBORw0KG...',
  platformFee: 100,
  receiptUrl: null,
  createdAt: '2026-09-14T18:38:28.573Z',
  updatedAt: '2026-09-14T18:38:28.573Z',
  expiresAt: '2026-09-14T19:08:28.573Z',
  metadata: { checkoutId: 'checkout-1' },
};

const NOVA_PIX = {
  valorCentavos: 370_000,
  externalId: 'checkout-1',
  descricao: 'LexIntegra — 2 servicos',
  expiraEmSegundos: 1800,
};

describe('AbacatePayGateway', () => {
  describe('cobranca PIX', () => {
    it('envia o corpo documentado, sem objeto customer', async () => {
      const { gateway, requisicoes } = gatewayCom([ok(PIX_DA_DOC)]);

      await gateway.criarCobrancaPix(NOVA_PIX);

      expect(requisicoes).toHaveLength(1);
      expect(requisicoes[0].url).toBe(
        'https://gateway.test/v2/transparents/create',
      );
      expect(requisicoes[0].metodo).toBe('POST');
      expect(requisicoes[0].corpo).toEqual({
        method: 'PIX',
        data: {
          amount: 370_000,
          description: 'LexIntegra — 2 servicos',
          expiresIn: 1800,
          externalId: 'checkout-1',
          metadata: { checkoutId: 'checkout-1' },
        },
      });
    });

    it('autentica por Bearer com a chave', async () => {
      const { gateway, requisicoes } = gatewayCom([ok(PIX_DA_DOC)]);

      await gateway.criarCobrancaPix(NOVA_PIX);

      expect(requisicoes[0].cabecalhos['Authorization']).toBe(
        `Bearer ${CHAVE}`,
      );
    });

    it('traduz a resposta', async () => {
      const { gateway } = gatewayCom([ok(PIX_DA_DOC)]);

      expect(await gateway.criarCobrancaPix(NOVA_PIX)).toEqual({
        cobrancaId: 'pix_char_abc123xyz',
        valorCentavos: 370_000,
        brCode: PIX_DA_DOC.brCode,
        brCodeBase64: PIX_DA_DOC.brCodeBase64,
        expiraEm: PIX_DA_DOC.expiresAt,
      });
    });

    /**
     * A segunda metade da trava contra producao. Uma cobranca REAL num processo
     * que so aceita sandbox e descartada antes de chegar a tela de pagamento.
     */
    it('descarta resposta com devMode divergente', async () => {
      const { gateway } = gatewayCom([ok({ ...PIX_DA_DOC, devMode: false })]);

      await expect(gateway.criarCobrancaPix(NOVA_PIX)).rejects.toThrow(
        /devMode=false/,
      );
    });

    it('recusa resposta fora do formato, dizendo qual campo', async () => {
      const { brCode: _sem, ...semCodigo } = PIX_DA_DOC;
      const { gateway } = gatewayCom([ok(semCodigo)]);

      await expect(gateway.criarCobrancaPix(NOVA_PIX)).rejects.toThrow(
        /brCode/,
      );
    });

    it.each([
      [
        'success: false',
        {
          status: 200,
          corpo: { data: null, success: false, error: 'INVALID_AMOUNT' },
        },
        /INVALID_AMOUNT/,
      ],
      [
        'HTTP 500',
        { status: 500, corpo: { data: null, error: 'boom' } },
        /HTTP 500/,
      ],
      ['corpo que nao e JSON', { status: 502, corpo: '<html>' }, /sem JSON/],
      ['fora do envelope', { status: 200, corpo: [1, 2] }, /fora do envelope/],
      ['falha de rede', new Error('ECONNRESET'), /sem resposta do gateway/],
    ])('%s vira ErroDoGateway', async (_caso, resposta, mensagem) => {
      const { gateway } = gatewayCom([resposta as Resposta]);

      const promessa = gateway.criarCobrancaPix(NOVA_PIX);

      await expect(promessa).rejects.toBeInstanceOf(ErroDoGateway);
      await expect(promessa).rejects.toThrow(mensagem);
    });

    /** Regra inviolavel 9: nem a chave nem pedaco dela entra em motivo de erro. */
    it('tira a chave do motivo, mesmo que o gateway a ecoe', async () => {
      const { gateway } = gatewayCom([
        { status: 401, corpo: { data: null, error: `invalid key ${CHAVE}` } },
      ]);

      const erro = await gateway
        .criarCobrancaPix(NOVA_PIX)
        .catch((e: Error) => e);

      expect((erro as Error).message).toContain('invalid key [chave]');
      expect((erro as Error).message).not.toContain(CHAVE);
    });

    it('sem error textual, diz que nao ha detalhe', async () => {
      const { gateway } = gatewayCom([
        {
          status: 400,
          corpo: { data: null, success: false, error: { codigo: 1 } },
        },
      ]);

      await expect(gateway.criarCobrancaPix(NOVA_PIX)).rejects.toThrow(
        /sem detalhe/,
      );
    });
  });

  describe('produto do checkout hospedado', () => {
    const PRODUTO = {
      externalId: 'lex_produto-1_abc',
      nome: 'Parecer',
      descricao: 'Parecer em PDF',
      precoCentavos: 250_000,
    };

    it('reaproveita o produto que ja existe', async () => {
      const { gateway, requisicoes } = gatewayCom([
        ok([
          { id: 'prod_outro', externalId: 'lex_outro' },
          { id: 'prod_1', externalId: 'lex_produto-1_abc' },
        ]),
      ]);

      expect(await gateway.garantirProduto(PRODUTO)).toBe('prod_1');
      expect(requisicoes).toHaveLength(1);
      expect(requisicoes[0].url).toBe(
        'https://gateway.test/v2/products/list?externalId=lex_produto-1_abc',
      );
    });

    it('cria quando nao existe, com preco em centavos', async () => {
      const { gateway, requisicoes } = gatewayCom([
        ok([]),
        ok({ id: 'prod_novo' }),
      ]);

      expect(await gateway.garantirProduto(PRODUTO)).toBe('prod_novo');
      expect(requisicoes[1].corpo).toEqual({
        externalId: 'lex_produto-1_abc',
        name: 'Parecer',
        description: 'Parecer em PDF',
        price: 250_000,
        currency: 'BRL',
      });
    });

    /** Dois checkouts simultaneos com o mesmo snapshot novo disputam a criacao. */
    it('perdendo a disputa da criacao, procura de novo', async () => {
      const { gateway } = gatewayCom([
        ok([]),
        {
          status: 409,
          corpo: { data: null, success: false, error: 'EXTERNAL_ID_EXISTS' },
        },
        ok([{ id: 'prod_do_vencedor', externalId: 'lex_produto-1_abc' }]),
      ]);

      expect(await gateway.garantirProduto(PRODUTO)).toBe('prod_do_vencedor');
    });

    it('sem produto depois da recusa, falha', async () => {
      const { gateway } = gatewayCom([
        { status: 500, corpo: { error: 'x' } },
        {
          status: 400,
          corpo: { data: null, success: false, error: 'INVALID' },
        },
        ok('nao e lista'),
      ]);

      await expect(gateway.garantirProduto(PRODUTO)).rejects.toThrow(/INVALID/);
    });
  });

  describe('checkout hospedado', () => {
    const NOVO = {
      itens: [{ produtoGatewayId: 'prod_1', quantidade: 2 }],
      externalId: 'checkout-2',
      urlRetorno: 'https://lexintegra.com.br/checkout',
      urlConclusao: 'https://lexintegra.com.br/checkout?id=checkout-2',
    };

    it('pede so cartao e devolve a URL da pagina', async () => {
      const { gateway, requisicoes } = gatewayCom([
        ok({
          id: 'bill_abc',
          amount: 500_000,
          url: 'https://pay.abacatepay.com/bill_abc',
          status: 'PENDING',
          devMode: true,
          externalId: 'checkout-2',
        }),
      ]);

      expect(await gateway.criarCheckoutHospedado(NOVO)).toEqual({
        cobrancaId: 'bill_abc',
        valorCentavos: 500_000,
        url: 'https://pay.abacatepay.com/bill_abc',
      });
      expect(requisicoes[0].url).toBe(
        'https://gateway.test/v2/checkouts/create',
      );
      expect(requisicoes[0].corpo).toEqual({
        items: [{ id: 'prod_1', quantity: 2 }],
        methods: ['CARD'],
        externalId: 'checkout-2',
        returnUrl: NOVO.urlRetorno,
        completionUrl: NOVO.urlConclusao,
        metadata: { checkoutId: 'checkout-2' },
      });
    });

    it('descarta checkout real num processo de sandbox', async () => {
      const { gateway } = gatewayCom([
        ok({
          id: 'bill_abc',
          amount: 1,
          url: 'https://pay.test/x',
          devMode: false,
        }),
      ]);

      await expect(gateway.criarCheckoutHospedado(NOVO)).rejects.toThrow(
        /devMode/,
      );
    });
  });

  describe('estorno', () => {
    it.each([
      ['transparente', '/transparents/refund'],
      ['hospedado', '/checkouts/refund'],
    ] as const)('%s vai para %s', async (origem, rota) => {
      const { gateway, requisicoes } = gatewayCom([
        ok({ refundPublicId: 'tran_refund789xyz' }),
      ]);

      expect(
        await gateway.estornar({ cobrancaId: 'c-1', origem, motivo: 'pedido' }),
      ).toEqual({ sucesso: true, jaEstornado: false });
      expect(requisicoes[0].url).toBe(`https://gateway.test/v2${rota}`);
      expect(requisicoes[0].corpo).toEqual({ id: 'c-1', reason: 'pedido' });
    });

    /**
     * O CONTRATO DA PORTA. A recusa de um estorno que ja aconteceu e SUCESSO —
     * decidido pela situacao consultada, e nao pelo texto do erro, que nao esta
     * documentado.
     */
    it.each([
      ['transparente', '/transparents/check?id=c-1'],
      ['hospedado', '/checkouts/get?id=c-1'],
    ] as const)(
      'recusa com a cobranca ja REFUNDED e sucesso (%s)',
      async (origem, consulta) => {
        const { gateway, requisicoes } = gatewayCom([
          {
            status: 400,
            corpo: {
              data: null,
              success: false,
              error: 'TRANSACTION_NOT_REFUNDABLE',
            },
          },
          ok({ status: 'REFUNDED', devMode: true }),
        ]);

        expect(
          await gateway.estornar({ cobrancaId: 'c-1', origem, motivo: 'x' }),
        ).toEqual({ sucesso: true, jaEstornado: true });
        expect(requisicoes[1].url).toBe(`https://gateway.test/v2${consulta}`);
      },
    );

    it('recusa com a cobranca ainda paga e falha, com o motivo do gateway', async () => {
      const { gateway } = gatewayCom([
        {
          status: 400,
          corpo: {
            data: null,
            success: false,
            error: 'TRANSACTION_NOT_REFUNDABLE',
          },
        },
        ok({ status: 'PAID', devMode: true }),
      ]);

      expect(
        await gateway.estornar({
          cobrancaId: 'c-1',
          origem: 'transparente',
          motivo: 'x',
        }),
      ).toEqual({
        sucesso: false,
        motivo: 'HTTP 400: TRANSACTION_NOT_REFUNDABLE',
      });
    });

    it.each([
      ['consulta falha', { status: 500, corpo: { error: 'x' } }],
      ['consulta fora do formato', ok({ situacao: 'REFUNDED' })],
    ])('%s: falha, sem lancar', async (_caso, consulta) => {
      const { gateway } = gatewayCom([
        { status: 400, corpo: { data: null, success: false, error: 'NOPE' } },
        consulta as Resposta,
      ]);

      expect(
        await gateway.estornar({
          cobrancaId: 'c-1',
          origem: 'hospedado',
          motivo: 'x',
        }),
      ).toMatchObject({ sucesso: false });
    });

    /** Uma cobranca real consultada por um processo de sandbox nao conta como estornada. */
    it('consulta com devMode divergente: falha, sem lancar', async () => {
      const { gateway } = gatewayCom([
        { status: 400, corpo: { data: null, success: false, error: 'NOPE' } },
        ok({ status: 'REFUNDED', devMode: false }),
      ]);

      expect(
        await gateway.estornar({
          cobrancaId: 'c-1',
          origem: 'hospedado',
          motivo: 'x',
        }),
      ).toEqual({
        sucesso: false,
        motivo: expect.stringMatching(/devMode/) as string,
      });
    });

    it('corta o motivo em 500 caracteres', async () => {
      const { gateway, requisicoes } = gatewayCom([
        ok({ refundPublicId: 'r' }),
      ]);

      await gateway.estornar({
        cobrancaId: 'c-1',
        origem: 'transparente',
        motivo: 'a'.repeat(900),
      });

      expect((requisicoes[0].corpo as { reason: string }).reason).toHaveLength(
        500,
      );
    });
  });

  it('usa a URL de producao da v2 por padrao', () => {
    const gateway = new AbacatePayGateway(CHAVE, { devModeEsperado: true });

    expect((gateway as unknown as { base: string }).base).toBe(
      'https://api.abacatepay.com/v2',
    );
  });
});
