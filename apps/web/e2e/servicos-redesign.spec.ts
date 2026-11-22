import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const produto = {
  id: 'diagnostico',
  nome: 'Diagnóstico contratual',
  descricao: 'Diagnóstico completo da operação.',
  precoCentavos: 69000,
  entregaveis: [
    'Anamnese inicial',
    'Contrato personalizado (2 de 24)',
    'Contrato personalizado (1 de 24)',
    'Parecer técnico',
    'Relatório mensal',
    'Análise contratual',
  ],
  quantidadeReunioes: 2,
  numeroRevisoesPermitidas: 0,
  parcelas: 3,
  tipoCobranca: 'assinatura',
  descricaoDetalhada:
    'Lemos os contratos em vigor.\n\nEntregamos o diagnóstico por prioridade.',
};

async function liberar(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem(
      'lexintegra:pre-cadastro',
      JSON.stringify({
        token: 'cadastro.teste',
        expiraEm: new Date(Date.now() + 86400000).toISOString(),
      }),
    ),
  );
}

test('ficha, expansão, busca interrompível e carrinho preservam os dados', async ({
  page,
}) => {
  await liberar(page);
  const pedidos: string[] = [];
  await page.route('**/api/vitrine', (rota) => {
    pedidos.push(rota.request().url());
    return rota.fulfill({
      json: [
        produto,
        {
          ...produto,
          id: 'outro',
          nome: 'Serviço avulso',
          entregaveis: [],
          descricao: '',
          quantidadeReunioes: 0,
          parcelas: 1,
          tipoCobranca: 'avulso',
          descricaoDetalhada: '',
        },
      ],
    });
  });
  await page.goto('/servicos');
  const card = page.locator('.produto').first();
  await expect(card.getByRole('heading')).toHaveText(produto.nome);
  await expect(card.locator('.produto__descricao')).toHaveText(
    'Diagnóstico completo da operação.',
  );
  await expect(card.locator('.produto__entregaveis')).toContainText(
    'Contratos personalizados',
  );
  await expect(card.locator('.produto__meta')).toHaveText(
    '28 entregáveis · 2 reuniões',
  );
  /* A parcela e calculada do preco e de `parcelas`, nao lida da descricao. */
  await expect(card.locator('.produto__preco')).toHaveText(/3x de R\$\s230,00/);
  await expect(card.locator('.produto__total')).toHaveText(
    /ou R\$\s690,00 à vista/,
  );
  /*
   * O botao "+" (ajuste 1): o nome acessivel diz de que produto sao os
   * detalhes, e a descricao detalhada ja esta no DOM, escondida, antes do
   * clique — abrir nao faz chamada nenhuma.
   */
  const detalhes = card.locator('.produto__detalhada');
  await expect(detalhes).toBeHidden();
  await expect(detalhes).toContainText('Lemos os contratos em vigor.');
  const mais = card.getByRole('button', {
    name: 'Ver mais detalhes de Diagnóstico contratual',
  });
  await expect(mais).toHaveAttribute('aria-expanded', 'false');
  await mais.focus();
  await page.keyboard.press('Enter');
  await expect(detalhes).toBeVisible();
  await expect(
    card.getByText('Análise contratual', { exact: true }),
  ).toBeVisible();
  const menos = card.getByRole('button', {
    name: 'Ver menos detalhes de Diagnóstico contratual',
  });
  await expect(menos).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(detalhes).toBeHidden();
  await expect(
    card.getByText('Análise contratual', { exact: true }),
  ).toBeHidden();
  expect(pedidos).toHaveLength(1);
  const busca = page.getByPlaceholder('Buscar um serviço');
  await busca.fill('nao-existe');
  await busca.fill('ANALISE');
  await expect(page.locator('.produto')).toHaveCount(1);
  await busca.press('Escape');
  await expect(page.locator('.produto')).toHaveCount(2);
  await card.getByRole('button', { name: /Adicionar ao carrinho/ }).click();
  await expect(page.locator('.carrinho')).toContainText('1');
  await card.getByRole('button', { name: /Adicionar ao carrinho/ }).click();
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  expect(pedidos).toHaveLength(1);
  await page.locator('.carrinho a').click();
  await expect(page).toHaveURL(/\/carrinho$/);
  await expect(page.getByRole('heading', { name: produto.nome })).toHaveCount(
    1,
  );
});

test('trinta produtos, nomes longos e movimento reduzido sem overflow', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await liberar(page);
  await page.route('**/api/vitrine', (rota) =>
    rota.fulfill({
      json: Array.from({ length: 30 }, (_, i) => ({
        ...produto,
        id: String(i),
        nome: `${i} Serviço jurídico com um nome bastante longo e escopo detalhado`,
      })),
    }),
  );
  await page.goto('/servicos');
  await expect(page.locator('.produto')).toHaveCount(30);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const colunas = await page
    .locator('.vitrine')
    .evaluate(
      (grade) => getComputedStyle(grade).gridTemplateColumns.split(' ').length,
    );
  const largura = page.viewportSize()!.width;
  expect(colunas).toBe(largura >= 1200 ? 3 : largura >= 760 ? 2 : 1);
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('servicos.png') });
});

test('carregamento, erro e retentativa usam a requisição real da tela', async ({
  page,
}) => {
  await liberar(page);
  let tentativa = 0;
  let continuar: () => void = () => {};
  const espera = new Promise<void>((resolve) => {
    continuar = resolve;
  });
  await page.route('**/api/vitrine', async (rota) => {
    tentativa++;
    if (tentativa === 1) {
      await espera;
      await rota.fulfill({ status: 503, json: {} });
    } else await rota.fulfill({ json: [] });
  });
  await page.goto('/servicos');
  await expect(page.locator('.esqueleto')).toHaveCount(3);
  await expect(page.getByPlaceholder('Buscar um serviço')).toBeDisabled();
  continuar();
  await expect(page.locator('.falha')).toBeVisible();
  await page.locator('.falha button').click();
  await expect(page.locator('.vazio[role=status]')).toContainText(
    'Nenhum serviço',
  );
  await expect(
    page.getByRole('link', { name: 'Falar com o suporte' }),
  ).toBeVisible();
  expect(tentativa).toBe(2);
});

for (const reduzido of [false, true]) {
  test(`convite por rolagem, Escape e exibição única; movimento reduzido: ${reduzido}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({
      reducedMotion: reduzido ? 'reduce' : 'no-preference',
    });
    const chamadas: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname.startsWith('/api'))
        chamadas.push(req.url());
    });
    await page.goto('/');
    await page.evaluate(() =>
      localStorage.removeItem('lexintegra:convite-cadastro'),
    );
    await page.goto('/');
    const dialogo = page.locator('app-convite-cadastro dialog');
    await expect(dialogo).not.toBeVisible();
    await page.locator('#servicos').scrollIntoViewIfNeeded();
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole('link')).toHaveAttribute(
      'href',
      '/cadastro',
    );
    await expect(dialogo.getByRole('button', { name: 'Fechar' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialogo.getByRole('button', { name: 'Agora não' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogo).not.toBeVisible();
    await page.reload();
    await page.locator('#servicos').scrollIntoViewIfNeeded();
    await expect(dialogo).not.toBeVisible();
    expect(chamadas).toEqual([]);
    await page.screenshot({ path: info.outputPath('convite-fechado.png') });
  });
}
