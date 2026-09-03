/**
 * Arquitetura, secao 10: Angular e Nest rodam ambos em Jest, o que da um relatorio
 * de cobertura consolidado, um unico limiar e um unico alvo para o Stryker. E o
 * ganho direto sobre a alternativa React, que exigiria consolidar dois runners.
 */
export default {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    // Fiacao de bootstrap do framework, sem logica propria: medir cobertura
    // deles infla o denominador sem dizer nada sobre a qualidade do codigo.
    '!src/main.ts',
    '!src/main.server.ts',
    '!src/app/app.config.ts',
    '!src/app/app.config.server.ts',
    '!src/app/app.routes.server.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  // Limiar deliberadamente baixo: este e um esqueleto sem logica de negocio, e
  // limiar alto sobre codigo vazio e metrica falsa. Sobe na Etapa 4, quando a
  // primeira regra de dominio existir.
  coverageThreshold: {
    global: { statements: 60, branches: 50, functions: 60, lines: 60 },
  },
};
