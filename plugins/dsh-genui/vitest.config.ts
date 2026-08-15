import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Standalone-package tests resolve the dsh workspace against the checkout
 * that powers the host: peer packages (ui-primitives, system-prompt,
 * invariants, cordis vendor) are aliased to their source trees so tests run
 * against the same code the browser bundle compiles — no built lib/ copies.
 * Adjust DSH_ROOT if you develop against a different checkout.
 */
// CI 通过环境变量显式指定 DSH_ROOT；本地默认解析到仓库内 vendored 的 harness checkout。
const DSH_ROOT = process.env.DSH_ROOT ?? resolve(__dirname, '../../harness')

const src = (p: string) => resolve(DSH_ROOT, p)

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: resolve(__dirname, 'node_modules/react/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: resolve(__dirname, 'node_modules/react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: resolve(__dirname, 'node_modules/react-dom/client.js') },
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: src('packages/client/ui-primitives/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-system-prompt$/, replacement: src('packages/core/system-prompt/src/index.ts') },
      { find: /^@deepseek-ai\/dsh-invariants$/, replacement: src('packages/support/invariants/src/index.ts') },
      { find: /^@deepseek-ai\/cordis$/, replacement: src('vendor/cordis/src/index.ts') },
      { find: /^cosmokit$/, replacement: src('vendor/cosmokit/src/index.ts') },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})
