import { expect, test } from '@playwright/test';

/**
 * O PWA (05/10/2026), perguntado ao proprio Chromium pelo DevTools Protocol:
 * ele achou o manifesto pelo `<link rel="manifest">`, analisou sem erro e leu os
 * campos que a instalacao exige. O conteudo do manifesto e os icones sao
 * travados em `src/app/pwa.spec.ts`.
 *
 * NAO `Page.getInstallabilityErrors`: no Chromium headless ele devolve lista
 * vazia mesmo SEM manifesto (conferido em 05/10/2026), e um teste que sempre
 * passa nao prova nada.
 */
test('o Chrome encontra e le o manifesto', async ({ page }) => {
  await page.goto('/');
  const cdp = await page.context().newCDPSession(page);

  await expect
    .poll(
      async () =>
        (await cdp.send('Page.getAppManifest')) as {
          url: string;
          errors: { message: string }[];
          data?: string;
        },
      { timeout: 15_000 },
    )
    .toMatchObject({ url: expect.stringMatching(/\/manifest\.webmanifest$/) });

  const manifesto = (await cdp.send('Page.getAppManifest')) as {
    errors: { message: string }[];
    data: string;
  };
  expect(manifesto.errors).toEqual([]);
  const dados = JSON.parse(manifesto.data) as {
    display: string;
    start_url: string;
    icons: { sizes: string }[];
  };
  expect(dados.display).toBe('standalone');
  expect(dados.start_url).toBe('/');
  expect(dados.icons.map((i) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  for (const icone of dados.icons) {
    const resposta = await page.request.get(
      (icone as unknown as { src: string }).src,
    );
    expect(resposta.headers()['content-type']).toContain('image/png');
  }
});
