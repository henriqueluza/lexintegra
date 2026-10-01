import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { CONTAS, entrar, expect, test } from '../jornadas/pilha';

/**
 * Acessibilidade da ficha de anamnese (Bloco A da B2), sobre a pilha.
 *
 * E a tela mais longa da area do cliente — dez blocos, mais de quarenta
 * perguntas, grupos de radio e de caixa de marcar —, e a unica do painel em que
 * o cliente escreve muito. O `grupo-opcoes` ja passa pelo axe no catalogo; aqui
 * o que se confere e a pagina montada: um `h1`, os `h2` dos blocos, as legendas
 * e, depois de um envio vazio, as mensagens de erro ligadas a cada grupo.
 *
 * O corte e o mesmo do catalogo: `serious` e `critical`.
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

test('a ficha de anamnese passa no axe, vazia e com os erros', async ({
  page,
}) => {
  await entrar(page, CONTAS.cliente);
  await page.goto('/painel/anamnese');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ficha inicial' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(10);

  expect(await graves(page)).toEqual([]);

  await page.getByRole('button', { name: 'Enviar ficha' }).click();
  await expect(page.getByText('Revise as respostas destacadas')).toBeVisible();

  expect(await graves(page)).toEqual([]);
});
