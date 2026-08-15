import { defineConfig } from 'vitest/config'

/**
 * Test surface for the progress package: pure token-rate derivations in the
 * default node environment, plus the jsdom component smoke tests (per-file
 * `// @vitest-environment jsdom` directive). Tests import only package
 * sources plus type-only @deepseek-ai imports (erased at runtime), so no
 * path mapping into the harness snapshot is needed.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
  },
})
