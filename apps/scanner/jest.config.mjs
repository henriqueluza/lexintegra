/**
 * O scanner tem suite propria e minima.
 *
 * O QUE E TESTADO: `interpretar`, a traducao da saida do `clamdscan` em veredito
 * — funcao pura, e onde se erra. O RESTO e processo, rede e sistema de arquivos:
 * exercita-lo exigiria ClamAV instalado no runner, e o que ele provaria e que o
 * ClamAV funciona, nao que este codigo esta certo.
 *
 * O caminho de ponta a ponta com um arquivo de teste real e validacao HUMANA,
 * reservada no plano de execucao (Etapa 11, "So voce").
 */
export default {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/../tsconfig.json' },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    /*
     * `servidor.ts` e `atualizar-base.ts` sao pontos de entrada: abrem socket,
     * chamam processo externo e falam com o Cloud Storage. Medi-los aqui infla o
     * denominador com codigo que a suite nao tem como exercitar, e o numero
     * deixaria de dizer alguma coisa.
     */
    '!servidor.ts',
    '!atualizar-base.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
};
