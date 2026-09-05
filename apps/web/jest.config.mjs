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
  moduleNameMapper: {
    // Espelha o `paths` do tsconfig: o Jest nao le `paths` sozinho.
    '^shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^shared/(.*)$': '<rootDir>/../../packages/shared/src/$1.ts',
    // `packages/shared` e nodenext e importa './estado-entregavel.js'; o arquivo
    // em disco e `.ts`. Mesmo par usado em apps/api/jest.config.mjs.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
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
    /*
     * O catalogo de componentes fica fora da cobertura de unidade, e nao por
     * conveniencia de numero: ele e removido do pacote de producao pelo
     * `fileReplacements` do angular.json, e suas secoes sao markup declarativo —
     * uma lista de estados a mostrar, sem ramo nem decisao. Teste de unidade
     * sobre elas afirmaria "o template que escrevi e o template que escrevi".
     *
     * O que precisa ser verificado no catalogo — que ele monta, que nenhuma
     * pagina tem violacao de acessibilidade, que nada mudou visualmente — e
     * verificado pela suite de Playwright, que nao alimenta este contador.
     *
     * As ROTAS do catalogo continuam medidas: la ha o risco real de um link
     * morto, e ha teste de unidade para isso.
     */
    '!src/app/catalogo/**/*.secao.ts',
    '!src/app/catalogo/pecas/**',
    '!src/app/catalogo/catalogo.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  /*
   * O limiar de 60/50/60/60 da Etapa 2 era deliberadamente baixo porque o app era
   * um esqueleto sem logica: limiar alto sobre codigo vazio e metrica falsa. A
   * Etapa 3 encheu o app de codigo testavel, e o medido e 99,6 / 92,5 / 95,3 /
   * 100 — o limiar abaixo fica logo abaixo disso, com folga suficiente para um
   * arquivo novo nao quebrar a build antes de ganhar teste, e apertada o bastante
   * para uma regressao de verdade aparecer.
   *
   * Subir o limiar so foi possivel depois de tirar o catalogo do denominador; a
   * justificativa esta em `collectCoverageFrom`, acima.
   */
  coverageThreshold: {
    global: { statements: 95, branches: 88, functions: 90, lines: 95 },
  },
};
