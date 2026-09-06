import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * O CRITERIO DE ACEITE DA ETAPA 6, em forma de teste.
 *
 * "A pagina publica nao faz nenhuma chamada a API antes da conclusao do
 * pre-cadastro" (plano de execucao, Etapa 6). Nao e preferencia de arquitetura: e
 * a mitigacao de cold start do Cloud Run. Com `min-instances = 0`, a primeira
 * requisicao depois de ociosidade custa de um a tres segundos, e a home e a
 * pagina onde a pessoa decide se fica — o custo tem que cair depois do
 * engajamento, nao antes.
 *
 * O teste e HERMETICO: as duas rotas da API sao interceptadas, entao ele nao
 * precisa da API nem dos emuladores para rodar. O que ele verifica e o
 * comportamento do navegador, e e ali que a regra vale ou nao vale.
 */

const PRE_CADASTRO = '**/api/pre-cadastros';
const VITRINE = '**/api/vitrine';

const SERVICOS = [
  {
    id: 'produto-1',
    nome: 'Revisão de contrato comercial',
    descricao: 'Leitura completa e minuta revisada pronta para negociação.',
    precoCentavos: 250_000,
    entregaveis: ['Minuta revisada'],
    quantidadeReunioes: 1,
    numeroRevisoesPermitidas: 2,
  },
];

/** Registra toda requisicao para `/api`, com o metodo, na ordem em que sai. */
function espiarApi(page: Page): string[] {
  const chamadas: string[] = [];

  page.on('request', (requisicao) => {
    const caminho = new URL(requisicao.url()).pathname;
    if (caminho.startsWith('/api')) {
      chamadas.push(`${requisicao.method()} ${caminho}`);
    }
  });

  return chamadas;
}

async function interceptar(page: Page): Promise<void> {
  await page.route(PRE_CADASTRO, (rota: Route) =>
    rota.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'id-de-teste.segredo-de-teste',
        expiraEm: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    }),
  );

  await page.route(VITRINE, (rota: Route) =>
    rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SERVICOS),
    }),
  );
}

async function percorrerAPaginaInteira(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const passo = window.innerHeight / 2;
    for (let y = 0; y < document.body.scrollHeight; y += passo) {
      window.scrollTo(0, y);
      await new Promise((resolver) => setTimeout(resolver, 60));
    }
  });
  await page.waitForTimeout(300);
}

async function preencherEEnviar(page: Page): Promise<void> {
  await page.getByLabel('Nome completo').fill('Ana Ribeiro Salgado');
  await page.getByLabel('E-mail').fill('ana@empresa.com.br');
  await page.getByLabel('Telefone').fill('(61) 99000-0000');
  await page.getByRole('button', { name: 'Criar acesso' }).click();
}

test.describe('area publica', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  /**
   * A afirmacao central. Rolar a pagina inteira e acionar os caminhos internos
   * NAO pode produzir uma requisicao — nem para a vitrine, nem para o health, nem
   * para nada.
   */
  test('nao chama a API antes do pre-cadastro', async ({ page }) => {
    const chamadas = espiarApi(page);
    await interceptar(page);

    await page.goto('/');
    await percorrerAPaginaInteira(page);
    await page.getByRole('link', { name: 'Ver serviços e preços' }).click();
    await page.getByRole('link', { name: 'Entender o processo' }).click();
    await page.waitForTimeout(500);

    expect(chamadas).toEqual([]);
  });

  test('o catalogo nao aparece antes do cadastro', async ({ page }) => {
    await interceptar(page);
    await page.goto('/');

    await expect(
      page.getByText('Os preços aparecem depois do cadastro'),
    ).toBeVisible();
    await expect(page.getByText('Revisão de contrato comercial')).toHaveCount(
      0,
    );
  });

  /**
   * O outro lado da mesma regra: depois do envio, e SO depois, a vitrine e
   * buscada. Sem esta metade, "nao chama a API" seria satisfeito por uma pagina
   * que nunca chama a API.
   */
  test('destrava a vitrine depois do pre-cadastro', async ({ page }) => {
    const chamadas = espiarApi(page);
    await interceptar(page);

    await page.goto('/');
    await preencherEEnviar(page);

    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();
    await expect(page.getByText('R$ 2.500,00')).toBeVisible();
    expect(chamadas).toEqual(['POST /api/pre-cadastros', 'GET /api/vitrine']);
  });

  /**
   * `localStorage` e nao `sessionStorage`: a liberacao sobrevive ao fechamento da
   * aba, para que os sete dias de validade que o servidor promete valham alguma
   * coisa do lado do navegador.
   */
  test('a liberacao sobrevive ao recarregamento', async ({ page }) => {
    await interceptar(page);
    await page.goto('/');
    await preencherEEnviar(page);
    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();

    await page.reload();

    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();
    await expect(
      page.getByText('Os preços aparecem depois do cadastro'),
    ).toHaveCount(0);
  });

  test('o formulario recusa entrada invalida sem chamar a API', async ({
    page,
  }) => {
    const chamadas = espiarApi(page);
    await interceptar(page);

    await page.goto('/');
    await page.getByLabel('Nome completo').fill('An');
    await page.getByLabel('E-mail').fill('nao-e-email');
    await page.getByLabel('Telefone').fill('123');
    await page.getByRole('button', { name: 'Criar acesso' }).click();

    await expect(page.getByText('Informe um telefone com DDD.')).toBeVisible();
    expect(chamadas).toEqual([]);
  });

  /**
   * O aviso de privacidade fica na PROPRIA tela de coleta (arquitetura, secao 6,
   * fronteira 1). Um link para uma politica em outra pagina nao cumpre isso.
   */
  test('mostra o aviso de privacidade junto do formulario', async ({
    page,
  }) => {
    await page.goto('/');

    const formulario = page.locator('#cadastro form');
    await expect(
      formulario.getByText('Você pode pedir a exclusão a qualquer momento.'),
    ).toBeVisible();
    await expect(
      formulario.getByRole('group', { name: 'Aviso de privacidade' }),
    ).toBeAttached();
  });
});
