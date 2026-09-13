/**
 * Fronteiras entre modulos e ciclos proibidos (arquitetura, secao 10).
 * Roda em `pnpm lint` e em `pnpm quality`.
 */
module.exports = {
  forbidden: [
    {
      name: 'sem-ciclos',
      severity: 'error',
      comment:
        'Dependencia circular. Sempre extraivel para um terceiro modulo; nunca aceitar.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'web-nao-importa-api',
      severity: 'error',
      comment:
        'O frontend nao pode importar codigo do backend. O que for comum vai para packages/shared.',
      from: { path: '^apps/web' },
      to: { path: '^apps/api' },
    },
    {
      name: 'api-nao-importa-web',
      severity: 'error',
      comment: 'O backend nao pode importar codigo do frontend.',
      from: { path: '^apps/api' },
      to: { path: '^apps/web' },
    },
    {
      name: 'shared-nao-importa-apps',
      severity: 'error',
      comment:
        'packages/shared e folha da arvore de dependencia. Se ele precisa de um app, a fronteira esta errada.',
      from: { path: '^packages/shared' },
      to: { path: '^apps' },
    },
    {
      name: 'web-so-usa-firebase-para-auth',
      severity: 'error',
      comment:
        'Regra inviolavel 7: o SDK do Firebase no frontend serve SO para autenticacao. ' +
        'Nenhuma leitura ou escrita direta no Firestore pelo browser — todo acesso ao ' +
        'banco passa pela API, o que concentra a autorizacao em um lugar auditavel. As ' +
        'regras do Firestore negam a leitura de qualquer forma, entao um import destes ' +
        'produziria uma tela que falha em producao sem falhar em nenhum teste de unidade.',
      from: { path: '^apps/web' },
      to: {
        path: '^(firebase/(firestore|storage|database|functions|analytics|messaging)|firebase-admin)',
      },
    },
    {
      name: 'so-o-portao-emite-link-de-leitura',
      severity: 'error',
      comment:
        'Regra inviolavel 6: nenhum arquivo e servido com status diferente de ' +
        '`limpo`, e essa checagem vive em UM lugar — `arquivos/portao.ts`. ' +
        'Um teste prova que o portao confere o estado; nenhum teste prova que ' +
        'ALGUEM MAIS nao emitiu um link por fora. Isolar a emissao em ' +
        '`arquivos/leitura.ts` e restringir quem o importa e o que transforma ' +
        'essa segunda garantia em lint — e lint roda em todo commit, inclusive ' +
        'nos que ninguem revisou com atencao.',
      from: {
        path: '^apps/api',
        pathNot: [
          // O portao (que usa), o proprio emissor, e o modulo que os liga —
          // fiacao declarativa do Nest, que nao chama nada.
          '^apps/api/src/arquivos/(portao|leitura|arquivos\\.module)\\.ts$',
          // `spec\.ts$` e nao `\.spec\.ts$`: cobre tambem os
          // `*.integration-spec.ts`, que montam o portao a mao para exercita-lo.
          'spec\\.ts$',
        ],
      },
      to: { path: '^apps/api/src/arquivos/leitura\\.ts$' },
    },
    {
      name: 'so-o-armazenamento-conhece-o-sdk-do-storage',
      severity: 'error',
      comment:
        'ADR-17: o SDK do Cloud Storage vive atras da porta `Armazenamento`. ' +
        'Um import direto em outro modulo desfaria o teste sem rede — e o ' +
        'projeto nao tem emulador de Storage, entao "testar contra o de ' +
        'verdade" significaria testar contra o bucket de producao.',
      from: {
        path: '^apps/api',
        pathNot: '^apps/api/src/armazenamento/',
      },
      to: { path: '^@google-cloud/storage' },
    },
    {
      name: 'sem-dev-dep-em-producao',
      severity: 'error',
      comment: 'Modulo de producao dependendo de devDependency.',
      from: { path: '^(apps|packages)', pathNot: '\\.spec\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'sem-modulo-orfao',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.(json|css|html|d\\.ts)$',
          '\\.config\\.(mjs|cjs|js|ts)$',
          '^apps/web/(setup-jest|src/main|src/main\\.server)\\.ts$',
          // Substituto de producao do catalogo: entra no grafo por
          // `fileReplacements` do angular.json, nao por import.
          '^apps/web/src/app/catalogo/catalogo\\.routes\\.prod\\.ts$',
          // Suite do Playwright: e ponto de entrada, descoberto pelo runner e
          // nao importado por ninguem. Ser orfao e a forma certa dela.
          '^apps/web/e2e/.*\\.spec\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|dist|coverage|\\.angular|out-tsc)' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
