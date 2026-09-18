import { expect, test, type Page } from '@playwright/test';
import { esperarHidratacao } from './hidratacao';

/**
 * Espera a pagina ASSENTAR, sem tocar nela.
 *
 * `esperarHidratacao` prova que o Angular assumiu CLICANDO no botao — e o jeito
 * certo de provar isso, e inutil aqui: o clique deixa tres avisos de campo
 * obrigatorio na tela, e a imagem de referencia da home travada passaria a ser a
 * de um formulario com erro. Para captura, o que importa e fonte carregada e um
 * quadro desenhado, que e o mesmo criterio de `abrirPeca` no catalogo.
 */
async function assentar(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
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
 * `fullPage` de proposito aqui, ao contrario do catalogo: o que se quer verificar
 * e a pagina inteira, e nao ha casca de desenvolvimento em volta para sujar o
 * diff.
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
  await page.addInitScript(() => localStorage.clear());

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

    await expect(page).toHaveScreenshot('home-travada.png', {
      fullPage: true,
    });
  });

  /** O estado que so existe depois do pre-cadastro: precos e cartoes na tela. */
  test('home destravada', async ({ page }) => {
    await page.goto('/');
    await esperarHidratacao(page);

    await page.getByLabel('Nome completo').fill('Ana Teste de Souza');
    await page.getByLabel('E-mail').fill('ana@exemplo.test');
    await page.getByLabel('Telefone').fill('61990000000');
    await page.getByRole('button', { name: 'Criar acesso' }).click();
    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();

    await expect(page).toHaveScreenshot('home-destravada.png', {
      fullPage: true,
    });
  });

  test('entrar', async ({ page }) => {
    await page.goto('/entrar');
    await assentar(page);

    await expect(page).toHaveScreenshot('entrar.png', { fullPage: true });
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
