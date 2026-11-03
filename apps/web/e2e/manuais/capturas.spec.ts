import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { esperarHidratacao } from '../hidratacao';
import { CONTAS, entrar, estadoDoArquivo, expect, test } from '../jornadas/pilha';

/**
 * As capturas dos manuais por perfil (`docs/manuais/`). NAO E TESTE.
 *
 * Roda so por `pnpm capturas:manuais` (projeto `manuais` de
 * `playwright.pilha.config.ts`), sobre a mesma pilha das jornadas: emuladores,
 * API compilada e `ng serve`. Herdeiro de `roteiro-capturas.ts` (21/09/2026), que
 * capturava as telas soltas; este percorre os fluxos que os manuais descrevem,
 * para a imagem mostrar o estado de que o texto fala.
 *
 * SO DADO FICTICIO. As contas sao as da semente (`@exemplo.test`), e a compra
 * sai pelo gateway FALSO, fechada por `scripts/simular-webhook.mjs` — o mesmo
 * papel do AbacatePay que `pnpm dev` usa. Nada aqui tem caminho ate producao: a
 * semente e o simulador recusam o que nao for emulador e loopback.
 *
 * Cada `test` comeca com o banco zerado e semeado de novo (`pilha.ts`), entao os
 * fluxos nao dependem da ordem.
 */

const RAIZ = resolve(__dirname, '../../../..');
const PASTA = resolve(RAIZ, 'docs/manuais/imagens');
const API_LOCAL = 'http://localhost:8090';
const PROJETO = process.env['GCLOUD_PROJECT'] ?? 'demo-lexintegra';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
/* Um JPEG minimo: SOI, APP0 JFIF e EOI. Passa nos magic bytes. */
const JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffd9',
  'hex',
);

test.setTimeout(240_000);

/**
 * `alvo` recorta um componente; `primeiraTela` fica so na altura da janela
 * (a landing inteira, com a fotografia, passa de 2 MB).
 */
async function capturar(
  page: Page,
  nome: string,
  alvo?: Locator,
  primeiraTela = false,
): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('app-carregando[variante="bloco"]')).toHaveCount(0);
  /* Imagem preguicosa so carrega na tela: rola ate cada uma antes da foto. */
  for (const img of await page.locator('img[loading="lazy"]').all()) {
    await img.scrollIntoViewIfNeeded();
  }
  await page.evaluate(async () => {
    const espera = new Promise((pronto) => setTimeout(pronto, 5_000));
    const decodificadas = Promise.all(
      [...document.images].map((img) => img.decode().catch(() => undefined)),
    );
    await Promise.race([decodificadas, espera]);
  });
  mkdirSync(PASTA, { recursive: true });
  const caminho = resolve(PASTA, `${nome}.png`);
  if (alvo !== undefined) {
    await alvo.scrollIntoViewIfNeeded();
    await alvo.screenshot({ path: caminho, animations: 'disabled' });
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: caminho,
    fullPage: !primeiraTela,
    animations: 'disabled',
    caret: 'hide',
  });
}

async function abrir(page: Page, rota: string): Promise<void> {
  await page.goto(rota);
  await page.waitForLoadState('networkidle');
}

function simularWebhook(checkoutId: string, acao = 'pago'): void {
  execFileSync('node', ['scripts/simular-webhook.mjs', checkoutId, acao], {
    cwd: RAIZ,
    stdio: 'pipe',
    env: { ...process.env, API_LOCAL },
  });
}

/** O link de senha que a API "enviaria", lido do emulador do Auth. */
async function codigoDeSenha(email: string): Promise<string> {
  const host = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  const resposta = await fetch(
    `http://${host}/emulator/v1/projects/${PROJETO}/oobCodes`,
  );
  const { oobCodes } = (await resposta.json()) as {
    oobCodes: { email: string; oobCode: string }[];
  };
  const codigo = oobCodes.filter((c) => c.email === email).at(-1)?.oobCode;
  if (codigo === undefined) throw new Error(`Sem link de senha para ${email}.`);
  return codigo;
}

