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
      { useESM: true, tsconfig: '<rootDir>/../tsconfig.json' },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['js', 'json', 'ts'],
  passWithNoTests: true,
};
