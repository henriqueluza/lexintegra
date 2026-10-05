import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const rota of [
  '/',
  '/servicos',
  '/cadastro',
  '/entrar',
  '/recuperar-senha',
  '/definir-senha',
  '/carrinho',
  '/checkout',
  '/termos',
  '/privacidade',
]) {
  test(`Névoa: rodapé, acessibilidade e largura em ${rota}`, async ({
    page,
  }, testInfo) => {
    /*
     * O axe mede a cor CALCULADA, e a hero anima a entrada da nota com
     * opacidade: medida no meio, `--lex-text-secondary` sai misturada ao fundo
     * (#8994a1, 2,49:1, num CI de 05/10/2026). Movimento reduzido mostra o
     * estado final, que e o que a regra de contraste avalia — o mesmo que
     * `redesign.spec.ts` faz, pelo mesmo motivo.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(rota);
    await page.evaluate(() => document.fonts.ready);
    const rodape = page.locator('app-rodape-publico');
    await expect(rodape).toHaveCount(1);
    await expect(rodape).toContainText('33.906.250/0001-44');
    await expect(
      rodape.getByRole('link', { name: 'suportelexintegra@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:suportelexintegra@gmail.com');
    // 05/10/2026: o e-mail é o único contato; o telefone saiu.
    await expect(rodape.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(
      rodape.getByRole('link', { name: 'Termos de uso' }),
    ).toHaveAttribute('href', '/termos');
    await expect(
      rodape.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(resultado.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('pagina.png'),
      fullPage: rota !== '/',
    });
  });
}

test('menu prende o foco, fecha com Esc e devolve foco ao acionador', async ({
  page,
}) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.querySelector('dialog')?.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialogo).not.toBeVisible();
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('catálogo de componentes mantém o tema existente após sair da home', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('app-root')).toHaveClass('publica-nevoa');
  await page.goto('/catalogo');
  await expect(page.locator('app-root')).not.toHaveClass('publica-nevoa');
  await expect(page.locator('app-rodape-publico')).toHaveCount(0);
});

test('movimento reduzido mantém capítulos, FAQ e trilho utilizáveis', async ({
  page,
}) => {
  // As seções só existem a partir de 720 px (landing-celular.css).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.capitulo')).toHaveCount(5);
  await page.getByRole('button', { name: 'Próximo serviço' }).click();
  expect(
    await page.locator('#trilho-servicos').evaluate((el) => el.scrollLeft),
  ).toBeGreaterThan(0);
  const pergunta = page.getByRole('button', {
    name: 'O cadastro inicial já cria minha conta?',
  });
  await pergunta.click();
  await expect(page.locator('#resposta-0')).toBeVisible();
  await pergunta.click();
  await expect(page.locator('#resposta-0')).not.toBeVisible();
});

test('composição aprovada em 1440 e 390 e limites responsivos', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
      // No celular a página é só a hero e o rodapé (landing-celular.css).
      const secoes =
        width < 720
          ? ([['rodape', 'footer']] as const)
          : ([
              ['capitulo', '#passo-0'],
              ['ficha', '#ficha'],
              ['servicos', '#servicos'],
              ['rodape', 'footer'],
            ] as const);
      for (const [nome, seletor] of secoes) {
        const secao = page.locator(seletor);
        await secao.scrollIntoViewIfNeeded();
        for (const img of await secao.locator('img').all()) {
          await img.evaluate((elemento: HTMLImageElement) => elemento.decode());
        }
        await secao.screenshot({
          path: testInfo.outputPath(`${nome}-${width}.png`),
        });
      }
      await page
        .getByRole('link', { name: 'LexIntegra — início' })
        .first()
        .click();
    }
  }
});

/**
 * Abaixo de 720 px (05/10/2026): só a hero, com as ações principais, e o rodapé
 * completo. As seções escondidas saem também da árvore de acessibilidade, e o
 * menu não aponta para âncoras que não existem na tela.
 */
test('no celular, a landing é só a hero e o rodapé', async ({ page }) => {
  // Movimento reduzido: o axe mede a cor calculada (ver o teste do rodapé).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const main = page.locator('main');
  await expect(main.locator('section:visible')).toHaveCount(1);
  await expect(main.locator('section.hero')).toBeVisible();
  for (const id of ['como', 'ficha', 'servicos', 'duvidas']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }
  await expect(page.locator('.percurso')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dúvidas.' })).toHaveCount(0);
  const hero = page.locator('section.hero');
  await expect(
    hero.getByRole('link', { name: 'Ver serviços e preços' }),
  ).toHaveAttribute('href', '/servicos');
  await expect(
    hero.getByRole('link', { name: 'Cadastro gratuito' }),
  ).toHaveAttribute('href', '/cadastro');
  await expect(
    hero.getByRole('link', { name: 'Entrar', exact: true }),
  ).toHaveAttribute('href', '/entrar');
  await expect(hero.getByRole('link', { name: 'Como funciona' })).toHaveCount(
    0,
  );
  const rodape = page.locator('app-rodape-publico');
  await expect(rodape).toBeVisible();
  await expect(rodape).toContainText('33.906.250/0001-44');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('link', { name: 'Serviços' })).toBeVisible();
  for (const ancora of ['Como funciona', 'Seu pedido', 'Dúvidas']) {
    await expect(menu.getByRole('link', { name: ancora })).toHaveCount(0);
  }
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
});

test('a partir de 720 px, a landing mostra as seções', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/');
  for (const id of ['como', 'ficha', 'servicos', 'duvidas']) {
    await expect(page.locator('#' + id)).toBeAttached();
    expect(
      await page
        .locator('#' + id)
        .evaluate((el) => getComputedStyle(el).display),
    ).not.toBe('none');
  }
  await expect(
    page
      .locator('section.hero')
      .getByRole('link', { name: 'Cadastro gratuito' }),
  ).toHaveCount(0);
});
