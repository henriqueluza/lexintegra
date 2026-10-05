import { expect, test } from '@playwright/test';

/*
 * Abaixo de 720 px a landing é só a hero e o rodapé (landing-celular.css): os
 * testes que precisam do percurso, dos capítulos ou do trilho fixam a largura.
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('capítulos acompanham a rolagem, ciclo segura no hover e encerra ao sair da landing', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.goto('/');
  await expect(page.locator('.percurso')).toHaveClass(/is-cycle/);
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.waitForTimeout(2600);
  await page.locator('.percurso li').nth(1).hover();
  await expect(page.locator('[data-contador]')).toHaveText('02');
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-contador]')).toHaveText('02');
  const capitulo = page.locator('.capitulo').first();
  await page.evaluate(() =>
    window.scrollTo(
      0,
      document.querySelector<HTMLElement>('.capitulo')!.offsetTop -
        innerHeight * 0.7,
    ),
  );
  await page.waitForTimeout(150);
  await expect
    .poll(() =>
      capitulo
        .locator('.iris i')
        .first()
        .evaluate((el) => getComputedStyle(el).transform),
    )
    .not.toBe('none');
  const antes = await capitulo
    .locator('img')
    .evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.move(10, 400);
  await page.mouse.wheel(0, 220);
  await expect
    .poll(() =>
      capitulo.locator('img').evaluate((el) => getComputedStyle(el).transform),
    )
    .not.toBe(antes);
  await page
    .getByRole('button', { name: 'Menu', exact: true })
    .evaluate((el: HTMLElement) => el.scrollIntoView());
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Serviços', exact: true })
    .click();
  await expect(page).toHaveURL(/servicos/);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  expect(erros).toEqual([]);
});

test('preferência de movimento reduzido desliga efeitos já em execução', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.percurso')).toHaveClass(/is-cycle/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.percurso')).not.toHaveClass(/is-cycle/);
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  await expect(
    page.locator('.introducao').first().locator('p span'),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.percurso')).toHaveClass(/is-cycle/);
});

test('line-up responde ao arraste e menu móvel pode ser puxado para fechar', async ({
  page,
}) => {
  // O trilho só existe a partir de 720 px; o menu móvel, abaixo de 800.
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/');
  await expect(page.locator('.percurso')).toHaveClass(/is-cycle/);
  const trilho = page.locator('.trilho');
  await trilho.scrollIntoViewIfNeeded();
  const area = (await trilho.boundingBox())!;
  await page.mouse.move(area.x + 300, area.y + 100);
  await page.mouse.down();
  await page.mouse.move(area.x + 30, area.y + 100, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(() => trilho.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const alca = page.locator('.alca');
  await expect(alca).toBeVisible();
  await page.waitForTimeout(650);
  const ponto = (await alca.boundingBox())!;
  await page.mouse.move(ponto.x + 150, ponto.y + 20);
  await page.mouse.down();
  await page.mouse.move(ponto.x + 150, ponto.y + 280, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('âncora leva ao capítulo com rolagem suave', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.percurso')).toHaveClass(/is-cycle/);
  await page.waitForTimeout(2600);
  await page.locator('a[href="#passo-0"]').click();
  await expect(page).toHaveURL(/#passo-0/);
  await expect
    .poll(() =>
      page
        .locator('#passo-0')
        .evaluate((el) => Math.abs(el.getBoundingClientRect().top)),
    )
    .toBeLessThan(120);
});
