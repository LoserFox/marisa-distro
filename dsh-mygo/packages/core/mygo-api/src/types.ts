/**
 * Type-only contract surface of `@r05en1cu/dsh-mygo-api`（P2 收敛版）：
 * 插件 manifest、compatibility 只读声明、事件词汇、`PluginEnv` 契约面与
 * 管理面句柄。能力载荷形状（fs/vars/llm/exec/http/skills/commands/tools/
 * prompt/settings）在 `env.ts`。本模块无运行时代码、不 import cordis。
 * 收敛口径（2026-08-13）：每个保留类型都有真实消费者（lifecycle 引擎 /
 * 零侵入桥接 facade / capabilities / 测试面）；求解/lockfile 残留类型已
 * 在 P1 随实现删除。
 * @module @r05en1cu/dsh-mygo-api/src/types
 */

import type Schema from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  PluginCommands,
  PluginExec,
  PluginFs,
  PluginHttp,
  PluginModel,
  PluginPromptSection,
  PluginSkills,
  PluginToolDefinition,
  PluginVars,
  StagedSettingsRegistration,
} from './env.ts'

/** A schemastery schema, the manifest config DSL every harness plugin shares. */
export type Schemastery = Schema

/** Disposer shape returned by every registration method; structurally compatible with Cordis. */
export type Disposable = () => void

/** Minimal logger surface handed to plugins. */
export interface Logger {
  error(format: unknown, ...params: unknown[]): void
  info(format: unknown, ...params: unknown[]): void
  warn(format: unknown, ...params: unknown[]): void
  debug(format: unknown, ...params: unknown[]): void
}

// ---------------------------------------------------------------------------
// manifest（插件作者声明面）
// ---------------------------------------------------------------------------

/** The upper-level plugin manifest. Plugin authors never import Cordis. */
export interface PluginDefinition {
  /** Plugin id; the registry key and event-payload identity, matching `/^[a-z][a-z0-9-]*$/`. */
  readonly id: string
  /** Manifest version in semver shape. */
  readonly version: string
  /** Open classification vocabulary (`/^[a-z][a-z0-9-]*$/`). */
  readonly kinds: string[]
  /** Cordis service ids this plugin consumes; `@` in an entry is reserved (`capability-range-reserved`). */
  readonly requires: readonly string[]
  /** 服务级依赖：服务名 → semver 区间；仅运行期政策闸，安装期不阻断。 */
  readonly serviceRequires?: Readonly<Record<string, string | readonly string[]>>
  /** 符号别名映射（别名 → 规范符号；前置门管辖）。 */
  readonly symbolAliases?: Readonly<Record<string, string>>
  /** Service ids this plugin provides. */
  readonly provides: readonly string[]
  /** Declared event permissions and position. */
  readonly permissions: PermissionsBlock
  /** Custom events: exact names or `namespace/*` patterns (observe/emit only). */
  readonly events?: readonly string[]
  // 能力授权块（缺省 = 全拒）：fileAccess `write` 蕴含 `read`；各 allowlist 缺一
  // 不可即拒绝对应 env 面。
  readonly fileAccess?: FileAccessEntry[]
  readonly networkAccess?: { readonly allow: string[] }
  readonly varsAccess?: readonly string[]
  readonly llmAccess?: { readonly models?: readonly string[] }
  readonly execAccess?: { readonly allow: readonly string[] }
  readonly httpAccess?: { readonly routes?: readonly string[] }
  /** Client-half declaration for UI plugins (browser bundle entry + host injections). */
  readonly client?: PluginClientDeclaration
  // 授权标记（需同名 grant）：sessionWrite / hostPublish / dynamicInstall。
  readonly sessionWriteAccess?: boolean
  readonly hostPublishAccess?: boolean
  readonly dynamicInstallAccess?: boolean
  /** Whether the plugin participates in capture/restore state handoff. */
  readonly stateful: boolean
  /** State-handoff quiescence policy for replace; the chain swap itself is always atomic. */
  readonly swapPolicy: 'immediate' | 'drain' | 'next-idle'
  /** Schemastery schema validating the resolved install/updateConfig config. */
  readonly config: Schemastery
  /** Lifecycle hooks. */
  readonly hooks: PluginHooks
  /** Static contributions to managed extension points (static data only). */
  readonly entrypoints?: PluginEntrypointsDeclaration
  /** Package-level constraints against sibling managed plugins (validation only; never selects versions). */
  readonly compatibility?: PluginCompatibility
}

