/**
 * Standalone vitest config (plain ESM — no TS transpile deps needed, so it
 * loads even when the repo node_modules lacks esbuild/vite).
 *
 * Aliases @deepseek-ai/dsh-* peer packages to the running DSH checkout's built
 * lib so runtime imports resolve outside the workspace (same strategy as the
 * community dsh-toolkit repos). DSH_SOURCE selects the checkout; default is the
 * vendored harness checkout at <repo>/harness.
 *
 * test.include is scoped to the ROOT tests/ dir so sibling git worktree
 * test dirs are never scanned.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const DSH = process.env.DSH_SOURCE ?? fileURLToPath(new URL('../../harness', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: 'cordis', replacement: DSH + '/vendor/cordis/lib/index.js' },
      { find: '@deepseek-ai/dsh-storage', replacement: DSH + '/packages/storage/storage/lib/index.js' },
      { find: '@deepseek-ai/dsh-storage-json', replacement: DSH + '/packages/storage/storage-json/lib/index.js' },
      { find: '@deepseek-ai/dsh-tools', replacement: DSH + '/packages/core/tools/lib/index.js' },
      { find: '@deepseek-ai/dsh-session', replacement: DSH + '/packages/core/session/lib/index.js' },
      { find: '@deepseek-ai/dsh-llm', replacement: DSH + '/packages/llm/llm/lib/index.js' },
      { find: '@deepseek-ai/dsh-system-prompt', replacement: DSH + '/packages/core/system-prompt/lib/index.js' },
    ],
  },
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
