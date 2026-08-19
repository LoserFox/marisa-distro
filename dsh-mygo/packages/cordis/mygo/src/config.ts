/**
 * Manager Config schema and resolver. Defaults follow the
 * schedule's T6 values: 256KB code, 64MB registry, 1000 dynamic plugins,
 * 50MB audit × 5 files, 2 retained generations.
 * `stateRoot` defaults to the harness-home `plugin-state` directory.
 * @module @r05en1cu/dsh-mygo/src/config
 */

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type { PluginManagerConfig } from './types.ts'

/** The schema's normalized output: `stateRoot` is optional until the resolver fills it. */
type ParsedConfig = Omit<PluginManagerConfig, 'stateRoot'> & { readonly stateRoot?: string }

/**
 * Schemastery schema for the manager Config. All fields except `stateRoot`
 * carry their spec defaults; `stateRoot` is filled by
 * {@link resolvePluginManagerConfig} so the harness-home default is resolved
 * against the environment at resolve time.
 */
export const PluginManagerConfigSchema: Schema = z.object({
  maxCodeBytes: z.number().step(1).min(1).default(256 * 1024),
  maxRegistryBytes: z.number().step(1).min(1).default(64 * 1024 * 1024),
  maxDynamicPlugins: z.number().step(1).min(1).default(1000),
  auditMaxBytes: z.number().step(1).min(1).default(50 * 1024 * 1024),
  auditKeepFiles: z.number().step(1).min(1).default(5),
  stateRoot: z.string(),
  historyKeep: z.number().step(1).min(1).default(2),
  swapTimeoutMs: z.number().step(1).min(1).default(30_000),
  disposeTimeoutMs: z.number().step(1).min(0).max(30_000).default(5000),
  protectedFields: z.array(z.string()).default([]),
})

/**
 * Resolve a manager Config value: parse the input against the schema (invalid
 * input fails loud with schemastery's error) and fill the `stateRoot` default
 * from the current harness home.
 * @param input - partial manager Config; `undefined` yields all defaults.
 * @returns the fully resolved Config.
 */
export function resolvePluginManagerConfig(input?: unknown): PluginManagerConfig {
  // Schemastery's tuple/dict inference is looser than the FileAccessEntry
  // tuple contract, so the normalized output crosses through `unknown`.
  const parsed = PluginManagerConfigSchema(input ?? {}) as unknown as ParsedConfig
  return parsed.stateRoot === undefined
    ? { ...parsed, stateRoot: dshHomePath('plugin-state') }
    : { ...parsed, stateRoot: parsed.stateRoot }
}
