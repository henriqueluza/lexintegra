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
