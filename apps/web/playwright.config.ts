import { defineConfig, devices } from '@playwright/test';

/**
 * Regressao visual e verificacao de acessibilidade sobre o catalogo de
 * componentes.
 *
 * POR QUE DENTRO DE CONTEINER (ver scripts/visual.sh na raiz)
 * Captura de tela feita no macOS nunca bate byte a byte com a feita no Linux do
 * CI: antisserrilhamento de fonte, arredondamento de subpixel e o desenho de
 * controle nativo diferem. Rodando local e no CI dentro da MESMA imagem oficial,
 * existe um unico conjunto de imagens de referencia — o que foi aprovado e
 * exatamente o que o CI compara.
 *
 * TRES LARGURAS, e nao uma: o requisito de layout responsivo da etapa nao e
 * verificavel numa captura so. 360px pega o telefone estreito, 768px o ponto onde
 * a tabela empilha e as abas rolam, 1280px o desktop.
 */
const LARGURAS = [
  { nome: 'estreito', width: 360, height: 900 },
  { nome: 'medio', width: 768, height: 1000 },
  { nome: 'largo', width: 1280, height: 1000 },
] as const;

const URL_BASE = process.env['URL_BASE'] ?? 'http://localhost:4200';

/**
 * O convite do fim da home (07/10/2026) e um popup MODAL: todo teste que rola a
 * landing ate o fim o tomaria na frente do proximo clique, e toda captura de
 * pagina inteira poderia pega-lo aberto. Por isso todo teste comeca com ele
 * "fechado agora ha pouco" (`CHAVE_CONVITE` em `convite-cadastro.ts`; o nome
 * esta repetido aqui porque a configuracao nao importa codigo da aplicacao). O
 * instante e o da carga da configuracao: o silencio e de sete dias, e nenhuma
 * execucao dura isso. So `convite-cadastro.spec.ts` volta ao armazenamento vazio.
 */
const CONVITE_JA_FECHADO = {
  cookies: [],
  origins: [
    {
      origin: new URL(URL_BASE).origin,
      localStorage: [
        { name: 'lexintegra:convite-cadastro', value: String(Date.now()) },
      ],
    },
  ],
};

export default defineConfig({
  testDir: './e2e',

  /*
   * As suites que precisam da PILHA ficam de fora daqui (Etapa 12). Esta
   * configuracao sobe so o `ng serve`, e jornada autenticada exige emuladores e
   * API — sem o recorte, `pnpm test:visual` tenta roda-las e 57 casos falham por
   * falta de sessao, o que nao tem nada a ver com regressao visual. Elas rodam
   * por `playwright.pilha.config.ts` (`pnpm test:jornadas` e
   * `scripts/visual.sh paineis`).
   */
  testIgnore: ['jornadas/**', 'paineis/**'],

  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: URL_BASE,
    storageState: CONVITE_JA_FECHADO,
    // Reduz o ruido entre execucoes: sem animacao em curso, sem cursor piscando.
    colorScheme: 'light',
  },

  expect: {
    toHaveScreenshot: {
      /*
       * Tolerancia zero de proporcao, mas 0,2 de limiar por pixel. Renderizacao
       * de fonte varia em fracoes de tom entre execucoes ate na mesma maquina;
       * exigir igualdade exata por pixel produziria falha intermitente, que e
       * pior que nao ter o teste — todo mundo aprende a ignorar.
       */
      maxDiffPixelRatio: 0,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  /*
   * Um conjunto unico de imagens, sem `{platform}` no caminho: o conteiner
   * garante que so existe uma plataforma. Se um dia alguem gravar fora dele, o
   * diff aparece — que e o comportamento certo.
   */
  snapshotPathTemplate: '{testDir}/referencia/{arg}-{projectName}{ext}',

  projects: LARGURAS.map(({ nome, width, height }) => ({
    name: nome,
    use: { ...devices['Desktop Chrome'], viewport: { width, height } },
  })),

  /*
   * O servidor de desenvolvimento, e nao o build de producao: o catalogo e
   * removido do pacote publicado de proposito, entao nao ha o que capturar la.
   */
  webServer: process.env['URL_BASE']
    ? undefined
    : {
        command: 'pnpm exec ng serve --port 4200',
        url: 'http://localhost:4200/catalogo/tokens',
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },
});
