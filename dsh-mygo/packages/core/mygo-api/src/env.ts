/**
 * Capability payload types of `@r05en1cu/dsh-mygo-api`：`PluginEnv` 各能力面
 * （fs/vars/llm/exec/http/skills/commands/tools/prompt/settings）的请求与
 * 响应形状。全部为真实消费者保留面：lifecycle 引擎实现、零侵入桥接 facade
 * 桥接、fake-env 测试面实现。无运行时代码。
 * @module @r05en1cu/dsh-mygo-api/src/env
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Disposable } from './types.ts'

/** Env-var capability exposed through `PluginEnv.vars`. */
export interface PluginVars {
  get(name: string): string | undefined
  set(name: string, value: string): void
}

/** One model message in the managed request dialect. */
export interface PluginModelMessage {
  readonly role: string
  readonly content: string
}

/** Managed model-call request; the provider route is a host wiring concern. */
export interface PluginModelRequest {
  readonly model: string
  readonly messages: readonly PluginModelMessage[]
  readonly temperature?: number
  readonly maxTokens?: number
}

/** Managed model-call response (text completion). */
export interface PluginModelResponse {
  readonly content: string
  readonly model?: string
  readonly usage?: { readonly promptTokens?: number; readonly completionTokens?: number }
}

/** Model-call capability exposed through `PluginEnv.llm`; no host seam fails loudly (`llm-denied`). */
export interface PluginModel {
  complete(request: PluginModelRequest): Promise<PluginModelResponse>
}

