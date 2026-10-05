import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const rota of [
  '/',
  '/servicos',
  '/cadastro',
  '/entrar',
  '/recuperar-senha',
  '/definir-senha',
  '/carrinho',
  '/checkout',
  '/termos',
  '/privacidade',
]) {
  test(`Névoa: rodapé, acessibilidade e largura em ${rota}`, async ({
    page,
  }, testInfo) => {
    /*
     * O axe mede a cor CALCULADA, e a hero anima a entrada da nota com
     * opacidade: medida no meio, `--lex-text-secondary` sai misturada ao fundo
     * (#8994a1, 2,49:1, num CI de 05/10/2026). Movimento reduzido mostra o
     * estado final, que e o que a regra de contraste avalia — o mesmo que
     * `redesign.spec.ts` faz, pelo mesmo motivo.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(rota);
    await page.evaluate(() => document.fonts.ready);
    const rodape = page.locator('app-rodape-publico');
    await expect(rodape).toHaveCount(1);
    await expect(rodape).toContainText('33.906.250/0001-44');
    await expect(
      rodape.getByRole('link', { name: 'suportelexintegra@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:suportelexintegra@gmail.com');
    // 05/10/2026: o e-mail é o único contato; o telefone saiu.
    await expect(rodape.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(
      rodape.getByRole('link', { name: 'Termos de uso' }),
    ).toHaveAttribute('href', '/termos');
    await expect(
      rodape.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const resultado = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(resultado.violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('pagina.png'),
      fullPage: rota !== '/',
    });
  });
}

test('menu prende o foco, fecha com Esc e devolve foco ao acionador', async ({
  page,
}) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.querySelector('dialog')?.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialogo).not.toBeVisible();
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('catálogo de componentes mantém o tema existente após sair da home', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('app-root')).toHaveClass('publica-nevoa');
  await page.goto('/catalogo');
  await expect(page.locator('app-root')).not.toHaveClass('publica-nevoa');
  await expect(page.locator('app-rodape-publico')).toHaveCount(0);
});

test('movimento reduzido mantém capítulos, FAQ e trilho utilizáveis', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.capitulo')).toHaveCount(5);
  await page.getByRole('button', { name: 'Próximo serviço' }).click();
  expect(
    await page.locator('#trilho-servicos').evaluate((el) => el.scrollLeft),
  ).toBeGreaterThan(0);
  const pergunta = page.getByRole('button', {
    name: 'O cadastro inicial já cria minha conta?',
  });
  await pergunta.click();
  await expect(page.locator('#resposta-0')).toBeVisible();
  await pergunta.click();
  await expect(page.locator('#resposta-0')).not.toBeVisible();
});

test('composição aprovada em 1440 e 390 e limites responsivos', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
      for (const [nome, seletor] of [
        ['capitulo', '#passo-0'],
        ['ficha', '#ficha'],
        ['servicos', '#servicos'],
        ['rodape', 'footer'],
      ] as const) {
        const secao = page.locator(seletor);
        await secao.scrollIntoViewIfNeeded();
        for (const img of await secao.locator('img').all()) {
          await img.evaluate((elemento: HTMLImageElement) => elemento.decode());
        }
        await secao.screenshot({
          path: testInfo.outputPath(`${nome}-${width}.png`),
        });
      }
      await page
        .getByRole('link', { name: 'LexIntegra — início' })
        .first()
        .click();
    }
  }
});

/**
 * O celular (05/10/2026): ao abrir, a PRIMEIRA TELA e so a hero — titulo,
 * texto e "Ver servicos e precos" —, e a landing continua inteira ao rolar. Um
 * pedido anterior escondia as secoes no celular (PR #79); foi desfeito.
 */
test('no celular, a primeira tela é só a hero e a landing segue inteira', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hero = page.locator('section.hero');
  await expect(hero.getByRole('heading', { level: 1 })).toBeInViewport();
  await expect(
    hero.getByRole('link', { name: 'Ver serviços e preços' }),
  ).toBeInViewport();
  await expect(hero.getByRole('link', { name: 'Como funciona' })).toHaveCount(
    0,
  );
  await expect(hero.locator('.nota')).toBeHidden();
  await expect(page.locator('.percurso')).toBeHidden();
  await expect(page.locator('#como')).not.toBeInViewport();

  for (const id of ['como', 'ficha', 'servicos', 'duvidas']) {
    const secao = page.locator('#' + id);
    await secao.scrollIntoViewIfNeeded();
    await expect(secao).toBeVisible();
  }
  await expect(page.locator('.capitulo')).toHaveCount(5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const menu = page.getByRole('dialog');
  for (const ancora of ['Como funciona', 'Seu pedido', 'Dúvidas']) {
    await expect(menu.getByRole('link', { name: ancora })).toBeVisible();
  }
});

/** A partir de 720 px a hero continua com o link, a nota e o percurso. */
test('a partir de 720 px, a hero mantém o percurso', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/');
  const hero = page.locator('section.hero');
  await expect(hero.getByRole('link', { name: 'Como funciona' })).toBeVisible();
  await expect(hero.locator('.nota')).toBeVisible();
  await expect(page.locator('.percurso')).toBeVisible();
});

/**
 * Regressao de 05/10/2026: com `<base href="/">`, o `#secao-n` sozinho levava
 * para a home. O sumario precisa ficar na mesma pagina e levar a secao ao topo,
 * abaixo do cabecalho fixo.
 */
for (const rota of ['/termos', '/privacidade']) {
  test(`"Nesta página" leva à seção em ${rota}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(rota);
    const sumario = page.getByRole('navigation', { name: 'Nesta página' });
    const links = sumario.getByRole('link');
    const ultimo = links.last();
    const titulo = (await ultimo.textContent())?.trim() ?? '';
    await ultimo.click();
    await expect(page).toHaveURL(new RegExp(`${rota}#secao-\\d+$`));
    const secao = page.getByRole('heading', { name: titulo, level: 2 }).last();
    await expect(secao).toBeInViewport();
    expect(new URL(page.url()).pathname).toBe(rota);
  });
}
