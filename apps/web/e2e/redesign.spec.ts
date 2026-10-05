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
    /*
     * O axe mede a cor CALCULADA, e a landing anima a entrada dos blocos
     * (opacidade). Com o movimento ligado, a medição às vezes cai no meio da
     * animação e lê a mistura da cor com o fundo — o rótulo do percurso, com
     * token de 5,3:1, já foi medido a 3,25:1 assim, num CI sim e no seguinte
     * não, com a mesma árvore. Movimento reduzido mostra o estado final, que é
     * o que a regra de contraste avalia; a suíte visual já faz o mesmo.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
test('a home carrega a fotografia e as rotas antigas redirecionam', async ({
  page,
}) => {
  // As fotografias dos capitulos so existem a partir de 720 px (landing-celular.css).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/com-movimento');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main img')).toHaveCount(7);
  await page.goto('/todas-as-imagens');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main img')).toHaveCount(7);
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
  const nav = page.getByRole('dialog', { name: 'Navegação principal' });
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

test('as perguntas animam abertura e fechamento com redução de movimento', async ({
  page,
}) => {
  // O FAQ so existe a partir de 720 px (landing-celular.css).
  await page.setViewportSize({ width: 1280, height: 900 });
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
