import {
  MARCAS_ACEITAS,
  MARCAS_DO_CARTAO,
  METODOS_PAGAMENTO,
  NOME_DA_MARCA,
  PARCELAS_MAXIMAS_NO_CARTAO,
} from './formas-de-pagamento.js';

/**
 * A lista e travada aqui de proposito. Ela tem que bater com o painel do
 * AbacatePay: acrescentar uma bandeira sem conferir la e anunciar o que o
 * gateway recusa. Mudar a conta e editar o modulo E este teste.
 */
describe('formas de pagamento', () => {
  it('aceita Pix e cartao, e nada mais', () => {
    expect(METODOS_PAGAMENTO).toEqual(['pix', 'cartao']);
  });

  it('anuncia exatamente as marcas habilitadas no painel, nesta ordem', () => {
    expect(MARCAS_ACEITAS.map((marca) => NOME_DA_MARCA[marca])).toEqual([
      'Pix',
      'Visa',
      'Mastercard',
      'Apple Pay',
      'Google Pay',
    ]);
  });

  it('separa o Pix do que depende do cartao ligado', () => {
    expect(MARCAS_DO_CARTAO).not.toContain('pix');
    expect([...MARCAS_DO_CARTAO, 'pix'].sort()).toEqual(
      [...MARCAS_ACEITAS].sort(),
    );
  });

  it('parcela em ate 12x', () => {
    expect(PARCELAS_MAXIMAS_NO_CARTAO).toBe(12);
  });
});
