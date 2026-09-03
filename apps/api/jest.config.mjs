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
      { useESM: true, tsconfig: '<rootDir>/../tsconfig.json' },
    ],
  },
  // Em nodenext o codigo importa './health.service.js'; o arquivo em disco e .ts.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Ver comentario equivalente em apps/web/jest.config.mjs: limiar baixo enquanto
  // o esqueleto nao tem regra de negocio; sobe na Etapa 4.
  coverageThreshold: {
    global: { statements: 60, branches: 50, functions: 60, lines: 60 },
  },
};
