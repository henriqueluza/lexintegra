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
 * O QUE FICA DE FORA, e por que:
 *
 * - `advogado/disponibilidade`: a grade e calculada a partir da semana CORRENTE,
 *   no servidor (`packages/shared/src/semana.ts`). A imagem mudaria toda segunda,
 *   e um baseline que precisa ser regravado por calendario treina a equipe a
 *   regravar sem olhar — que e como uma suite de regressao visual morre.
 * - `painel/anamnese`: e o stub provisorio da Etapa 8
 *   (`{{TODO-FICHA-ANAMNESE-DA-CONTRATANTE}}`), e vai mudar inteiro quando a
 *   ficha definitiva chegar.
 */
const TELAS = [
  { nome: 'cliente-pedidos', rota: '/painel', conta: CONTAS.cliente },
  {
    nome: 'advogado-demandas',
    rota: '/advogado/demandas',
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
});
