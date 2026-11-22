import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { esperarHidratacao } from './hidratacao';

/**
 * Acessibilidade da pagina publica, nas tres larguras que os projetos do
 * Playwright ja definem (360, 768 e 1280).
 *
 * Roda sobre os DOIS estados da vitrine, e nao so o inicial: o estado destravado
 * tem uma arvore de conteudo diferente — cartoes, listas e precos que nao existem
 * no travado — e verificar so o travado deixaria metade da pagina sem cobertura.
 */
const GRAVIDADES = ['serious', 'critical'];

async function violacoes(
  page: import('@playwright/test').Page,
): Promise<unknown[]> {
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return resultado.violations
    .filter((v) => GRAVIDADES.includes(v.impact ?? ''))
    .map((v) => ({
      regra: v.id,
      descricao: v.help,
      onde: v.nodes.map((n) => n.target.join(' ')),
    }));
}

test.describe('acessibilidade da area publica', () => {
  test.beforeEach(async ({ page }) => {
    /*
     * O axe mede a cor CALCULADA, e a hero anima a entrada dos textos e das
     * acoes com opacidade: medida no meio, a cor sai misturada ao fundo e o
     * contraste reprova num CI e passa no seguinte (05/10/2026, nos links de
     * cadastro e entrada da hero do celular). Movimento reduzido mostra o estado
     * final, que e o que a regra avalia — como em `redesign.spec.ts`.
     */
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'produto-1',
            nome: 'Revisão de contrato comercial',
            descricao: 'Leitura completa e minuta revisada.',
            precoCentavos: 250_000,
            entregaveis: ['Minuta revisada'],
            quantidadeReunioes: 1,
            numeroRevisoesPermitidas: 2,
            /* Divisao que nao fecha: o axe ve a parcela e a linha do total. */
            parcelas: 6,
            tipoCobranca: 'assinatura',
            /* Com descricao detalhada, o axe ve o botao "+" e a regiao dele. */
            descricaoDetalhada:
              'Lemos o contrato inteiro.\n\nDevolvemos a minuta com as alterações marcadas.',
          },
        ]),
      }),
    );
    await page.route('**/api/pre-cadastros', (rota) =>
      rota.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'id.segredo',
          expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      }),
    );
  });

  test('com a vitrine travada', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    expect(await violacoes(page)).toEqual([]);
  });

  test('com a vitrine liberada', async ({ page }) => {
    await page.goto('/cadastro');

    await esperarHidratacao(page);

    await page.getByLabel('Nome completo').fill('Ana Ribeiro Salgado');
    await page.getByLabel('E-mail').fill('ana@empresa.com.br');
    await page.getByLabel('Telefone').fill('(61) 99000-0000');
    await page.getByRole('button', { name: 'Liberar catálogo' }).click();
    await page.getByRole('link', { name: 'Explorar os serviços' }).click();
    await expect(page.getByText('Revisão de contrato comercial')).toBeVisible();

    expect(await violacoes(page)).toEqual([]);

    /* O cartao ABERTO pelo "+" (ajuste 1) passa pelo axe tambem. */
    await page
      .getByRole('button', {
        name: 'Ver mais detalhes de Revisão de contrato comercial',
      })
      .click();
    await expect(page.getByText('Lemos o contrato inteiro.')).toBeVisible();

    expect(await violacoes(page)).toEqual([]);
  });

  /**
   * O catalogo de producao nasce vazio, entao este e o estado que o primeiro
   * visitante real encontra em `/servicos`. Alem do axe, confere que o vazio nao
   * quebra o layout: sem rolagem horizontal, mensagem visivel e anunciada, e
   * nenhuma busca nem cartao para o leitor de tela tropecar.
   */
  test('com o catalogo vazio', async ({ page }) => {
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      }),
    );
    await page.goto('/cadastro');
    await esperarHidratacao(page);

    await page.getByLabel('Nome completo').fill('Ana Ribeiro Salgado');
    await page.getByLabel('E-mail').fill('ana@empresa.com.br');
    await page.getByLabel('Telefone').fill('(61) 99000-0000');
    await page.getByRole('button', { name: 'Liberar catálogo' }).click();
    await page.getByRole('link', { name: 'Explorar os serviços' }).click();

    const vazio = page.getByRole('status').filter({
      hasText: 'Nenhum serviço publicado no momento.',
    });
    await expect(vazio).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);

    const transbordo = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(transbordo).toBe(false);

    expect(await violacoes(page)).toEqual([]);
  });
});
