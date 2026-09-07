import { expect, test } from '@playwright/test';

/**
 * A prova do ADR-09, contra o BUILD ESTATICO e com o JavaScript DESLIGADO.
 *
 * O Google executa JavaScript e acabaria indexando de qualquer forma. O problema
 * real sao WhatsApp, Instagram, LinkedIn e Telegram, que nao executam script e
 * leem apenas as tags do HTML servido — um link compartilhado chegaria sem
 * titulo, sem descricao e sem imagem.
 *
 * Roda so pelo `scripts/publico.sh`, que constroi e serve `dist/web/browser`. O
 * servidor de desenvolvimento nao serve o que o Hosting vai servir, e e o que o
 * Hosting serve que o rastreador le.
 */
test.use({ javaScriptEnabled: false });

/*
 * Contra o servidor de desenvolvimento estas afirmacoes nao valem: o `ng serve`
 * nao serve o que o Hosting vai servir. `URL_BASE` so esta definida quando
 * `scripts/publico.sh` aponta a suite para o build estatico — sem ela, a suite se
 * declara ignorada em vez de reprovar por um motivo que nao e defeito.
 */
test.skip(
  process.env['URL_BASE'] === undefined,
  'Precisa do build estatico: rode `scripts/publico.sh`.',
);

test.describe('pre-renderizacao da area publica', () => {
  test('serve o conteudo sem JavaScript', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('O trabalho jurídico');
    await expect(page.getByText('Como funciona')).toBeVisible();
    await expect(page.getByText('Crie seu acesso')).toBeVisible();
  });

  /**
   * O estado servido e o TRAVADO, e tem que ser: o HTML e o mesmo para todo
   * mundo, e servir a vitrine aberta entregaria o catalogo a quem nao se
   * cadastrou — inclusive ao rastreador.
   */
  test('serve a vitrine travada, nunca o catalogo', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByText('Os preços aparecem depois do cadastro'),
    ).toBeVisible();
  });

  test('serve o formulario e o aviso de privacidade', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await expect(page.getByLabel('Telefone')).toBeVisible();
    await expect(
      page.getByText('Você pode pedir a exclusão a qualquer momento.'),
    ).toBeVisible();
  });

  /**
   * As tags que as redes sociais leem. Sem elas, o link compartilhado chega como
   * uma URL crua.
   */
  test('serve as tags que as redes sociais leem', async ({ page }) => {
    await page.goto('/');

    const conteudo = async (seletor: string): Promise<string | null> =>
      page.locator(seletor).first().getAttribute('content');

    expect(await conteudo('meta[property="og:title"]')).toBeTruthy();
    expect(await conteudo('meta[property="og:description"]')).toBeTruthy();
    expect(await conteudo('meta[property="og:url"]')).toContain('lexintegra');
    expect(await conteudo('meta[name="description"]')).toBeTruthy();
  });

  /**
   * O marcador que o CI ja confere no `index.html`. Aqui ele e conferido na
   * pagina servida, que e onde ele importa.
   */
  test('o HTML e pre-renderizado, e nao uma casca vazia', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('app-root')).toHaveAttribute(
      'ng-server-context',
      'ssg',
    );
  });
});
