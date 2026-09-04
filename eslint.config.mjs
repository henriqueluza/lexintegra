import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

/**
 * Arquitetura, secao 10: a regra de complexidade e a de tamanho de arquivo sao
 * requisito de qualidade do projeto, nao preferencia de estilo. Elas alimentam o
 * `pnpm quality` e o entregavel da clausula 4.3.
 *
 * Lint sem type-checking de proposito: o ganho do modo type-checked nao compensa,
 * nesta etapa, o custo de manter tres tsconfig de projeto sincronizados no CI.
 * Reavaliar na Etapa 12 (endurecimento).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/out-tsc/**',
      '**/node_modules/**',
      'docs/prototipos/**',
      'infra/**',
      'public/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Arquivos de configuracao CommonJS na raiz.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      complexity: ['error', { max: 10 }],
      'max-lines': [
        'error',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['error', 4],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Testes podem ser longos e repetitivos: o valor de um teste esta na clareza
    // do caso, nao na concisao.
    files: ['**/*.spec.ts', '**/*.integration-spec.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  /*
   * ------------------------------------------------------------------------
   * Angular: classe de componente
   * ------------------------------------------------------------------------
   */
  {
    files: ['apps/web/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      /*
       * Regra inviolavel 8, primeira metade: valor visual nao pode nascer dentro
       * do componente. `styles: [...]` inline no decorador escapa do stylelint,
       * que so enxerga arquivo `.css`. Forcar `styleUrl` mantem todo CSS de
       * componente sob a regra de token.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Decorator[expression.callee.name="Component"] Property[key.name="styles"]',
          message:
            'Use styleUrl com um arquivo .css: `styles` inline escapa do stylelint, ' +
            'e com ele a regra de token que e o criterio de aceite da Etapa 3.',
        },
      ],
    },
  },

  /*
   * ------------------------------------------------------------------------
   * Angular: template
   * ------------------------------------------------------------------------
   *
   * O conjunto `templateAccessibility` e o tratamento de acessibilidade que a
   * Etapa 3 exige nascer com o componente: rotulo associado ao controle, evento
   * de clique com equivalente de teclado, elemento interativo focavel, papel ARIA
   * com os atributos que ele obriga. Verificar isso a mao, componente a
   * componente, nao sobrevive a Etapa 5.
   */
  {
    files: ['apps/web/**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {
      /*
       * Regra inviolavel 8, segunda metade: `style="..."` no template e a outra
       * porta de entrada de valor visual solto, e o stylelint tambem nao a
       * enxerga.
       */
      '@angular-eslint/template/no-inline-styles': [
        'error',
        { allowNgStyle: false, allowBindToStyle: false },
      ],
      '@angular-eslint/template/button-has-type': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
    },
  },
);
