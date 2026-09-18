import { defineConfig, devices } from '@playwright/test';

/**
 * As jornadas autenticadas, sobre a PILHA REAL (Etapa 12).
 *
 * Config separada de `playwright.config.ts` de proposito. A suite de la roda
 * contra o `ng serve` sozinho, com a API mockada — e por isso ela e rapida e nao
 * precisa de Java. Estas jornadas precisam do oposto: emuladores de Auth e
 * Firestore, API de verdade e navegador entrando com senha. Misturar as duas num
 * config so obrigaria toda execucao de regressao visual a subir a pilha inteira.
 *
 * DOIS COMANDOS, UM CONFIG. `pnpm test:jornadas` roda o projeto `jornadas` no
 * host (comportamento; nao depende de fonte). Os paineis rodam por
 * `scripts/visual.sh paineis`, DENTRO do conteiner — imagem de referencia
 * gravada no macOS nao bate com a do CI, e a diferenca nao e defeito nenhum.
 *
 * PORTAS PROPRIAS (API 8090, web 4201, armazenamento falso 9299), e nao as de
 * `pnpm dev`. A suite nao pode disputar porta com quem esta trabalhando na
 * maquina — e reaproveitar o servidor do desenvolvedor seria pior: ele sobe com
 * outra configuracao, e a jornada passaria ou falharia pelo motivo errado. A
 * 8081 esta fora de cogitacao para a API: e a do emulador do Firestore.
 *
 * `workers: 1` PELO MESMO MOTIVO DA SUITE DE INTEGRACAO DA API: ha um emulador
 * so, e cada teste limpa o estado dele. Em paralelo, um apaga o dado do outro, e
 * o sintoma sao falhas que mudam de nome a cada execucao.
 *
 * QUEM SOBE OS EMULADORES E `scripts/emuladores.sh`, por fora — e dele que vem
 * FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST no ambiente. O
 * `webServer` aqui sobe API e web, que os herdam.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['jornadas/**/*.spec.ts', 'paineis/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? 'line' : 'list',

  use: {
    baseURL: 'http://localhost:4201',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },

  /* As mesmas regras de captura da suite visual: ver `playwright.config.ts`. */
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  snapshotPathTemplate: '{testDir}/referencia/{arg}-{projectName}{ext}',

  /*
   * As jornadas rodam UMA VEZ, numa largura so: o que elas verificam e
   * comportamento, e repeti-las em tres larguras triplicaria o tempo sem
   * verificar nada novo. Os paineis rodam nas tres, porque ali o que se verifica
   * e justamente o desenho.
   */
  projects: [
    {
      name: 'jornadas',
      testMatch: 'jornadas/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 1000 },
      },
    },
    {
      name: 'estreito',
      testMatch: 'paineis/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 900 },
      },
    },
    {
      name: 'medio',
      testMatch: 'paineis/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1000 },
      },
    },
    {
      name: 'largo',
      testMatch: 'paineis/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 1000 },
      },
    },
  ],

  webServer: [
    {
      /*
       * `dist/main.js` e nao `nest start --watch`: a jornada nao muda codigo, e o
       * modo de observacao recompila a cada toque em arquivo — no CI isso e
       * tempo gasto para nada. O `pnpm test:jornadas` da raiz compila antes.
       *
       * ARMAZENAMENTO_FALSO_PORTA e o que faz o upload existir aqui: sem ele, a
       * URL de escrita aponta para `falso.local` e o navegador nao a alcanca.
       */
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:8090/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: '8090',
        ARMAZENAMENTO_FALSO_PORTA: '9299',
        LOG_FORMATO: 'texto',
      },
    },
    {
      command:
        'pnpm exec ng serve --port 4201 --proxy-config proxy.jornadas.conf.json',
      url: 'http://localhost:4201',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
