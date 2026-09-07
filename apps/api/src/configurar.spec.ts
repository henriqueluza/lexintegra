import { proxiesConfiaveis } from './configurar.js';

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
