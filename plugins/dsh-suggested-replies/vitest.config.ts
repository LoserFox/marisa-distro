/** Vitest defaults to Node; UI specifications opt into jsdom per-file. */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
  },
})
