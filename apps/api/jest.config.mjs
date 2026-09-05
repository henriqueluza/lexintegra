/**
 * NestJS 12 e ESM-only, entao a suite roda em modo ESM. Isso exige
 * NODE_OPTIONS=--experimental-vm-modules (ver o script `test` no package.json).
 */
export default {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
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
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.integration-spec.ts',
    '!main.ts',
    /*
     * `emulador.ts` e arnes de teste de integracao — ele so roda sob
     * `scripts/emuladores.sh`, e essa suite nao alimenta este contador. Deixa-lo
     * no denominador infla o total com codigo que a suite de unidade nao tem
     * como exercitar, e o numero deixaria de dizer alguma coisa.
     */
    '!emulador.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  /*
   * O limiar de 60/50/60/60 era da Etapa 2, quando a API era um esqueleto sem
   * logica: limiar alto sobre codigo vazio e metrica falsa. A Etapa 4 encheu a
   * API de decisao — guards, provisionamento, outbox, transportes — e o medido e
   * 90,6 / 82,7 / 88,9 / 92,5. O limiar abaixo fica logo abaixo disso: com folga
   * para um arquivo novo nao quebrar a build antes de ganhar teste, e apertado o
   * bastante para uma regressao de verdade aparecer.
   *
   * O que sobra descoberto sao os `*.module.ts` — fiacao declarativa do Nest, sem
   * ramo nem decisao — e as fabricas do `firebase.module.ts`, que so tem
   * comportamento real contra o emulador, e a suite de integracao nao alimenta
   * este contador.
   */
  coverageThreshold: {
    global: { statements: 88, branches: 80, functions: 85, lines: 90 },
  },
};
