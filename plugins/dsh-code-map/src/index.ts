/**
 * `@dsh-external/dsh-code-map`: codebase-map queries for the model — symbol
 * outlines today, call/type hierarchies next. Host half owns a per-workspace
 * pooled language-server process and registers the text-only `code_map` tool
 * (v0: `document_symbols`, the full symbol tree of one file).
 *
 * Standalone repo convention: no SDK dependency; the minimal service
 * interfaces are supplied by the host Harness at runtime.
 * @module @dsh-external/dsh-code-map
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import z from 'schemastery'
import { registerCodeMapTool, type CodeMapOptions, type ServerConfig, type ToolDefinition, type ToolsContext } from './tools.ts'

const require = createRequire(import.meta.url)

/** Minimal Cordis context carrying the host services this plugin needs. */
interface HostContext extends ToolsContext {
  effect(callback: () => () => void, label?: string): void
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'code-map'

/** Services required by this plugin. */
export const inject = ['tools', 'subprocess']

/** Plugin configuration: tool budgets plus the server table. */
export interface Config {
  /** Server table (extension-routed). Defaults to a resolved typescript server. */
  servers?: Record<string, ServerConfig>
  /** Largest number of rendered symbol entries before an omission marker. */
  maxSymbols?: number
  /** Largest complete rendered result in characters. */
  maxResultChars?: number
  /** Tool-call timeout budget in ms. */
  toolTimeoutMs?: number
}

const ServerConfig: z<ServerConfig> = z.object({
  command: z.string().required(),
  args: z.array(String).default([]),
  extensionToLanguage: z.dict(String).required(),
  configuration: z.any().default(null),
  maxMessageBytes: z.number().default(16_000_000),
  maxStderrBytes: z.number().default(1_000_000),
})

export const Config: z<Config> = z.object({
  servers: z.dict(ServerConfig).default({}),
  maxSymbols: z.number().default(200),
  maxResultChars: z.number().default(16_000),
  toolTimeoutMs: z.number().default(60_000),
})

/**
 * Register the `code_map` tool over the pooled LSP clients.
 * @param ctx - the plugin context carrying `tools`, `subprocess`, and `effect`.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx: HostContext, config: Config): void {
  const resolved = config as Required<Config>
  assertPositiveInteger('maxSymbols', resolved.maxSymbols)
  assertPositiveInteger('maxResultChars', resolved.maxResultChars)
  assertPositiveInteger('toolTimeoutMs', resolved.toolTimeoutMs)

  const servers = resolved.servers
  if (Object.keys(servers).length === 0) {
    servers.typescript = defaultTypeScriptServer()
  }
  for (const [serverId, server] of Object.entries(servers)) {
    if (serverId.trim() === '') throw new Error('code-map: server ids must be non-empty strings')
    if (Object.keys(server.extensionToLanguage).length === 0) {
      throw new Error(`code-map: server "${serverId}" maps no file extensions`)
    }
  }

  const options: CodeMapOptions = {
    maxSymbols: resolved.maxSymbols,
    maxResultChars: resolved.maxResultChars,
    timeoutMs: resolved.toolTimeoutMs,
    servers,
    defaultServer: servers.typescript,
  }

  ctx.effect(() => registerCodeMapTool(ctx, options), 'code-map.registerTool')
}

/**
 * Resolve the default typescript server: `node.exe` + the `typescript-language-server`
 * CLI shipped with this plugin. Throws a clear error when the package is missing.
 */
function defaultTypeScriptServer(): ServerConfig {
  let cliPath: string
  try {
    const packageJson = require.resolve('typescript-language-server/package.json')
    cliPath = join(dirname(packageJson), 'lib/cli.mjs')
  } catch {
    throw new Error(
      'code-map: typescript-language-server is not resolvable; install it in the plugin package or configure `servers` explicitly',
    )
  }
  return {
    command: process.execPath,
    args: [cliPath, '--stdio'],
    extensionToLanguage: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.mts': 'typescript',
      '.cts': 'typescript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
    },
  }
}

/** Reject a non-positive-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`code-map: ${name} must be a positive integer`)
  }
}
