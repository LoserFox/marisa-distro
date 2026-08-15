/**
 * Generic stdio language-server backend for `ctx.lsp`. One plugin instance configures a named table
 * of server commands and registers one isolated provider for each entry. Every provider lazily
 * single-flights one server process per canonical workspace realpath, serves transient-open queries
 * through it, and replaces a selected transport that fails before or during the next read-only
 * query. Providers read sources through Node APIs in the host namespace (not `ctx.fs`)
 * and trust their configured servers — no sandbox confinement.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is effect-scoped: disposal
 * unregisters from `ctx.lsp` and tears down every live server.
 * @module @deepseek-ai/dsh-lsp-local
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import type { Context } from 'cordis'
import z from 'schemastery'
import { LspError, LspProviderId } from '@deepseek-ai/dsh-lsp'
import type {
  LspProvider,
  LspProviderQuery,
  LspQueryResult,
} from '@deepseek-ai/dsh-lsp'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { abortable, abortError } from './abort.ts'
import { canonicalizeWorkspace, readHostSource } from './host.ts'
import { LspInstance } from './instance.ts'
import type { ConnectionSpawner } from './connection.ts'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { InstanceSpec } from './instance.ts'

export { canonicalizeWorkspace, readHostSource } from './host.ts'
export { encodeMessage, MessageDecoder } from './framing.ts'
export {
  negotiatePositionEncoding,
  normalizeHover,
  normalizeLocations,
  requestMethod,
  supportsOperation,
  supportsTransientOpen,
} from './translate.ts'
export { LspInstance } from './instance.ts'
export { LspConnection } from './connection.ts'

/** Cordis plugin name for loader diagnostics. */
export const name = 'lsp-local'

/** Services required by this plugin. */
export const inject = ['lsp', 'subprocess']

/** Credential-shaped ambient env vars are NOT forwarded to the child by default. */


const DEFAULT_MAX_MESSAGE_BYTES = 16_000_000
const DEFAULT_MAX_STDERR_BYTES = 1_000_000
const DEFAULT_MAX_DOCUMENT_BYTES = 4_000_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const DEFAULT_KILL_GRACE_MS = 2_000

/** One configured local language server and its host bounds. */
export interface LspLocalServerConfig {
  /** Executable to spawn (absolute, or resolved on PATH at load). */
  command: string
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  extensionToLanguage: Record<string, string>
  /** Arguments passed to the executable (no shell). Default `[]`. */
  args?: string[]
  /** Extra env vars merged on top of the scrubbed ambient env. Default `{}`. */
  env?: Record<string, string>
  /** Static `initialize` options forwarded to the server. Default `null`. */
  initializationOptions?: unknown
  /** Static answer to every `workspace/configuration` item. Default `null`. */
  configuration?: unknown
  /** Largest single framed message accepted from the server (bytes). Default 16000000. */
  maxMessageBytes?: number
  /** Largest stderr tail retained for diagnostics (bytes). Default 1000000. */
  maxStderrBytes?: number
  /** Largest source file this host will open (bytes). Default 4000000. */
  maxDocumentBytes?: number
  /** Graceful `shutdown`/`exit` budget before escalation (ms). Default 5000. */
  shutdownTimeoutMs?: number
  /** Request-cancel and SIGTERM→SIGKILL grace (ms). Default 2000. */
  killGraceMs?: number
}

/** Plugin configuration: provider id → local language-server configuration. */
export interface Config {
  /** Non-empty table of stable provider ids to independent local server configurations. */
  servers: Record<string, LspLocalServerConfig>
}

/** One server config after schemastery fills every default. */
type ResolvedServerConfig = Required<LspLocalServerConfig>

const LspLocalServerConfig: z<LspLocalServerConfig> = z.object({
  command: z.string().required(),
  args: z.array(String).default([]),
  env: z.dict(String).default({}),
  extensionToLanguage: z.dict(String).required(),
  initializationOptions: z.any().default(null),
  configuration: z.any().default(null),
  maxMessageBytes: z.number().default(DEFAULT_MAX_MESSAGE_BYTES),
  maxStderrBytes: z.number().default(DEFAULT_MAX_STDERR_BYTES),
  maxDocumentBytes: z.number().default(DEFAULT_MAX_DOCUMENT_BYTES),
  shutdownTimeoutMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_SHUTDOWN_TIMEOUT_MS),
  killGraceMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_KILL_GRACE_MS),
})

export const Config: z<Config> = z.object({
  servers: z.dict(LspLocalServerConfig).required(),
})

