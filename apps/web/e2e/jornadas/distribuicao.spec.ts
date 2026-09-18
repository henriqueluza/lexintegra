import { CONTAS, entrar, expect, test } from './pilha';

/**
 * A distribuicao de uma demanda, do administrador ao advogado (Etapa 9).
 *
 * A semente deixa `clara-parecer` SEM advogado, de proposito: e o pedido na fila
 * do administrador. Os outros dois ja nascem distribuidos para a Ana.
 *
 * O que so a jornada prova: que a lista de advogados do seletor vem preenchida.
 * Ela le a colecao `advogados`, que ate a Etapa 12 a semente nao escrevia — o
 * seletor vinha vazio e atribuir respondia 404 para um advogado que existe no
 * Auth. Nenhum teste de unidade via isso, porque nenhum deles monta a tela com o
 * banco de desenvolvimento.
 */
test.describe('distribuicao', () => {
  test('o administrador distribui e o advogado passa a ver', async ({
    page,
  }) => {
    await entrar(page, CONTAS.admin);
    await page.goto('/admin/distribuicao');

    const seletor = page.getByLabel(/Advogado para Parecer/i);
    await expect(seletor).toBeVisible();
    await seletor.selectOption({ label: 'Ana Souza' });
    await page.getByRole('button', { name: 'Distribuir' }).first().click();

    /*
     * A tela nao mostra mensagem de sucesso: ela RECARREGA, e a caixa de entrada
     * — que lista o que ainda NAO foi distribuido — deixa de mostrar o pedido. E
     * esse o sinal que o administrador ve, entao e esse que a jornada confere.
     */
    await expect(seletor).toHaveCount(0);

    await page.getByRole('button', { name: 'Sair' }).click();
    await entrar(page, CONTAS.advogado);

    /* Sem o acento no padrao: o catalogo ficticio escreve "Juridico" com acento,
     * e um literal sem ele nao casa — falha cuja mensagem nao da pista nenhuma. */
    await expect(
      page.getByRole('heading', { name: /Parecer Jur/i }),
    ).toHaveCount(2);
  });

  /**
   * O ADVOGADO VE APENAS O QUE LHE FOI DISTRIBUIDO (item 2.6.1). O Carlos nao
   * tem demanda nenhuma na semente, e o estado vazio aqui e legitimo — e a
   * unica forma de a tela mostrar que a separacao existe.
   */
  test('o outro advogado nao ve a demanda alheia', async ({ page }) => {
    await entrar(page, CONTAS.outroAdvogado);

    await expect(page.getByText('Nenhuma demanda distribuida')).toBeVisible();
  });
});
