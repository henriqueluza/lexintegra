import { OPCOES_DA_APLICACAO, proxiesConfiaveis } from './configurar.js';

describe('proxiesConfiaveis', () => {
  it('le a variavel de ambiente', () => {
    expect(proxiesConfiaveis({ PROXIES_CONFIAVEIS: '2' })).toBe(2);
  });

  it('vale zero quando nao ha variavel', () => {
    expect(proxiesConfiaveis({})).toBe(0);
  });

  /**
   * Valor torto cai em zero em vez de virar `NaN`. `trust proxy` com `NaN`
   * silenciosamente nao confia em ninguem, que e o mesmo efeito — mas por um
   * caminho que ninguem consegue depurar.
   */
  it.each([
    ['texto', 'dois'],
    ['fracionario', '1.5'],
    ['negativo', '-1'],
    ['vazio', ''],
  ])('cai em zero com valor %s', (_nome, valor) => {
    expect(proxiesConfiaveis({ PROXIES_CONFIAVEIS: valor })).toBe(0);
  });
});

/**
 * O HMAC do webhook e calculado sobre os bytes que chegaram. Sem `rawBody`, o
 * guard nao tem o que conferir e recusa todo evento legitimo — o pagamento seria
 * feito e o pedido nunca criado, com a assinatura "errada" como unico sintoma.
 */
describe('OPCOES_DA_APLICACAO', () => {
  it('guarda o corpo cru', () => {
    expect(OPCOES_DA_APLICACAO.rawBody).toBe(true);
  });
});
