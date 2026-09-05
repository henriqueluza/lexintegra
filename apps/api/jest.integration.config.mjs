/**
 * Testes de integracao rodam contra o emulador do Firestore (arquitetura, secao 10).
 */
export default {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.integration-spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/../tsconfig.spec.json' },
    ],
  },
  // Em nodenext o codigo importa './health.service.js'; o arquivo em disco e .ts.
  // O mesmo par vale para os imports internos de `packages/shared`.
  moduleNameMapper: {
    '^shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  passWithNoTests: true,

  /*
   * UM ARQUIVO POR VEZ, E ISSO NAO E LENTIDAO ACEITA A TOA.
   *
   * O padrao do Jest e um worker por nucleo, com os arquivos de teste em
   * paralelo. Ha UM emulador, e todo arquivo daqui chama `limparEmuladores()` no
   * `beforeEach` — em paralelo, um apaga o dado que o outro acabou de escrever.
   *
   * Ate a Etapa 4 havia um unico arquivo de integracao na API, entao o problema
   * nao existia. A Etapa 5 trouxe mais tres, e o sintoma foi uma dezena de falhas
   * que mudavam de nome a cada execucao — inclusive em testes de advogados que
   * ninguem tinha tocado.
   *
   * E a mesma razao pela qual `scripts/emuladores.sh` roda as duas suites em
   * sequencia com `&&` em vez de dois `--filter`.
   */
  maxWorkers: 1,
};
