import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  configuracaoDePagamentos,
  PRODUCAO_DESTRAVADA,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from './modo.js';

/*
 * Chaves de mentira com o formato certo. Nenhuma e credencial: o prefixo e o que
 * esta sob teste, e o resto e texto qualquer.
 */
const CHAVE_SANDBOX = 'abc_dev_chave-de-teste';
const CHAVE_PRODUCAO = 'abc_prod_chave-de-teste-que-nao-existe';
const CHAVE_SEM_PREFIXO = 'chave-sem-prefixo-de-ambiente';

const SEGREDOS = {
  ABACATEPAY_WEBHOOK_SECRET: 'segredo',
  ABACATEPAY_WEBHOOK_CHAVE_HMAC: 'hmac',
};

describe('configuracaoDePagamentos', () => {
  describe('a trava contra producao (regra inviolavel 20)', () => {
    /**
     * Em QUALQUER ambiente, com QUALQUER chave. Se este teste cair, o processo
     * passou a aceitar subir cobrando de verdade por um valor de variavel.
     */
    it.each([
      ['em producao', { NODE_ENV: 'production' }],
      ['em desenvolvimento', {}],
      [
        'com chave e segredos',
        { ABACATEPAY_API_KEY: CHAVE_SANDBOX, ...SEGREDOS },
      ],
    ])('recusa PAGAMENTOS_MODO=producao %s', (_caso, ambiente) => {
      expect(() =>
        configuracaoDePagamentos(
          { ...ambiente, PAGAMENTOS_MODO: 'producao' },
          false,
        ),
      ).toThrow(/regra inviolavel 20/);
    });

    it('recusa a chave sem o prefixo de sandbox, sem repetir a chave', () => {
      let mensagem = '';
      try {
        configuracaoDePagamentos({
          PAGAMENTOS_MODO: 'sandbox',
          ABACATEPAY_API_KEY: CHAVE_SEM_PREFIXO,
          ...SEGREDOS,
        });
      } catch (erro) {
        mensagem = (erro as Error).message;
      }

      expect(mensagem).toContain('abc_dev_');
      expect(mensagem).not.toContain(CHAVE_SEM_PREFIXO);
    });

    /**
     * O boot le a constante, e o commit de destravamento a abriu
     * (docs/runbooks/ligar-terceiros.md, 1.5). Fechar de novo e outro commit
     * revisado, junto com `pagamentos_modo = "desligado"`.
     */
    it('a trava esta aberta no codigo', () => {
      expect(PRODUCAO_DESTRAVADA).toBe(true);
    });
  });

  /**
   * O caminho que o commit de destravamento liga (docs/runbooks/
   * ligar-terceiros.md). Testado com a trava aberta pelo parametro, sem mexer
   * na constante.
   */
  describe('producao destravada', () => {
    const PRODUCAO = {
      NODE_ENV: 'production',
      PAGAMENTOS_MODO: 'producao',
    };

    it('sobe com a chave de producao e espera devMode false', () => {
      expect(
        configuracaoDePagamentos(
          { ...PRODUCAO, ABACATEPAY_API_KEY: CHAVE_PRODUCAO, ...SEGREDOS },
          true,
        ),
      ).toEqual({
        modo: 'producao',
        chaveApi: CHAVE_PRODUCAO,
        segredoWebhook: 'segredo',
        chaveHmacWebhook: 'hmac',
        devModeEsperado: false,
      });
    });

    it.each([
      ['sem chave', {}],
      ['com a chave de sandbox', { ABACATEPAY_API_KEY: CHAVE_SANDBOX }],
      ['com chave sem prefixo', { ABACATEPAY_API_KEY: CHAVE_SEM_PREFIXO }],
    ])('recusa %s, sem repetir a chave', (_caso, chave) => {
      let mensagem = '';
      try {
        configuracaoDePagamentos({ ...PRODUCAO, ...chave, ...SEGREDOS }, true);
      } catch (erro) {
        mensagem = (erro as Error).message;
      }
      expect(mensagem).toContain('abc_prod_');
      expect(mensagem).not.toContain(CHAVE_SANDBOX);
      expect(mensagem).not.toContain(CHAVE_SEM_PREFIXO);
    });

    it('recusa sem os segredos do webhook', () => {
      expect(() =>
        configuracaoDePagamentos(
          { ...PRODUCAO, ABACATEPAY_API_KEY: CHAVE_PRODUCAO },
          true,
        ),
      ).toThrow(/obrigatorios/);
    });

    /** Maquina de desenvolvimento nunca cobra de verdade. */
    it('recusa fora de NODE_ENV=production', () => {
      expect(() =>
        configuracaoDePagamentos(
          {
            PAGAMENTOS_MODO: 'producao',
            ABACATEPAY_API_KEY: CHAVE_PRODUCAO,
            ...SEGREDOS,
          },
          true,
        ),
      ).toThrow(/so sobe com NODE_ENV=production/);
    });

    it('sandbox continua recusando a chave de producao', () => {
      expect(() =>
        configuracaoDePagamentos(
          {
            NODE_ENV: 'production',
            PAGAMENTOS_MODO: 'sandbox',
            ABACATEPAY_API_KEY: CHAVE_PRODUCAO,
            ...SEGREDOS,
          },
          true,
        ),
      ).toThrow(/abc_dev_/);
    });
  });

  describe('em producao', () => {
    it('exige a variavel', () => {
      expect(() =>
        configuracaoDePagamentos({ NODE_ENV: 'production' }),
      ).toThrow(/PAGAMENTOS_MODO precisa ser declarado/);
    });

    it('aceita desligado sem chave nenhuma', () => {
      expect(
        configuracaoDePagamentos({
          NODE_ENV: 'production',
          PAGAMENTOS_MODO: 'desligado',
        }),
      ).toMatchObject({ modo: 'desligado', chaveApi: null });
    });

    /** Um gateway em memoria em producao mostraria QR codes que nao cobram nada. */
    it('recusa sandbox sem chave, em vez de cair no gateway falso', () => {
      expect(() =>
        configuracaoDePagamentos({
          NODE_ENV: 'production',
          PAGAMENTOS_MODO: 'sandbox',
        }),
      ).toThrow(/exige ABACATEPAY_API_KEY/);
    });

    it('aceita sandbox com chave de desenvolvimento e segredos', () => {
      expect(
        configuracaoDePagamentos({
          NODE_ENV: 'production',
          PAGAMENTOS_MODO: 'sandbox',
          ABACATEPAY_API_KEY: CHAVE_SANDBOX,
          ...SEGREDOS,
        }),
      ).toEqual({
        modo: 'sandbox',
        chaveApi: CHAVE_SANDBOX,
        segredoWebhook: 'segredo',
        chaveHmacWebhook: 'hmac',
        devModeEsperado: true,
      });
    });
  });

  it('recusa valor desconhecido', () => {
    expect(() =>
      configuracaoDePagamentos({ PAGAMENTOS_MODO: 'ligado' }),
    ).toThrow(/invalido/);
  });

  it.each([
    ['sem o segredo', { ABACATEPAY_WEBHOOK_CHAVE_HMAC: 'hmac' }],
    ['sem a chave do HMAC', { ABACATEPAY_WEBHOOK_SECRET: 'segredo' }],
    [
      'com segredos em branco',
      { ABACATEPAY_WEBHOOK_SECRET: '  ', ABACATEPAY_WEBHOOK_CHAVE_HMAC: '' },
    ],
  ])('com chave, recusa %s', (_caso, segredos) => {
    expect(() =>
      configuracaoDePagamentos({
        PAGAMENTOS_MODO: 'sandbox',
        ABACATEPAY_API_KEY: CHAVE_SANDBOX,
        ...segredos,
      }),
    ).toThrow(/obrigatorios/);
  });

  describe('fora de producao', () => {
    /** Desenvolvimento e emulador nao precisam de credencial nenhuma. */
    it('sem nada configurado, e sandbox com o gateway falso', () => {
      expect(configuracaoDePagamentos({})).toEqual({
        modo: 'sandbox',
        chaveApi: null,
        segredoWebhook: SEGREDO_WEBHOOK_DESENVOLVIMENTO,
        chaveHmacWebhook: CHAVE_HMAC_DESENVOLVIMENTO,
        devModeEsperado: true,
      });
    });

    it('chave em branco conta como ausente', () => {
      expect(
        configuracaoDePagamentos({
          PAGAMENTOS_MODO: ' sandbox ',
          ABACATEPAY_API_KEY: ' ',
        }),
      ).toMatchObject({ modo: 'sandbox', chaveApi: null });
    });

    it('aceita desligado', () => {
      expect(
        configuracaoDePagamentos({ PAGAMENTOS_MODO: 'desligado' }).modo,
      ).toBe('desligado');
    });
  });
});
