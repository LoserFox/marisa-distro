/**
 * Self-contained tsdown preset for the dsh-update-check bundles, modeled on
 * dsh-ui-progress (client) and dsh-sonar (host externals). Two outputs:
 *  - lib/index.js    — node half: cordis host plugin (routes + check schedule)
 *  - lib/invariant.js — invariant companion (reserves package ownership)
 *  - lib/client.js   — browser bundle: a closure factory handed to
 *    window.__ModuleLoader__.load({ id, factory }); externals resolve through
 *    the loader's frozen module table.
 *
 * Host externals stay unbundled so the plugin shares the composition's single
 * cordis/settings/schemastery instances; node: builtins are never bundled.
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@omdsh-dev/dsh-update-check'

/** Module specifiers the dsh web shell shares into its frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Externals resolved from the loader module table (same list as dsh-ui-progress). */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

/** Bundle purity gate: platform seeds stay external, everything else inline. */
function isExternal(source: string): boolean {
  return CLIENT_EXTERNALS.includes(source)
}

/** Host runtime imports shared with the composition — never bundled. */
const HOST_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-home-paths',
  'undici',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:path',
] as const

export default [
  {
    // Node half: the host loader imports lib/index.js; the invariant
    // companion stays a separate entry so hosts can load it on demand.
    entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: true,
    deps: { neverBundle: [...HOST_EXTERNALS] },
  },
  {
    // Browser bundle: lib/client.js, served by the harness at /plugins/<id>/client.js.
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    noExternal: (id: string) => { return isExternal(id) ? undefined : true },
    plugins: [{
      // Bundle purity gate: any @deepseek-ai value import that is not a
      // platform module is a build error — cross-plugin collaboration goes
      // through cordis services (type-only imports are erased and never reach
      // this gate).
      name: 'dsh-update-check-client-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (isExternal(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (loader module table) — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services',
        )
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