/** Managed subprocess request; the executable name is the grant-checked unit. */
export interface PluginExecRequest {
  readonly command: string
  readonly args?: readonly string[]
  readonly stdin?: string
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/** Managed subprocess result. */
export interface PluginExecResult {
  readonly stdout: string
  readonly stderr: string
  /** Exit code; -1 when the process died from a signal. */
  readonly code: number
  readonly stdoutBytes?: Uint8Array
  readonly stderrBytes?: Uint8Array
}

/** Subprocess capability exposed through `PluginEnv.exec` (`exec-denied` on denial). */
export interface PluginExec {
  run(request: PluginExecRequest): Promise<PluginExecResult>
}

/** HTTP methods a managed route may claim; `*` matches any method. */
export type PluginHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | '*'

/** One managed HTTP request delivered to a route handler. */
export interface PluginHttpRequest {
  readonly method: string
  /** Pathname (query string excluded). */
  readonly path: string
  readonly url?: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

/** One managed HTTP response returned by a route handler. */
export interface PluginHttpResponse {
  readonly status: number
  readonly body?: string | Record<string, unknown> | Uint8Array
  readonly headers?: Readonly<Record<string, string>>
  /** Live response stream (SSE-style routes); closes on `res.end()`, source end, or `streamIdleMs` idle. */
  readonly stream?: AsyncIterable<Uint8Array>
}

/** One managed HTTP route registration. */
export interface PluginHttpRouteSpec {
  readonly method: PluginHttpMethod
  readonly path: string
  /** `exact` matches the pathname verbatim; `prefix` matches it and any subpath. */
  readonly kind?: 'exact' | 'prefix'
  readonly handler: (request: PluginHttpRequest) => PluginHttpResponse | Promise<PluginHttpResponse>
  /** Idle timeout (no writes) after which an open response stream closes; default 30s. */
  readonly streamIdleMs?: number
}

/** HTTP route-registration capability exposed through `PluginEnv.http`. */
export interface PluginHttp {
  register(spec: PluginHttpRouteSpec): Disposable
}

/** One managed skill contribution. */
export interface PluginSkillDefinition {
  readonly name: string
  readonly description: string
  /** Markdown instruction body loaded by the registry on demand. */
  readonly content: string
  readonly whenToUse?: string
  readonly invocation?: { readonly modelInvocable: boolean; readonly userInvocable: boolean }
  readonly source?: string
  readonly provider?: string
  /** Duplicate-resolution rank; lower ranks win (default 0). */
  readonly rank?: number
  readonly resourceBase?: { readonly kind: string; readonly path?: string; readonly url?: string; readonly description?: string }
  readonly path?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

/** Skill-contribution capability exposed through `PluginEnv.skills`. */
export interface PluginSkills {
  register(definition: PluginSkillDefinition): Disposable
}

/** One managed slash command. */
export interface PluginCommandDefinition {
  readonly name: string
  readonly description: string
  readonly input?: { readonly hint?: string }
  readonly handler: (input: PluginCommandInvocation) => PluginCommandResult | Promise<PluginCommandResult>
}

/** One managed slash-command invocation. */
export interface PluginCommandInvocation {
  readonly rawInput: string
  readonly agent?: { readonly id: string; readonly session: { readonly id: string } }
  readonly sessionId?: SessionId
  readonly signal?: AbortSignal
}

/** One managed slash-command result. */
export interface PluginCommandResult {
  readonly kind: 'success' | 'error'
  readonly text: string
}

/** Slash-command capability exposed through `PluginEnv.commands`. */
export interface PluginCommands {
  register(definition: PluginCommandDefinition): Disposable
}

/** File capability exposed through `PluginEnv.fs`; denial precedes any real I/O. */
export interface PluginFs {
  read(path: string): Promise<Uint8Array>
  write(path: string, data: Uint8Array | string): Promise<void>
  append(path: string, data: Uint8Array | string): Promise<void>
  /** Symlinks are surfaced as `symlink` and never followed by `read`. */
  readdir(path: string): Promise<readonly PluginDirEntry[]>
  /** lstat semantics: symlinks are reported, not followed. */
  stat(path: string): Promise<PluginFileStat>
}

/** One directory entry returned by `PluginFs.readdir`. */
export interface PluginDirEntry {
  readonly name: string
  readonly kind: 'file' | 'directory' | 'symlink' | 'other'
}

/** Metadata returned by `PluginFs.stat` (lstat semantics). */
export interface PluginFileStat {
  readonly kind: 'file' | 'directory' | 'symlink' | 'other'
  readonly size: number
  readonly mtimeMs: number
}

/** Minimal structural tool definition owned by this package (bridged into the tools registry). */
export interface PluginToolDefinition {
  readonly name: string
  readonly description: string
  /** Input JSON Schema object for the model-facing arguments. */
  readonly input: Record<string, unknown>
  /** Output JSON Schema node for the canonical result value. */
  readonly output: Record<string, unknown>
  /** Host `output.render` projection: canonical value → content blocks. */
  readonly outputRender?: (args: unknown, value: unknown) => unknown
  /** Host `output.presentationMeta` projection: value → persisted replay meta. */
  readonly outputPresentationMeta?: (args: unknown, value: unknown) => unknown
  readonly presentCall?: (args: unknown) => unknown
  readonly presentResult?: (args: unknown, result: unknown) => unknown
  /** Cooperative tool-call timeout budget in milliseconds. */
  readonly timeoutMs?: number
  /** Pure synchronous classifier for parallel overlap. */
  readonly isConcurrencySafe?: (args: unknown) => boolean
  /** Synchronous last-mile content transform. */
  readonly finalizeContent?: (exec: unknown, result: unknown) => unknown[] | undefined
  execute(args: unknown, exec: PluginToolExecutionContext): Promise<unknown>
  /** UI render intent; omitted falls back to the generic presentation. */
  readonly renderIntent?: PluginToolRenderIntent
}

/** Structural prompt section contributed through the manager. */
export interface PluginPromptSection {
  readonly name: string
  readonly order: number
  readonly text: string | ((context: unknown) => string)
}

/** Execution context passed to a plugin tool's `execute`. */
export interface PluginToolExecutionContext {
  readonly signal: AbortSignal
  readonly sessionId?: SessionId
  readonly agent?: PluginToolAgentContext
}

/** Durable session facts visible to a managed tool call. */
export interface PluginToolSessionContext {
  readonly id: string
  readonly header?: { readonly cwd?: string; readonly origin?: string; readonly delegationDepth?: number }
  /** Read-only event log view (never for direct writes). */
  readonly events?: readonly unknown[]
}

/** Agent view handed to managed tool calls by the host bridge. */
export interface PluginToolAgentContext {
  readonly sessionId: string
  readonly session: PluginToolSessionContext
}

/** Tool render intent: a `card`-tagged value mapped into the tools presentation vocabulary. */
export interface PluginToolRenderIntent {
  readonly card: string
}

/** One pending settings-namespace registration staged for commit. */
export interface StagedSettingsRegistration {
  readonly kind: 'settings-registration'
  readonly pluginId: string
  readonly ns: string
  readonly schema: unknown
  readonly options?: {
    readonly base?: unknown
    readonly applies?: 'live' | 'restart'
    readonly validate?: (value: unknown) => void
  }
  /** Staging scope handed to the plugin during activation; wired to the live scope at commit. */
  readonly stagedScope: StagedSettingsScope
}

/** Scope returned by the staged settings surface during activation. */
export interface StagedSettingsScope {
  get(): unknown
  watch(callback: (next: unknown, prev: unknown) => void | Promise<void>): () => void
  /** Attach this staging scope to the live host scope after commit. */
  attach(live: unknown): void
}
