/**
 * Standalone vitest config: alias @deepseek-ai/dsh-* peer packages to the
 * running DSH checkout's built lib so runtime imports resolve outside the
 * workspace (same strategy as the community dsh-toolkit repos).
 *
 * DSH_SOURCE selects which checkout the aliases point at — default is the
 * vendored harness checkout at <repo>/harness; the A/B snapshot rotation
 * (dsh-snapshot-ab) sets it to a candidate slot to test against the next
 * daily snapshot before cutover.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const DSH = process.env.DSH_SOURCE ?? fileURLToPath(new URL('../../harness', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: 'cordis', replacement: fileURLToPath(new URL(`${DSH}/vendor/cordis/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-storage', replacement: fileURLToPath(new URL(`${DSH}/packages/storage/storage/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-storage-json', replacement: fileURLToPath(new URL(`${DSH}/packages/storage/storage-json/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-tools', replacement: fileURLToPath(new URL(`${DSH}/packages/core/tools/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-session', replacement: fileURLToPath(new URL(`${DSH}/packages/core/session/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-llm', replacement: fileURLToPath(new URL(`${DSH}/packages/llm/llm/lib/index.js`, import.meta.url)) },
      { find: '@deepseek-ai/dsh-system-prompt', replacement: fileURLToPath(new URL(`${DSH}/packages/core/system-prompt/lib/index.js`, import.meta.url)) },
    ],
  },
})