/**
 * Register the configured stdio LSP providers. Resolves every executable at load (after credential
 * scrubbing) before publishing any provider; each process launches lazily on its first matching
 * query.
 * @param ctx - the plugin context (must inject `lsp`).
 * @param config - the resolved plugin configuration (schemastery has filled every default).
 */
export function apply(ctx: Context, config: Config): void {
  const entries = Object.entries(config.servers)
  if (entries.length === 0) throw new Error('lsp-local: servers must contain at least one server')

  // Resolve every server-local setting before registration so a bad later command or bound cannot
  // publish an earlier provider. Registry-level mapping conflicts are rolled back below.
  const providers = entries.map(([providerId, rawConfig]) => {
    if (providerId.trim() === '') throw new Error('lsp-local: server ids must be non-empty strings')
    const resolved = rawConfig as ResolvedServerConfig
    validateServerConfig(providerId, resolved)
    const childEnv = buildChildEnv(resolved.env)
    const executable = resolveExecutable(resolved.command, childEnv)
    return new LocalLspProvider(providerId, resolved, childEnv, executable, spec => ctx.subprocess.spawn(spec))
  })

  ctx.effect(() => {
    const disposers: Array<() => void> = []
    try {
      for (const provider of providers) disposers.push(ctx.lsp.registerProvider(provider))
    } catch (error) {
      for (const dispose of disposers.reverse()) { dispose() }
      throw error
    }
    return async () => {
      // Remove every route before process teardown so no new query can enter a draining provider.
      for (const dispose of disposers.reverse()) dispose()
      await Promise.all(providers.map(provider => provider.disposeAll()))
    }
  }, 'lsp-local.registerProviders')
}

/** Validate one resolved server entry before any provider in the table is registered. */
function validateServerConfig(providerId: string, resolved: ResolvedServerConfig): void {
  // Teardown budgets feed `deadline()`, whose `<= 0` is the internal no-timeout sentinel; a
  // nonpositive value would let a server that ignores shutdown hang disposal forever. Fail at load.
  assertTimer(providerId, 'shutdownTimeoutMs', resolved.shutdownTimeoutMs)
  assertTimer(providerId, 'killGraceMs', resolved.killGraceMs)
  // Byte caps must be positive: a nonpositive stderr cap defeats the retained-tail bound
  // (`slice(-0)` keeps everything), `maxMessageBytes: 0` makes every response fatal, and a bad
  // document cap fails later in the read path instead of at load.
  assertPositiveInteger(providerId, 'maxStderrBytes', resolved.maxStderrBytes)
  assertPositiveInteger(providerId, 'maxMessageBytes', resolved.maxMessageBytes)
  assertPositiveInteger(providerId, 'maxDocumentBytes', resolved.maxDocumentBytes)
}

