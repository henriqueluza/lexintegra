import { expect, test } from '@playwright/test';

test('visitante vê entrar e cadastro; pré-cadastrado vê somente catálogo', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const chamadas: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api'))
      chamadas.push(req.url());
  });
  await page.goto('/');
  const navbar = page.locator('header .atalhos');
  await expect(
    navbar.getByRole('link', { name: 'Entrar', exact: true }),
  ).toHaveAttribute('href', '/entrar');
  await expect(
    navbar.getByRole('link', { name: 'Cadastro', exact: true }),
  ).toHaveAttribute('href', '/cadastro');
  await expect(
    navbar.getByRole('link', { name: 'Entrar', exact: true }),
  ).toBeVisible();
  await expect(
    navbar.getByRole('link', { name: 'Cadastro', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('navbar-visitante.png') });
  await page.evaluate(() =>
    localStorage.setItem(
      'lexintegra:pre-cadastro',
      JSON.stringify({
        token: 'token-ficticio-local',
        expiraEm: new Date(Date.now() + 86400000).toISOString(),
      }),
    ),
  );
  await page.reload();
  await expect(
    navbar.getByRole('link', { name: 'Catálogo', exact: true }),
  ).toBeVisible();
  await expect(navbar.locator('a')).toHaveCount(1);
  await expect(navbar.locator('a')).toHaveAttribute('href', '/servicos');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog');
  await expect(
    menu.getByRole('link', { name: 'Entrar', exact: true }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole('link', { name: 'Cadastre-se', exact: true }),
  ).toHaveCount(0);
  await expect(
    menu.getByRole('link', { name: 'Acessar catálogo', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: testInfo.outputPath('navbar-pre-cadastro.png'),
  });
  expect(chamadas).toEqual([]);
});