async function preCadastrar(
  page: Page,
  nome: string,
  email: string,
): Promise<void> {
  await abrir(page, '/cadastro');
  await esperarHidratacao(page);
  await page.getByLabel('Nome completo').fill(nome);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Telefone').fill('61990000000');
  await page.getByRole('button', { name: 'Liberar catálogo' }).click();
  await expect(
    page.getByRole('link', { name: 'Explorar os serviços' }),
  ).toBeVisible();
}

async function adicionar(page: Page, produto: string): Promise<void> {
  const cartao = page.locator('.produto', { hasText: produto }).first();
  await cartao.getByRole('button', { name: /Adicionar/ }).click();
}

/** Preenche o checkout e paga por PIX. Devolve o `checkoutId`. */
async function pagarComPix(
  page: Page,
  nome: string,
  email: string,
  capturas?: { formulario: string; cartao: string; pix: string },
): Promise<string> {
  await abrir(page, '/checkout');
  await page.getByLabel('Nome completo').fill(nome);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Li e aceito os termos de contratação').check();
  if (capturas !== undefined) {
    await page.getByLabel('Cartão de crédito', { exact: true }).check();
    await capturar(page, capturas.cartao);
    await page.getByLabel('PIX', { exact: true }).check();
    await capturar(page, capturas.formulario);
  }
  const resposta = page.waitForResponse(
    (r) => r.url().endsWith('/api/checkout') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Pagar' }).click();
  const { checkoutId } = (await (await resposta).json()) as {
    checkoutId: string;
  };
  await expect(
    page.getByRole('heading', { name: 'Pague com PIX' }),
  ).toBeVisible();
  if (capturas !== undefined) await capturar(page, capturas.pix);
  return checkoutId;
}

test('cliente: cadastro, compra e acesso', async ({ page }) => {
  await abrir(page, '/');
  await capturar(page, 'cliente-01-landing', undefined, true);

  await preCadastrar(page, 'Paula Exemplo', 'paula.exemplo@exemplo.test');
  await capturar(page, 'cliente-02-cadastro-concluido');

  await page.getByRole('link', { name: 'Explorar os serviços' }).click();
  await expect(page.locator('.produto').first()).toBeVisible();
  await capturar(page, 'cliente-03-servicos');

  await adicionar(page, 'Contrato Social');
  await adicionar(page, 'Parecer');
  await abrir(page, '/carrinho');
  await capturar(page, 'cliente-04-carrinho');

  const checkoutId = await pagarComPix(
    page,
    'Paula Exemplo',
    'paula.exemplo@exemplo.test',
    {
      formulario: 'cliente-05-checkout',
      cartao: 'cliente-06-checkout-cartao',
      pix: 'cliente-07-pix',
    },
  );

  simularWebhook(checkoutId);
  await expect(
    page.getByRole('heading', { name: 'Pagamento confirmado' }),
  ).toBeVisible({ timeout: 30_000 });
  await capturar(page, 'cliente-08-pagamento-confirmado');

  /* O e-mail de acesso: o link leva a /definir-senha com o codigo. */
  await expect
    .poll(() => codigoDeSenha('paula.exemplo@exemplo.test').catch(() => ''), {
      timeout: 30_000,
    })
    .not.toBe('');
  const codigo = await codigoDeSenha('paula.exemplo@exemplo.test');
  await abrir(page, `/definir-senha?oobCode=${codigo}`);
  await expect(page.getByRole('textbox', { name: 'Nova senha', exact: true })).toBeVisible();
  await capturar(page, 'cliente-09-definir-senha');
  await page
    .getByRole('textbox', { name: 'Nova senha', exact: true })
    .fill('senha-de-desenvolvimento');
  await page
    .getByRole('textbox', { name: 'Repita a nova senha' })
    .fill('senha-de-desenvolvimento');
  await page.getByRole('button', { name: 'Definir senha' }).click();
  await expect(
    page.getByRole('heading', { name: 'Senha definida' }),
  ).toBeVisible({ timeout: 15_000 });

  await entrar(page, 'paula.exemplo@exemplo.test');
  await expect(page).toHaveURL(/anamnese/);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await capturar(page, 'cliente-10-ficha-inicial');

  await page.getByRole('button', { name: 'Sair' }).click();
  await abrir(page, '/entrar');
  await capturar(page, 'cliente-11-entrar');
  await abrir(page, '/recuperar-senha');
  await capturar(page, 'cliente-12-recuperar-senha');
});

test('cliente: pedido, reuniao, anexos e entregavel', async ({ page }) => {
  await entrar(page, CONTAS.cliente);
  await abrir(page, '/painel');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await capturar(page, 'cliente-20-meus-pedidos');

  /*
   * O pedido distribuido (`clara-contrato`). Pelo titulo, e nao pelo botao de
   * marcar: o botao muda de nome quando o calendario abre, e o filtro deixaria
   * de casar no meio do fluxo.
   */
  const cartao = page
    .locator('app-cartao-pedido')
    .filter({ hasText: 'Elaboração de Contrato Social' })
    .first();

  /* Marcar reuniao. */
  await cartao.getByRole('button', { name: /Marcar reuni/i }).click();
  const calendario = cartao.locator('app-calendario-horarios');
  await calendario.locator('button.dia--livre').first().click();
  await calendario.getByRole('radio').first().check();
  await capturar(page, 'cliente-21-marcar-reuniao', cartao);
  await cartao.getByRole('button', { name: /Confirmar reuni/i }).click();
  await expect(cartao.getByText(/Abrir sala/).first()).toBeVisible({
    timeout: 30_000,
  });
  await capturar(page, 'cliente-22-reuniao-marcada', cartao);

  /* Remarcar: so a abertura do calendario. */
  await cartao.getByRole('button', { name: 'Remarcar' }).first().click();
  await capturar(page, 'cliente-23-remarcar', cartao);
  await abrir(page, '/painel');

  /* Observacoes e anexos. */
  const primeiro = page.locator('app-cartao-pedido').first();
  await primeiro.getByRole('button', { name: 'Observações e arquivos' }).click();
  await primeiro.locator('input[type="file"]').setInputFiles({
    name: 'contrato-atual.jpg',
    mimeType: 'image/jpeg',
    buffer: JPG,
  });
  await capturar(page, 'cliente-24-anexos', primeiro);

  /* Cancelar pedido: o da fila, sem trabalho iniciado. So a confirmacao. */
  await abrir(page, '/painel');
  const naFila = page
    .locator('app-cartao-pedido')
    .filter({ hasText: 'Parecer Jurídico Trabalhista' })
    .first();
  await naFila.getByRole('button', { name: 'Cancelar pedido' }).click();
  await capturar(page, 'cliente-25-cancelar-pedido', naFila);
});

test('advogado e cliente: entregavel, revisao e agenda', async ({ page }) => {
  await entrar(page, CONTAS.advogado);
  await abrir(page, '/advogado/demandas');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await capturar(page, 'advogado-01-demandas');

  await page.getByRole('button', { name: 'Iniciar trabalho' }).first().click();
  await expect(page.getByText('Enviar entregável').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Anamnese e observações' })
    .first()
    .click();
  await capturar(page, 'advogado-02-trabalho-iniciado');

  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'contrato-social.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect
    .poll(() => estadoDoArquivo('clara-contrato', '001'), { timeout: 20_000 })
    .toBe('limpo');

  await abrir(page, '/advogado/agenda');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await capturar(page, 'advogado-03-agenda');

  await page.getByRole('button', { name: 'Sair' }).click();
  await entrar(page, CONTAS.cliente);
  const cartao = page
    .locator('app-cartao-pedido')
    .filter({
      has: page.getByRole('button', { name: 'Aceitar termos e baixar' }),
    })
    .first();
  await expect(cartao).toBeVisible({ timeout: 20_000 });
  await capturar(page, 'cliente-26-entregavel-disponivel', cartao);

  await cartao.getByRole('button', { name: 'Pedir revisão' }).click();
  await page.getByRole('button', { name: 'Sair' }).click();

  await entrar(page, CONTAS.advogado);
  await abrir(page, '/advogado/demandas');
  await expect(page.getByRole('button', { name: 'Retomar' }).first()).toBeVisible();
  await capturar(page, 'advogado-04-revisao-pedida');
});

test('admin: cadastros, distribuicao e financeiro', async ({ page }) => {
  /* Uma compra com dois itens, para o estorno isolado ficar pendente. */
  await preCadastrar(page, 'Paula Exemplo', 'paula.exemplo@exemplo.test');
  await abrir(page, '/servicos');
  await adicionar(page, 'Contrato Social');
  await adicionar(page, 'Parecer');
  const pago = await pagarComPix(page, 'Paula Exemplo', 'paula.exemplo@exemplo.test');
  simularWebhook(pago);
  await expect(
    page.getByRole('heading', { name: 'Pagamento confirmado' }),
  ).toBeVisible({ timeout: 30_000 });

  /* Outra compra, paga com valor diferente: vira pagamento divergente. */
  await abrir(page, '/carrinho');
  await abrir(page, '/servicos');
  await adicionar(page, 'Due Diligence');
  const divergente = await pagarComPix(
    page,
    'Rui Exemplo',
    'rui.exemplo@exemplo.test',
  );
  simularWebhook(divergente, 'divergente');

  await entrar(page, CONTAS.admin);

  for (const [nome, rota] of [
    ['admin-01-advogados', '/admin/advogados'],
    ['admin-02-produtos', '/admin/produtos'],
    ['admin-03-distribuicao', '/admin/distribuicao'],
    ['admin-04-clientes', '/admin/clientes'],
  ] as const) {
    await abrir(page, rota);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await capturar(page, nome);
  }

  /* Editar advogado: o campo "Organizador no Teams". */
  await abrir(page, '/admin/advogados');
  await page.getByRole('button', { name: /Editar/ }).first().click();
  await expect(page.getByLabel(/Organizador no Teams/)).toBeVisible();
  await capturar(page, 'admin-05-editar-advogado');

  /* Editar produto: preco, parcelas e entregaveis. */
  await abrir(page, '/admin/produtos');
  await page.getByRole('button', { name: /Editar/ }).first().click();
  await expect(page.getByLabel('Parcelas no cartão')).toBeVisible();
  await capturar(page, 'admin-06-editar-produto');

  /* Estornar um dos dois pedidos da compra da Paula: fica pendente de devolucao. */
  await abrir(page, '/admin/distribuicao');
  await page
    .getByRole('button', { name: 'Estornar Parecer Jurídico Trabalhista' })
    .first()
    .click();
  await page.getByLabel(/Motivo do estorno/).fill('Desistência antes do início.');
  await capturar(page, 'admin-07a-estornar-pedido');
  await page.getByRole('button', { name: 'Confirmar estorno' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toHaveCount(0);

  /* Contestacao da mesma cobranca. */
  simularWebhook(pago, 'contestado');

  for (const [nome, rota] of [
    ['admin-07-estornos', '/admin/estornos'],
    ['admin-08-pagamentos', '/admin/pagamentos'],
    ['admin-09-contestacoes', '/admin/contestacoes'],
    ['admin-10-entregas', '/admin/entregas'],
    ['admin-11-reunioes', '/admin/reunioes'],
    ['admin-12-administradores', '/admin/administradores'],
  ] as const) {
    await abrir(page, rota);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await capturar(page, nome);
  }
});
