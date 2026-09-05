/**
 * Testes de integracao rodam contra o emulador do Firestore (arquitetura, secao 10).
 * Nao ha nenhum ainda: o modelo de dados e a Etapa 5, e as regras de seguranca a
 * Etapa 4. A configuracao existe para `pnpm test:integration` ser um comando real
 * desde a Etapa 2, e nao uma promessa no CLAUDE.md.
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
};
