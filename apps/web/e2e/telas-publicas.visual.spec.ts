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
  if (await page.locator('app-landing').count()) {
    // A rota e seus estilos chegam depois do HTML inicial. Abrir e fechar uma
    // resposta prova que o componente está vivo sem deixar marcas na captura.
    const pergunta = page.locator('.pergunta button').first();
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
    parcelas: 1,
    /*
     * PRODUTO AINDA NAO CLASSIFICADO, de proposito: e como a API devolve o que
     * foi gravado antes do lote de novembro de 2026 (sem tipo, sem descricao
     * detalhada). O cartao dele nao tem o botao "+".
     */
    tipoCobranca: null,
    descricaoDetalhada: '',
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

/**
 * Formas de pagamento e parcelas (01/11/2026). Os estados entram direto pelo
 * armazenamento do navegador — liberacao do catalogo e carrinho —, como a
 * pagina os le depois da hidratacao: o caminho pelo formulario ja e coberto
 * por "catalogo liberado".
 */
const VITRINE_PARCELADA = [
  {
    id: 'parcelado-exato',
    nome: 'Plano anual de assessoria',
    descricao: 'Assessoria jurídica contínua por doze meses.',
    precoCentavos: 708_000,
    entregaveis: ['Contrato personalizado'],
    quantidadeReunioes: 2,
    numeroRevisoesPermitidas: 0,
    parcelas: 12,
    tipoCobranca: 'assinatura',
    descricaoDetalhada:
      'Um advogado acompanha a empresa ao longo do ano.\n\nInclui a elaboração de contratos sob medida e duas reuniões de alinhamento.',
  },
  {
    /* So assinatura parcela (novembro de 2026): era "Parecer avulso" em 7x. */
    id: 'parcelado-com-resto',
    nome: 'Plano semestral de pareceres',
    descricao: 'Pareceres técnicos sobre questões concretas, por seis meses.',
    precoCentavos: 180_000,
    entregaveis: ['Parecer'],
    quantidadeReunioes: 0,
    numeroRevisoesPermitidas: 1,
    parcelas: 7,
    tipoCobranca: 'assinatura',
    descricaoDetalhada:
      'Você envia a questão e recebe o parecer fundamentado, com uma rodada de revisão.',
  },
  {
    id: 'a-vista',
    nome: 'Consulta única',
    descricao: 'Uma reunião para tirar dúvidas.',
    precoCentavos: 50_000,
    entregaveis: ['Ata da reunião'],
    quantidadeReunioes: 1,
    numeroRevisoesPermitidas: 0,
    parcelas: 1,
    tipoCobranca: 'avulso',
    descricaoDetalhada:
      'Uma hora de reunião por vídeo com um advogado, e a ata com os encaminhamentos.',
  },
];

async function liberadoComCarrinho(
  page: Page,
  itens: readonly (typeof VITRINE_PARCELADA)[number][] = [],
): Promise<void> {
  await page.addInitScript(
    ({ carrinho }) => {
      localStorage.setItem(
        'lexintegra:pre-cadastro',
        JSON.stringify({
          token: 'id.segredo',
          expiraEm: '2027-01-01T00:00:00.000Z',
        }),
      );
      if (carrinho.length > 0)
        localStorage.setItem(
          'lexintegra:carrinho',
          JSON.stringify({
            chave: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
            itens: carrinho,
          }),
        );
    },
    {
      carrinho: itens.map((produto) => ({
        produtoId: produto.id,
        nome: produto.nome,
        precoCentavos: produto.precoCentavos,
        parcelas: produto.parcelas,
        tipoCobranca: produto.tipoCobranca,
      })),
    },
  );
}

test.describe('regressao visual das formas de pagamento e parcelas', () => {
  test.beforeEach(async ({ page }) => {
    await interceptar(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  /** Parcela exata, parcela com resto na primeira e produto so a vista. */
  test('catalogo com parcelas', async ({ page }) => {
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VITRINE_PARCELADA),
      }),
    );
    await liberadoComCarrinho(page);
    await page.goto('/servicos');
    await expect(page.getByText('Consulta única')).toBeVisible();
    await assentar(page);

    await expect(page).toHaveScreenshot('catalogo-com-parcelas.png', {
      fullPage: true,
    });
  });

  /**
   * O BOTAO "+" DO CARTAO (ajuste 1), aberto no primeiro produto: a descricao
   * detalhada aparece, o sinal vira "−" e os cartoes vizinhos continuam fechados.
   */
  test('catalogo com os detalhes de um cartao abertos', async ({ page }) => {
    await page.route('**/api/vitrine', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VITRINE_PARCELADA),
      }),
    );
    await liberadoComCarrinho(page);
    await page.goto('/servicos');
    await page
      .getByRole('button', {
        name: 'Ver mais detalhes de Plano anual de assessoria',
      })
      .click();
    await expect(
      page.getByText('Um advogado acompanha a empresa ao longo do ano.'),
    ).toBeVisible();
    await assentar(page);

    await expect(page).toHaveScreenshot('catalogo-detalhes-abertos.png', {
      fullPage: true,
    });
  });

  /** So assinatura no carrinho: o resumo anuncia a parcela. */
  test('carrinho com assinatura', async ({ page }) => {
    await liberadoComCarrinho(page, VITRINE_PARCELADA.slice(0, 1));
    await page.goto('/carrinho');
    await expect(page.locator('.resumo__parcelas')).toBeVisible();
    await assentar(page);

    await expect(page).toHaveScreenshot('carrinho-assinatura.png', {
      fullPage: true,
    });
  });

  /**
   * CARRINHO MISTO (decisao de 18/11/2026): com um servico avulso, a compra vai
   * a vista, e o resumo diz por que e como parcelar a assinatura.
   */
  test('carrinho misto, sem parcelamento', async ({ page }) => {
    await liberadoComCarrinho(page, [
      VITRINE_PARCELADA[0],
      VITRINE_PARCELADA[2],
    ]);
    await page.goto('/carrinho');
    await expect(page.locator('.resumo__sem-parcelas')).toBeVisible();
    await expect(page.locator('.resumo__parcelas')).toHaveCount(0);
    await assentar(page);

    await expect(page).toHaveScreenshot('carrinho-misto.png', {
      fullPage: true,
    });
  });

  test('checkout com carrinho misto', async ({ page }) => {
    await page.route('**/api/checkout/metodos', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pix: true, cartao: true }),
      }),
    );
    await liberadoComCarrinho(page, [
      VITRINE_PARCELADA[0],
      VITRINE_PARCELADA[2],
    ]);
    await page.goto('/checkout');
    await expect(page.locator('.checkout__sem-parcelas')).toBeVisible();
    await expect(page.locator('.checkout__parcelas')).toHaveCount(0);
    await assentar(page);

    await expect(page).toHaveScreenshot('checkout-carrinho-misto.png', {
      fullPage: true,
    });
  });

  test('rodape com formas de pagamento', async ({ page }) => {
    await page.goto('/termos');
    await assentar(page);

    await expect(page.locator('app-rodape-publico')).toHaveScreenshot(
      'rodape.png',
    );
  });

  test('checkout com cartao no ar', async ({ page }) => {
    await page.route('**/api/checkout/metodos', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pix: true, cartao: true }),
      }),
    );
    await liberadoComCarrinho(page, VITRINE_PARCELADA.slice(0, 2));
    await page.goto('/checkout');
    await expect(page.locator('.checkout__parcelas')).toBeVisible();
    await assentar(page);

    await expect(page).toHaveScreenshot('checkout-cartao-no-ar.png', {
      fullPage: true,
    });
  });

  /** Sem cartao: so o Pix entre as marcas, e nenhuma parcela anunciada. */
  test('checkout com cartao fora do ar', async ({ page }) => {
    await page.route('**/api/checkout/metodos', (rota) =>
      rota.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pix: true, cartao: false }),
      }),
    );
    await liberadoComCarrinho(page, VITRINE_PARCELADA.slice(0, 2));
    await page.goto('/checkout');
    await expect(page.locator('.checkout__selo')).toHaveText('Em breve');
    await assentar(page);

    await expect(page).toHaveScreenshot('checkout-cartao-fora-do-ar.png', {
      fullPage: true,
    });
  });
});
