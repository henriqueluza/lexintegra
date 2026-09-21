import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
for (const caminho of [
  '/',
  '/todas-as-imagens',
  '/cadastro',
  '/servicos',
  '/carrinho',
  '/checkout',
  '/entrar',
  '/privacidade',
  '/termos',
]) {
  test(`redesign responsivo e acessível: ${caminho}`, async ({ page }) => {
    const chamadas: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api')) chamadas.push(r.url());
    });
    await page.goto(caminho);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('main')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator('body')).not.toContainText('{{TODO');
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      axe.violations.filter((v) =>
        ['critical', 'serious'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
    expect(chamadas).toEqual([]);
  });
}
test('as duas versões carregam fotografias e a antiga animação redireciona', async ({
  page,
}) => {
  await page.goto('/com-movimento');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main img')).toHaveCount(4);
  await page.goto('/todas-as-imagens');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main img')).toHaveCount(4);
  for (const foto of await page.locator('main img').all()) {
    await foto.scrollIntoViewIfNeeded();
    await expect(foto).toBeVisible();
    await expect
      .poll(() => foto.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await expect(page.locator('app-martelo')).toHaveCount(0);
});
test('a navegação oferece acesso independente aos fluxos', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link', { name: 'Cadastre-se' })).toHaveAttribute(
    'href',
    '/cadastro',
  );
  await expect(
    nav.getByRole('link', { name: 'Entrar', exact: true }),
  ).toHaveAttribute('href', '/entrar');
  await expect(nav.getByRole('link', { name: /Carrinho/ })).toHaveCount(0);
  await page.goto('/carrinho');
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho', exact: true }),
  ).toBeVisible();
});

test('as quatro perguntas animam abertura e fechamento com redução de movimento', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const botao of await page.locator('.pergunta button').all()) {
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'true');
    const id = await botao.getAttribute('aria-controls');
    const duracao = await page
      .locator('#' + id)
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
    expect(duracao).toBeLessThanOrEqual(0.001);
    await botao.click();
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
  }
});
