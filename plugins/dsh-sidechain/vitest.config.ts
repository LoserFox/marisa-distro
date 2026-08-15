import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const browserModulesStub = fileURLToPath(new URL('./tests/browser-modules.stub.ts', import.meta.url))

/**
 * Type-only @deepseek-ai imports resolve through each package's `exports`
 * map; the subagent/command service faces are stubbed inside the specs, so
 * the only DSH runtime package loaded here is Schemastery (for Config).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-runtime/client': browserModulesStub,
      '@deepseek-ai/dsh-client-ui-primitives': browserModulesStub,
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
