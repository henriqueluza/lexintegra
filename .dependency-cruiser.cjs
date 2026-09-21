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
        /* Caminho resolvido — ver o comentario em `so-o-armazenamento-...`. */
        path: '/(firebase/(firestore|storage|database|functions|analytics|messaging)|firebase-admin)/',
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
      name: 'so-o-enfileirador-monta-nome-de-tarefa',
      severity: 'error',
      comment:
        'O nome da tarefa e a camada de deduplicacao do Cloud Tasks (ADR-03): e ' +
        'ele que impede o varredor de criar uma segunda tarefa para um registro ' +
        'cuja tarefa ainda esta viva. Um chamador que monte o nome a mao, com um ' +
        'campo a menos, nao quebra nada — a tarefa e criada, o teste passa, e a ' +
        'deduplicacao deixa de acontecer. O sintoma so aparece em producao, como ' +
        'e-mail duplicado. Mesma forma de `arquivos/leitura.ts`: ha teste ' +
        'provando que o enfileirador monta o nome certo, e nenhum provando que ' +
        'ALGUEM MAIS nao montou um por fora — isolar a funcao e restringir quem a ' +
        'importa e o que transforma essa segunda garantia em lint.',
      from: {
        path: '^apps/api',
        pathNot: [
          // O enfileirador (que usa) e o proprio arquivo.
          '^apps/api/src/outbox/(enfileirador\\.service|nome-da-tarefa)\\.ts$',
          // `spec\.ts$` e nao `\.spec\.ts$`: cobre tambem os
          // `*.integration-spec.ts`, que conferem o nome que chegou a fila.
          'spec\\.ts$',
        ],
      },
      to: { path: '^apps/api/src/outbox/nome-da-tarefa\\.ts$' },
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
      /*
       * O caminho RESOLVIDO, e nao o especificador. Sob pnpm o pacote vive em
       * `node_modules/.pnpm/@google-cloud+storage@.../node_modules/...`, e o
       * padrao ancorado em `^@google-cloud/storage` que existia aqui ate a Etapa
       * 12 nunca casava com nada: a regra parecia proteger a fronteira e nao
       * protegia.
       */
      to: { path: '/@google-cloud/storage/' },
    },
    {
      name: 'so-a-instrumentacao-conhece-o-sdk-de-rastreio',
      severity: 'error',
      comment:
        'Etapa 12. O SDK do OpenTelemetry e os pacotes de instrumentacao so sao ' +
        'carregados por `observabilidade/instrumentacao.ts`, que roda ANTES da ' +
        'aplicacao, por `--import`. Um `new NodeSDK(...)` dentro de um modulo do ' +
        'Nest subiria um segundo provedor depois de o Express ja ter carregado o ' +
        '`http`: a instrumentacao nao pegaria nada e os dois exportadores ' +
        'disputariam o mesmo trace. `@opentelemetry/api` fica de FORA desta regra ' +
        'de proposito — ela e a interface, e sem SDK carregado nao faz nada, que e ' +
        'exatamente o que o logger e a fila precisam.',
      from: {
        path: '^apps/api',
        pathNot: [
          '^apps/api/src/observabilidade/(instrumentacao|amostragem)\\.ts$',
          // O teste do amostrador precisa do `SamplingDecision` do SDK para
          // afirmar a decisao; ele nao sobe provedor nenhum.
          '\\.spec\\.ts$',
        ],
      },
      to: {
        path: '/(@opentelemetry/(sdk-|instrumentation-|resources|resource-detector)|@google-cloud/opentelemetry)',
      },
    },

    {
      name: 'o-scanner-nao-depende-do-monorepo',
      severity: 'error',
      comment:
        'Etapa 11, mantida na 12. O contentor do ClamAV nao importa ' +
        '`packages/shared` nem nada de `apps/` — e essa ausencia que permite ' +
        'construi-lo e implanta-lo sozinho, com Dockerfile e pipeline proprios. ' +
        'Ate aqui isso era convencao escrita em comentario; agora e lint. O custo ' +
        'de violar seria descoberto tarde: o build do scanner passaria a exigir o ' +
        'workspace inteiro.',
      from: { path: '^apps/scanner' },
      to: { path: '^(packages/|apps/(api|web))' },
    },

    {
      name: 'so-a-fabrica-conhece-o-abacatepay',
      severity: 'error',
      comment:
        'Etapa 8, regra inviolavel 20. O adaptador do AbacatePay so pode ser ' +
        'instanciado por `pagamentos/gateway/criar-gateway.ts`, que so o escolhe ' +
        'depois de `modo.ts` validar o modo, o prefixo da chave e os segredos do ' +
        'webhook. Um `new AbacatePayGateway(...)` em outro modulo passaria por ' +
        'cima da trava contra producao inteira — e sandbox e producao usam a ' +
        'mesma URL, entao nada falharia: so cobraria de verdade.',
      from: {
        path: '^apps/api',
        pathNot: [
          '^apps/api/src/pagamentos/gateway/(criar-gateway|abacatepay\\.gateway)\\.ts$',
          'spec\\.ts$',
        ],
      },
      to: {
        path: '^apps/api/src/pagamentos/gateway/abacatepay\\.gateway\\.ts$',
      },
    },
    {
      name: 'so-a-fabrica-conhece-o-graph',
      severity: 'error',
      comment:
        'Etapa 10, ADR-21. O adaptador da Microsoft Graph so pode ser ' +
        'instanciado por `reunioes/sala/criar-sala-de-reuniao.ts`, que so o ' +
        'escolhe depois de `modo.ts` validar o modo. Um `new GraphSalaDeReuniao' +
        '(...)` em outro modulo passaria por cima da trava inteira — e o que ' +
        'esta do outro lado dela e o tenant da B&C: salas criadas em nome de ' +
        'advogados reais, com convites saindo para clientes reais, a partir de ' +
        'um ambiente de teste. Mesma forma de `so-a-fabrica-conhece-o-abacatepay`.',
      from: {
        path: '^apps/api',
        pathNot: [
          '^apps/api/src/reunioes/sala/(criar-sala-de-reuniao|graph\\.sala-de-reuniao)\\.ts$',
          'spec\\.ts$',
        ],
      },
      to: {
        path: '^apps/api/src/reunioes/sala/graph\\.sala-de-reuniao\\.ts$',
      },
    },
    {
      name: 'sem-dev-dep-em-producao',
      severity: 'error',
      comment:
        'Modulo de producao dependendo de devDependency. As isencoes cobrem o ' +
        'que NAO e producao: testes de unidade e de integracao, arnes de e2e e ' +
        'arquivos de configuracao. Ate a Etapa 12 esta regra nao valia nada — o ' +
        '`node_modules` estava fora do grafo, entao nenhuma aresta para pacote ' +
        'externo existia e a regra nunca podia disparar.',
      from: {
        path: '^(apps|packages)',
        pathNot: [
          '\\.spec\\.ts$',
          '\\.integration-spec\\.ts$',
          '^apps/web/e2e/',
          '\\.config\\.(mjs|cjs|js|ts)$',
          '^apps/web/setup-jest\\.ts$',
          // Arneses de teste que vivem em `src/` para compilar junto (ver o
          // cabecalho de `firestore-falso.ts`).
          '^apps/api/src/(firestore-falso|emulador|arnes-.*)\\.ts$',
        ],
      },
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
    /*
     * ANCORADO EM SEGMENTO DE CAMINHO, e nao em qualquer lugar do texto.
     *
     * O padrao antigo era `(node_modules|dist|coverage|...)`, sem ancora, e
     * `dist` casava com **`distribuicao`**: sete arquivos ficavam fora do grafo,
     * entre eles `pedidos/distribuicao.service.ts` e as telas de distribuicao do
     * administrador. O "zero ciclos" de ate a Etapa 12 nao cobria o que parecia
     * cobrir — e a falha era silenciosa, porque arquivo excluido nao aparece nem
     * como aviso.
     */
    exclude: {
      path: '(^|/)(dist|coverage|\\.angular|out-tsc|\\.stryker-tmp)(/|$)',
    },
    tsPreCompilationDeps: true,

    /*
     * `shared` resolve para `packages/shared/dist/*` pelo `exports` do pacote, e
     * `dist` e excluido do grafo — entao NENHUMA aresta entrava em
     * `packages/shared`, e as regras sobre ele nunca eram exercitadas. Pior: em
     * CI o `dist` nem existe quando o lint roda. `tsconfig.deps.json` existe so
     * para isto: ele mapeia `shared` para a FONTE, que e o que o compilador e o
     * Jest tambem enxergam.
     */
    tsConfig: { fileName: 'tsconfig.deps.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
