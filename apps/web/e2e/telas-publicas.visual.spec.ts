import { expect, test, type Locator, type Page } from '@playwright/test';
import { esperarHidratacao } from './hidratacao';

// Capturas estáticas; o movimento real é verificado em movimento.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

/**
 * As FOTOGRAFIAS da landing ficam mascaradas na captura. Com tudo igual, o
 * Chrome as vezes rasteriza uma foto grande com outra qualidade de escala, e a
 * textura (nuvens, fachadas) muda alguns milhares de pixels de uma execucao
 * para a outra — no CI, `home travada` e `landing-todas-imagens` falhavam uma
 * vez em tres. A mascara pinta a caixa de cada foto: posicao e tamanho continuam
 * conferidos, e o texto e o layout da pagina seguem estritos. Fora da landing a
 * locator nao casa com nada, e a captura nao muda.
 */
const fotosDaLanding = (page: Page): Locator[] => [
  page.locator('app-landing img'),
];

/** Espera hidratação, fontes e imagens antes da captura estática. */
async function assentar(page: Page): Promise<void> {
  const pergunta = page.locator('.pergunta button').first();
  if (
    (await page.locator('app-landing').count()) &&
    !(await pergunta.isVisible())
  ) {
    // Abaixo de 720 px a landing nao tem o FAQ (landing-celular.css): a prova
    // de que o componente esta vivo e abrir e fechar o menu, sem deixar foco.
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(async () => {
      await menu.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  } else if (await page.locator('app-landing').count()) {
    // A rota e seus estilos chegam depois do HTML inicial. Abrir e fechar uma
    // resposta prova que o componente está vivo sem deixar marcas na captura.
    await expect(async () => {
      await pergunta.click();
      await expect(pergunta).toHaveAttribute('aria-expanded', 'true', {
        timeout: 500,
      });
    }).toPass({ timeout: 15_000 });
    await pergunta.click();
    await expect(pergunta).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.evaluate(() => document.fonts.ready);
  /*
   * Imagem com `loading="lazy"` abaixo da dobra carrega ou nao conforme o tempo,
   * e a captura de pagina inteira pegava as duas versoes (ADR-22: a foto do
   * atendimento na home). Aqui toda imagem vira `eager` e o teste espera cada uma
   * decodificar. O produto continua preguicoso; so a captura fica deterministica.
   */
  await page.evaluate(async () => {
    const imagens = [...document.images];
    for (const imagem of imagens) imagem.loading = 'eager';
    await Promise.all(
      imagens.map((imagem) =>
        imagem.complete
          ? imagem.decode().catch(() => undefined)
          : new Promise((resolver) => {
              imagem.addEventListener('load', resolver, { once: true });
              imagem.addEventListener('error', resolver, { once: true });
            }),
      ),
    );
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
}

/**
 * Regressao visual das TELAS publicas (Etapa 12).
 *
 * A suite do catalogo cobre os componentes isolados; esta cobre as paginas que o
 * visitante ve de fato. A diferenca importa: uma pagina quebra por composicao —
 * espacamento entre blocos, ordem das secoes, um cartao que estourou a coluna —
 * e nenhum componente isolado acusaria isso.
 *
 * A API E MOCKADA, como em `publico.a11y.spec.ts`. Regressao visual precisa de
 * determinismo, e conteudo vindo do banco de desenvolvimento muda com a semente.
 * As telas autenticadas ficam em `paineis.visual.spec.ts`, que roda sobre a
 * pilha por precisar de sessao.
 *
 * fullPage cobre a composição inteira de cada página pública.
 */
const VITRINE = [
  {
    id: 'produto-1',
    nome: 'Revisão de contrato comercial',
    descricao: 'Leitura completa e minuta revisada.',
    precoCentavos: 250_000,
    entregaveis: ['Minuta revisada'],
    quantidadeReunioes: 1,
    numeroRevisoesPermitidas: 2,
  },
];

async function interceptar(page: Page): Promise<void> {
  await page.route('**/api/vitrine', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(VITRINE),
    }),
  );

  await page.route('**/api/pre-cadastros', (rota) =>
    rota.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'id.segredo',
        /* Data FIXA: `Date.now()` mudaria o pixel de qualquer coisa que a
         * mostrasse, e o diff apontaria para a hora, nao para a mudanca. */
        expiraEm: '2027-01-01T00:00:00.000Z',
      }),
    }),
  );
}

