/**
 * Capability surfaces for managed plugin generations. The permission-gate
 * layer is removed: filesystem, network, env-var, model, subprocess, and
 * http-route surfaces are direct host passthroughs. Registration surfaces
 * still stage through the manager so HMR can swap/dispose them atomically.
 * @module @r05en1cu/dsh-mygo/src/capabilities
 */

import { appendFile, lstat, readdir as fsReaddir, readFile, writeFile, realpath as fsRealpath } from 'node:fs/promises'
import { PluginError, formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type {
  Logger,
  PluginDirEntry,
  PluginEnv,
  PluginErrorCode,
  PluginExec,
  PluginExecRequest,
  PluginExecResult,
  PluginFileStat,
  PluginModel,
  PluginModelRequest,
  PluginModelResponse,
} from '@r05en1cu/dsh-mygo-api'

/** Host I/O seam backing the ungated `env.fs` surface. */
export interface PluginIo {
  /** Read one file's bytes. */
  read(path: string): Promise<Uint8Array>
  /** Write one file's bytes. */
  write(path: string, data: Uint8Array): Promise<void>
  /** Append bytes to one file. */
  append(path: string, data: Uint8Array): Promise<void>
  /** List one directory's entries (symlinks reported without following). */
  readdir(path: string): Promise<readonly PluginDirEntry[]>
  /** Metadata with lstat semantics (symlinks reported without following). */
  stat(path: string): Promise<PluginFileStat>
  /** Resolve symlinks to a canonical absolute path. */
  realpath(path: string): Promise<string>
}

/** Node fs implementation of the host I/O seam. */
export const nodePluginIo: PluginIo = {
  read: path => readFile(path),
  write: (path, data) => writeFile(path, data),
  append: (path, data) => appendFile(path, data),
  readdir: async path => (await fsReaddir(path, { withFileTypes: true })).map(entry => ({
    name: entry.name,
    kind: entry.isFile()
      ? 'file'
      : entry.isDirectory()
        ? 'directory'
        : entry.isSymbolicLink()
          ? 'symlink'
          : 'other',
  })),
  stat: async path => {
    const stat = await lstat(path)
    return {
      kind: stat.isFile()
        ? 'file'
        : stat.isDirectory()
          ? 'directory'
          : stat.isSymbolicLink()
            ? 'symlink'
            : 'other',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    }
  },
  realpath: path => fsRealpath(path),
}

/** Registration-effect quotas (§18): 100 listeners / 50 tools / 20 services. */
export interface PluginEffectQuota {
  /** Listener registrations staged for one generation. */
  listeners: number
  /** Tool/skill/prompt registrations staged for one generation. */
  tools: number
  /** Provide/http/command registrations staged for one generation. */
  services: number
}

/**
 * Claim one registration-effect slot for a plugin generation.
 * @param quota - per-plugin counters shared across scope layers.
 * @param kind - which quota bucket to claim.
 * @param pluginId - owning plugin id for error attribution.
 */
export function claimEffect(
  quota: PluginEffectQuota,
  kind: 'listener' | 'tool' | 'service',
  pluginId: string,
): void {
  const key = kind === 'listener' ? 'listeners' : kind === 'tool' ? 'tools' : 'services'
  const limit = kind === 'listener' ? 100 : kind === 'tool' ? 50 : 20
  if (quota[key] >= limit) {
    throw fail('quota-effects-exceeded', { kind, limit }, pluginId)
  }
  quota[key] += 1
}

/**
 * Rate-limited logger (SEC:71): at most 1000 lines per plugin per minute;
 * excess lines are dropped and the plugin is warned once per window.
 * @param raw - the engine's logger.
 * @param now - clock for the minute window.
 * @returns the gated logger handed to one plugin.
 */
export function createRateLimitedLogger(raw: Logger, now: () => number): Logger {
  let windowStart = now()
  let count = 0
  let warned = false
  const emit = (method: 'error' | 'info' | 'warn' | 'debug', format: unknown, params: unknown[]): void => {
    const current = now()
    if (current - windowStart >= 60_000) {
      windowStart = current
      count = 0
      warned = false
    }
    if (count >= 1000) {
      if (!warned) {
        raw.warn('plugin log rate limit exceeded (1000 lines/minute); further lines are dropped until the next minute')
        warned = true
      }
      return
    }
    count += 1
    raw[method](format, ...params)
  }
  return {
    error: (format, ...params) => { emit('error', format, params) },
    info: (format, ...params) => { emit('info', format, params) },
    warn: (format, ...params) => { emit('warn', format, params) },
    debug: (format, ...params) => { emit('debug', format, params) },
  }
}

/**
 * Build the `env.fs` surface for one plugin: a direct host I/O passthrough
 * (no path grants).
 * @param _pluginId - owning plugin id (kept for surface parity).
 * @param io - host I/O seam.
 * @returns the ungated fs surface.
 */
export function createPluginFs(_pluginId: string, io: PluginIo): PluginEnv['fs'] {
  return {
    read: (path: string): Promise<Uint8Array> => io.read(path),
    write: (path: string, data: Uint8Array | string): Promise<void> => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      return io.write(path, bytes)
    },
    append: (path: string, data: Uint8Array | string): Promise<void> => {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
      return io.append(path, bytes)
    },
    readdir: (path: string): Promise<readonly PluginDirEntry[]> => io.readdir(path),
    stat: (path: string): Promise<PluginFileStat> => io.stat(path),
  }
}

