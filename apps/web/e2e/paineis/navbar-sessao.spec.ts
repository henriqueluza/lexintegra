import { CONTAS, entrar, expect, test } from '../jornadas/pilha';
for (const [perfil, conta, destino] of [
  ['cliente', CONTAS.cliente, '/painel'],
  ['advogado', CONTAS.advogado, '/advogado'],
  ['admin', CONTAS.admin, '/admin'],
] as const) {
  test(`navbar reconhece sessão restaurada de ${perfil} e a saída`, async ({
    page,
  }) => {
    await entrar(page, conta);
    await page.goto('/');
    await page.reload();
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    if (await menu.isVisible()) await menu.click();
    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    await expect(nav.locator('a[href="' + destino + '"]')).toBeVisible();
    await expect(nav.getByRole('link', { name: /Carrinho/ })).toBeVisible();
    await expect(
      nav.locator('a[href="/entrar"],a[href="/cadastro"]'),
    ).toHaveCount(0);
    await nav.locator('a[href="' + destino + '"]').click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);
    await page.goto('/');
    if (await menu.isVisible()) await menu.click();
    await expect(
      nav.getByRole('link', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: /Carrinho/ })).toHaveCount(0);
  });
}