/** File-access mode vocabulary: `write` implies `read` on the same path. */
export type FileAccessMode = 'read' | 'write'

/** One file-access entry `[mode, path]`. */
export type FileAccessEntry = readonly [mode: FileAccessMode, path: string]

/** Client-half declaration carried by the managed manifest. */
export interface PluginClientDeclaration {
  /** Browser bundle entry relative to the package root, e.g. `./lib/client.js`. */
  readonly main: string
  readonly inject?: readonly string[]
}

/** One static contribution to a managed extension point. */
export type PluginEntrypointContribution = string | { readonly value: unknown }

/** Declared static contributions by extension-point key. */
export type PluginEntrypointsDeclaration = Readonly<Record<string, readonly PluginEntrypointContribution[]>>

/** Declared event permission block. */
export interface PermissionsBlock {
  readonly observe: readonly string[]
  /** Transform declarations on waterfall events (grant-gated). */
  readonly transform: readonly TransformDeclaration[]
  /** Intercept declarations (grant-gated). */
  readonly intercept: readonly InterceptDeclaration[]
  /** Listener position; default is `derived`. */
  readonly position: 'outermost' | 'derived' | 'innermost'
  /** Claimed contributions: `'service:<id>'` or `'tool:<name>'`. */
  readonly claims: readonly string[]
}

/** One transform declaration on a waterfall event (depth-1 property names). */
export interface TransformDeclaration {
  readonly event: string
  readonly reads?: string[]
  readonly writes?: string[]
  readonly appends?: string[]
}

/** One intercept declaration on a serial or waterfall event. */
export interface InterceptDeclaration {
  readonly event: string
  /** Allowed return branches, drawn from the event's decision-union vocabulary. */
  readonly returns: string[]
}

/** Lifecycle hooks declared by a plugin: setup → activate → deactivate/captureState/restoreState/dispose. */
export interface PluginHooks {
  /** Staging-time preparation; registration methods throw `setup-registration` here. */
  setup?(env: PluginEnv, config: unknown): Promise<void>
  /** Go-live hook; all registrations belong here. */
  activate(env: PluginEnv): Promise<void> | void
  /** Graceful drain before the generation is released. */
  deactivate?(reason: DeactivateReason): Promise<void> | void
  /** Capture state for handoff (JSON-serializable, at most 10MB). */
  captureState?(): unknown
  /** Apply captured state from the previous generation or a persisted snapshot. */
  restoreState?(state: unknown, previous: PreviousGeneration | null): Promise<void> | void
  /** Release resources not owned by registrations. */
  dispose?(): Promise<void> | void
}

/** Why a plugin generation is being deactivated; `shutdown` is a clean process exit. */
export type DeactivateReason = 'replace' | 'uninstall' | 'disable' | 'shutdown'

/** Identity of the generation that produced a state snapshot. */
export interface PreviousGeneration {
  readonly generation: number
  readonly version: string
}

// ---------------------------------------------------------------------------
// compatibility（只读声明 + 求值报告；无求解）
// ---------------------------------------------------------------------------

