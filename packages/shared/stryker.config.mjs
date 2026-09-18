/**
 * Analise de mutacao dos alvos PUROS (arquitetura, secao 10).
 *
 * "Rodar Stryker no projeto inteiro e caro em tempo de CI e produz ruido. Os
 * alvos que valem: cálculo de saldo e intervalo de reuniões, validação de
 * transição de status, verificação de assinatura do webhook e as regras de
 * autorização." Deste lado ficam os dois primeiros que ja existem: a maquina de
 * estados do entregavel e a elegibilidade de cancelamento e estorno.
 *
 * POR QUE UMA CONFIGURACAO AQUI E OUTRA EM `apps/api`, e nao uma so na raiz:
 * `jest --findRelatedTests` devolve VAZIO para arquivo fora do `rootDir`. Mutar
 * `packages/shared` a partir da configuracao da API rodaria zero teste por
 * mutante e reportaria tudo como sobrevivente — uma suite de mutacao que aprova
 * qualquer coisa e pior que nenhuma. E nada em `apps/api` importa
 * `estado-entregavel`: quem mata esses mutantes e a suite deste pacote.
 *
 * `inPlace: true` PORQUE O SANDBOX QUEBRA AQUI. O Stryker copia o projeto para um
 * diretorio temporario, e sob pnpm as dependencias reais ficam em
 * `<pacote>/node_modules`, que a copia nao leva. No lugar, a resolucao e
 * exatamente a de `pnpm test`. O preco e que um `kill -9` no meio deixa arquivo
 * mutado na arvore — por isso `pnpm mutacao` confere `git status` no fim.
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'jest',

  /*
   * O PLUGIN E DECLARADO, e nao descoberto. Sob pnpm, `@stryker-mutator/core`
   * mora em `.pnpm/...` e a varredura automatica dele nao enxerga o
   * `node_modules` deste pacote — o sintoma e "no TestRunner plugins were
   * loaded" com o plugin instalado ali do lado.
   */
  plugins: ['@stryker-mutator/jest-runner'],
  inPlace: true,
  reporters: ['clear-text', 'progress', 'html', 'json'],

  jest: {
    projectType: 'custom',
    configFile: 'jest.config.mjs',
    enableFindRelatedTests: true,
  },

  /*
   * O Stryker cria o processo do executor, entao a variavel dos scripts do
   * package.json nao chega ate la — sem isto, ESM nao roda.
   */
  testRunnerNodeArgs: ['--experimental-vm-modules'],

  mutate: [
    'src/estado-entregavel.ts',
    'src/situacao-pedido.ts',
    'src/perfil.ts',
  ],

  /*
   * MEDIDO, e nao chutado. A primeira corrida deu 98.46% (64 mutantes mortos, um
   * sobrevivente equivalente em `ehPerfil`, documentado la). `break` e o piso
   * observado menos dois pontos, a mesma folga que os limiares de cobertura
   * usam: apertar ate 98 faria um refactor legitimo quebrar a build. Subir este
   * numero e decisao deliberada, nunca automatica.
   */
  thresholds: { high: 95, low: 85, break: 96 },

  tempDirName: 'node_modules/.stryker-tmp',
  htmlReporter: { fileName: '../../reports/mutacao-shared.html' },
  jsonReporter: { fileName: '../../reports/mutacao-shared.json' },
};
