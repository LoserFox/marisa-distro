import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.spec.ts'],
    // Guard against accidentally importing Electron in pure-Node units: the
    // main-process modules import 'electron', the supervision units must not.
    environment: 'node',
    testTimeout: 30_000,
  },
})
