import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Acessibilidade da pagina publica, nas tres larguras que os projetos do
 * Playwright ja definem (360, 768 e 1280).
 *
 * Roda sobre os DOIS estados da vitrine, e nao so o inicial: o estado destravado
 * tem uma arvore de conteudo diferente — cartoes, listas e precos que nao existem
 * no travado — e verificar so o travado deixaria metade da pagina sem cobertura.
 */
const GRAVIDADES = ['serious', 'critical'];

async function violacoes(
  page: import('@playwright/test').Page,
): Promise<unknown[]> {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return resultado.violations
    .filter((v) => GRAVIDADES.includes(v.impact ?? ''))
    .map((v) => ({
      regra: v.id,
      descricao: v.help,
      onde: v.nodes.map((n) => n.target.join(' ')),
    }));
}

test.describe('acessibilidade da area publica', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'produto-1',
            nome: 'Revisão de contrato comercial',
            descricao: 'Leitura completa e minuta revisada.',
            precoCentavos: 250_000,
            entregaveis: ['Minuta revisada'],
            quantidadeReunioes: 1,
            numeroRevisoesPermitidas: 2,
          },
        ]),
      }),
    );
    await page.route('**/api/pre-cadastros', (rota) =>
      rota.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'id.segredo',
          expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    );
  });

  test('com a vitrine travada', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    expect(await violacoes(page)).toEqual([]);
  });

  test('com a vitrine liberada', async ({ page }) => {
    await page.goto('/');

    /* Prova que a aplicacao hidratou: ver `esperarHidratacao` em publico.spec.ts. */
    await page.getByRole('button', { name: 'Criar acesso' }).click();
    await expect(page.getByText('Campo obrigatório.').first()).toBeVisible();

    await page.getByLabel('Nome completo').fill('Ana Ribeiro Salgado');
    await page.getByLabel('E-mail').fill('ana@empresa.com.br');
    await page.getByLabel('Telefone').fill('(61) 99000-0000');
    await page.getByRole('button', { name: 'Criar acesso' }).click();
    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();

    expect(await violacoes(page)).toEqual([]);
  });
});