/** Package-level compatibility constraints against sibling managed plugins. */
export interface PluginCompatibility {
  /** Every key must resolve to an enabled managed plugin whose version satisfies the range. */
  readonly depends?: Readonly<Record<string, string>>
  /** No key may resolve to an enabled managed plugin whose version falls inside the range. */
  readonly breaks?: Readonly<Record<string, string>>
  /** Soft positive: warnings only. */
  readonly recommends?: Readonly<Record<string, string>>
  /** Soft positive, weaker than `recommends`: warnings only. */
  readonly suggests?: Readonly<Record<string, string>>
  /** Soft negative: warnings only. */
  readonly conflicts?: Readonly<Record<string, string>>
  /** v1 alias for `depends`; normalized at parse time. */
  readonly requires?: Readonly<Record<string, string>>
}

/** One directed dependency edge on the compatibility graph. */
export interface CompatibilityEdge {
  readonly declarer: string
  readonly kind: 'depends' | 'recommends' | 'suggests' | 'conflicts' | 'breaks'
  readonly target: string
  readonly range: string
}

/** One hard constraint violation with its full path from the checked root. */
export interface CompatibilityViolation {
  readonly kind: 'depends' | 'breaks'
  readonly declarer: string
  readonly target: string
  readonly range: string
  readonly installed?: string
  readonly state?: 'missing' | 'installed-disabled' | 'version-mismatch'
  readonly rangeInvalid?: boolean
  readonly chain: readonly CompatibilityEdge[]
}

/** One soft or derived incompatibility note. */
export interface CompatibilityWarning {
  readonly kind: 'recommends' | 'suggests' | 'conflicts' | 'derived-conflict'
  readonly declarer: string
  readonly target: string
  readonly range?: string
  readonly installed?: string
  readonly chain?: readonly CompatibilityEdge[]
  readonly detail?: string
}

/** Full outcome of one compatibility evaluation. */
export interface CompatibilityReport {
  readonly plugin: string
  readonly action: 'install' | 'replace' | 'enable' | 'uninstall' | 'reconcile' | 'preflight'
  readonly violations: readonly CompatibilityViolation[]
  readonly warnings: readonly CompatibilityWarning[]
}

/** Composition facts used to derive conflicts the manifest does not declare. */
export interface CompositionFactProvider {
  serviceProviders(): readonly { readonly service: string; readonly plugin: string }[]
  patchedRows(): readonly { readonly rowId: string; readonly plugin: string }[]
}

/** Optional declarative overrides for a raw Cordis plugin adoption (from `dsh.mygo` metadata). */
export interface RawPluginDeclaration {
  readonly version?: string
  readonly entrypoints?: PluginEntrypointsDeclaration
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
}

// ---------------------------------------------------------------------------
// 事件（声明合并词汇）
// ---------------------------------------------------------------------------

/** Event-name map for managed events; event-owning packages augment it via declaration merging. */
export interface PluginEvents {}

/** Name of every managed event contributed via {@link PluginEvents} merging. */
export type PluginEventName = keyof PluginEvents

/** Listener parameter shape for one managed event (waterfall events end with `next`). */
export type PluginEventListener<E extends PluginEventName> =
  PluginEvents[E] extends (...args: infer Args) => unknown ? (...args: Args) => void : never

/** Dispatch argument tuple for one managed event. */
export type PluginEventArgs<E extends PluginEventName> =
  PluginEvents[E] extends (...args: infer Args) => unknown ? Args : never

// ---------------------------------------------------------------------------
// PluginEnv（注册动词只在 activate 可用，setup 期抛 setup-registration）
// ---------------------------------------------------------------------------

