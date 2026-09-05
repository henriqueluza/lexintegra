/**
 * Suite de INTEGRACAO: exige os emuladores de Auth e Firestore no ar. Por isso o
 * script se chama `test:integration` e nao `test` — `pnpm test` precisa
 * continuar rodando numa maquina sem Java.
 *
 * Quem sobe os emuladores e `scripts/emuladores.sh`.
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
  // Emulador em maquina fria demora a responder a primeira conexao.
  testTimeout: 30_000,
};
