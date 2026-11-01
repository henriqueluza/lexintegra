import { codigoCurtoDoPedido } from './codigo-do-pedido.js';

describe('codigoCurtoDoPedido', () => {
  it('seis ultimos da cobranca, hifen e o numero do item', () => {
    expect(codigoCurtoDoPedido('pix_char_czxa1U3t5ZpHDY6p65fWCFnW_001')).toBe(
      'fWCFnW-001',
    );
  });

  it('usa o ULTIMO sublinhado: a cobranca tambem tem sublinhados', () => {
    expect(codigoCurtoDoPedido('bill_abc_def_123456_012')).toBe('123456-012');
  });

  it('cobranca curta entra inteira', () => {
    expect(codigoCurtoDoPedido('abc_002')).toBe('abc-002');
  });

  it('id fora do formato sai inteiro', () => {
    expect(codigoCurtoDoPedido('pedido-sem-item')).toBe('pedido-sem-item');
    expect(codigoCurtoDoPedido('_001')).toBe('_001');
  });
});
