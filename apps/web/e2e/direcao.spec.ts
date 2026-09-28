import { expect, test } from '@playwright/test';
import { abrirPeca } from './pecas';

/**
 * As duas direcoes visuais se ANINHAM, e este arquivo existe por causa de um bug
 * que so aparece por isso.
 *
 * Em producao o `<html>` e sempre `data-direcao="catedra"` (rotas publicas), e a
 * shell autenticada da Etapa 4 poe `data-direcao="pauta"` num elemento abaixo
 * dele. Ou seja: todo componente da area do cliente e, ao mesmo tempo,
 * descendente de um `[data-direcao='catedra']`.
 *
 * A primeira versao do desvio de escopo de superficie elevada era
 * `[data-direcao='catedra'] .superficie-elevada`, e vazava por esse caminho: um
 * cartao da area do cliente pegava o dourado da Catedra sobre fundo branco. O axe
 * pegou pelo sintoma (contraste); estes testes pegam pela causa.
 *
 * O catalogo reproduz o aninhamento de producao, que e o que torna a verificacao
 * possivel aqui.
 */
async function tokenResolvido(
  page: import('@playwright/test').Page,
  seletor: string,
  token: string,
): Promise<string> {
  return page.evaluate(
    ([sel, nome]) => {
      const el = document.querySelector(sel as string);
      if (el === null) throw new Error(`Nao encontrei ${sel}`);
      return getComputedStyle(el)
        .getPropertyValue(nome as string)
        .trim();
    },
    [seletor, token] as const,
  );
}

test.describe('aninhamento das direcoes', () => {
  test('o catalogo de fato aninha uma direcao dentro da outra', async ({
    page,
  }) => {
    await abrirPeca(page, 'cartao');

    const aninhado = await page.evaluate(() => {
      const pauta = document.querySelector('[data-direcao="pauta"]');
      return pauta?.closest('[data-direcao="catedra"]') !== null;
    });

    expect(aninhado).toBe(true);
  });

  test('a superficie elevada da Pauta usa o acento da Pauta, nao o da Catedra', async ({
    page,
  }) => {
    await abrirPeca(page, 'cartao');

    const acento = await tokenResolvido(
      page,
      '[data-direcao="pauta"] .cartao.superficie-elevada',
      '--acento',
    );

    // --vinho, nao --ouro-400.
    expect(acento.toLowerCase()).toBe('#6c0c0c');
  });

  /*
   * Desde o ADR-22 as duas areas apontam `--acento-em-elevada` para o mesmo vinho,
   * e o dourado da Catedra saiu das superficies. O teste continua: ele prova que
   * a indirecao existe e resolve no escopo certo, que e o que permite uma area
   * futura ter um acento proprio sem mexer em componente.
   */
  test('a superficie elevada da area publica resolve o acento de elevada', async ({
    page,
  }) => {
    await abrirPeca(page, 'cartao');

    const acento = await tokenResolvido(
      page,
      '[data-direcao="catedra"] .cartao.superficie-elevada',
      '--acento',
    );

    // --vinho (12,39:1 sobre o branco).
    expect(acento.toLowerCase()).toBe('#6c0c0c');
  });

  test('a tabela tambem declara a superficie elevada', async ({ page }) => {
    await abrirPeca(page, 'tabela');

    const acento = await tokenResolvido(
      page,
      '[data-direcao="catedra"] .tabela',
      '--acento',
    );

    expect(acento.toLowerCase()).toBe('#6c0c0c');
  });
});
