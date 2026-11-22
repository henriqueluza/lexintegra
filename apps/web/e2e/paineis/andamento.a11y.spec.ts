import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { CONTAS, entrar, expect, test } from '../jornadas/pilha';

/**
 * Acessibilidade da tela "Andamento" do administrador (lote de novembro, ajuste
 * 5), sobre a pilha, no mesmo corte de `anamnese.a11y.spec.ts`: `serious` e
 * `critical`.
 *
 * DUAS FOTOGRAFIAS: a tela aberta e a tela com uma trilha aberta, porque o
 * botao com `aria-expanded` e o painel que ele controla so existem juntos
 * depois do clique.
 */
const GRAVIDADES = ['serious', 'critical'];

async function graves(page: Page): Promise<unknown[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations
    .filter((v) => GRAVIDADES.includes(v.impact ?? ''))
    .map((v) => ({
      regra: v.id,
      descricao: v.help,
      onde: v.nodes.map((n) => n.target.join(' ')),
    }));
}

test('o andamento passa no axe, fechado e com uma trilha aberta', async ({
  page,
}) => {
  await entrar(page, CONTAS.admin);
  await page.goto('/admin/andamento');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Andamento' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  expect(await graves(page)).toEqual([]);

  await page
    .getByRole('button', { name: /^Ver trilha/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Trilhas abertas' }),
  ).toBeVisible();

  expect(await graves(page)).toEqual([]);
});
