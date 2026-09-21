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
    /*
     * Etapa 10. E o "calculo de saldo e intervalo de reunioes" que a
     * arquitetura, secao 10, lista como alvo desde o comeco — e que o
     * comentario de `apps/api/stryker.config.mjs` reservava como "uma linha
     * nesta lista". As bordas sao de milissegundo (24h, 24h menos 1 ms,
     * intervalo exatamente igual ao minimo), que e onde um `>=` virado em `>`
     * nao quebra nenhum teste obvio.
     */
    'src/regras-reuniao.ts',
    'src/estado-reuniao.ts',
  ],

  /*
   * MEDIDO, e nao chutado. A primeira corrida deu 98.46% (64 mutantes mortos, um
   * sobrevivente equivalente em `ehPerfil`, documentado la); a Etapa 10 deu
   * 98.15% com `regras-reuniao.ts` e `estado-reuniao.ts` dentro (212 de 216).
   * `break` e o piso observado menos dois pontos, a mesma folga que os limiares
   * de cobertura usam: apertar ate 98 faria um refactor legitimo quebrar a
   * build. Subir este numero e decisao deliberada, nunca automatica.
   *
   * OS TRES SOBREVIVENTES DE `regras-reuniao.ts` SAO REAIS, e ficam. Todos sao a
   * mesma guarda — `inicioMs !== null &&`, que fecha a regra quando o instante
   * gravado e ilegivel — trocada por `true`. Com a guarda solta, `null` entra na
   * aritmetica e vira zero, e o unico input que distingue os dois codigos e um
   * `agora` NEGATIVO: um instante anterior a 1970. Escrever esse teste nao
   * defenderia nada que possa acontecer; defenderia o numero. A analise de
   * mutacao e boa em apontar onde olhar, e esta e uma das vezes em que a
   * resposta certa e olhar e nao mexer — como o sobrevivente de `ehPerfil`.
   *
   * Os cinco sobreviventes ARITMETICOS que a primeira corrida da Etapa 10 achou
   * nas duas constantes de 24 horas foram mortos, e valiam: todo teste de borda
   * monta o instante a partir da propria constante, entao a suite inteira
   * continuava verde com a janela valendo 24 SEGUNDOS. O valor passou a ser
   * afirmado uma vez, em milissegundos, contra o que o ADR-12 diz em portugues.
   */
  thresholds: { high: 95, low: 85, break: 96 },

  tempDirName: 'node_modules/.stryker-tmp',
  htmlReporter: { fileName: '../../reports/mutacao-shared.html' },
  jsonReporter: { fileName: '../../reports/mutacao-shared.json' },
};
