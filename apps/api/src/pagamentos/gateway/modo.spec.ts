import {
  CHAVE_HMAC_DESENVOLVIMENTO,
  configuracaoDePagamentos,
  SEGREDO_WEBHOOK_DESENVOLVIMENTO,
} from './modo.js';

/*
 * Chaves de mentira com o formato certo. Nenhuma e credencial: o prefixo e o que
 * esta sob teste, e o resto e texto qualquer.
 */
const CHAVE_SANDBOX = 'abc_dev_chave-de-teste';
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
        configuracaoDePagamentos({ ...ambiente, PAGAMENTOS_MODO: 'producao' }),
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
  });

  describe('em producao', () => {
    it('exige a variavel', () => {
      expect(() =>
        configuracaoDePagamentos({ NODE_ENV: 'production' }),
      ).toThrow(/PAGAMENTOS_MODO precisa ser/);
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
