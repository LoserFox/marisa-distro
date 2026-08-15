import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@deepseek-ai\/dsh-client-runtime\/client$/,
        replacement: fileURLToPath(new URL('./test/client-runtime.ts', import.meta.url)),
      },
      {
        find: /^@deepseek-ai\/dsh-client-web-react$/,
        replacement: fileURLToPath(new URL('./test/web-react.ts', import.meta.url)),
      },
    ],
  },
  ssr: {
    noExternal: ['@deepseek-ai/dsh-client-ui-primitives'],
  },
  test: {
    include: ['tests/**/*.spec.ts', 'ui-a2a/tests/**/*.spec.tsx'],
  },
})
