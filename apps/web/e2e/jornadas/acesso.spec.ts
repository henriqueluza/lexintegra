import { CONTAS, SENHA, entrar, expect, test } from './pilha';

/**
 * Login dos tres perfis e a fronteira entre eles (Etapa 4).
 *
 * A suite de unidade prova que os guards decidem certo e a de integracao prova
 * que a API recusa. O que so esta jornada prova e a fiacao entre os dois: token
 * emitido pelo Firebase, interceptor anexando, guard lendo a claim e rota
 * inicial certa por perfil — a cadeia inteira, no navegador. Foi ela que pegou
 * a dependencia circular no `ErrorHandler` da propria Etapa 12, que derrubava o
 * login inteiro sem quebrar teste de unidade nenhum.
 */
test.describe('acesso', () => {
  test('o cliente cai no painel dele', async ({ page }) => {
    await entrar(page, CONTAS.cliente);

    await expect(page).toHaveURL(/\/painel/);
  });

  test('o advogado cai nas demandas dele', async ({ page }) => {
    await entrar(page, CONTAS.advogado);

    await expect(page).toHaveURL(/\/advogado/);
  });

  test('o administrador cai na area administrativa', async ({ page }) => {
    await entrar(page, CONTAS.admin);

    await expect(page).toHaveURL(/\/admin/);
  });

  /** Sair precisa devolver a pessoa para fora da area autenticada. */
  test('sair encerra a sessao', async ({ page }) => {
    await entrar(page, CONTAS.cliente);

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/painel');
    await expect(page).not.toHaveURL(/\/painel/);
  });

  /**
   * O guard do navegador tira o cliente da rota administrativa. A negacao que
   * vale e a do servidor, e ela tem suite propria (`areas.integration-spec.ts`);
   * aqui o que se prova e que a tela nao abre uma porta que a API fecharia.
   */
  test('o cliente nao alcanca a area administrativa', async ({ page }) => {
    await entrar(page, CONTAS.cliente);

    await page.goto('/admin/advogados');

    await expect(page).not.toHaveURL(/\/admin/);
  });

  test('senha errada nao entra e diz por que', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(CONTAS.cliente);
    await page.getByLabel('Senha').fill(`${SENHA}-errada`);
    await page.getByRole('button', { name: /entrar/i }).click();

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);
  });
});