test.describe('regressao visual das telas publicas', () => {
  test.beforeEach(async ({ page }) => {
    await interceptar(page);
  });

  test('home travada', async ({ page }) => {
    await page.goto('/');
    await assentar(page);

    await expect(page.locator('.corte').first()).toHaveCSS('opacity', '0');
    await expect(page).toHaveScreenshot('home-travada.png', {
      fullPage: true,
      mask: fotosDaLanding(page),
    });
  });

  /** O estado que so existe depois do pre-cadastro: precos e cartoes na tela. */
  test('catalogo liberado', async ({ page }) => {
    await page.goto('/cadastro');
    await esperarHidratacao(page);

    await page.getByLabel('Nome completo').fill('Ana Teste de Souza');
    await page.getByLabel('E-mail').fill('ana@exemplo.test');
    await page.getByLabel('Telefone').fill('61990000000');
    await page.getByRole('button', { name: 'Liberar catálogo' }).click();
    await page.getByRole('link', { name: 'Explorar os serviços' }).click();
    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();

    await expect(page).toHaveScreenshot('home-destravada.png', {
      fullPage: true,
    });
  });

  /**
   * O catalogo de producao nasce VAZIO (o escritorio cria os produtos pelo
   * painel), entao este e o estado que o primeiro visitante real encontra. A rota
   * registrada aqui vence a do `beforeEach`: no Playwright, a ultima vale.
   */
  test('catalogo vazio', async ({ page }) => {
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      }),
    );
    await page.goto('/cadastro');
    await esperarHidratacao(page);

    await page.getByLabel('Nome completo').fill('Ana Teste de Souza');
    await page.getByLabel('E-mail').fill('ana@exemplo.test');
    await page.getByLabel('Telefone').fill('61990000000');
    await page.getByRole('button', { name: 'Liberar catálogo' }).click();
    await page.getByRole('link', { name: 'Explorar os serviços' }).click();
    await expect(
      page.getByText('Nenhum serviço publicado no momento.'),
    ).toBeVisible();

    await expect(page).toHaveScreenshot('catalogo-vazio.png', {
      fullPage: true,
    });
  });

  test('entrar', async ({ page }) => {
    await page.goto('/entrar');
    await assentar(page);

    await expect(page).toHaveScreenshot('entrar.png', {
      fullPage: true,
    });
  });

  test('recuperar senha', async ({ page }) => {
    await page.goto('/recuperar-senha');
    await assentar(page);

    await expect(page).toHaveScreenshot('recuperar-senha.png', {
      fullPage: true,
    });
  });

  /**
   * SEM `oobCode` NA URL, que e o estado de quem abriu o link errado — e o unico
   * que da para capturar sem credencial viva. Com codigo, a tela depende de um
   * segredo que nao pode entrar em imagem de referencia (regra inviolavel 9).
   */
  test('definir senha sem codigo', async ({ page }) => {
    await page.goto('/definir-senha');
    await assentar(page);

    await expect(page).toHaveScreenshot('definir-senha.png', {
      fullPage: true,
    });
  });

  /**
   * O checkout SEM CARRINHO (Etapa 8). O estado com cobranca depende de um
   * checkout vivo no gateway, que muda a cada execucao — QR e identificador
   * nunca sao os mesmos, e nenhuma imagem de referencia sobreviveria a isso. A
   * jornada de compra, quando existir, cobre o estado com cobranca.
   */
  test('checkout sem carrinho', async ({ page }) => {
    await page.goto('/checkout');
    await assentar(page);

    await expect(page).toHaveScreenshot('checkout-sem-carrinho.png', {
      fullPage: true,
    });
  });

  test('pagina nao encontrada', async ({ page }) => {
    await page.goto('/rota-que-nao-existe');
    await assentar(page);

    await expect(page).toHaveScreenshot('nao-encontrada.png', {
      fullPage: true,
    });
  });
});

for (const [nome, caminho] of [
  ['landing-todas-imagens', '/todas-as-imagens'],
  ['cadastro', '/cadastro'],
  ['carrinho-vazio', '/carrinho'],
  ['privacidade', '/privacidade'],
  ['termos', '/termos'],
]) {
  test(nome, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(caminho);
    await assentar(page);
    await expect(page).toHaveScreenshot(nome + '.png', {
      fullPage: true,
      mask: fotosDaLanding(page),
    });
  });
}
