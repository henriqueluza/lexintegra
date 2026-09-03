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
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts'],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 60, branches: 50, functions: 60, lines: 60 },
  },
};