/**
 * Build the `env.fetch` boundary for one plugin: a direct host fetch
 * passthrough (no URL allowlist).
 * @param fetchImpl - host fetch.
 * @returns the ungated fetch function.
 */
export function createNetworkFetch(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
): (url: string, init?: RequestInit) => Promise<Response> {
  return (url, init) => fetchImpl(url, init)
}

/**
 * Build the `env.vars` surface for one plugin: a direct host process-env
 * passthrough (no variable allowlist).
 * @returns the ungated vars surface.
 */
export function createPluginVars(): PluginEnv['vars'] {
  return {
    get: (name: string): string | undefined => process.env[name],
    set: (name: string, value: string): void => {
      process.env[name] = value
    },
  }
}

/**
 * Build the `env.llm` surface for one plugin: a direct host LLM passthrough.
 * A missing host seam still fails loudly (`llm-denied`, host-unavailable).
 * @param pluginId - owning plugin id for error attribution.
 * @param host - host completion seam, or `undefined` when none is wired.
 * @returns the ungated model surface.
 */
export function createModelCall(
  pluginId: string,
  host: ((request: PluginModelRequest) => Promise<PluginModelResponse>) | undefined,
): PluginModel {
  return {
    complete: (request: PluginModelRequest): Promise<PluginModelResponse> => {
      if (host === undefined) {
        throw fail('llm-denied', {
          plugin: pluginId,
          model: request.model,
          reason: 'host-unavailable',
        }, pluginId)
      }
      return host(request)
    },
  }
}

/**
 * Build the `env.exec` surface for one plugin: a direct host subprocess
 * passthrough. A missing host seam still fails loudly (`exec-denied`,
 * host-unavailable).
 * @param pluginId - owning plugin id for error attribution.
 * @param host - host subprocess seam, or `undefined` when none is wired.
 * @returns the ungated exec surface.
 */
export function createExecBoundary(
  pluginId: string,
  host: ((request: PluginExecRequest) => Promise<PluginExecResult>) | undefined,
): PluginExec {
  return {
    run: (request: PluginExecRequest): Promise<PluginExecResult> => {
      if (host === undefined) {
        throw fail('exec-denied', {
          plugin: pluginId,
          command: request.command,
          reason: 'host-unavailable',
        }, pluginId)
      }
      return host(request)
    },
  }
}

/** Build a `PluginError` from the shared template vocabulary. */
function fail(code: PluginErrorCode, details: Record<string, unknown>, pluginId: string): PluginError {
  return new PluginError(code, formatPluginError(code, details), details, pluginId)
}
