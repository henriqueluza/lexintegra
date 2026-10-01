import { cartaoHabilitado } from './cartao.js';

describe('PAGAMENTOS_CARTAO (decisoes.md 3.4)', () => {
  it.each([
    ['habilitado', true],
    ['desabilitado', false],
    [' desabilitado ', false],
  ])('%s', (valor, esperado) => {
    expect(cartaoHabilitado({ PAGAMENTOS_CARTAO: valor })).toBe(esperado);
  });

  it('recusa valor desconhecido', () => {
    expect(() => cartaoHabilitado({ PAGAMENTOS_CARTAO: 'sim' })).toThrow(
      /invalido/,
    );
  });

  it('e obrigatoria em producao', () => {
    expect(() => cartaoHabilitado({ NODE_ENV: 'production' })).toThrow(
      /precisa ser/,
    );
  });

  it('fora de producao, ausente e habilitado (gateway falso)', () => {
    expect(cartaoHabilitado({})).toBe(true);
  });
});
