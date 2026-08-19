/**
 * Client bundle build for dsh-track: emit lib/client.js in the DSH
 * client-modules factory shape (window.__ModuleLoader__.load, contract C6).
 * Mirrors the official clientBundle preset: cjs format (the injected require
 * resolves module-table externals), named entry `client` pinned to
 * lib/client.js, and banner/footer wrapping the factory.
 */
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  // Inlined browser dependencies use Node's conventional development guard.
  // Match DSH's clientBundle preset so the factory never reads a Node global.
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  // DSH client-modules contract C6: register via __ModuleLoader__.load.
  banner: 'window.__ModuleLoader__.load({ id: "@fakechris/dsh-track", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  footer: 'return module.exports; } });',
  deps: {
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-runtime/client',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-conversation',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-locale/client',
    ],
  },
})
