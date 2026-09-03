import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

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
);
