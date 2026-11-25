import { CONTAS, entrar, expect, test } from '../jornadas/pilha';

/**
 * A NAVEGACAO PUBLICA RECONHECE QUEM JA ENTROU, depois de um recarregamento, e
 * volta ao estado de visitante depois da saida.
 *
 * Este arquivo falhava 9 de 9 desde o frontend Nevoa: os atalhos da sessao
 * sairam de dentro da `nav` "Navegacao principal" — que ficou so com as quatro
 * ancoras da pagina — e foram para dois lugares, a faixa do topo ("Minha area",
 * na `nav` "Acesso a plataforma") e a area de acoes do menu (o nome da pessoa e
 * o carrinho, dentro do `dialog`). O teste continuava procurando os links no
 * lugar antigo. O comportamento nunca quebrou; quem envelheceu foi o seletor.
 *
 * Ninguem percebeu porque a suite dos paineis nao roda no CI. O `dialog` e a
 * `nav` de dentro dele tem o MESMO nome acessivel, entao o papel e o que os
 * separa: `getByRole('dialog')` e o menu inteiro.
 */
for (const [perfil, conta, destino] of [
  ['cliente', CONTAS.cliente, '/painel'],
  ['advogado', CONTAS.advogado, '/advogado'],
  ['admin', CONTAS.admin, '/admin'],
] as const) {
  test(`navbar reconhece sessão restaurada de ${perfil} e a saída`, async ({
    page,
  }) => {
    /*
     * 60 s, e nao os 30 s padrao. Cada caso faz um login, quatro navegacoes e
     * uma saida; quando este arquivo e o PRIMEIRO da execucao, a pilha fria
     * sozinha consome o prazo padrao (medido em 22/11/2026: o primeiro caso
     * estourava em `reload`, com o login ja concluido, e os outros oito
     * passavam).
     */
    test.setTimeout(60_000);
    await entrar(page, conta);
    await page.goto('/');
    await page.reload();

    /* A faixa do topo: "Minha area" leva ao painel do perfil, sem "Entrar". */
    const atalhos = page.getByRole('navigation', {
      name: 'Acesso à plataforma',
    });
    await expect(
      atalhos.getByRole('link', { name: 'Minha área', exact: true }),
    ).toHaveAttribute('href', destino);
    await expect(
      atalhos.locator('a[href="/entrar"],a[href="/cadastro"]'),
    ).toHaveCount(0);

    /* O menu: a pessoa e o carrinho, e nenhum convite para entrar. */
    const abrirMenu = page.getByRole('button', { name: 'Menu', exact: true });
    const menu = page.getByRole('dialog', { name: 'Navegação principal' });
    await abrirMenu.click();
    await expect(menu.locator(`a[href="${destino}"]`)).toBeVisible();
    await expect(menu.getByRole('link', { name: /Carrinho/ })).toBeVisible();
    await expect(
      menu.locator('a[href="/entrar"],a[href="/cadastro"]'),
    ).toHaveCount(0);

    await menu.locator(`a[href="${destino}"]`).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(page).toHaveURL(/\/entrar$/);

    /* Depois da saida, a mesma pagina volta a ser a do visitante. */
    await page.goto('/');
    await expect(atalhos.locator('a[href="/entrar"]')).toHaveCount(1);
    await expect(
      atalhos.getByRole('link', { name: 'Minha área', exact: true }),
    ).toHaveCount(0);
    await abrirMenu.click();
    await expect(
      menu.getByRole('link', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(menu.getByRole('link', { name: /Carrinho/ })).toHaveCount(0);
  });
}
