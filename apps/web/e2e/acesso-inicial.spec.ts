import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('login oferece criar senha sem consultar existencia e leva o email ao envio', async ({
  page,
}) => {
  const envios: unknown[] = [];
  await page.route('**/api/auth/redefinicao-senha', (rota) => {
    envios.push(rota.request().postDataJSON());
    return rota.fulfill({ status: 202, body: '' });
  });
  await page.goto('/entrar');
  // O HTML inicial ja tem campos; a validacao confirma que Angular hidratou.
  await expect(async () => {
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText('Campo obrigatório.').first()).toBeVisible({
      timeout: 500,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel('E-mail').fill('ana@exemplo.test');
  await page.getByLabel('Senha').focus();
  await expect(
    page.getByRole('link', { name: 'Criar ou recuperar senha', exact: true }),
  ).toBeVisible();
  expect(envios).toEqual([]);
  await page
    .getByRole('link', { name: 'Criar ou recuperar senha', exact: true })
    .click();
  await expect(page.getByLabel('E-mail')).toHaveValue('ana@exemplo.test');
  await page.getByRole('button', { name: 'Enviar link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verifique seu e-mail' }),
  ).toBeVisible();
  expect(envios).toEqual([{ email: 'ana@exemplo.test' }]);
  await expect(
    page.getByText('Se houver um pré-cadastro ou uma conta', { exact: false }),
  ).toBeVisible();
});

test('pre-cadastro oferece retomada sem repetir os dados e sem problemas de acessibilidade', async ({
  page,
}, info) => {
  await page.goto('/cadastro');
  await expect(
    page.getByRole('link', { name: 'Criar ou recuperar senha', exact: true }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: `/tmp/lex-acesso-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Criar ou recuperar senha', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Criar ou recuperar senha',
      exact: true,
    }),
  ).toBeVisible();
});