/** The capability surface the manager hands to a plugin. */
export interface PluginEnv {
  /** Rate-limited logger (excess is dropped and reported via `warn`). */
  readonly logger: Logger
  // 事件面：on 走托管派发（签名随事件 @mode）；onHost 是零侵入桥接的宿主
  // 总线直连（世代释放时撤销）；emit 走 dispatch machine。
  on<E extends PluginEventName>(event: E, listener: PluginEventListener<E>): Disposable
  onHost(event: string, listener: (...args: unknown[]) => unknown, options?: { readonly once?: boolean; readonly prepend?: boolean }): Disposable
  emit(event: string, payload?: unknown): void
  // 注册面（仅 activate 可用）：effect = 世代 teardown；hostEffect /
  // registerSettings 为桥接内部动词（facade 拦截宿主注册用）。
  effect(disposer: () => void, name?: string): void
  hostEffect(disposer: () => void, name?: string): void
  registerSettings(registration: StagedSettingsRegistration): void
  registerPromptSection(section: PluginPromptSection): Disposable
  registerTool(definition: PluginToolDefinition): Disposable
  getTool(name: string): PluginToolDefinition | undefined
  listTools(): readonly PluginToolDefinition[]
  /** Provide a service value declared in `provides`. */
  provide(capability: string, value: unknown): Disposable
  /** Resolve one capability declared in `requires`; undeclared resolves to `undefined` (service isolation). */
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T is the caller-chosen service type at each call site.
  get<T>(capability: string): T | undefined
  /** The raw host context (zero-intrusion escape hatch; the facade forwards unknown `ctx.*` here). */
  readonly host: unknown
  /** Derive an agent-scoped env whose registrations are visible only to that agent. */
  scope(agentId: SessionId): PluginEnv
  // 管理面：受管集只读视图 + 动态安装/卸载/热配置（需 dynamicInstall grant）。
  plugins(): readonly PluginHandleInfo[]
  install(source: PluginSource, options?: InstallOptions): Promise<PluginHandleInfo>
  uninstall(id: string): Promise<void>
  updateConfig(patch: unknown, expectedRevision?: number): Promise<void>
  // 能力面（grant 把关，拒绝先于任何真实操作）：fs/vars/fetch 直通宿主，
  // llm/exec 无宿主 seam 时 fail-loud；http/skills/commands 随世代暂存与撤销。
  readonly fs: PluginFs
  fetch(url: string, init?: RequestInit): Promise<Response>
  readonly vars: PluginVars
  readonly llm: PluginModel
  readonly exec: PluginExec
  readonly http: PluginHttp
  readonly skills: PluginSkills
  readonly commands: PluginCommands
}

// ---------------------------------------------------------------------------
// 管理面（来源 / 安装 / 句柄）
// ---------------------------------------------------------------------------

/** Dynamic install source discriminant union; npm entries reference resolvable packages, never fetched. */
export type PluginSource =
  | { readonly type: 'inline'; readonly code: string }
  | { readonly type: 'npm'; readonly package: string }

/** Channel identity used for ceiling evaluation. */
export type InstallOrigin = 'model' | 'runtime-api'

/** Options for a dynamic plugin install. */
export interface InstallOptions {
  /** Channel origin; defaults to `runtime-api` and selects the permission ceiling. */
  readonly origin?: InstallOrigin
  /** Initial config validated against the manifest config schema. */
  readonly config?: unknown
}

/** Read-only handle for one managed plugin. */
export interface PluginHandleInfo {
  readonly id: string
  readonly version: string
  readonly generation: number
  /** Install origin; `static` = bundle/Loader composition adopted by the adapter. */
  readonly origin: 'static' | InstallOrigin
  readonly status: 'enabled' | 'disabled' | 'quarantined' | 'shadowed' | 'uninstalled'
  /** 政策/反应式状态：INACTIVE 依赖恢复后自动激活。 */
  readonly policyStatus?: 'active' | 'inactive' | 'policy-rejected'
  readonly reason?: string
  readonly kinds: readonly string[]
  readonly requires: readonly string[]
  readonly provides: readonly string[]
  /** Per-plugin order-neutrality flag for install-set-pure ordering. */
  readonly orderNeutral: boolean
  readonly source: PluginSource | { readonly type: 'static' }
  readonly entrypoints?: readonly string[]
  readonly compatibility?: PluginCompatibility
}
