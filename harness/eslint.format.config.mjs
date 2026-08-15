import stylistic from '@stylistic/eslint-plugin'
import parser from '@typescript-eslint/parser'

// Oxlint's JavaScript-plugin compatibility layer reports these rules but does
// not execute their fixers. Keep this config formatting-only: Oxlint remains
// the authoritative repository linter after this pass applies safe fixes.
export default [
  {
    ignores: [
      '**/lib/**',
      '**/node_modules/**',
      '**/.sessions/**',
      '.claude/**',
      '**/.doc-typecheck-*/**',
      '**/.node-next-types-*/**',
      // Do not mirror Oxlint's contract-fixture ignore: those files must reach this formatter.
      'website/.generated/**',
      'vendor/**',
      'native/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.config.ts',
      'packages/client/tsdown.client.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/indent': ['error', 2],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'none' },
        singleline: { delimiter: 'semi', requireLast: false },
      }],
    },
  },
  {
    // TypeGraph coverage must retain source-authored syntax that the normal quote rule forbids.
    files: ['packages/typert/generator/tests/fixtures/type-model/packages/host/src/models.ts'],
    rules: {
      '@stylistic/quotes': 'off',
    },
  },
]
