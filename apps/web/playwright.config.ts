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

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: process.env['URL_BASE'] ?? 'http://localhost:4200',
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
