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
  await expect(page.locator('main img')).toHaveCount(2);
  await page.getByRole('link', { name: 'Ver todas as imagens' }).click();
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
  await nav.getByRole('link', { name: 'Carrinho 0' }).click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(
    page.getByRole('heading', { name: 'Seu carrinho', exact: true }),
  ).toBeVisible();
});
