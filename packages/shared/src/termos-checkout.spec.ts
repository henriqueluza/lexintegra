import {
  TEXTO_TERMOS_CHECKOUT,
  VERSAO_TERMOS_CHECKOUT,
  RESUMO_TERMOS_CHECKOUT,
} from './termos-checkout.js';
describe('termos do checkout', () => {
  it('versiona a minuta sem reaproveitar o aceite anterior', () => {
    expect(VERSAO_TERMOS_CHECKOUT).toBe('checkout-v2-minuta-2026-09');
  });
  it('explica cancelamento, estorno e preserva direitos legais', () => {
    expect(TEXTO_TERMOS_CHECKOUT).not.toContain('TODO');
    expect(TEXTO_TERMOS_CHECKOUT).toContain('não devolve automaticamente');
    expect(TEXTO_TERMOS_CHECKOUT).toContain('direitos assegurados');
    expect(RESUMO_TERMOS_CHECKOUT).toContain('estorno');
  });
});