/** Reject a timer value Node would clamp instead of scheduling as configured. */
function assertTimer(providerId: string, name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`lsp-local: servers.${providerId}.${name} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

/** Reject a nonpositive or non-integer config value at load, so misconfiguration fails loud. */
function assertPositiveInteger(providerId: string, name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`lsp-local: servers.${providerId}.${name} must be a positive integer`)
  }
}

/** A pooled generic provider: one server process per canonical workspace, created on demand. */
class LocalLspProvider implements LspProvider {
  readonly id: LspProviderId
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /** One live instance per canonical workspace realpath. */
  private readonly instances = new Map<string, LspInstance>()
  /** One complete source-read→open→query→close serialization tail per canonical workspace. */
  private readonly queues = new Map<string, Promise<void>>()
  private disposed = false

  constructor(
    providerId: string,
    private readonly config: ResolvedServerConfig,
    private readonly childEnv: Record<string, string>,
    private readonly executable: string,
    private readonly spawner: ConnectionSpawner,
  ) {
    this.id = LspProviderId(providerId)
    this.extensionToLanguage = config.extensionToLanguage
  }

  /** Read the disposed flag through a method so a `query()` await cannot narrow it to a literal. */
  private isDisposed(): boolean {
    return this.disposed
  }

  /** Reject work that cannot publish or use a provider-owned instance. */
  private assertActive(signal?: AbortSignal): void {
    /* v8 ignore next -- the seam unregisters this provider before disposal; direct in-flight calls
       exercise the post-await check instead. */
    if (this.isDisposed()) throw new LspError('lsp-local provider is disposed', 'LSP_DISPOSED')
    if (signal?.aborted) throw abortError(signal)
  }

  async query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult> {
    // Honor an already-aborted signal before host I/O so a canceled request never starts a server.
    this.assertActive(signal)
    const workspace = await canonicalizeWorkspace(request.workspaceRoot, signal)
    this.assertActive(signal)
    return this.enqueue(workspace, signal, async () => {
      this.assertActive(signal)
      // Read inside the workspace queue but before spawning: a queued query sees current bytes when
      // its turn starts, while an invalid source still cannot leave an idle process pooled.
      const source = await readHostSource(request.filePath, workspace, this.config.maxDocumentBytes, signal)
      // Disposal may have snapshotted the instance map while host I/O was pending. Re-check before a
      // synchronous get-or-create so every spawned process remains owned by teardown.
      this.assertActive(signal)
      let instance = this.instanceFor(workspace)
      try {
        return await instance.query(request, source, signal)
      } catch (error) {
        // A selected child can have died while idle or fail during the next write. Queries are
        // read-only, so replace that transport once and retry transparently.
        if (!instance.isTransportFailure(error)) throw error
        await instance.dispose()
        this.evictIfCurrent(workspace, instance)
        this.assertActive(signal)
        instance = this.instanceFor(workspace)
        return await instance.query(request, source, signal)
      } finally {
        // Reach quiescence before dropping a dead slot; a replacement must survive this ownership check.
        if (instance.dead) {
          await instance.dispose()
          this.evictIfCurrent(workspace, instance)
        }
      }
    })
  }

  /** Serialize one complete query lifecycle for a canonical workspace. */
  private enqueue<T>(workspace: string, signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(workspace) ?? Promise.resolve()
    const result = abortable(previous, signal).then(run)
    // The tail follows the actual prior work even when this caller aborts its wait. It never rejects,
    // so later callers serialize without inheriting an earlier query's outcome.
    const tail = previous.then(() => result).then(() => undefined, () => undefined)
    this.queues.set(workspace, tail)
    void tail.then(() => {
      if (this.queues.get(workspace) === tail) this.queues.delete(workspace)
    })
    return result
  }

  /** Return or synchronously publish the one instance for a canonical workspace. */
  private instanceFor(workspace: string): LspInstance {
    this.assertActive()
    const existing = this.instances.get(workspace)
    if (existing !== undefined) return existing
    const created = this.createInstance(workspace)
    this.instances.set(workspace, created)
    return created
  }

  /** Drop the slot iff it still contains this instance. */
  private evictIfCurrent(workspace: string, instance: LspInstance): void {
    /* v8 ignore next -- mismatch requires another query to replace the slot before this finally runs. */
    if (this.instances.get(workspace) === instance) this.instances.delete(workspace)
  }

  private createInstance(workspace: string): LspInstance {
    const spec: InstanceSpec = {
      command: this.executable,
      args: this.config.args,
      cwd: workspace,
      env: this.childEnv,
      configuration: this.config.configuration,
      initializationOptions: this.config.initializationOptions,
      maxMessageBytes: this.config.maxMessageBytes,
      maxStderrBytes: this.config.maxStderrBytes,
      shutdownTimeoutMs: this.config.shutdownTimeoutMs,
      killGraceMs: this.config.killGraceMs,
    }
    return new LspInstance(spec, this.spawner)
  }

  /** Dispose every live instance and block further queries. */
  async disposeAll(): Promise<void> {
    this.disposed = true
    const live = [...this.instances.values()]
    const draining = [...this.queues.values()]
    this.instances.clear()
    await Promise.all([
      ...live.map(instance => instance.dispose()),
      ...draining,
    ])
    this.queues.clear()
  }
}

/** The seam's scrubbed parent env (credential-shaped and DSH_* names dropped), plus the config's explicit env. */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
  return { ...scrubbedParentEnv(), ...extra }
}

/**
 * Resolve the server executable to an absolute path: an absolute command is verified directly; a
 * bare command is looked up on the child's PATH. Fails loudly when nothing is executable.
 */
function resolveExecutable(command: string, childEnv: Record<string, string>): string {
  if (isAbsolute(command)) {
    // Verify an absolute command too, so an unavailable one fails at load, not on the first query.
    if (!isExecutableFileSync(command)) {
      throw new Error(`lsp-local: command "${command}" is not an executable file`)
    }
    return command
  }
  /* v8 ignore next -- buildChildEnv always sets PATH from the ambient env; the further fallbacks are defensive. */
  const pathValue = childEnv.PATH ?? process.env.PATH ?? ''
  for (const dir of pathValue.split(delimiter)) {
    if (dir === '') continue
    const candidate = join(dir, command)
    if (isExecutableFileSync(candidate)) return candidate
  }
  throw new Error(`lsp-local: command "${command}" was not found on PATH`)
}

/** Synchronous regular-file and executable check used only at load-time resolution. */
function isExecutableFileSync(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}
