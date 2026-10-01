import {
  TEXTO_TERMOS_CHECKOUT,
  VERSAO_TERMOS_CHECKOUT,
  RESUMO_TERMOS_CHECKOUT,
} from './termos-checkout.js';
import { TEXTO_PRAZOS_ESTORNO, TEXTO_REGRA_ESTORNO } from './regra-estorno.js';

describe('termos do checkout', () => {
  it('versiona o texto da B2 sem reaproveitar o aceite anterior', () => {
    expect(VERSAO_TERMOS_CHECKOUT).toBe('checkout-v3-2026-10');
  });

  /** decisoes.md 3.3 e 5.3: a regra e os prazos vem da constante unica. */
  it('traz a regra de estorno e os prazos da constante unica', () => {
    expect(TEXTO_TERMOS_CHECKOUT).toContain(TEXTO_REGRA_ESTORNO);
    expect(TEXTO_TERMOS_CHECKOUT).toContain(TEXTO_PRAZOS_ESTORNO);
    expect(TEXTO_TERMOS_CHECKOUT).toContain('não devolve o valor');
    expect(TEXTO_TERMOS_CHECKOUT).toContain('direito de arrependimento');
    expect(RESUMO_TERMOS_CHECKOUT).toContain('estorno');
  });

  it('nao publica marcador antigo', () => {
    expect(TEXTO_TERMOS_CHECKOUT).not.toMatch(/TODO|\{\{/u);
  });
});
