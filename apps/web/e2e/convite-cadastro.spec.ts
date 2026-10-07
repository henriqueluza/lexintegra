import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * O convite do fim da home (07/10/2026): quem rola a landing ate o fim, sem ter
 * liberado o catalogo, recebe um popup que leva ao cadastro inicial.
 *
 * O UNICO arquivo que comeca com o armazenamento vazio. Os outros recebem o
 * convite ja fechado (`playwright.config.ts`), porque ele e modal e ficaria na
 * frente dos cliques de quem rola a pagina ate o fim.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

function espiarApi(page: Page): string[] {
  const chamadas: string[] = [];
  page.on('request', (requisicao) => {
    const caminho = new URL(requisicao.url()).pathname;
    if (caminho.startsWith('/api')) chamadas.push(caminho);
  });
  return chamadas;
}

/**
 * A landing hidratada: o FAQ so abre depois do Angular assumir o HTML
 * pre-renderizado, e e ai que o observador do fim da pagina ja existe. Abrir e
 * fechar uma resposta, como em `telas-publicas.visual.spec.ts`.
 */
async function esperarLanding(page: Page): Promise<void> {
  const pergunta = page.locator('.pergunta button').first();
  await expect(async () => {
    await pergunta.click();
    await expect(pergunta).toHaveAttribute('aria-expanded', 'true', {
      timeout: 500,
    });
  }).toPass({ timeout: 15_000 });
  await pergunta.click();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function irAoFim(page: Page): Promise<void> {
  await page.goto('/');
  await esperarLanding(page);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
}

const convite = (page: Page): Locator =>
  page.getByRole('dialog', { name: 'Seu próximo passo começa aqui.' });

test('aparece no fim da home e leva ao cadastro, sem chamar a API', async ({
  page,
}) => {
  const chamadas = espiarApi(page);

  await page.goto('/');
  await esperarLanding(page);
  await expect(convite(page)).toBeHidden();

  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(convite(page)).toBeVisible();
  expect(chamadas).toEqual([]);

  await convite(page)
    .getByRole('link', { name: 'Ver serviços e preços' })
    .click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByLabel('Nome completo')).toBeVisible();
});

test('fechado, nao volta na proxima visita', async ({ page }) => {
  await irAoFim(page);
  await expect(convite(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(convite(page)).toBeHidden();

  await irAoFim(page);
  await page.waitForTimeout(500);
  await expect(convite(page)).toBeHidden();
});

test('"Agora não" fecha e devolve a pagina', async ({ page }) => {
  await irAoFim(page);

  await convite(page).getByRole('button', { name: 'Agora não' }).click();

  await expect(convite(page)).toBeHidden();
  await page.getByRole('link', { name: 'LexIntegra — início' }).first().click();
});

test('quem ja liberou o catalogo nao ve o convite', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'lexintegra:pre-cadastro',
      JSON.stringify({
        token: 'id-de-teste.segredo-de-teste',
        expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ),
  );

  await irAoFim(page);
  await page.waitForTimeout(500);

  await expect(convite(page)).toBeHidden();
});

/** O popup aberto passa no axe, nas mesmas regras e gravidades da area publica. */
test('aberto, sem violacao de acessibilidade', async ({ page }) => {
  await irAoFim(page);
  await expect(convite(page)).toBeVisible();

  const resultado = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    resultado.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      .map((v) => v.id),
  ).toEqual([]);
});
