import type { UserConfig } from 'tsdown'

const ID = 'dsh-sonar'

const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-connection/client',
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-conversation/client',
]

const HOST_EXTERNALS = [
  'cordis',
  'schemastery',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-commands',
  '@deepseek-ai/dsh-llm',
  'node:crypto',
  'node:fs',
  'node:os',
  'node:path',
  'node:url',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-tools',
]

const host: UserConfig = {
  name: `${ID}/host`,
  entry: { index: 'src/index.ts', host: 'src/host.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: HOST_EXTERNALS },
  outputOptions: {
    entryFileNames: '[name].js',
  },
}

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: CLIENT_EXTERNALS,
    alwaysBundle: (id: string) => CLIENT_EXTERNALS.includes(id) ? undefined : true,
  },
  plugins: [{
    name: 'dsh-sonar-client-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      throw new Error(`client bundle purity: ${JSON.stringify(source)} is not a platform module`)
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [host, client]
