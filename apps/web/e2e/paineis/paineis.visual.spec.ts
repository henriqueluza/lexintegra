import { CONTAS, entrar, expect, test } from '../jornadas/pilha';

/**
 * Regressao visual dos PAINEIS autenticados (Etapa 12).
 *
 * Roda sobre a pilha, e nao com a API mockada, porque a alternativa e pior: um
 * jogo de respostas escritas a mao aqui envelheceria em silencio, e a imagem de
 * referencia passaria a defender uma tela que a API nao produz mais. Com a
 * semente, o que se captura e o que o desenvolvedor ve em `pnpm dev`.
 *
 * O PRECO DISSO E O TEMPO: cada teste limpa e semeia o banco (fixture de
 * `pilha.ts`), e as capturas rodam em tres larguras. E o preco certo — baseline
 * de painel so vale se o conteudo for previsivel.
 *
 * O RELOGIO E FIXO NOS TRES LADOS desde a Etapa 10 — servidor, navegador e
 * semente —, e e isso que permitiu `advogado/disponibilidade` ENTRAR. Ela ficava
 * de fora porque a grade e calculada a partir da semana corrente
 * (`packages/shared/src/semana.ts`) e a imagem mudaria toda segunda; um baseline
 * que precisa ser regravado por calendario treina a equipe a regravar sem olhar,
 * que e como uma suite de regressao visual morre. Com o relogio parado a semana
 * e sempre a mesma, e o motivo da exclusao deixou de existir. A agenda do
 * advogado e o painel de reunioes do administrador entram pela mesma porta.
 *
 * A AGENDA E O PAINEL DE REUNIOES ENTRAM VAZIOS, e isso e deliberado: a semente
 * publica a grade do advogado mas nao marca reuniao nenhuma — marcar e um ato do
 * cliente, e faze-lo a mao aqui exigiria escrever o documento da reuniao, a
 * reserva do slot e o contador do pedido de forma coerente, uma quarta forma
 * escrita a mao que divergiria dos servicos (ver o cabecalho da semente). O que
 * essas duas referencias defendem e o ESTADO VAZIO, que e um estado desenhado; a
 * tabela cheia esta coberta pela jornada autenticada e pelas suites de unidade.
 * A grade da disponibilidade, essa sim, sai cheia — e e a tela que mais ganhou
 * com o relogio parado.
 *
 * O QUE CONTINUA DE FORA: `painel/anamnese`, que e o stub provisorio da Etapa 8
 * (`{{TODO-FICHA-ANAMNESE-DA-CONTRATANTE}}`) e vai mudar inteiro quando a ficha
 * definitiva chegar.
 */
const TELAS = [
  { nome: 'cliente-pedidos', rota: '/painel', conta: CONTAS.cliente },
  {
    nome: 'advogado-demandas',
    rota: '/advogado/demandas',
    conta: CONTAS.advogado,
  },
  { nome: 'advogado-agenda', rota: '/advogado/agenda', conta: CONTAS.advogado },
  {
    nome: 'advogado-disponibilidade',
    rota: '/advogado/disponibilidade',
    conta: CONTAS.advogado,
  },
  { nome: 'admin-advogados', rota: '/admin/advogados', conta: CONTAS.admin },
  { nome: 'admin-produtos', rota: '/admin/produtos', conta: CONTAS.admin },
  {
    nome: 'admin-distribuicao',
    rota: '/admin/distribuicao',
    conta: CONTAS.admin,
  },
  { nome: 'admin-clientes', rota: '/admin/clientes', conta: CONTAS.admin },
  { nome: 'admin-estornos', rota: '/admin/estornos', conta: CONTAS.admin },
  { nome: 'admin-entregas', rota: '/admin/entregas', conta: CONTAS.admin },
  { nome: 'admin-reunioes', rota: '/admin/reunioes', conta: CONTAS.admin },
] as const;

test.describe('regressao visual dos paineis', () => {
  for (const tela of TELAS) {
    test(tela.nome, async ({ page }) => {
      await entrar(page, tela.conta);
      await page.goto(tela.rota);

      // Sem isto a captura pode sair no meio do carregamento da lista.
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () =>
          new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
      );

      await expect(page).toHaveScreenshot(`${tela.nome}.png`, {
        fullPage: true,
      });
    });
  }

  /**
   * O CARTAO COM O AGENDAMENTO FORA DO AR — que e o estado de PRODUCAO enquanto
   * a integracao com o Teams nao existir (`REUNIOES_MODO=desligado`).
   *
   * POR QUE ESTE TESTE INTERCEPTA, sendo que a suite inteira existe para NAO
   * interceptar. O modo e configuracao do processo da API, e o `webServer` desta
   * config e um so para a execucao inteira: subir a API em `desligado` apagaria
   * o agendamento de todas as outras telas e derrubaria a jornada, que precisa
   * marcar de verdade. Um segundo servidor so para uma captura custaria mais do
   * que defende.
   *
   * E A INTERCEPCAO E MINIMA DE PROPOSITO: ela pega a resposta REAL do servidor
   * e vira UM booleano, exatamente o que a configuracao de producao viraria.
   * Nao ha jogo de respostas escrito a mao — que e o que a suite recusa, porque
   * envelhece em silencio —, entao qualquer mudanca na forma do cartao continua
   * chegando aqui inteira.
   */
  test('cliente-pedidos-sem-agendamento', async ({ page }) => {
    await entrar(page, CONTAS.cliente);

    await page.route('**/api/pedidos', async (rota) => {
      const resposta = await rota.fetch();
      const cartoes = (await resposta.json()) as Record<string, unknown>[];

      await rota.fulfill({
        response: resposta,
        json: cartoes.map((cartao) => ({
          ...cartao,
          agendamentoDisponivel: false,
        })),
      });
    });

    await page.goto('/painel');

    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/ainda não está disponível/).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
    );

    await expect(page).toHaveScreenshot('cliente-pedidos-sem-agendamento.png', {
      fullPage: true,
    });
  });
});
