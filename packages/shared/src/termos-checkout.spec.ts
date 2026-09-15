import {
  RESUMO_TERMOS_CHECKOUT,
  TEXTO_TERMOS_CHECKOUT,
  VERSAO_TERMOS_CHECKOUT,
} from './termos-checkout.js';

/**
 * ESTE TESTE CAI DE PROPOSITO quando o texto juridico chegar. E o que transforma
 * a substituicao num ato: quem trocar o marcador precisa trocar a versao junto e
 * reescrever este arquivo — e nao ha como esquecer de um dos dois.
 */
describe('termos do checkout (ADR-12)', () => {
  it('ainda mostra o marcador do texto juridico pendente', () => {
    expect(TEXTO_TERMOS_CHECKOUT).toBe('{{TODO-TEXTO-REGRA-ESTORNO-ADR-12}}');
  });

  it('ainda esta na versao que diz que o texto e pendente', () => {
    expect(VERSAO_TERMOS_CHECKOUT).toContain('pendente');
  });

  /** O resumo repete a regra do ADR-12, e nao a inventa. */
  it('o resumo fala da regra de estorno', () => {
    expect(RESUMO_TERMOS_CHECKOUT).toMatch(/estorno/);
    expect(RESUMO_TERMOS_CHECKOUT).toMatch(/elaborado/);
  });
});
