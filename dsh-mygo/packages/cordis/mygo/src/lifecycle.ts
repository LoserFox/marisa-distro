/**
 * Lifecycle engine (#15, §12-§14/§16 group 4): the generation registry,
 * staging sets with cross-scope atomicity, the seven-step replace protocol,
 * manager-held provides and the tool indirection table, swapPolicy bounded
 * waits, and T3 persistence ordering through the {@link RegistryStore} seam.
 * T4 boot recovery revalidates every persisted row and mounts or quarantines
 * it. All errors are `PluginError` from the shared template vocabulary.
 * @module @r05en1cu/dsh-mygo/src/lifecycle
 */

import { PluginError, formatPluginError, fromCordisPlugin } from '@r05en1cu/dsh-mygo-api'
import type {
  CompositionFactProvider,
  CompatibilityReport,
  InstallOptions,
  InstallOrigin,
  Logger,
  PluginCompatibility,
  PluginDefinition,
  PluginEnv,
  PluginErrorCode,
  PluginExecRequest,
  PluginExecResult,
  PluginEntrypointContribution,
  PluginHandleInfo,
  PluginHttpRouteSpec,
  PluginCommandDefinition,
  PluginCommandInvocation,
  PluginModelRequest,
  PluginModelResponse,
  PluginSource,
  PluginSkillDefinition,
  StagedSettingsRegistration,
  PluginToolExecutionContext,
  PluginToolDefinition,
  PluginPromptSection,
  RawCordisFunctionPlugin,
  RawPluginDeclaration,
} from '@r05en1cu/dsh-mygo-api'
import type { Context } from '@deepseek-ai/cordis'
import { isDeepStrictEqual } from 'node:util'
import { configFingerprint } from './config-fingerprint.ts'

/** Implicit manager identity in the unified dependency graph. */
export const MYGO_MANAGER_ID = 'dsh-mygo'
export { MYGO_MANAGER_VERSION } from './self.ts'
import { MYGO_MANAGER_VERSION } from './self.ts'
export const MYGO_MANAGER_CAPABILITY = 'service:mygo-core'

/**
 * Runtime record of dynamic symbol access through wrapped provided values
 * (A11 运行时代理兜底；B13 前置门消费)。只读注册表，随 provideTable 生命周期
 * 由引擎持有；记录谁在何时访问过哪些符号。
 * pluginId = 访问发起方（消费方插件 id；A15 归属修复），供政策闸按消费者隔离
 * 与按代修剪。
 */
export interface ProvidedAccessRecord {
  readonly capability: string
  readonly symbol: string
  readonly at: number
  readonly pluginId: string
}

/**
 * Wrap one provided value so the raw object never escapes the manager
 * (design-r3 §4.2/§4.3，B3/B4；closeout §16 四发布点)。Proxy get 转发；
 * set/deleteProperty 在桥接路径被拒绝并触发政策报告（exports 冻结，EB-D8）。
 * 原始引用不写入 provideTable、不返回、不经 seam 发布。
 * 动态符号访问记录自修复批次 2 起由消费方包装面（StagingEnv.get →
 * trackConsumerAccess）按消费者归属记录（A15）；本包装面不再记录。
 */
export function wrapProvidedValue(
  value: unknown,
  rejectMutation: (property: string | symbol, action: 'set' | 'delete') => void = () => {},
): unknown {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
  return new Proxy(value, {
    get(target, property, receiver) {
      return Reflect.get(target, property, receiver)
    },
    set(_target, property, _next, _receiver) {
      // 桥接 exports 冻结（EB-D8）：原地改写被拒绝并产出政策报告。
      rejectMutation(property, 'set')
      return false
    },
    deleteProperty(_target, property) {
      // 删除与写入同权：冻结面禁止摘除导出符号。
      rejectMutation(property, 'delete')
      return false
    },
  })
}
import {
  claimEffect,
  createPluginFs,
  createModelCall,
  createNetworkFetch,
  createPluginVars,
  createExecBoundary,
  createRateLimitedLogger,
  nodePluginIo,
  type PluginEffectQuota,
  type PluginIo,
} from './capabilities.ts'
import { evaluateConflicts } from './conflicts.ts'
import type { DispatchMachine } from './dispatch.ts'
import { EVENT_VOCABULARY } from './event-vocabulary.ts'
import type { PluginEventVocabularyEntry } from './event-vocabulary.ts'
import { deriveOrders } from './order.ts'
import { validateMount } from './mount.ts'
import { planOperation } from './plan.ts'
import {
  compatibilityViolationLines,
  evaluateCompatibility,
  transitiveUninstallViolations,
  type CompatibilityPlugin,
  type CompatibilitySet,
} from './compatibility.ts'
import { EntrypointsTable } from './entrypoints.ts'
import type { BundleInstallResult, BundleMember, BundleRail } from './bundle-rail.ts'
import {
  liveUninstall,
  loaderEntrySnapshot,
  precheckLiveInstall,
  verifyEntryState,
  writeLiveBlock,
} from './live-rail.ts'
import { resolveProfileEnv } from './registry-auth.ts'
import type { CredentialsLike } from './registry-auth.ts'
import type { RegistryPersistence } from './persistence.ts'
import type { SnapshotMeta } from './snapshots.ts'
import type {
  PlanState,
  PluginDeclarationInput,
  PluginManagerConfig,
  PluginOperation,
  PluginOperationPlan,
  PluginSupportCheck,
} from './types.ts'
import type { PluginLifecycleEventPayload } from './types.ts'
import type { GenerationRecord, RegistryStore, StatusRecord } from './store.ts'
import { FineEpochRegistry, captureExports, preGate, type ProviderSymbolSnapshot } from './package/fine-epoch.ts'
import { ProviderObservationRegistry, type ProviderObservation } from './package/provider-observations.ts'
import { evaluateRequiresGate, requiresGateReport, type RequiresGateResult } from './package/requires-gate.ts'
import type { ServiceResolutionReport } from './package/report.ts'

/** One staged registration of a generation layer. */
type StagedRegistration =
  | {
    readonly kind: 'listener'
    readonly pluginId: string
    readonly scope?: string
    readonly event: string
    readonly mode: 'observe' | 'transform' | 'intercept'
    readonly position: 'outermost' | 'derived' | 'innermost'
    readonly returns?: readonly string[]
    readonly listener: (...args: unknown[]) => unknown
  }
  | {
    readonly kind: 'host-listener'
    readonly pluginId: string
    readonly event: string
    readonly listener: (...args: unknown[]) => unknown
    readonly once?: boolean
    readonly prepend?: boolean
  }
  | {
    readonly kind: 'tool'
    readonly pluginId: string
    readonly scope?: string
    readonly definition: PluginToolDefinition
  }
  | {
    readonly kind: 'prompt-section'
    readonly pluginId: string
    readonly scope?: string
    readonly section: PluginPromptSection
  }
  | {
    readonly kind: 'http-route'
    readonly pluginId: string
    readonly scope?: string
    readonly spec: PluginHttpRouteSpec
  }
  | {
    readonly kind: 'skill'
    readonly pluginId: string
    readonly scope?: string
    readonly definition: PluginSkillDefinition
  }
  | {
    readonly kind: 'command'
    readonly pluginId: string
    readonly scope?: string
    readonly definition: PluginCommandDefinition
  }
  | {
    readonly kind: 'entrypoint'
    readonly pluginId: string
    readonly key: string
    readonly raw: PluginEntrypointContribution
  }
  | {
    readonly kind: 'provide'
    readonly pluginId: string
    readonly scope?: string
    readonly capability: string
    readonly value: unknown
  }
  | {
    readonly kind: 'effect'
    readonly pluginId: string
    readonly scope?: string
    readonly disposer: () => void
    readonly name?: string
  }
  | {
    readonly kind: 'host-effect'
    readonly pluginId: string
    readonly disposer: () => void
    readonly name?: string
  }
  | StagedSettingsRegistration

/** Shared staging phase: registrations belong to activate only (§4-1). */
interface PhaseHolder {
  phase: 'setup' | 'activate'
}

/** The registration half of the plugin env, owned by the engine (#15). */
class StagingEnv implements PluginEnv {
  readonly logger: Logger
  readonly fs: PluginEnv['fs']
  readonly vars: PluginEnv['vars']
  readonly llm: PluginEnv['llm']
  readonly exec: PluginEnv['exec']
  readonly http: PluginEnv['http']
  readonly skills: PluginEnv['skills']
  readonly commands: PluginEnv['commands']
  readonly scopedTo: string | undefined
  private readonly owner: LifecycleEngine
  private readonly pluginId: string
  private readonly manifest: PluginDefinition
  private readonly registrations: StagedRegistration[]
  private readonly scopeLayer: string | undefined
  private readonly phase: PhaseHolder
  private readonly quotas: PluginEffectQuota
  private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response>

  constructor(
    owner: LifecycleEngine,
    pluginId: string,
    manifest: PluginDefinition,
    registrations: StagedRegistration[],
    scopeLayer: string | undefined,
    phase: PhaseHolder,
    logger: Logger,
    fs: PluginEnv['fs'],
    vars: PluginEnv['vars'],
    llm: PluginEnv['llm'],
    exec: PluginEnv['exec'],
    fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
    quotas: PluginEffectQuota,
  ) {
    this.owner = owner
    this.pluginId = pluginId
    this.manifest = manifest
    this.registrations = registrations
    this.scopeLayer = scopeLayer
    this.phase = phase
    this.quotas = quotas
    this.fetchImpl = fetchImpl
    this.logger = logger
    this.fs = fs
    this.vars = vars
    this.llm = llm
    this.exec = exec
    this.http = {
      register: (spec: PluginHttpRouteSpec): (() => void) => {
        this.assertRegistrable('register')
        claimEffect(this.quotas, 'service', this.pluginId)
        this.registrations.push({
          kind: 'http-route',
          pluginId: this.pluginId,
          spec,
          ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
        })
        return () => {}
      },
    }
    this.skills = {
      register: (definition: PluginSkillDefinition): (() => void) => {
        this.assertRegistrable('register')
        claimEffect(this.quotas, 'tool', this.pluginId)
        this.registrations.push({
          kind: 'skill',
          pluginId: this.pluginId,
          definition,
          ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
        })
        return () => {}
      },
    }
    this.commands = {
      register: (definition: PluginCommandDefinition): (() => void) => {
        this.assertRegistrable('register')
        claimEffect(this.quotas, 'service', this.pluginId)
        this.registrations.push({
          kind: 'command',
          pluginId: this.pluginId,
          definition,
          ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
        })
        return () => {}
      },
    }
  }

  on(
    event: string,
    listener: (...args: unknown[]) => unknown,
    options?: { readonly prepend?: boolean },
  ): () => void {
    this.assertRegistrable('on')
    claimEffect(this.quotas, 'listener', this.pluginId)
    if (!this.owner.eventKnown(event) && !this.isDeclaredCustomEvent(event)) {
      // Host passthrough: the manager does not claim this event (outside the
      // harness vocabulary and outside the plugin's declared custom events).
      // The listener registers on the raw host bus with real Cordis
      // semantics; the manager tracks the disposer for HMR-safe revocation.
      this.registrations.push({
        kind: 'host-listener',
        pluginId: this.pluginId,
        event,
        listener,
        ...(options?.prepend === true ? { prepend: true } : {}),
      })
      return () => {}
    }
    const declaration = this.manifest.permissions.intercept.find(entry => entry.event === event)
    const transform = this.manifest.permissions.transform.find(entry => entry.event === event)
    this.registrations.push({
      kind: 'listener',
      pluginId: this.pluginId,
      event,
      mode: declaration !== undefined ? 'intercept' : transform !== undefined ? 'transform' : 'observe',
      position: this.manifest.permissions.position,
      ...(declaration === undefined ? {} : { returns: declaration.returns }),
      ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
      listener,
    })
    return () => {}
  }

  onHost(
    event: string,
    listener: (...args: unknown[]) => unknown,
    options?: { readonly once?: boolean; readonly prepend?: boolean },
  ): () => void {
    this.assertRegistrable('onHost')
    claimEffect(this.quotas, 'listener', this.pluginId)
    this.registrations.push({
      kind: 'host-listener',
      pluginId: this.pluginId,
      event,
      listener,
      ...(options?.once === true ? { once: true } : {}),
      ...(options?.prepend === true ? { prepend: true } : {}),
    })
    return () => {}
  }

  /** Whether the event matches a declared custom `events` entry (exact or namespace/*). */
  private isDeclaredCustomEvent(event: string): boolean {
    for (const pattern of this.manifest.events ?? []) {
      if (pattern.endsWith('/*')) {
        if (event.startsWith(pattern.slice(0, -1))) return true
      } else if (pattern === event) {
        return true
      }
    }
    return false
  }

  emit(event: string, payload?: unknown): void {
    this.owner.emitManaged(event, payload)
  }

  effect(disposer: () => void, name?: string): void {
    this.assertRegistrable('effect')
    this.registrations.push({
      kind: 'effect',
      pluginId: this.pluginId,
      disposer,
      ...(name === undefined ? {} : { name }),
      ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
    })
  }

  hostEffect(disposer: () => void, name?: string): void {
    this.assertRegistrable('hostEffect')
    this.registrations.push({
      kind: 'host-effect',
      pluginId: this.pluginId,
      disposer,
      ...(name === undefined ? {} : { name }),
    })
  }

  registerSettings(registration: StagedSettingsRegistration): void {
    this.assertRegistrable('settings.register')
    claimEffect(this.quotas, 'service', this.pluginId)
    this.registrations.push(registration)
  }

  get host(): unknown {
    return this.owner.rawHost()
  }

  scope(agentId: string): PluginEnv {
    return new StagingEnv(
      this.owner,
      this.pluginId,
      this.manifest,
      this.registrations,
      agentId,
      this.phase,
      this.logger,
      this.fs,
      this.vars,
      this.llm,
      this.exec,
      this.fetchImpl,
      this.quotas,
    )
  }

  registerTool(definition: PluginToolDefinition): () => void {
    this.assertRegistrable('registerTool')
    claimEffect(this.quotas, 'tool', this.pluginId)
    this.registrations.push({
      kind: 'tool',
      pluginId: this.pluginId,
      definition,
      ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
    })
    return () => {}
  }

  getTool(name: string): PluginToolDefinition | undefined {
    return this.owner.managedTool(name)
  }

  listTools(): readonly PluginToolDefinition[] {
    return this.owner.managedTools()
  }

  registerPromptSection(section: PluginPromptSection): () => void {
    this.assertRegistrable('registerPromptSection')
    if (typeof section.name !== 'string' || section.name.length === 0
      || !Number.isFinite(section.order)
      || (typeof section.text !== 'string' && typeof section.text !== 'function')) {
      throw fail('staging-failed', {
        stage: 'prompt-section',
        cause: 'section must declare a name, finite order, and string-or-function text',
      }, this.pluginId)
    }
    // §18 contribution bucket: prompt sections count against the tool quota.
    claimEffect(this.quotas, 'tool', this.pluginId)
    this.registrations.push({
      kind: 'prompt-section',
      pluginId: this.pluginId,
      section,
      ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
    })
    return () => {}
  }

  provide(capability: string, value: unknown): () => void {
    this.assertRegistrable('provide')
    claimEffect(this.quotas, 'service', this.pluginId)
    const registration: StagedRegistration = {
      kind: 'provide',
      pluginId: this.pluginId,
      capability,
      value,
      ...(this.scopeLayer === undefined ? {} : { scope: this.scopeLayer }),
    }
    this.registrations.push(registration)
    // A14：真实 disposer——调用后立即撤下该提供（后续解析失败 + 政策重估）。
    // 配额槽位不回收（保守方向：不放开注册上限）。
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      const index = this.registrations.indexOf(registration)
      if (index >= 0) this.registrations.splice(index, 1)
      this.owner.removeProvidedValue(this.pluginId, capability)
    }
  }

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T is the caller-chosen service type at each call site.
  get<T>(capability: string): T | undefined {
    const provided = this.owner.provideValue(capability)
    if (provided !== undefined) return this.owner.trackConsumerAccess(provided, capability, this.pluginId) as T
    if (capability === 'sessionPersistence') return this.owner.sessionPersistenceProjection(this.pluginId) as T | undefined
    const host = this.owner.hostValue(capability)
    if (host !== undefined) return host as T
    return undefined
  }

  plugins(): readonly PluginHandleInfo[] {
    return this.owner.plugins()
  }

  async install(source: PluginSource, options: InstallOptions = {}): Promise<PluginHandleInfo> {
    return this.owner.install(source, { ...options, origin: options.origin ?? 'runtime-api' })
  }

  async uninstall(id: string): Promise<void> {
    return this.owner.uninstall(id)
  }

  updateConfig(patch: unknown): Promise<void> {
    return this.owner.updateConfig(this.pluginId, patch)
  }

  fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.fetchImpl(url, init)
  }

  private assertRegistrable(method: string): void {
    if (this.phase.phase !== 'setup') return
    throw fail('setup-registration', { method }, this.pluginId)
  }
}

/** One generation of a managed plugin, immutable after staging. */
interface EngineGeneration {
  readonly number: number
  readonly manifest: PluginDefinition
  readonly code: string
  readonly source: PluginSource | { readonly type: 'static' }
  readonly resolvedConfig: unknown
  readonly registrations: readonly StagedRegistration[]
  /** Disposers removing this generation's registrations from the machine. */
  readonly disposers: (() => void)[]
  /**
   * 政策可逆面（修复批次 2 / A1）：受管 dispatch 监听器的注册 disposer，
   * 政策停用（INACTIVE）时撤销、恢复时重建，与 effect disposers 分离。
   */
  readonly policyDisposers: (() => void)[]
  /**
   * 政策可逆面（修复批次 2 / A1）：宿主总线监听器（kind 'host-listener'）的
   * disposer；政策停用与 disable 都会撤销（与既有 disable 语义一致）。
   */
  readonly policyHostDisposers: (() => void)[]
  /** Hot-swap retention: events with in-flight dispatches at swap time. */
  remainingEvents: Set<string>
  /** Provided capabilities and their current values (manager-held). */
  readonly provides: Map<string, unknown>
  /** Tool definitions held through the indirection table. */
  readonly tools: Map<string, PluginToolDefinition>
  /** Prompt sections held through the prompt-service publication table. */
  readonly promptSections: Map<string, PluginPromptSection>
  readonly httpRoutes: Map<string, PluginHttpRouteSpec>
  readonly skills: Map<string, PluginSkillDefinition>
  readonly commands: Map<string, PluginCommandDefinition>
  /** Opaque tokens of this generation's entrypoint contributions. */
  readonly entrypointTokens: unknown[]
  /** Host-side side-effect disposers; revocable on disable AND release. */
  readonly hostEffectDisposers: (() => void)[]
  /**
   * Settings namespaces staged by the facade; registered on a per-generation
   * host fiber at commit (replace releases the incumbent before the new
   * generation applies, so the global namespace map never sees two owners).
   */
  readonly settingsRegistrations: StagedSettingsRegistration[]
  /** Per-generation settings owner fiber, set at settings commit. */
  settingsOwner?: { readonly fiber: { dispose(): Promise<void> } }
  /** Settled once the settings owner fiber is disposed (set by disposeGeneration). */
  settingsOwnerDisposal?: Promise<void>
  /** Whether this generation's registrations are live on the machine. */
  readonly mounted: boolean
}

/** A managed plugin record. */
interface ManagedRecord {
  readonly id: string
  readonly origin: 'static' | InstallOrigin
  readonly source: PluginSource | { readonly type: 'static' }
  status: 'enabled' | 'disabled' | 'quarantined' | 'shadowed'
  /** 政策/反应式状态（EB-D16 三态：disabled > 政策拒绝 > INACTIVE）。 */
  policyStatus?: 'active' | 'inactive' | 'policy-rejected'
  reason?: string
  /** Host side effects were revoked by disable; enable must remount. */
  hostSideEffectsDropped?: boolean
  generations: EngineGeneration[]
  state: unknown
  snapshot?: SnapshotMeta
}

/** Recovery outcome for one persisted row (§22.4). */
export interface RecoveryRow {
  readonly id: string
  readonly status: 'restored' | 'shadowed' | 'quarantined' | 'gc' | 'ignored'
  readonly reason?: string
  readonly errorCode?: PluginErrorCode
}

/** Tool-name tombstone: a name an uninstalled plugin used to own. */
interface ToolTombstone {
  readonly pluginId: string
}

/** Boot recovery summary (§22.4). */
export interface LifecycleRecoveryReport {
  readonly restored: number
  readonly shadowed: number
  readonly quarantined: number
  readonly gc: { readonly orphanGenerations: number; readonly historyTrimmed: number }
  readonly rows: readonly RecoveryRow[]
}

/** Structural host tools-registry seam the registry bridge publishes through. */
export interface ToolRegistryLike {
  /** Register one registry-shaped definition; returns its disposer. */
  register(definition: unknown): () => void
  /** The global-layer definition of one tool name, or `undefined` when free. */
  get(name: string): unknown
}

/** Structural host systemPrompt service seam (Proposal B). */
export interface PromptServiceLike {
  /** Register one prompt section; returns its disposer. */
  section(section: unknown): () => void
}

/** Structural host HTTP server seam for `env.http` route publication. */
export interface HttpServerLike {
  /** Register one web route; returns its disposer. */
  register(route: unknown): () => void
}

/** Structural host skills service seam for `env.skills` publication. */
export interface SkillServiceLike {
  /** Register one skill provider; returns its disposer. */
  registerProvider(create: (control: unknown) => unknown): () => void
}

/** Structural host commands service seam for `env.commands` publication. */
export interface CommandServiceLike {
  /** Register one slash command; returns its disposer. */
  register(definition: unknown): () => void
}

/** Read-only session-persistence projection (Proposal B, ruling question ②). */
export interface SessionPersistenceProjection {
  listSnapshots(signal?: AbortSignal): Promise<unknown>
  list(signal?: AbortSignal): Promise<unknown>
  locate(meta: unknown): unknown
  inspect(id: unknown, signal?: AbortSignal): Promise<unknown>
  load(id: unknown): Promise<unknown>
  readFrom(id: unknown, fromSeq: number, signal?: AbortSignal): Promise<unknown>
  prepare(id: unknown, signal?: AbortSignal): Promise<unknown>
  /** Loud write denial: the write surface is deferred (Proposal B). */
  create(meta: unknown): Promise<never>
  /** Loud write denial: the write surface is deferred (Proposal B). */
  append(id: unknown, events: readonly unknown[]): Promise<never>
}

/**
 * Build the read-only sessionPersistence projection a managed plugin may
 * resolve (Proposal B). Read methods forward to the host service; the write
 * methods (`create`/`append`) are present as throwing stubs so a call
 * PHYSICALLY FAILS instead of silently returning `undefined` — the write
 * surface is deferred to the first write consumer.
 * @param service - the host sessionPersistence service.
 * @returns the projection object.
 */
export function createSessionPersistenceProjection(
  service: unknown,
  writeAllowed = false,
): SessionPersistenceProjection {
  const host = service as Partial<SessionPersistenceProjection>
  const denied = (method: string): () => Promise<never> => () => {
    return Promise.reject(new Error(
      `sessionPersistence.${method} is not available to managed plugins in v1 (write surface deferred; Proposal B)`,
    ))
  }
  function forward<A extends unknown[], R>(method: ((...args: A) => R) | undefined, fallback: (...args: A) => R): ((...args: A) => R) {
    return method === undefined ? fallback : (...args: A) => method(...args)
  }
  return {
    listSnapshots: forward(host.listSnapshots, () => Promise.resolve([])),
    list: forward(host.list, () => Promise.resolve([])),
    locate: forward(host.locate, () => undefined),
    inspect: forward(host.inspect, () => Promise.reject(new Error('sessionPersistence.inspect is unavailable'))),
    load: forward(host.load, () => Promise.reject(new Error('sessionPersistence.load is unavailable'))),
    readFrom: forward(host.readFrom, () => Promise.resolve([])),
    prepare: forward(host.prepare, () => Promise.resolve(undefined)),
    create: writeAllowed && host.create !== undefined
      ? (...args) => host.create!(...args)
      : denied('create'),
    append: writeAllowed && host.append !== undefined
      ? (...args) => host.append!(...args)
      : denied('append'),
  }
}

/** Options for the lifecycle engine. */
export interface LifecycleEngineOptions {
  /** Cordis context the engine emits `plugin/*` events through. */
  readonly ctx: Context
  /** Dispatch machine whose arrays the engine swaps on topology change. */
  readonly dispatch: DispatchMachine
  /** Persistence seam; the sqlite implementation arrives in #17. */
  readonly store: RegistryStore
  /** Resolved manager Config (#12). */
  readonly config: PluginManagerConfig
  /**
   * Resolve an inline/npm source to a definition (evaluation is the caller's
   * host power). Absent (harness/tests): every resolution fails loudly.
   */
  readonly resolveSource?: (source: PluginSource) => Promise<PluginDefinition>
  /** Pure source preview for `plan()` (npm sources must not install). */
  readonly resolveSourcePreview?: (source: PluginSource) => Promise<PluginDefinition>
  /** Generation history retained per plugin; defaults to Config `historyKeep`. */
  readonly historyKeep?: number
  /** Bounded drain/next-idle wait; defaults to Config `swapTimeoutMs`. */
  readonly swapTimeoutMs?: number
  /** dispose/unload 过渡超时；缺省取 Config `disposeTimeoutMs`（B8/EB-D21）。 */
  readonly disposeTimeoutMs?: number
  /** Agent-turn busy check for `swapPolicy: 'next-idle'`. */
  readonly isTurnBusy?: () => boolean | Promise<boolean>
  /** Static composition ids (T2-4: static wins over dynamic rows). */
  readonly staticIds?: readonly string[]
  /** Slot classification for order neutrality (same input as #13). */
  readonly slotKinds?: ReadonlyMap<string, 'host-sorted' | 'chain-ordered'>
  /** Preferred recovery mount order (dependencies first, from lockfile). */
  readonly recoverOrder?: readonly string[]
  /** Harness event vocabulary for mount validation (defaults to the generated one). */
  readonly eventVocabulary?: readonly PluginEventVocabularyEntry[]
  /** Logger for recovery and warnings. */
  readonly logger?: Logger
  /** Host I/O seam for the `env.fs` boundary; defaults to Node's `fs/promises`. */
  readonly io?: PluginIo
  /** Host fetch for the `env.fetch` boundary; defaults to the global fetch. */
  readonly fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
  /**
   * Host tools-registry seam for the registry bridge (Proposal A). Defaults
   * to the composed `tools` service via `ctx.get('tools')`; absent = tools
   * stay manager-internal and the bridge is inert.
   */
  readonly toolRegistry?: ToolRegistryLike
  /** Host systemPrompt seam for prompt-section publication (Proposal B). */
  readonly promptService?: PromptServiceLike
  /** Host sessionPersistence seam for the read-only projection (Proposal B). */
  readonly sessionPersistence?: unknown
  /** Host model-completion seam for `env.llm`; absent denies every model call. */
  readonly llm?: (request: PluginModelRequest) => Promise<PluginModelResponse>
  /** Host subprocess seam for `env.exec`; absent denies every command. */
  readonly exec?: (request: PluginExecRequest) => Promise<PluginExecResult>
  /** Host HTTP server seam for `env.http` route publication; absent keeps routes manager-held. */
  readonly httpServer?: HttpServerLike
  /** Host skills service seam for `env.skills` publication; absent keeps skills manager-held. */
  readonly skillService?: SkillServiceLike
  /** Host commands service seam for `env.commands` publication; absent keeps commands manager-held. */
  readonly commandService?: CommandServiceLike
  /** Entrypoint aggregation table; defaults to a fresh manager-owned table. */
  readonly entrypoints?: EntrypointsTable
  /**
   * Versions of non-managed packages (host packages) constraints may name.
   * Keys are plugin-id style; v1 deployments pass an empty map and constraint
   * keys reference managed plugin ids only.
   */
  readonly hostPackages?: Readonly<Record<string, string>>
  /** P3 bundle rail adapter; when present, profile bundles join the unified graph. */
  readonly bundleRail?: BundleRail
  /** Host provide seam for publishing manager-held provides into `ctx`; absent keeps provides manager-held. */
  readonly hostProvide?: (name: string, value: unknown) => () => void
  /**
   * Host service resolver for declared `requires` that the manager does not
   * itself hold. Declarations are the gate: `env.get` only forwards declared
   * capabilities, and undeclared ones stay `undefined` (SEC:86).
   */
  readonly hostService?: (capability: string) => unknown
  /** Sqlite/snapshot/audit persistence facade (#17); absent = in-memory engine. */
  readonly persistence?: RegistryPersistence
  /** Clock for provenance timestamps and bounded waits. */
  readonly now?: () => number
  /** Failure-injection seam: called right after a replace's status persist
   * succeeds, before step 6/7 — throwing here simulates a process crash with
   * the step-5 durable state already on disk. */
  readonly crashAfterPersist?: () => void
}

/**
 * The lifecycle engine: install/uninstall/replace/enable/disable/updateConfig
 * over the generation registry, with T3 persistence ordering and T4 boot
 * recovery. One operation per plugin id runs at a time
 * (`concurrent-operation` otherwise).
 */
export class LifecycleEngine {
  private readonly ctx: Context
  private readonly dispatch: DispatchMachine
  private readonly store: RegistryStore
  private readonly config: PluginManagerConfig
  private readonly resolveSource: (source: PluginSource) => Promise<PluginDefinition>
  private readonly resolveSourcePreview: (source: PluginSource) => Promise<PluginDefinition>
  private readonly historyKeep: number
  private readonly swapTimeoutMs: number
  private readonly disposeTimeoutMs: number
  private readonly isTurnBusy: () => boolean | Promise<boolean>
  private readonly staticIds: ReadonlySet<string>
  private readonly slotKinds: ReadonlyMap<string, 'host-sorted' | 'chain-ordered'>
  private readonly recoverOrder: readonly string[] | undefined
  private readonly eventVocabulary: readonly PluginEventVocabularyEntry[]
  /** Engine-owned logger for warnings and violation surfaces; defaults to a no-op. */
  readonly logger: Logger
  private readonly io: PluginIo
  private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response>
  private readonly llm: ((request: PluginModelRequest) => Promise<PluginModelResponse>) | undefined
  private readonly exec: ((request: PluginExecRequest) => Promise<PluginExecResult>) | undefined
  private readonly httpServerHost: HttpServerLike | undefined
  private readonly skillServiceHost: SkillServiceLike | undefined
  private readonly commandServiceHost: CommandServiceLike | undefined
  private readonly entrypoints: EntrypointsTable
  private readonly hostPackages: Readonly<Record<string, string>>
  private readonly bundleRail: BundleRail | undefined
  private readonly hostProvideSeam: ((name: string, value: unknown) => () => void) | undefined
  private readonly hostService: ((capability: string) => unknown) | undefined
  private readonly toolRegistry: ToolRegistryLike | undefined
  private readonly promptService: PromptServiceLike | undefined
  private readonly toolTombstones = new Map<string, ToolTombstone>()
  private readonly sessionPersistence: unknown
  private readonly persistence: RegistryPersistence | undefined
  private readonly now: () => number
  private readonly crashAfterPersist: () => void

  private readonly records = new Map<string, ManagedRecord>()
  private readonly configRevisions = new Map<string, { revision: number; fingerprint: string | undefined }>()
  private readonly locks = new Map<string, string>()
  private readonly provideTable = new Map<string, { readonly pluginId: string; value: unknown }>()
  private readonly toolIndirections = new Map<string, { readonly pluginId: string; definition: PluginToolDefinition }>()
  private readonly toolRegistryDisposers = new Map<string, () => void>()
  private readonly promptSectionTable = new Map<string, { readonly pluginId: string; section: PluginPromptSection }>()
  private readonly promptSectionDisposers = new Map<string, () => void>()
  private readonly httpRouteIndirections = new Map<string, { readonly pluginId: string; readonly spec: PluginHttpRouteSpec }>()
  private readonly httpRouteDisposers = new Map<string, () => void>()
  private readonly skillIndirections = new Map<string, { readonly pluginId: string; readonly definition: PluginSkillDefinition }>()
  private readonly skillProviderDisposers = new Map<string, () => void>()
  private readonly commandIndirections = new Map<string, { readonly pluginId: string; readonly definition: PluginCommandDefinition }>()
  private readonly commandDisposers = new Map<string, () => void>()
  private readonly hostProvideDisposers = new Map<string, () => void>()
  private readonly hostProvideValues = new Map<string, unknown>()
  /** 动态符号访问记录（B3/A11 兜底；B13 前置门读取；A15 按消费者归属）。 */
  private readonly providedAccessRecords: ProvidedAccessRecord[] = []
  /** 消费方访问包装缓存（A15）：(消费者 id, capability) → 包装代理，保身份稳定。 */
  private readonly consumerWrappers = new Map<string, Map<string, { readonly value: unknown; readonly wrapper: unknown }>>()
  /** 政策闸报告（修复批次 2 / A1）：plugin id → 最近一次 requires/symbol 违例报告。 */
  private readonly policyReports = new Map<string, ServiceResolutionReport>()
  /** 细 epoch 前置门：挂载时导出快照注册表（B13）。 */
  private readonly fineEpochRegistry = new FineEpochRegistry()
  /** 服务提供者观测记录（B19；报告候选集来源）。 */
  private readonly providerObservations = new ProviderObservationRegistry()
  private readonly idleDisposers = new Map<string, () => void>()
  private readonly neutral = new Map<string, boolean>()
  private readonly logLimiters = new Map<string, Logger>()
  private nextGeneration = 1

  /** 只读动态符号访问记录（A11/B13）。 */
  providedAccessLog(): readonly ProvidedAccessRecord[] {
    return this.providedAccessRecords
  }

  /** 细 epoch 前置门注册表（B13；只读消费）。 */
  fineEpoch(): FineEpochRegistry {
    return this.fineEpochRegistry
  }

  /** 服务提供者观测注册表（B19；只读消费）。 */
  providerObservationRegistry(): ProviderObservationRegistry {
    return this.providerObservations
  }

  /** B3 单一收口：所有 provide 值 MUST 经此包装后入表/返回/发布。 */
  private wrapProvided(capability: string, value: unknown, pluginId: string): unknown {
    return wrapProvidedValue(value, (property, action) => {
      this.logger.warn(
        `exports-frozen: plugin ${pluginId} 尝试通过桥接导出面 ${action} 符号 ${String(property)}（能力 ${capability}）`,
      )
    })
  }

  /**
   * A15 消费方访问包装：为 (消费者, capability) 提供身份稳定的记录代理。
   * 每次 get 校验缓存是否仍包装当前提供值——提供者换代后自动换新包装（自愈）。
   * 修复批次 4（review#1 A2 / review#2 A11）：traps 补全口径 = 记录完整性，
   * 不是拦截（DG-3(a) 裁决 Proxy 定位 = 访问记录面）——defineProperty /
   * has / ownKeys / getOwnPropertyDescriptor 与 symbol 键访问同样入记录；
   * 本包装面不新增任何拒绝行为（set/delete 的既有冻结语义由内层提供方包装面
   * 维持，defineProperty 等转发路径与批次 2 完全一致）。
   */
  trackConsumerAccess(value: unknown, capability: string, consumerId: string): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
    let perCapability = this.consumerWrappers.get(consumerId)
    if (perCapability === undefined) {
      perCapability = new Map()
      this.consumerWrappers.set(consumerId, perCapability)
    }
    const cached = perCapability.get(capability)
    if (cached !== undefined && cached.value === value) return cached.wrapper
    const record = (property: string | symbol): void => {
      const name = typeof property === 'symbol' ? String(property) : property
      if (name === 'then') return
      this.providedAccessRecords.push({ capability, symbol: name, at: Date.now(), pluginId: consumerId })
    }
    const wrapper = new Proxy(value, {
      get: (target, property, receiver) => {
        record(property)
        return Reflect.get(target, property, receiver)
      },
      has: (target, property) => {
        record(property)
        return Reflect.has(target, property)
      },
      getOwnPropertyDescriptor: (target, property) => {
        record(property)
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
      ownKeys: (target) => {
        for (const key of Reflect.ownKeys(target)) record(key)
        return Reflect.ownKeys(target)
      },
      defineProperty: (target, property, attributes) => {
        record(property)
        return Reflect.defineProperty(target, property, attributes)
      },
    })
    perCapability.set(capability, { value, wrapper })
    return wrapper
  }

  /**
   * Create the engine over a dispatch machine and registry store.
   * @param options - context, machine, store, Config, source resolver, and policy knobs.
   */
  constructor(options: LifecycleEngineOptions) {
    this.ctx = options.ctx
    this.dispatch = options.dispatch
    this.store = options.store
    this.config = options.config
    this.resolveSource = options.resolveSource ?? (async () => {
      throw new PluginError(
        'package-not-resolvable',
        formatPluginError('package-not-resolvable', {
          package: 'n/a',
          anchors: 'resolveSource 未配置',
        }),
        { package: 'n/a', anchors: 'resolveSource 未配置' },
      )
    })
    this.resolveSourcePreview = options.resolveSourcePreview ?? this.resolveSource
    this.historyKeep = options.historyKeep ?? options.config.historyKeep
    this.swapTimeoutMs = options.swapTimeoutMs ?? options.config.swapTimeoutMs
    this.disposeTimeoutMs = options.disposeTimeoutMs ?? options.config.disposeTimeoutMs ?? 5000
    this.isTurnBusy = options.isTurnBusy ?? (() => false)
    this.staticIds = new Set(options.staticIds ?? [])
    this.slotKinds = options.slotKinds ?? new Map()
    this.recoverOrder = options.recoverOrder
    this.eventVocabulary = options.eventVocabulary ?? EVENT_VOCABULARY
    this.logger = options.logger ?? { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} }
    this.io = options.io ?? nodePluginIo
    this.fetchImpl = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init))
    this.llm = options.llm
    this.exec = options.exec
    this.httpServerHost = options.httpServer
    this.skillServiceHost = options.skillService
    this.commandServiceHost = options.commandService
    this.entrypoints = options.entrypoints ?? new EntrypointsTable(options.ctx)
    this.hostPackages = options.hostPackages ?? {}
    this.bundleRail = options.bundleRail
    this.hostProvideSeam = options.hostProvide
    this.hostService = options.hostService
    this.toolRegistry = options.toolRegistry ?? (this.ctx.get('tools') as ToolRegistryLike | undefined)
    this.promptService = options.promptService ?? (this.ctx.get('systemPrompt') as PromptServiceLike | undefined)
    this.sessionPersistence = options.sessionPersistence ?? this.ctx.get('sessionPersistence')
    this.persistence = options.persistence
    this.now = options.now ?? (() => Date.now())
    this.crashAfterPersist = options.crashAfterPersist ?? (() => {})
  }

  /**
   * Install one plugin: runtime commit → persist → return (T3 rule 1).
   * @param source - inline code or an npm package reference (never fetched).
   * @param options - origin and initial config for the install.
   * @returns the managed handle of the installed plugin.
   */
  async install(source: PluginSource, options: InstallOptions = {}): Promise<PluginHandleInfo> {
    const origin = options.origin ?? 'runtime-api'
    const definition = await this.resolveSource(source)
    return this.withLock(definition.id, 'install', async () => {
      this.validate(definition, origin, source)
      // 范围重塑（2026-08-13）：激活求解器已删除，安装只做兼容预检
      // （assertCompatibility）；depends 闭包连带启用不再发生。
      this.assertCompatibility(definition)
      await this.assertRegistryQuota(source, definition.id)
      const existing = this.records.get(definition.id)
      if (existing !== undefined) {
        if (existing.origin === 'static') return this.installShadowed(definition, source)
        throw fail('concurrent-operation', { id: definition.id, operation: 'install' }, definition.id)
      }
      this.assertNoConflicts(definition.id, definition, 'install')
      const generation = await this.stageNew(definition, source, options.config, null, undefined)
      this.assertToolNamesAvailable(generation, definition.id)
      this.assertToolRegistryConflicts(generation, definition.id)
      const previousOrders = this.deriveOrderMap()
      await this.commitGeneration(definition.id, origin, source, generation, 'enabled', previousOrders, null)
      await this.auditMount(definition.id, definition.version, generation.number, origin)
      this.emit('plugin/installed', this.eventPayload(definition.id, definition, generation.number))
      this.emit('plugin/activated', this.eventPayload(definition.id, definition, generation.number))
      return this.handleOf(this.record(definition.id))
    })
  }

  /**
   * Adopt a static composition entry (#12/#18 adapter surface; decision #12).
   * Static entries are the deployment's authority: they win over any dynamic
   * row of the same id (T2-4, runtime marking) and are never persisted.
   * @param definition - validated static plugin manifest.
   * @param config - resolved deployment config.
   * @returns the static plugin handle.
   */
  async adoptStatic(definition: PluginDefinition, config: unknown): Promise<PluginHandleInfo> {
    // Serialize per id: a Loader hot-reload bridge adoption and the panel's
    // live adoptRaw can race into the same static row; without the lock both
    // pass the idempotency check and run apply twice (double host-side
    // registrations, e.g. settings namespaces).
    return this.withLock(definition.id, 'adopt', async () => {
      this.validate(definition, 'static', { type: 'static' })
      this.assertCompatibility(definition)
      // Idempotent static adoption: a Loader hot-reload (bridge row re-adopt)
      // and the panel's live adoptRaw can reach the same static row in either
      // order. A second adoption of the same live generation must not re-run
      // apply — host side effects (index taps, skill providers, upgrade
      // routes) are not double-registrable. A same-version re-adoption with
      // a DIFFERENT config is a hot-config change and must replace.
      const live = this.records.get(definition.id)
      if (live !== undefined && live.origin === 'static' && live.status === 'enabled') {
        const current = live.generations.at(-1)
        if (current !== undefined && current.mounted && current.manifest.version === definition.version) {
          const resolved = this.resolveConfig(definition, config)
          if (isDeepStrictEqual(resolved, current.resolvedConfig)) {
            return this.handleOf(live)
          }
        }
      }
      // A persisted uninstall tombstone keeps a static bundle row from being
      // re-adopted on every boot until the operator clears it.
      const tombstone = await this.store.readStatus(definition.id)
      if (tombstone !== undefined && tombstone.status === 'uninstalled') {
        this.logger.warn(`static plugin ${definition.id} skipped: uninstalled tombstone`)
        for (const tool of tombstone.tools ?? []) {
          this.toolTombstones.set(tool, { pluginId: definition.id })
        }
        return {
          id: definition.id,
          version: definition.version,
          generation: 0,
          origin: 'static',
          status: 'uninstalled',
          kinds: definition.kinds,
          requires: definition.requires,
          provides: definition.provides,
          orderNeutral: true,
          source: { type: 'static' },
        }
      }
      const existing = this.records.get(definition.id)
      if (existing !== undefined && existing.origin !== 'static') {
        existing.status = 'shadowed'
        existing.reason = 'shadowed'
        this.refreshOrders()
      }
      // Native HMR ordering: release the incumbent generation before the new
      // static definition applies, so global host seats (settings namespaces,
      // upgrade/fallback routes) never see two owners in one adoption.
      if (existing !== undefined) {
        for (const old of existing.generations) {
          this.disposeGeneration(old)
          await this.disposeGenerationBounded(old)
          this.emit('plugin/deactivated', this.eventPayload(existing.id, old.manifest, old.number))
        }
      }
      const previous = existing?.generations.at(-1) ?? null
      let generation: EngineGeneration
      try {
        generation = await this.stageNew(definition, { type: 'static' }, config, null, undefined)
        this.assertToolNamesAvailable(generation, definition.id)
        this.assertToolRegistryConflicts(generation, definition.id)
      } catch (error) {
        // The incumbent was already released; restore it so a failed
        // re-adoption never strands the plugin.
        if (existing !== undefined && previous !== null) {
          try {
            await this.restoreIncumbent(existing, previous, 'adopt')
          } catch (rollbackError) {
            this.logger.warn(`static plugin ${definition.id} adopt rollback failed: ${String(rollbackError)}`)
          }
        }
        throw error
      }
      this.applyRegistrations(generation)
      this.replaceTables(definition.id, previous, generation)
      this.syncToolPublishState()
      this.syncPromptSectionState()
      this.syncHttpRouteState()
      this.syncSkillState()
      this.syncCommandState()
      this.syncProvideState()
      this.reconcileRequiresGates()
      await this.commitSettingsRegistrations(generation)
      this.records.set(definition.id, {
        id: definition.id,
        origin: 'static',
        source: { type: 'static' },
        status: 'enabled',
        generations: [generation],
        state: undefined,
      })
      this.refreshOrders()
      this.emit('plugin/installed', this.eventPayload(definition.id, definition, generation.number))
      this.emit('plugin/activated', this.eventPayload(definition.id, definition, generation.number))
      return this.handleOf(this.record(definition.id))
    })
  }

  /**
   * Adopt a raw Cordis plugin (zero-intrusion surface): the manifest is
   * auto-derived from the plugin's `name`/`inject`/`Config`/`apply` shape and
   * the generation runs through the host-shaped transparent facade, so a
   * stock dsh-external plugin mounts without any managed-plugin code.
   * @param raw - the raw cordis plugin module (name/inject/Config/apply).
   * @param config - deployment config validated against the raw Config schema.
   * @param id - optional manager-side plugin id; defaults to the derived id.
   * @returns the static plugin handle.
   */
  async adoptRaw(
    raw: RawCordisFunctionPlugin,
    config: unknown,
    id?: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginHandleInfo> {
    const definition = mergeRawDeclaration(fromCordisPlugin(raw), id, declaration)
    return this.adoptStatic(definition, config)
  }

  /**
   * Live-update an adopted raw plugin: derive the new manifest and run the
   * HMR replace protocol so the running generation swaps without restarting
   * the host or dropping sessions (capture → stage → swap → dispose).
   * @param raw - the new raw Cordis plugin module.
   * @param config - deployment config for the new generation.
   * @param id - the existing manager-side plugin id (required).
   * @returns the updated plugin handle.
   */
  async updateRaw(
    raw: RawCordisFunctionPlugin,
    config: unknown,
    id: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginHandleInfo> {
    const definition = mergeRawDeclaration(fromCordisPlugin(raw), id, declaration)
    return this.withLock(id, 'replace', async () => {
      this.requireRecord(id, 'replace')
      return this.replaceWithDefinition(id, { type: 'static' }, definition, false, config)
    })
  }

  /**
   * Pre-mount support check: derive the managed manifest and verify every
   * declared `requires` is satisfiable (manager-held surface, an existing
   * provide, or a live host service). Pure — no records, tables, or routes
   * are touched, so callers can gate mounting without side effects.
   * @param raw - the raw Cordis plugin module.
   * @param id - optional manager-side plugin id; defaults to the derived id.
   * @returns `{ ok: true }` or `{ ok: false, reason }`.
   */
  async checkSupport(
    raw: RawCordisFunctionPlugin,
    id?: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginSupportCheck> {
    if (typeof raw !== 'function' && typeof (raw as { apply?: unknown }).apply !== 'function') {
      return { ok: false, reason: '插件入口不是函数 / apply 对象 / 类构造器' }
    }
    let derived: PluginDefinition
    try {
      derived = fromCordisPlugin(raw)
    } catch (error) {
      return { ok: false, reason: `插件入口形状不合法：${error instanceof Error ? error.message : String(error)}` }
    }
    const definition = mergeRawDeclaration(derived, id, declaration)
    const managerHeld = new Set(['tools', 'systemPrompt', 'httpServer', 'skills', 'commands', 'sessionPersistence'])
    const missing: string[] = []
    for (const capability of definition.requires) {
      if (managerHeld.has(capability)) continue
      if (this.provideValue(capability) !== undefined) continue
      if (this.hostValue(capability) !== undefined) continue
      missing.push(capability)
    }
    if (missing.length > 0) {
      return { ok: false, reason: `宿主缺少服务：${missing.join(', ')}` }
    }
    const violations = this.incomingCompatibilityViolations(definition)
    if (violations.length > 0) {
      return { ok: false, reason: `兼容性冲突：${violations.join('；')}` }
    }
    return { ok: true }
  }

  /**
   * Pure compatibility preflight: whether a declarative package
   * (`dsh.mygo` from its package.json) would violate any constraint against
   * the live managed set. Panel installers call this before writing the
   * bridge so a broken combination is refused early.
   */
  checkCompatibility(declaration: {
    readonly id: string
    readonly version?: string
    readonly compatibility?: PluginCompatibility
  }): CompatibilityReport {
    const definition: PluginDefinition = {
      ...emptyManifest(declaration.id),
      version: declaration.version ?? '0.0.0-raw',
      ...(declaration.compatibility === undefined
        ? {}
        : { compatibility: declaration.compatibility }),
    }
    return this.incomingCompatibilityReport(definition, 'preflight')
  }

  /**
   * Uninstall: idempotent for unknown ids; persist first (T3 rule 2).
   * @param id - plugin id to remove.
   */
  async uninstall(id: string): Promise<void> {
    return this.withLock(id, 'uninstall', async () => {
      const record = this.records.get(id)
      if (record === undefined) return
      const dependents = this.dependentsOf(id)
      if (dependents.length > 0) throw fail('dependent-exists', { dependents }, id)
      const victimVersion = record.generations.at(-1)?.manifest.version
      const victimProvides = record.generations.at(-1)?.manifest.provides ?? []
      const blocked = transitiveUninstallViolations(
        [...this.records.values()]
          .filter(record => record.id !== id)
          .map(record => this.compatibilityPluginOf(record)),
        {
          id,
          ...(victimVersion === undefined ? {} : { version: victimVersion }),
          provides: victimProvides,
        },
      )
      if (blocked.length > 0) throw fail('compatibility-conflict', { plugin: id, violations: blocked }, id)
      const plan = planOperation({ op: 'uninstall', id }, this.planState())
      const displaced = plan.displaced
      // Static rows are never persisted as generations; persist the uninstall
      // as a tombstone so the bundle row stays uninstalled across restarts.
      if (record.origin === 'static') {
        try {
          const tombstone: StatusRecord = {
            v: 1,
            currentGen: 0,
            previousGen: null,
            status: 'uninstalled',
            provenance: { origin: 'static', mountedAt: this.now() },
          }
          const tools = record.generations.at(-1)?.registrations
            .filter((registration): registration is Extract<StagedRegistration, { readonly kind: 'tool' }> => registration.kind === 'tool')
            .map(registration => registration.definition.name)
          if (tools !== undefined && tools.length > 0) tombstone.tools = tools
          await this.store.writeStatus(id, tombstone)
        } catch (error) {
          throw fail('persist-failed', { operation: 'uninstall', table: 'status' }, id, error)
        }
      }
      for (const registration of record.generations.at(-1)?.registrations ?? []) {
        if (registration.kind === 'tool') {
          this.toolTombstones.set(registration.definition.name, { pluginId: id })
        }
      }
      if (record.origin !== 'static') {
        try {
          await this.store.deletePlugin(id)
        } catch (error) {
          throw fail('persist-failed', { operation: 'uninstall', table: 'status' }, id, error)
        }
      }
      try {
        await this.persistence?.snapshots.deleteAll(id)
      } catch {
        // Snapshot cleanup is best-effort: orphan files are boot-GC'd.
      }
      this.releaseRecord(record)
      this.records.delete(id)
      this.policyReports.delete(id)
      this.refreshOrders()
      this.emit('plugin/uninstalled', {
        ...this.eventPayload(id, this.manifestOf(record), this.generationNumber(record)),
        displaced,
      })
    })
  }

  /**
   * Enable: create-class write order (commit → persist → return).
   * @param id - plugin id to enable.
   */
  async enable(id: string): Promise<void> {
    if (this.isBundleMember(id)) {
      const plan = planOperation({ op: 'enable', id }, this.planState())
      if (!plan.accepted || plan.error !== undefined) {
        throw fail(plan.error?.code ?? 'compatibility-conflict', { plugin: id }, id)
      }
      this.bundleRail?.enable(id)
      return
    }
    return this.withLock(id, 'enable', async () => {
      const record = this.requireRecord(id, 'enable')
      if (record.status === 'enabled') return
      // Shadowed dynamic rows stay inert while the static incumbent owns the id.
      if (record.status === 'shadowed') return
      // Disable revoked the generation's host side effects (index taps,
      // skill providers, upgrade routes). Re-enabling must remount: the same
      // code and config through the HMR replace protocol re-runs apply and
      // re-registers the host effects without restarting sessions.
      if (record.hostSideEffectsDropped === true) {
        const generation = record.generations.at(-1)
        const definition = generation?.manifest
        if (definition === undefined) {
          throw fail('plugin-not-found', { id, operation: 'enable' }, id)
        }
        await this.replaceWithDefinition(
          id,
          record.source,
          definition,
          false,
          generation?.resolvedConfig,
        )
        delete record.hostSideEffectsDropped
        this.emit('plugin/enabled', this.eventPayload(id, this.manifestOf(record), this.generationNumber(record)))
        return
      }
      const definition = record.generations.at(-1)?.manifest
      if (definition !== undefined) this.assertCompatibility(definition)
      const generation = record.generations.at(-1)
      if (generation !== undefined && !generation.mounted) {
        await this.mountDeclared(record, generation)
        return
      }
      record.status = 'enabled'
      delete record.reason
      this.refreshOrders()
      if (record.origin !== 'static') {
        try {
          await this.store.writeStatus(id, this.statusRecord(record))
        } catch (error) {
          record.status = 'disabled'
          this.refreshOrders()
          throw fail('persist-failed', { operation: 'enable', table: 'status' }, id, error)
        }
      }
      this.emit('plugin/enabled', this.eventPayload(id, this.manifestOf(record), this.generationNumber(record)))
    })
  }

  /** Mount a recovered-disabled generation: stage, apply, persist (#17 closure). */
  private async mountDeclared(record: ManagedRecord, declared: EngineGeneration): Promise<void> {
    const definition = await this.resolveSource(record.source as PluginSource)
    const snapshot = record.snapshot === undefined
      ? undefined
      : await this.persistence?.snapshots.read(
        record.id,
        declared.number,
        record.snapshot,
        (message) => { this.logger.warn(message) },
      )
    const previous = { generation: declared.number, version: declared.manifest.version }
    const staged = await this.stageNew(definition, record.source, declared.resolvedConfig, previous, snapshot)
    this.assertToolNamesAvailable(staged, record.id)
    const previousOrders = this.deriveOrderMap()
    this.applyRegistrations(staged)
    this.updateProvideTable(staged, record.id)
    this.updateToolTable(staged, record.id)
    this.updateHttpRouteTable(staged, record.id)
    this.updateSkillTable(staged, record.id)
    this.updateCommandTable(staged, record.id)
    record.generations.push(staged)
    record.status = 'enabled'
    delete record.reason
    const previousSnapshot = record.snapshot
    delete record.snapshot
    this.refreshOrders()
    try {
      await this.store.writeGeneration(record.id, staged.number, {
        v: 1,
        source: record.source,
        manifest: definition,
        resolvedConfig: staged.resolvedConfig,
      })
      await this.store.writeStatus(record.id, { ...this.statusRecord(record), status: 'enabled' })
    } catch (error) {
      this.compensate(record.id, staged, previousOrders, null)
      record.generations = record.generations.filter(candidate => candidate.number !== staged.number)
      record.status = 'disabled'
      if (previousSnapshot === undefined) delete record.snapshot
      else record.snapshot = previousSnapshot
      this.refreshOrders()
      throw fail('persist-failed', { operation: 'enable', table: 'status' }, record.id, error)
    }
    // mountDeclared only runs for recovered dynamic rows; static records are
    // always mounted through adoptStatic.
    await this.auditMount(record.id, definition.version, staged.number, record.origin as InstallOrigin)
    this.emit('plugin/activated', this.eventPayload(record.id, definition, staged.number))
    this.emit('plugin/enabled', this.eventPayload(record.id, this.manifestOf(record), this.generationNumber(record)))
  }

  /**
   * Disable: delete-class write order (persist first, then runtime removal).
   * @param id - plugin id to disable.
   * @param reason - optional durable reason stamped on the status row.
   */
  async disable(id: string, reason?: string, force = false): Promise<void> {
    if (this.isBundleMember(id)) {
      const plan = planOperation({ op: 'disable', id, force }, this.planState())
      if (!plan.accepted || plan.error !== undefined) {
        const dependents = (plan.error?.details?.dependents as readonly string[] | undefined) ?? []
        throw fail('dependent-exists', { dependents }, id)
      }
      this.bundleRail?.disable(id)
      return
    }
    return this.withLock(id, 'disable', async () => {
      const record = this.requireRecord(id, 'disable')
      if (record.status === 'disabled') return
      if (record.status === 'shadowed') return
      // 求解器级联停用已删除（2026-08-13 范围重塑）：有 requires 级下游时
      // 只能显式 force 或先停用下游。
      const plan = planOperation({ op: 'disable', id, force }, this.planState())
      if (!plan.accepted) {
        const dependents = (plan.error?.details?.dependents as readonly string[] | undefined) ?? []
        throw fail('dependent-exists', { dependents }, id)
      }
      // Delete-class persist first for dynamic rows; static records never
      // write a phantom status row into the registry.
      if (record.origin !== 'static') {
        try {
          await this.store.writeStatus(id, {
            ...this.statusRecord(record, reason),
            status: 'disabled',
          })
        } catch (error) {
          throw fail('persist-failed', { operation: 'disable', table: 'status' }, id, error)
        }
      }
      record.status = 'disabled'
      if (reason === undefined) delete record.reason
      else record.reason = reason
      // Revoke hot-revocable host side effects (the reason `disable` keeps
      // dispatch registrations live is the "stopped" interception semantics;
      // host side effects have no such gate and must leave now).
      const generation = record.generations.at(-1)
      if (generation !== undefined && generation.hostEffectDisposers.length > 0) {
        for (const disposer of generation.hostEffectDisposers) {
          try {
            disposer()
          } catch (error) {
            this.logger.warn(`plugin ${id} disable host effect disposer failed: ${String(error)}`)
          }
        }
        generation.hostEffectDisposers.length = 0
        record.hostSideEffectsDropped = true
      }
      // 宿主监听器与 host-effect 同属「disable 立即撤销」线（applyRegistrations
      // 注释承诺）；修复批次 2 起宿主监听器存于 policyHostDisposers，随本处撤销。
      if (generation !== undefined && generation.policyHostDisposers.length > 0) {
        for (const disposer of generation.policyHostDisposers) {
          try {
            disposer()
          } catch (error) {
            this.logger.warn(`plugin ${id} disable host listener disposer failed: ${String(error)}`)
          }
        }
        generation.policyHostDisposers.length = 0
      }
      // Settings namespaces ride the same hot-revocable line: a disabled
      // plugin must not keep its Settings UI row (or its namespace claim)
      // while stopped; enable remounts them through the replace protocol.
      const settingsOwner = generation?.settingsOwner
      if (settingsOwner !== undefined) {
        delete generation!.settingsOwner
        generation!.settingsOwnerDisposal = Promise.resolve(settingsOwner.fiber.dispose()).catch(() => undefined)
        record.hostSideEffectsDropped = true
      }
      if (generation !== undefined) await this.disposeGenerationBounded(generation)
      this.refreshOrders()
      this.emit('plugin/disabled', {
        ...this.eventPayload(id, this.manifestOf(record), this.generationNumber(record)),
        ...(reason === undefined ? {} : { reason }),
      })
    })
  }

  /**
   * Replace: the seven-step protocol (§14).
   * @param id - plugin id whose generation is replaced.
   * @param source - the new source; `resolveSource` resolves it inside the plan.
   * @param options - force flag and replacement config.
   * @returns the managed handle of the replaced plugin.
   */
  async replace(
    id: string,
    source: PluginSource,
    options: { readonly force?: boolean; readonly config?: unknown } = {},
  ): Promise<PluginHandleInfo> {
    return this.withLock(id, 'replace', async () => {
      this.requireRecord(id, 'replace')
      const definition = await this.resolveSource(source)
      return this.replaceWithDefinition(id, source, definition, options.force === true, options.config)
    })
  }

  /**
   * Hot-config update: reuse the replace path with the same code (HP:98).
   * 空操作短路（HMR 体验）：patch 解析后与当前 live 代 resolvedConfig
   * deep-equal 时直接返回，不 bump generation、不重跑 apply、不发
   * `plugin/replaced`——与 adoptStatic 的同代幂等守卫同口径。
   *
   * Revision 层（mygo native）：expectedRevision 可选；携带时在锁内、写盘前
   * 校验当前 config revision，过期抛 `config-revision-conflict`。revision
   * 只随 stored config 实际变化推进；no-op 写不推进。
   * @param id - plugin id to reconfigure.
   * @param patch - new resolved config value.
   * @param expectedRevision - revision the caller read; stale writes are refused.
   */
  async updateConfig(id: string, patch: unknown, expectedRevision?: number): Promise<void> {
    await this.withLock(id, 'updateConfig', async () => {
      const record = this.requireRecord(id, 'updateConfig')
      const manifest = record.generations.at(-1)?.manifest
      if (manifest === undefined) {
        throw fail('staging-failed', { stage: 'cache', cause: 'no generation to update' }, id)
      }
      const before = this.configOf(id)
      const currentRevision = this.configRevisionOf(id)
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        throw fail(
          'config-revision-conflict',
          { id, expected: expectedRevision, actual: currentRevision },
          id,
        )
      }
      // 先解析校验（非法 patch 依旧 manifest-invalid 失败），再与 live 代比较。
      const resolved = this.resolveConfig(manifest, patch)
      const live = record.generations.at(-1)
      if (record.status === 'enabled' && live !== undefined && live.mounted && isDeepStrictEqual(resolved, live.resolvedConfig)) {
        this.advanceConfigRevision(id, before, before)
        return
      }
      await this.replaceWithDefinition(id, record.source, manifest, false, patch)
      this.advanceConfigRevision(id, before, this.configOf(id))
    })
  }

  /** 读当前 config revision；首次读为 0，config 值变化时 +1。 */
  configRevisionOf(id: string): number | undefined {
    const record = this.records.get(id)
    if (record === undefined) return undefined
    const value = this.configOf(id)
    const fingerprint = configFingerprint(value)
    const current = this.configRevisions.get(id)
    if (current === undefined) {
      this.configRevisions.set(id, { revision: 0, fingerprint })
      return 0
    }
    if (current.fingerprint !== fingerprint) {
      current.revision += 1
      current.fingerprint = fingerprint
    }
    return current.revision
  }

  /** 写入后推进 revision；值未变则不动。 */
  private advanceConfigRevision(id: string, before: unknown, after: unknown): number {
    const current = this.configRevisions.get(id) ?? { revision: 0, fingerprint: configFingerprint(before) }
    const fingerprint = configFingerprint(after)
    if (current.fingerprint !== fingerprint) {
      current.revision += 1
      current.fingerprint = fingerprint
    }
    this.configRevisions.set(id, current)
    return current.revision
  }

  /**
   * Return to a cached generation: a fresh replace with the cache as source (HP:138).
   * @param id - plugin id to roll back.
   * @param generation - cached generation number to restore.
   * @returns the managed handle of the restored plugin.
   */
  async replaceToGeneration(id: string, generation: number): Promise<PluginHandleInfo> {
    return this.withLock(id, 'replace', async () => {
      const record = this.requireRecord(id, 'replace')
      const cached = record.generations.find(candidate => candidate.number === generation)
      if (cached === undefined) {
        throw fail('staging-failed', { stage: 'cache', cause: `generation ${generation} not retained` }, id)
      }
      try {
        return await this.replaceWithDefinition(id, cached.source, cached.manifest, false, cached.resolvedConfig)
      } catch (error) {
        if (error instanceof PluginError && isRelationshipCode(error.code)) {
          throw fail('companion-conflict', { companion: firstPeer(error.details, id) }, id, error)
        }
        throw error
      }
    })
  }

  /**
   * Read-only view of the managed set.
   * @returns handles sorted by plugin id.
   */
  plugins(): readonly PluginHandleInfo[] {
    return [...this.records.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(record => this.handleOf(record))
  }

  /** 当前政策/反应式状态（缺省 active）。 */
  private policyStatusOf(record: ManagedRecord): 'active' | 'inactive' | 'policy-rejected' {
    return record.policyStatus ?? 'active'
  }

  /**
   * requires 政策闸（B6，修复批次 2 执行面接线 / A1）：服务级依赖仅运行期求值；
   * 违例 → 政策停用（policyStop：provide 不解析、方法不可达、事件不投递），
   * 提供者满足 → 真实恢复（policyStart，EB-D16 INACTIVE 自动激活）。
   * 不进依赖图、安装期不阻断。每次 provide 状态变更后调用。
   */
  private reconcileRequiresGates(): void {
    // 原型安全（修复批次 2 / review#1 A1）：null-prototype 聚合表，键名
    // "toString"/"constructor" 等服务名不会命中 Object.prototype。
    const snapshots = Object.create(null) as Record<string, ProviderSymbolSnapshot | undefined>
    for (const { service, snapshot } of this.fineEpochRegistry.entries()) {
      snapshots[service] = snapshot
    }
    const observations = Object.create(null) as Record<string, readonly ProviderObservation[]>
    for (const record of this.providerObservationRegistry().entries()) {
      observations[record.service] = [...(observations[record.service] ?? []), record]
    }
    const symbolsByPlugin = this.symbolsByPlugin()
    for (const record of this.records.values()) {
      if (record.status !== 'enabled') continue
      const generation = record.generations.at(-1)
      const requires = generation?.manifest.serviceRequires
      if (requires === undefined || Object.keys(requires).length === 0) {
        if (record.policyStatus === 'inactive') this.policyStart(record)
        else record.policyStatus = 'active'
        continue
      }
      const ownSymbols = symbolsByPlugin.get(record.id)
      const result: RequiresGateResult = evaluateRequiresGate({
        pluginId: record.id,
        requires,
        snapshots,
        observations,
        ...(ownSymbols === undefined ? {} : { consumerSymbols: ownSymbols }),
      })
      if (result.ok) {
        if (record.policyStatus === 'inactive') this.policyStart(record)
        else record.policyStatus = 'active'
        continue
      }
      if (record.policyStatus !== 'inactive') this.policyStop(record)
      this.policyReports.set(record.id, requiresGateReport(result))
      for (const violation of result.violations) {
        this.logger.warn(
          `requires-gate: plugin ${record.id} 服务 ${violation.service} ${violation.kind}`
          + `（区间 ${violation.range}${violation.providerVersion === undefined ? '' : `，提供者 ${violation.providerVersion}`}`
          + `${violation.missingSymbols === undefined ? '' : `，缺失符号 ${violation.missingSymbols.join(',')}`}）`,
        )
      }
    }
  }

  /** A15：按消费者 pluginId 聚合动态符号访问（无跨消费者交叉污染）。 */
  private symbolsByPlugin(): Map<string, Record<string, readonly string[]>> {
    const byPlugin = new Map<string, Record<string, string[]>>()
    for (const access of this.providedAccessRecords) {
      let byCapability = byPlugin.get(access.pluginId)
      if (byCapability === undefined) {
        byCapability = Object.create(null) as Record<string, string[]>
        byPlugin.set(access.pluginId, byCapability)
      }
      const current = byCapability[access.capability] ?? []
      if (!current.includes(access.symbol)) byCapability[access.capability] = [...current, access.symbol]
    }
    return byPlugin
  }

  /**
   * 政策停用（修复批次 2 / A1 执行面）：撤销事件面（受管 dispatch + 宿主
   * 监听器）、提供面（provideTable + seam + 记账）、方法面（工具/提示/路由/
   * 技能/命令/入口贡献）。不跑 deactivate/dispose 钩子、不动 effect 与设置
   * 命名空间——政策停用可逆（policyStart 重建），插件自持资源保持。
   */
  private policyStop(record: ManagedRecord): void {
    if (record.policyStatus === 'inactive') return
    const generation = record.generations.at(-1)
    if (generation === undefined) return
    record.policyStatus = 'inactive'
    for (const disposer of generation.policyDisposers.splice(0)) {
      try {
        disposer()
      } catch (error) {
        this.logger.warn(`plugin ${record.id} policy stop listener disposer failed: ${String(error)}`)
      }
    }
    for (const disposer of generation.policyHostDisposers.splice(0)) {
      try {
        disposer()
      } catch (error) {
        this.logger.warn(`plugin ${record.id} policy stop host listener disposer failed: ${String(error)}`)
      }
    }
    for (const capability of generation.provides.keys()) {
      const entry = this.provideTable.get(capability)
      if (entry?.pluginId === record.id) {
        this.provideTable.delete(capability)
        this.dropProvideAccounting(capability, record.id)
      }
    }
    for (const name of generation.tools.keys()) {
      if (this.toolIndirections.get(name)?.pluginId === record.id) this.toolIndirections.delete(name)
    }
    for (const name of generation.promptSections.keys()) {
      if (this.promptSectionTable.get(name)?.pluginId === record.id) this.promptSectionTable.delete(name)
    }
    for (const key of generation.httpRoutes.keys()) {
      if (this.httpRouteIndirections.get(key)?.pluginId === record.id) this.httpRouteIndirections.delete(key)
    }
    for (const name of generation.skills.keys()) {
      if (this.skillIndirections.get(name)?.pluginId === record.id) this.skillIndirections.delete(name)
    }
    for (const name of generation.commands.keys()) {
      if (this.commandIndirections.get(name)?.pluginId === record.id) this.commandIndirections.delete(name)
    }
    for (const token of generation.entrypointTokens.splice(0)) this.entrypoints.removeToken(token)
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
  }

  /**
   * 政策恢复（修复批次 2 / A1 执行面）：重挂可逆执行面——listener /
   * host-listener / entrypoint 从既有注册表重建，提供与工具等由
   * update*Table 从世代 Map 重建。不重跑 activate（EB-D16 自动激活语义）。
   */
  private policyStart(record: ManagedRecord): void {
    if (record.policyStatus !== 'inactive') return
    const generation = record.generations.at(-1)
    if (generation === undefined) return
    this.applyPolicyFace(generation)
    this.updateProvideTable(generation, record.id)
    this.updateToolTable(generation, record.id)
    this.updatePromptSectionTable(generation, record.id)
    this.updateHttpRouteTable(generation, record.id)
    this.updateSkillTable(generation, record.id)
    this.updateCommandTable(generation, record.id)
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.refreshOrders()
    record.policyStatus = 'active'
    this.policyReports.delete(record.id)
  }

  /** 政策恢复专用重建：仅可逆执行面（listener / host-listener / entrypoint）。 */
  private applyPolicyFace(generation: EngineGeneration): void {
    for (const registration of generation.registrations) {
      if (registration.kind === 'listener') {
        if (!this.dispatch.knows(registration.event)) {
          this.dispatch.declareEvent(registration.event)
        }
        const disposer = this.dispatch.register(registration.event, {
          pluginId: registration.pluginId,
          mode: registration.mode,
          position: registration.position,
          ...(registration.returns === undefined ? {} : { returns: registration.returns }),
          ...(registration.scope === undefined ? {} : { scope: registration.scope }),
          listener: registration.listener,
        })
        generation.policyDisposers.push(disposer)
      } else if (registration.kind === 'host-listener') {
        const host = this.ctx as unknown as {
          on(
            name: string,
            listener: (...args: unknown[]) => unknown,
            options?: { readonly prepend?: boolean },
          ): () => boolean
          once(
            name: string,
            listener: (...args: unknown[]) => unknown,
            options?: { readonly prepend?: boolean },
          ): () => boolean
        }
        const options = registration.prepend === true ? { prepend: true } : undefined
        const disposer = registration.once === true
          ? host.once(registration.event, registration.listener, options)
          : host.on(registration.event, registration.listener, options)
        generation.policyHostDisposers.push(disposer)
      } else if (registration.kind === 'entrypoint') {
        const token = this.entrypoints.add(registration.pluginId, registration.key, registration.raw)
        generation.entrypointTokens.push(token)
      }
    }
  }

  /**
   * A2 reload 前置门（replaceTables 消费）：提供者换代后，把消费者的被用符号
   * 投影对照新导出快照；缺符号 → 政策停用 + symbol-missing 报告
   * （词汇分工：符号缺失 → symbol-missing，任务 2.2）。
   */
  private verifyConsumerSymbolsAfterReplace(next: EngineGeneration): void {
    const capabilities = [...next.provides.keys()]
    if (capabilities.length === 0) return
    const symbolsByPlugin = this.symbolsByPlugin()
    for (const record of this.records.values()) {
      if (record.status !== 'enabled' || record.id === next.manifest.id) continue
      const requires = record.generations.at(-1)?.manifest.serviceRequires
      if (requires === undefined) continue
      const used = symbolsByPlugin.get(record.id)
      if (used === undefined) continue
      const violations: {
        readonly kind: 'symbol-missing'
        readonly service: string
        readonly range: string
        readonly providerVersion?: string
        readonly missingSymbols?: readonly string[]
        readonly candidates: readonly ProviderObservation[]
      }[] = []
      for (const capability of capabilities) {
        if (!Object.prototype.hasOwnProperty.call(requires, capability)) continue
        const symbols = used[capability]
        if (symbols === undefined || symbols.length === 0) continue
        const snapshot = this.fineEpochRegistry.get(capability)
        const gate = preGate(symbols, snapshot)
        if (gate.ok) continue
        const rawRange = requires[capability]
        violations.push({
          kind: 'symbol-missing',
          service: capability,
          range: (Array.isArray(rawRange) ? rawRange : [rawRange]).join(' || '),
          ...(snapshot?.version === undefined ? {} : { providerVersion: snapshot.version }),
          missingSymbols: gate.missing,
          candidates: this.providerObservationRegistry().candidates(capability),
        })
      }
      if (violations.length === 0) continue
      this.policyStop(record)
      this.policyReports.set(record.id, requiresGateReport({ pluginId: record.id, ok: false, violations }))
      for (const violation of violations) {
        this.logger.warn(
          `pre-gate: plugin ${record.id} 服务 ${violation.service} symbol-missing`
          + `（缺失符号 ${(violation.missingSymbols ?? []).join(',')}）`,
        )
      }
    }
  }

  /** A14：真实撤下一条提供——摘表 + 摘记账 + 政策重估（后续解析失败）。 */
  removeProvidedValue(pluginId: string, capability: string): void {
    const entry = this.provideTable.get(capability)
    if (entry?.pluginId !== pluginId) return
    this.provideTable.delete(capability)
    this.dropProvideAccounting(capability, pluginId)
    // 政策恢复不得复活已被撤下的提供：同步从世代 provides Map 摘除。
    this.records.get(pluginId)?.generations.at(-1)?.provides.delete(capability)
    this.syncProvideState()
    this.reconcileRequiresGates()
  }

  /** 最近一次 requires/symbol 政策报告（修复批次 2 / A1 报告面）。 */
  policyReportOf(id: string): ServiceResolutionReport | undefined {
    return this.policyReports.get(id)
  }

  /**
   * Current resolved config of one managed plugin's live generation.
   * @param id - plugin id.
   * @returns the resolved config, or `undefined` when unknown.
   */
  configOf(id: string): unknown | undefined {
    const record = this.records.get(id)
    if (record === undefined) return undefined
    return record.generations.at(-1)?.resolvedConfig
  }

  /**
   * Plan preview against the current managed set (§15.3/PO:242). Async since
   * install/replace resolve their source through the manager's resolver;
   * resolution is pure-read — no fiber, no hooks, no registry writes
   * (2026-08-08 ruling #4).
   * @param operation - the operation to preview.
   * @returns the plan verdict.
   */
  async plan(operation: PluginOperation): Promise<PluginOperationPlan> {
    if (operation.op === 'install') {
      const definition = await this.resolveSourcePreview(operation.source)
      return planOperation({ op: 'install', plugin: declarationOf(definition) }, this.planState())
    }
    if (operation.op === 'replace') {
      const definition = await this.resolveSourcePreview(operation.source)
      return planOperation({
        op: 'replace',
        id: operation.id,
        plugin: declarationOf(definition),
        force: operation.force === true,
      }, this.planState())
    }
    return planOperation(
      {
        op: operation.op,
        id: operation.id,
        ...(operation.op === 'disable' && operation.force === true ? { force: true } : {}),
      },
      this.planState(),
    )
  }

  /**
   * Plan one declarative install from `dsh.mygo` metadata. The panel calls
   * this before writing a bridge row so required-by actions and warnings are
   * visible; resolution is pure and never mutates state.
   */
  async planInstall(declaration: {
    readonly id: string
    readonly version?: string
    readonly compatibility?: PluginCompatibility
    readonly provides?: readonly string[]
  }): Promise<PluginOperationPlan> {
    const definition: PluginDefinition = {
      ...emptyManifest(declaration.id),
      version: declaration.version ?? '0.0.0-raw',
      ...(declaration.compatibility === undefined ? {} : { compatibility: declaration.compatibility }),
      provides: [...(declaration.provides ?? [])],
    }
    return planOperation({ op: 'install', plugin: this.declarationFromDefinition(definition) }, this.planState())
  }

  /** Bundle rail members (empty when the rail is not wired). */
  bundleList(): readonly BundleMember[] {
    return this.bundleRail?.members() ?? []
  }

  /** Install one profile bundle via the official CLI. */
  async bundleInstall(spec: string): Promise<BundleInstallResult> {
    if (this.bundleRail === undefined) throw new Error('bundle rail 未启用')
    const env = await this.resolveSpawnEnv()
    const member = this.bundleRail.install(spec, env === undefined ? {} : { env })
    const plan = this.verifyBundleInstall(member)
    if (!plan.accepted || plan.error !== undefined) {
      try {
        this.bundleRail.uninstall(member.id)
      } catch {
        // rollback is best-effort; the rejection below names the conflict
      }
      throw new PluginError(
        plan.error?.code ?? 'compatibility-conflict',
        plan.error?.message ?? 'bundle install 校验未通过',
        {
          plugin: member.id,
          ...(plan.error?.details === undefined ? {} : { ...plan.error.details }),
        },
        member.id,
      )
    }
    const activated = await this.activateLiveRail(member)
    return { member, plan, activated }
  }

  /**
   * r7 live rail：实例在跑（host loader 可达）时把新装 bundle 切到 live
   * 轨——先移出 dsh.profile.bundles（单轨规则：同 id 双 insert 对 boot 是
   * exit=1 致命错误；且必须先于预检，否则离线组合树已含新 bundle 的行，
   * 预检会自撞假阳性）→ 离线组合预检 id 撞车 → 冻结层守卫（行已被 boot
   * 轨 frozen bundlePatches 物化时保持 boot 轨不写块——冻结层在实例存活
   * 期不变，写块会构成运行期双 insert 毒化后续每次重放，rc8 e2e 实测
   * 抓出）→ 写受管 live 块 → 轮询验证激活。任一步失败回滚（剥块 /
   * 回 bundles / bundleRail.uninstall）并抛错。loader 不可达（CLI 等
   * 实例外形态）保持 boot 轨，下次 boot 物化。
   */
  private async activateLiveRail(member: BundleMember): Promise<'live' | 'pending-restart'> {
    if (this.bundleRail === undefined) return 'pending-restart'
    if (loaderEntrySnapshot((name: string) => this.ctx.get(name)) === undefined) return 'pending-restart'
    const home = this.bundleRail.homeDir()
    const profile = this.bundleRail.profileName()
    const dir = this.bundleRail.resolveBundleDir(member.packageName)
    if (dir === undefined) return 'pending-restart'
    const rollback = (): void => {
      try {
        liveUninstall(home, profile, member.packageName)
      } catch {
        // 剥块尽力而为；下面整包回滚后由 removePatchRows 口径兜底
      }
      this.restoreBootRail(member.packageName)
      try {
        this.bundleRail?.uninstall(member.id)
      } catch {
        // rollback is best-effort; the rejection below names the cause
      }
    }
    this.removeFromBootRail(member.packageName)
    const pre = await precheckLiveInstall(home, profile, dir)
    for (const warning of pre.warnings) this.logger.warn(`live rail: ${warning}`)
    if (!pre.ok) {
      rollback()
      throw new PluginError(
        'compatibility-conflict',
        pre.error ?? 'live rail 预检未通过',
        { plugin: member.id },
        member.id,
      )
    }
    // 冻结层守卫：insert 行已被 boot 轨 frozen bundlePatches 物化（重复
    // 安装/官方 CLI 先装过）时保持 boot 轨、不写 live 块——冻结层在实例
    // 存活期不变，写块会构成运行期同 id 双 insert 毒化后续每次重放。
    // 行当前即激活态，返回 'live' 如实上报。
    if (pre.rowIds.length > 0
      && await verifyEntryState((name: string) => this.ctx.get(name), pre.rowIds, 'active', 1, 1)) {
      this.restoreBootRail(member.packageName)
      return 'live'
    }
    const written = writeLiveBlock(home, profile, member.packageName, dir)
    if (!written.ok) {
      rollback()
      throw new PluginError(
        'bundle-invalid',
        written.error ?? 'live 块写入失败',
        { plugin: member.id },
        member.id,
      )
    }
    const mounted = await verifyEntryState((name: string) => this.ctx.get(name), written.rowIds, 'active')
    if (!mounted) {
      rollback()
      throw new PluginError(
        'swap-timeout',
        `live 重放验证超时（行 ${written.rowIds.join('、') || '(无 insert 行)'} 未激活；已回滚，bundle 未安装）`,
        { plugin: member.id },
        member.id,
      )
    }
    return 'live'
  }

  /** 单轨切换：把包移出 dsh.profile.bundles（live 块接管物化）。 */
  private removeFromBootRail(packageName: string): void {
    if (this.bundleRail === undefined) return
    const { dependencies, bundles } = this.bundleRail.readManifest()
    if (!bundles.includes(packageName)) return
    this.bundleRail.writeManifest({
      dependencies,
      bundles: bundles.filter(bundle => bundle !== packageName),
    })
  }

  /** removeFromBootRail 的逆操作（live 写块/验证失败的回滚）。 */
  private restoreBootRail(packageName: string): void {
    if (this.bundleRail === undefined) return
    const { dependencies, bundles } = this.bundleRail.readManifest()
    if (bundles.includes(packageName)) return
    this.bundleRail.writeManifest({ dependencies, bundles: [...bundles, packageName] })
  }

  /**
   * Pre-apply verify of one newly installed bundle member (2026-08-13 范围
   * 重塑：激活求解器已删除，改用纯求值的 plan 预览——兼容预检 + 关系冲突，
   * 无级联动作）。
   */
  private verifyBundleInstall(member: BundleMember): PluginOperationPlan {
    const state = this.planState()
    const filtered: PlanState = {
      ...state,
      plugins: state.plugins.filter(plugin => plugin.id !== member.id),
    }
    const incoming: PluginDeclarationInput = {
      id: member.id,
      ...(member.version === undefined ? {} : { version: member.version }),
      permissions: emptyPermissions(),
      requires: [],
      provides: member.provides ?? [],
      enabled: true,
      origin: 'static',
      rail: 'bundle',
      ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
    }
    return planOperation({ op: 'install', plugin: incoming }, filtered)
  }

  /** Uninstall one profile bundle (dependents block first, no force). */
  async bundleUninstall(id: string): Promise<void> {
    if (this.bundleRail === undefined) throw new Error('bundle rail 未启用')
    const activationPlan = planOperation({ op: 'uninstall', id }, this.planState())
    if (!activationPlan.accepted || activationPlan.error !== undefined) {
      const dependents = (activationPlan.error?.details?.dependents as readonly string[] | undefined) ?? []
      throw fail(activationPlan.error?.code === 'dependent-exists' ? 'dependent-exists' : 'compatibility-conflict', {
        ...(dependents.length > 0 ? { dependents } : {}),
        ...(activationPlan.error?.details === undefined ? {} : { ...activationPlan.error.details }),
      }, id)
    }
    const env = await this.resolveSpawnEnv()
    this.bundleRail.uninstall(id, env === undefined ? {} : { env })
  }

  /**
   * rc8 registry auth：spawn 前把 profile .npmrc 受管块的 `${REF}` 占位经
   * host credentials 服务解析成子进程 env 增量（按操作解析不缓存）；
   * 服务缺席/未配置只 warn 不阻断（pnpm 自己的 401 是最清楚的报错）。
   */
  private async resolveSpawnEnv(): Promise<Record<string, string> | undefined> {
    if (this.bundleRail === undefined) return undefined
    const credentials = this.ctx.get('credentials') as CredentialsLike | undefined
    const { env, missing } = await resolveProfileEnv(
      this.bundleRail.homeDir(),
      this.bundleRail.profileName(),
      credentials,
    )
    for (const ref of missing) {
      this.logger.warn(
        `registry auth：引用 ${ref} ${credentials === undefined ? '的 credentials 服务缺席' : '未配置'}`
        + '——若该源需要认证，pnpm 将以匿名请求（可能 401）',
      )
    }
    return Object.keys(env).length === 0 ? undefined : { ...env }
  }

  /** Enable/disable one profile bundle (routes through the unified graph). */
  async bundleSetEnabled(id: string, enabled: boolean, force = false): Promise<void> {
    if (this.bundleRail === undefined) throw new Error('bundle rail 未启用')
    if (enabled) await this.enable(id)
    else await this.disable(id, undefined, force)
  }

  /**
   * T4 boot recovery: revalidate every row, mount or quarantine, then GC.
   * @returns the recovery report of every row processed.
   */
  async recover(): Promise<LifecycleRecoveryReport> {
    const rows: RecoveryRow[] = []
    let orphanGenerations = 0
    let historyTrimmed = 0
    const rawIds = await this.store.listIds()
    const ids = this.recoverOrder === undefined
      ? rawIds
      : [...rawIds].sort((left, right) => {
          const li = this.recoverOrder?.indexOf(left) ?? -1
          const ri = this.recoverOrder?.indexOf(right) ?? -1
          if (li === -1 && ri === -1) return left < right ? -1 : left > right ? 1 : 0
          if (li === -1) return 1
          if (ri === -1) return -1
          return li - ri
        })
    for (const id of ids) {
      let status: StatusRecord | undefined
      try {
        status = await this.store.readStatus(id)
      } catch {
        await this.store.writeStatus(id, {
          v: 1,
          currentGen: 0,
          previousGen: null,
          status: 'quarantined',
          reason: 'damaged-record',
          provenance: { origin: 'runtime-api', mountedAt: 0 },
        })
        await this.auditRecovery('quarantine', id, 'damaged-record')
        rows.push({ id, status: 'quarantined', reason: 'damaged-record' })
        continue
      }
      if (status === undefined) {
        await this.store.deletePlugin(id)
        orphanGenerations += 1
        rows.push({ id, status: 'gc', reason: 'orphan' })
        continue
      }
      if (status.status === 'uninstalled') {
        // Keep the tombstone row: it is the durable record that a bundle row
        // stays uninstalled, and it carries the tool names for friendly
        // unknown-tool attribution.
        for (const tool of status.tools ?? []) {
          this.toolTombstones.set(tool, { pluginId: id })
        }
        rows.push({ id, status: 'ignored', reason: 'uninstalled-tombstone' })
        continue
      }
      if (this.staticIds.has(id)) {
        await this.store.writeStatus(id, { ...status, status: 'shadowed', reason: 'shadowed' })
        await this.auditRecovery('shadow', id, 'shadowed')
        // The dynamic row stays visible with status shadowed (T2-4): the
        // record is generation-less until the static incumbent adopts the id
        // or the operator revives it through a replace.
        this.records.set(id, {
          id,
          origin: status.provenance.origin,
          source: { type: 'inline', code: '' },
          status: 'shadowed',
          reason: 'shadowed',
          generations: [],
          state: undefined,
        })
        rows.push({ id, status: 'shadowed', reason: 'shadowed' })
        continue
      }
      let gens: readonly { readonly gen: number; readonly record: GenerationRecord }[]
      try {
        gens = await this.store.readGenerations(id)
      } catch {
        await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'damaged-record' })
        await this.auditRecovery('quarantine', id, 'damaged-record')
        rows.push({ id, status: 'quarantined', reason: 'damaged-record' })
        continue
      }
      const current = gens.find(entry => entry.gen === status.currentGen)
      if (current === undefined) {
        await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'damaged-record' })
        await this.auditRecovery('quarantine', id, 'damaged-record')
        rows.push({ id, status: 'quarantined', reason: 'damaged-record' })
        continue
      }
      const record = current.record
      if ((record as { readonly v?: unknown }).v !== 1 || !isManifestShaped(record.manifest)) {
        await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'damaged-record' })
        await this.auditRecovery('quarantine', id, 'damaged-record')
        rows.push({ id, status: 'quarantined', reason: 'damaged-record' })
        continue
      }
      let definition: PluginDefinition
      try {
        definition = await this.resolveSource(record.source as PluginSource)
      } catch {
        await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'package-not-resolvable' })
        await this.auditRecovery('quarantine', id, 'package-not-resolvable')
        rows.push({ id, status: 'quarantined', reason: 'package-not-resolvable' })
        continue
      }
      try {
        this.validate(definition, status.provenance.origin, record.source)
      } catch (error) {
        // Mount validation always rejects with a PluginError.
        const code = (error as PluginError).code
        await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'validation-failed' })
        await this.auditRecovery('quarantine', id, 'validation-failed', { code })
        rows.push({ id, status: 'quarantined', reason: 'validation-failed', errorCode: code })
        continue
      }
      if (status.status === 'enabled') {
        const previous = { generation: status.currentGen, version: definition.version }
        const captured = status.snapshot === undefined
          ? undefined
          : await this.persistence?.snapshots.read(
            id,
            status.currentGen,
            status.snapshot,
            (message) => { this.logger.warn(message) },
          )
        let generation: EngineGeneration
        try {
          generation = await this.stageNew(definition, record.source, record.resolvedConfig, previous, captured)
          this.assertToolNamesAvailable(generation, id)
        } catch (error) {
          await this.store.writeStatus(id, { ...status, status: 'quarantined', reason: 'validation-failed' })
          await this.auditRecovery('quarantine', id, 'validation-failed', {
            code: errorCodeOf(error),
          })
          rows.push({ id, status: 'quarantined', reason: 'validation-failed', errorCode: errorCodeOf(error) })
          continue
        }
        const previousOrders = this.deriveOrderMap()
        await this.commitGeneration(id, status.provenance.origin, record.source, generation, 'enabled', previousOrders, null)
        await this.auditMount(
          id,
          definition.version,
          generation.number,
          status.provenance.origin as InstallOrigin,
        )
        rows.push({ id, status: 'restored' })
      } else {
        // Full disabled recovery (#17 closure): the manifest is restaged
        // without mounting, so declarations and dependency edges survive.
        // Quarantined rows stay status-only: their manifest failed the
        // environment's validation, so it is not trusted for declarations.
        const declared: EngineGeneration[] = status.status === 'disabled'
          ? [{
            number: status.currentGen,
            manifest: definition,
            code: record.source.type === 'inline' ? record.source.code : '',
            source: record.source,
            resolvedConfig: this.resolveConfig(definition, record.resolvedConfig),
            registrations: [],
            disposers: [],
            policyDisposers: [],
            policyHostDisposers: [],
            remainingEvents: new Set(),
            provides: new Map(),
            tools: new Map(),
            promptSections: new Map(),
            httpRoutes: new Map(),
            skills: new Map(),
            commands: new Map(),
            entrypointTokens: [],
            hostEffectDisposers: [],
            settingsRegistrations: [],
            mounted: false,
          }]
          : []
        this.records.set(id, {
          id,
          origin: status.provenance.origin,
          source: record.source,
          status: status.status,
          generations: declared,
          state: undefined,
          ...(status.snapshot === undefined ? {} : { snapshot: status.snapshot }),
          ...(status.reason === undefined ? {} : { reason: status.reason }),
        })
        rows.push({
          id,
          status: status.status === 'disabled' ? 'restored' : 'quarantined',
          ...(status.reason === undefined ? {} : { reason: status.reason }),
        })
      }
      const trimmed = await this.trimHistory(id, status)
      historyTrimmed += trimmed
    }
    for (const record of this.records.values()) {
      for (const generation of record.generations) {
        this.nextGeneration = Math.max(this.nextGeneration, generation.number + 1)
      }
    }
    // The recovery loop mounts rows in list order, which may not match
    // declaration order; re-check the complete set once and disable the
    // declaring violators deterministically.
    await this.reconcileCompatibility()
    if (this.persistence !== undefined) {
      const keep = new Set<string>()
      for (const record of this.records.values()) {
        const current = record.generations.at(-1)
        if (current !== undefined) keep.add(`${record.id}/${current.number}`)
      }
      const removedSnapshots = await this.persistence.snapshots.gc(keep)
      if (orphanGenerations + historyTrimmed + removedSnapshots > 0) {
        await this.persistence.audit.append({
          class: 'boot-gc',
          actor: 'system',
          details: { orphanGenerations, historyTrimmed, removedSnapshots },
        })
      }
    }
    this.logger.info(
      `plugin registry recovery: restored ${rows.filter(row => row.status === 'restored').length}, `
      + `shadowed ${rows.filter(row => row.status === 'shadowed').length}, `
      + `quarantined ${rows.filter(row => row.status === 'quarantined').length}, `
      + `gc ${orphanGenerations} generations / ${historyTrimmed} history rows`,
    )
    return {
      restored: rows.filter(row => row.status === 'restored').length,
      shadowed: rows.filter(row => row.status === 'shadowed').length,
      quarantined: rows.filter(row => row.status === 'quarantined').length,
      gc: { orphanGenerations, historyTrimmed },
      rows,
    }
  }

  /** T5 audit entry for one recovery classification. */
  private async auditRecovery(
    kind: 'quarantine' | 'shadow',
    _id: string,
    reason: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    // Recovery classification entries are written before the row's record is
    // materialized, so no plugin identity is attached (schema-optional).
    await this.persistence?.audit.append({
      class: kind,
      actor: 'system',
      reason,
      ...(details === undefined ? {} : { details }),
    })
  }

  /** Dispose every retained generation and clear engine state. */
  dispose(): void {
    for (const disposer of this.idleDisposers.values()) disposer()
    this.idleDisposers.clear()
    for (const disposer of this.toolRegistryDisposers.values()) disposer()
    this.toolRegistryDisposers.clear()
    for (const disposer of this.promptSectionDisposers.values()) disposer()
    this.promptSectionDisposers.clear()
    for (const disposer of this.httpRouteDisposers.values()) disposer()
    this.httpRouteDisposers.clear()
    for (const disposer of this.skillProviderDisposers.values()) disposer()
    this.skillProviderDisposers.clear()
    for (const disposer of this.commandDisposers.values()) disposer()
    this.commandDisposers.clear()
    for (const disposer of this.hostProvideDisposers.values()) disposer()
    this.hostProvideDisposers.clear()
    this.hostProvideValues.clear()
    for (const record of this.records.values()) {
      for (const generation of record.generations) {
        for (const disposer of generation.disposers) disposer()
        for (const disposer of generation.policyDisposers) disposer()
        for (const disposer of generation.policyHostDisposers) disposer()
      }
    }
    this.records.clear()
    this.provideTable.clear()
    this.providedAccessRecords.length = 0
    this.consumerWrappers.clear()
    this.policyReports.clear()
    for (const { service } of this.fineEpochRegistry.entries()) this.fineEpochRegistry.delete(service)
    this.providerObservations.clear()
    this.toolIndirections.clear()
    this.promptSectionTable.clear()
    this.locks.clear()
    this.neutral.clear()
  }

  /**
   * Current value of one manager-held capability (staging-env accessor).
   * @param capability - capability key to read.
   * @returns the live value, or `undefined` when not provided.
   */
  provideValue(capability: string): unknown {
    return this.provideTable.get(capability)?.value
  }

  /**
   * Write-enabled sessionPersistence projection, or `undefined` without the
   * host seam (Proposal B).
   * @returns the manager-curated projection, or `undefined` when no seam exists.
   */
  sessionPersistenceProjection(_pluginId: string): SessionPersistenceProjection | undefined {
    if (this.sessionPersistence === undefined) return undefined
    return createSessionPersistenceProjection(this.sessionPersistence, true)
  }

  /** Resolve one declared capability from the host when the manager does not hold it. */
  hostValue(capability: string): unknown {
    return this.hostService?.(capability)
  }

  /** Raw host context escape hatch for the zero-intrusion facade. */
  rawHost(): unknown {
    return this.ctx
  }

  /**
   * Whether an event belongs to the static host harness vocabulary. Managed
   * listeners are routed through the dispatch machine for these events;
   * everything else (outside the vocabulary and outside a plugin's declared
   * custom events) is bridged to the raw host bus so host events keep real
   * Cordis semantics.
   * @param event - event name to test.
   * @returns true when the event is a known host harness event.
   */
  eventKnown(event: string): boolean {
    return this.eventVocabulary.some(entry => entry.name === event)
  }

  /**
   * Emit one plugin-declared custom event through the dispatch machine,
   * materializing the event in the vocabulary when it first appears (exact
   * declarations or `namespace/*` pattern members are both manifest-gated).
   * @param event - custom event name to emit.
   * @param payload - optional event payload.
   */
  emitManaged(event: string, payload?: unknown): void {
    if (!this.dispatch.knows(event)) this.dispatch.declareEvent(event)
    this.dispatch.emit(event, payload)
  }

  /** One rate-limited logger per plugin id (SEC:71), shared across generations. */
  private envLogger(id: string): Logger {
    const existing = this.logLimiters.get(id)
    if (existing !== undefined) return existing
    const limited = createRateLimitedLogger(this.logger, this.now)
    this.logLimiters.set(id, limited)
    return limited
  }

  private async withLock<T>(id: string, operation: string, body: () => Promise<T>): Promise<T> {
    const running = this.locks.get(id)
    if (running !== undefined) {
      throw fail('concurrent-operation', { id, operation: running }, id)
    }
    this.locks.set(id, operation)
    try {
      return await body()
    } finally {
      this.locks.delete(id)
    }
  }

  private requireRecord(id: string, operation: string): ManagedRecord {
    const record = this.records.get(id)
    if (record === undefined) throw fail('plugin-not-found', { id, operation }, id)
    return record
  }

  private validate(definition: PluginDefinition, origin: 'static' | InstallOrigin, source: PluginSource | { readonly type: 'static' }): void {
    validateMount(definition, {
      source,
      origin,
      ...(this.config.protectedFields === undefined ? {} : { protectedFields: this.config.protectedFields }),
      vocabulary: this.eventVocabulary,
    })
  }

  /** Installed versions (enabled + disabled, excluding shadowed/quarantined) plus host packages. */
  private installedVersions(): Readonly<Record<string, string>> {
    const versions: Record<string, string> = { ...this.hostPackages }
    for (const record of this.records.values()) {
      if (record.status !== 'enabled' && record.status !== 'disabled') continue
      const version = record.generations.at(-1)?.manifest.version
      if (version !== undefined && version !== '') versions[record.id] = version
    }
    for (const member of this.bundleRail?.members() ?? []) {
      if (member.version !== undefined && member.version !== '') versions[member.id] = member.version
    }
    versions[MYGO_MANAGER_ID] = MYGO_MANAGER_VERSION
    return versions
  }

  /**
   * Fail loud when the incoming plugin's own constraints are unsatisfiable or
   * its arrival breaks a survivor's declared constraints. The incoming plugin
   * is the deterministic victim of both directions.
   */
  private assertCompatibility(definition: PluginDefinition): void {
    const violations = this.incomingCompatibilityViolations(definition)
    if (violations.length > 0) {
      throw fail('compatibility-conflict', { plugin: definition.id, violations }, definition.id)
    }
  }

  /** One managed record as a compatibility evaluation member. */
  private compatibilityPluginOf(record: ManagedRecord): CompatibilityPlugin {
    const generation = record.generations.at(-1)
    return {
      id: record.id,
      ...(generation?.manifest.version === undefined
        ? {}
        : { version: generation?.manifest.version }),
      ...(generation?.manifest.compatibility === undefined
        ? {}
        : { compatibility: generation?.manifest.compatibility }),
      ...(generation?.manifest.provides === undefined
        ? {}
        : { provides: generation?.manifest.provides }),
      enabled: record.status === 'enabled',
    }
  }

  /** The current managed set: enabled members and every installed member. */
  private compatibilitySet(): CompatibilitySet {
    const records = [...this.records.values()]
      .filter(record => record.status === 'enabled' || record.status === 'disabled')
      .map(record => this.compatibilityPluginOf(record))
    const bundleMembers = this.bundleRail?.members() ?? []
    const bundlePlugins: CompatibilityPlugin[] = bundleMembers.map(member => ({
      id: member.id,
      ...(member.version === undefined ? {} : { version: member.version }),
      ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
      ...(member.provides === undefined ? {} : { provides: member.provides }),
      enabled: member.enabled,
    }))
    const managerMember: CompatibilityPlugin = {
      id: MYGO_MANAGER_ID,
      version: MYGO_MANAGER_VERSION,
      provides: [MYGO_MANAGER_CAPABILITY],
      enabled: true,
    }
    // rc.3：与 planState 同口径去重（bundle 真相源覆盖 records 同 id；
    // 管理器 id 由自描述兜底）。
    const installed = new Map<string, CompatibilityPlugin>()
    for (const plugin of records) {
      if (plugin.id !== MYGO_MANAGER_ID) installed.set(plugin.id, plugin)
    }
    for (const plugin of bundlePlugins) {
      if (plugin.id !== MYGO_MANAGER_ID) installed.set(plugin.id, plugin)
    }
    installed.set(MYGO_MANAGER_ID, managerMember)
    const all = [...installed.values()]
    return {
      enabled: all.filter(plugin => plugin.enabled === true),
      installed: all,
    }
  }

  /** Derived provider facts from the current managed set (P1: service level). */
  private compositionFacts(): CompositionFactProvider {
    const bundleMembers = this.bundleRail?.members() ?? []
    return {
      serviceProviders: () => {
        const facts: { readonly service: string; readonly plugin: string }[] = []
        for (const plugin of this.compatibilitySet().enabled) {
          for (const service of plugin.provides ?? []) facts.push({ service, plugin: plugin.id })
        }
        return facts
      },
      patchedRows: () => {
        const rows: { readonly rowId: string; readonly plugin: string }[] = []
        for (const member of bundleMembers) {
          if (!member.enabled) continue
          for (const fact of member.patchFacts) {
            rows.push({ rowId: fact.rowId, plugin: member.id })
          }
        }
        return rows
      },
    }
  }

  /** Whether one id belongs to the bundle rail (and is currently installed). */
  private isBundleMember(id: string): boolean {
    return (this.bundleRail?.members().some(member => member.id === id) ?? false)
  }

  /** Full compatibility report for one incoming plugin against the set. */
  private incomingCompatibilityReport(
    definition: PluginDefinition,
    action: CompatibilityReport['action'],
  ): CompatibilityReport {
    return evaluateCompatibility(
      {
        id: definition.id,
        version: definition.version,
        ...(definition.compatibility === undefined ? {} : { compatibility: definition.compatibility }),
        provides: definition.provides,
      },
      this.compatibilitySet(),
      action,
      this.compositionFacts(),
    )
  }

  /** Own-declared plus survivor-declared violations against one incoming plugin. */
  private incomingCompatibilityViolations(definition: PluginDefinition): string[] {
    return compatibilityViolationLines(this.incomingCompatibilityReport(definition, 'install'))
  }

  /**
   * Post-recovery compatibility pass: rows were mounted in list order, which
   * may not match declaration order, so the final set is re-checked once
   * complete. The declaring plugin is the deterministic victim: its record is
   * disabled with reason `compatibility-conflict` and the violation chain
   * logged, instead of taking down the host.
   */
  private async reconcileCompatibility(): Promise<void> {
    let changed = false
    // Cascade to a fixpoint: a missing leaf disables its direct declarer
    // first; the next pass then disables every plugin whose hard closure
    // walked through the now-disabled member. Each record carries only its
    // own edge chain as the violation reason.
    while (true) {
      const pass = [...this.records.values()].filter(record => record.status === 'enabled')
      let disabled = false
      for (const record of pass) {
        const definition = record.generations.at(-1)?.manifest
        if (definition === undefined) continue
        const report = this.incomingCompatibilityReport(definition, 'reconcile')
        const violations = compatibilityViolationLines(report)
        if (violations.length === 0) continue
        disabled = true
        changed = true
        this.logger.warn(`plugin ${record.id} disabled by compatibility: ${violations.join('；')}`)
        record.status = 'disabled'
        record.reason = 'compatibility-conflict'
        if (record.origin !== 'static') {
          try {
            await this.store.writeStatus(record.id, {
              ...this.statusRecord(record),
              status: 'disabled',
              reason: 'compatibility-conflict',
            })
          } catch (error) {
            this.logger.warn(`plugin ${record.id} compatibility status persist failed: ${String(error)}`)
          }
        }
        await this.auditRecovery('quarantine', record.id, 'compatibility-conflict', { violations })
      }
      if (!disabled) break
    }
    if (changed) this.refreshOrders()
  }

  private assertNoConflicts(id: string, definition: PluginDefinition, operation: 'install' | 'replace'): void {
    const next = operation === 'install'
      ? [...this.planState().plugins, declarationOf(definition)]
      : this.planState().plugins.map(plugin => plugin.id === id ? declarationOf(definition) : plugin)
    const issues = evaluateConflicts({ ...this.planState(), plugins: next })
    const issue = issues[0]
    if (issue !== undefined) throw fail(issue.code, issue.details, id)
  }

  /** T6 registry quotas: code bytes, projected registry bytes, row count. */
  private async assertRegistryQuota(source: PluginSource, pluginId: string): Promise<void> {
    const codeBytes = source.type === 'inline' ? new TextEncoder().encode(source.code).length : 0
    if (codeBytes > this.config.maxCodeBytes) {
      throw fail('quota-registry-exceeded', { limit: this.config.maxCodeBytes, current: codeBytes }, pluginId)
    }
    const usage = await this.store.usage()
    if (usage.rows >= this.config.maxDynamicPlugins) {
      throw fail('quota-registry-exceeded', { limit: this.config.maxDynamicPlugins, current: usage.rows }, pluginId)
    }
    // Conservative per-install estimate: the gens row (code) plus a small
    // status/manifest overhead.
    const estimated = codeBytes + 1024
    if (usage.bytes + estimated > this.config.maxRegistryBytes) {
      throw fail('quota-registry-exceeded', {
        limit: this.config.maxRegistryBytes,
        current: usage.bytes + estimated,
      }, pluginId)
    }
  }

  /** T5 audit-after-commit: one `mount` entry per successful mount. */
  private async auditMount(id: string, version: string, gen: number, origin: InstallOrigin): Promise<void> {
    await this.persistence?.audit.append({
      class: 'mount',
      plugin: { id, version, gen },
      actor: origin === 'model' ? 'model' : 'operator',
    })
  }

  private async installShadowed(definition: PluginDefinition, source: PluginSource): Promise<PluginHandleInfo> {
    const generation = await this.stageNew(definition, source, undefined, null, undefined)
    this.assertToolNamesAvailable(generation, definition.id)
    try {
      await this.store.writeGeneration(definition.id, generation.number, {
        v: 1,
        source,
        manifest: generation.manifest,
        resolvedConfig: generation.resolvedConfig,
      })
      await this.store.writeStatus(definition.id, {
        v: 1,
        currentGen: generation.number,
        previousGen: null,
        status: 'shadowed',
        reason: 'shadowed',
        provenance: { origin: 'runtime-api', mountedAt: this.now() },
      })
    } catch (error) {
      throw fail('persist-failed', { operation: 'install', table: 'status' }, definition.id, error)
    }
    this.emit('plugin/installed', this.eventPayload(definition.id, definition, generation.number))
    this.emit('plugin/disabled', {
      ...this.eventPayload(definition.id, definition, generation.number),
      reason: 'shadowed',
    })
    return {
      id: definition.id,
      version: definition.version,
      generation: generation.number,
      origin: 'runtime-api',
      status: 'shadowed',
      reason: 'shadowed',
      kinds: definition.kinds,
      requires: definition.requires,
      provides: definition.provides,
      orderNeutral: false,
      source,
    }
  }

  private async stageNew(
    definition: PluginDefinition,
    source: PluginSource | { readonly type: 'static' },
    config: unknown,
    previous: { readonly generation: number; readonly version: string } | null,
    capturedState: unknown,
  ): Promise<EngineGeneration> {
    const resolvedConfig = this.resolveConfig(definition, config)
    const registrations: StagedRegistration[] = []
    const phase: PhaseHolder = { phase: 'setup' }
    const quotas: PluginEffectQuota = { listeners: 0, tools: 0, services: 0 }
    const logger = this.envLogger(definition.id)
    const fs = createPluginFs(definition.id, this.io)
    const vars = createPluginVars()
    const llm = createModelCall(definition.id, this.llm)
    const exec = createExecBoundary(definition.id, this.exec)
    const fetch = createNetworkFetch(this.fetchImpl)
    const layers = previous === null ? ['*'] : ['*', ...this.existingScopes(definition.id)]
    const generation = this.nextGeneration
    this.nextGeneration += 1
    try {
      for (const layer of layers) {
        const env = new StagingEnv(
          this,
          definition.id,
          definition,
          registrations,
          layer === '*' ? undefined : layer,
          phase,
          logger,
          fs,
          vars,
          llm,
          exec,
          fetch,
          quotas,
        )
        phase.phase = 'setup'
        if (definition.hooks.setup !== undefined) await definition.hooks.setup(env, resolvedConfig)
        if (definition.stateful && definition.hooks.restoreState !== undefined) {
          await definition.hooks.restoreState(capturedState, previous)
        }
        phase.phase = 'activate'
        const activation = definition.hooks.activate(env)
        if (activation !== undefined) await activation
      }
    } catch (error) {
      const cause = String(error)
      const hostConflict = /service "([^"]+)" has been registered/.exec(cause)
      if (hostConflict !== null) {
        // The plugin provides a host service the composition already owns
        // (e.g. a SessionPersistence subclass next to the jsonl backend):
        // staging can never succeed while the incumbent stays — fail loud
        // with the conflict instead of a raw Cordis provide error.
        throw fail('staging-failed', {
          stage: 'staging',
          cause: `插件提供宿主已注册的服务 ${hostConflict[1]}（host-conflict）；`
            + `需要宿主组合移除同名服务，或该插件以替换模式部署`,
        }, definition.id, error)
      }
      throw fail('staging-failed', { stage: 'staging', cause }, definition.id, error)
    }
    for (const [key, values] of Object.entries(definition.entrypoints ?? {})) {
      for (const raw of values) {
        registrations.push({ kind: 'entrypoint', pluginId: definition.id, key, raw })
      }
    }
    for (const registration of registrations) {
      if (registration.kind === 'tool') assertToolOutputShape(registration.definition, definition.id)
    }
    return {
      number: generation,
      manifest: definition,
      code: source.type === 'inline' ? source.code : '',
      source,
      resolvedConfig,
      registrations,
      disposers: [],
      policyDisposers: [],
      policyHostDisposers: [],
      remainingEvents: new Set(),
      provides: new Map(),
      tools: new Map(),
      promptSections: new Map(),
      httpRoutes: new Map(),
      skills: new Map(),
      commands: new Map(),
      entrypointTokens: [],
      hostEffectDisposers: [],
      settingsRegistrations: [],
      mounted: true,
    }
  }

  private existingScopes(id: string): string[] {
    const record = this.records.get(id)
    return [...new Set((record?.generations.at(-1)?.registrations ?? [])
      .map(registration => 'scope' in registration ? registration.scope : undefined)
      .filter((scope): scope is string => scope !== undefined))]
      .sort()
  }

  private resolveConfig(definition: PluginDefinition, config: unknown): unknown {
    try {
      return definition.config(config ?? {})
    } catch (error) {
      // Surface the plugin's own schema description instead of the raw
      // schemastery ValidationError: installers need to know WHICH fields the
      // plugin requires (e.g. `{ type: 'sqlite', path }` or
      // `{ type: 'postgres', connectionString }`) to fill the config form.
      let expected = '插件配置 schema'
      try {
        const description = String(definition.config)
        if (description !== '') expected = description
      } catch {
        // schema without a readable description: keep the generic label
      }
      throw fail('manifest-invalid', {
        field: 'config',
        expected: `配置不合法：插件要求 ${expected}；收到 ${JSON.stringify(config ?? {})}。请在安装时填写 config（面板“配置(JSON)”输入框）`,
      }, definition.id, error)
    }
  }

  private async commitGeneration(
    id: string,
    origin: 'static' | InstallOrigin,
    source: PluginSource | { readonly type: 'static' },
    generation: EngineGeneration,
    status: 'enabled' | 'disabled' | 'quarantined' | 'shadowed',
    previousOrders: ReadonlyMap<string, readonly string[]>,
    previousGeneration: EngineGeneration | null,
  ): Promise<void> {
    // Runtime commit first (T3 rule 1): registrations, tables, record, orders.
    // Boot recovery and install always commit into a fresh record for the id.
    this.applyRegistrations(generation)
    this.updateProvideTable(generation, id)
    this.updateToolTable(generation, id)
    this.updateHttpRouteTable(generation, id)
    this.updateSkillTable(generation, id)
    this.updateCommandTable(generation, id)
    this.updatePromptSectionTable(generation, id)
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.records.set(id, {
      id,
      origin,
      source,
      status,
      generations: [generation],
      state: undefined,
    })
    this.reconcileRequiresGates()
    this.refreshOrders()
    try {
      await this.store.writeGeneration(id, generation.number, {
        v: 1,
        source,
        manifest: generation.manifest,
        resolvedConfig: generation.resolvedConfig,
      })
      await this.store.writeStatus(id, {
        v: 1,
        currentGen: generation.number,
        previousGen: previousGeneration?.number ?? null,
        status,
        provenance: { origin, mountedAt: this.now() },
      })
    } catch (error) {
      this.compensate(id, generation, previousOrders, previousGeneration)
      this.records.delete(id)
      this.policyReports.delete(id)
      const table = String(error).includes('gens') ? 'gens' : 'status'
      throw fail('persist-failed', { operation: 'install', table }, id, error)
    }
    await this.commitSettingsRegistrations(generation)
  }

  private async replaceWithDefinition(
    id: string,
    source: PluginSource | { readonly type: 'static' },
    definition: PluginDefinition,
    force: boolean,
    config: unknown,
  ): Promise<PluginHandleInfo> {
    const record = this.requireRecord(id, 'replace')
    this.validate(definition, record.origin === 'static' ? 'runtime-api' : record.origin, source)
    if (!force) this.assertCompatibility(definition)
    if (!force) this.assertNoConflicts(id, definition, 'replace')
    const incumbent = record.generations.at(-1)
    const incumbentProvides = incumbent?.manifest.provides ?? []
    const lost = incumbentProvides.filter(service => !definition.provides.includes(service))
    const added = definition.provides.filter(service => !incumbentProvides.includes(service))
    const dependents = this.dependentsOf(id, lost)
    if (dependents.length > 0) throw fail('dependent-exists', { dependents }, id)
    const plan = planOperation({ op: 'replace', id, plugin: declarationOf(definition), force }, this.planState())
    const newGeneration = (incumbent?.number ?? 0) + 1

    this.emit('plugin/replacing', this.eventPayload(id, definition, newGeneration))

    // Fail fast on the new config before releasing the incumbent: an invalid
    // config must not take the live generation down, even transiently.
    try {
      this.resolveConfig(definition, config)
    } catch (error) {
      this.emit('plugin/replace-failed', this.failurePayload(id, definition, newGeneration, errorCodeOf(error), String(error)))
      throw error
    }

    let state: unknown
    let snapshot: SnapshotMeta | undefined
    if (definition.stateful) {
      try {
        state = incumbent !== undefined && incumbent.manifest.hooks.captureState !== undefined
          ? incumbent.manifest.hooks.captureState()
          : undefined
        if (state !== undefined) {
          try {
            assertJsonState(state, id)
          } catch (error) {
            // 16.4: a rejected capture is a warning surface plus the normal
            // step-3 failure path.
            this.logger.warn(`state-rejected: plugin ${id} capture rejected: ${String(error)}`)
            await this.persistence?.audit.append({
              class: 'state-rejected',
              plugin: { id, version: definition.version, gen: newGeneration },
              actor: record.origin === 'model' ? 'model' : 'operator',
              reason: String(error),
            })
            throw error
          }
        }
      } catch (error) {
        this.emit('plugin/replace-failed', this.failurePayload(id, definition, newGeneration, 'staging-failed', String(error)))
        throw fail('staging-failed', { stage: 'capture', cause: String(error) }, id, error)
      }
      record.state = state
      if (state !== undefined && this.persistence !== undefined) {
        // Snapshot write failure follows the normal step-3 failure path
        // (outer catch): the replace is aborted before any staging side
        // effect and the old generation stays live.
        snapshot = await this.persistence.snapshots.write(id, newGeneration, state)
      }
    }

    const previous = incumbent === undefined ? null : { generation: incumbent.number, version: incumbent.manifest.version }

    // Native HMR ordering (fiber.update semantics): quiesce, then release the
    // incumbent generation fully BEFORE the replacement applies. Every global
    // host seat the old generation held (settings namespaces, webserver
    // upgrade/fallback routes, provider slots, ...) is free by the time the
    // new apply runs, so no staged/deferred registration special case is
    // needed and seat registries never observe two owners in one replace.
    if (incumbent !== undefined && definition.swapPolicy !== 'immediate') {
      try {
        await this.waitForQuiescence(definition.swapPolicy, affectedEvents(incumbent), id)
      } catch (error) {
        this.emit('plugin/replace-failed', this.failurePayload(id, definition, newGeneration, errorCodeOf(error), String(error)))
        throw error
      }
    }
    if (incumbent !== undefined) {
      await this.releaseGeneration(record, incumbent, affectedEvents(incumbent))
    }

    let generation: EngineGeneration
    try {
      generation = await this.stageNew(definition, source, config, previous, state)
      this.assertToolNamesAvailable(generation, id)
      this.assertToolRegistryConflicts(generation, id)
    } catch (error) {
      // The incumbent was already released; restore it (fresh apply of its
      // own definition) so a failed replacement never strands the plugin.
      if (incumbent !== undefined) {
        try {
          await this.restoreIncumbent(record, incumbent, 'staging')
        } catch (rollbackError) {
          record.status = 'quarantined'
          record.reason = `rollback-failed: ${String(rollbackError)}`
          this.logger.warn(`plugin ${id} replace rollback failed: ${String(rollbackError)}`)
        }
      }
      this.emit('plugin/replace-failed', this.failurePayload(id, definition, newGeneration, errorCodeOf(error), String(error)))
      throw error
    }

    const previousOrders = this.deriveOrderMap()
    const previousStatus = record.status
    const previousSnapshot = record.snapshot
    // Runtime commit first: registrations, tables, record, orders.
    this.applyRegistrations(generation)
    this.replaceTables(id, incumbent ?? null, generation)
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.reconcileRequiresGates()
    record.generations.push(generation)
    record.status = 'enabled'
    if (snapshot === undefined) delete record.snapshot
    else record.snapshot = snapshot
    this.refreshOrders()
    try {
      await this.store.writeGeneration(id, generation.number, {
        v: 1,
        source,
        manifest: generation.manifest,
        resolvedConfig: generation.resolvedConfig,
      })
      await this.store.writeStatus(id, {
        v: 1,
        currentGen: generation.number,
        previousGen: incumbent?.number ?? null,
        status: 'enabled',
        provenance: { origin: record.origin, mountedAt: this.now() },
        ...(snapshot === undefined ? {} : { snapshot }),
      })
    } catch (error) {
      this.compensate(id, generation, previousOrders, null)
      record.generations = record.generations.filter(candidate => candidate.number !== generation.number)
      record.status = previousStatus
      if (previousSnapshot === undefined) delete record.snapshot
      else record.snapshot = previousSnapshot
      if (incumbent !== undefined) {
        try {
          await this.restoreIncumbent(record, incumbent, 'persist')
        } catch (rollbackError) {
          record.status = 'quarantined'
          record.reason = `rollback-failed: ${String(rollbackError)}`
          this.logger.warn(`plugin ${id} persist rollback failed: ${String(rollbackError)}`)
        }
      }
      throw fail('persist-failed', { operation: 'replace', table: 'status' }, id, error)
    }
    this.crashAfterPersist()
    if (incumbent !== undefined && this.persistence !== undefined) {
      try {
        await this.persistence.snapshots.delete(id, incumbent.number)
      } catch {
        // Old snapshot cleanup is best-effort: orphan files are boot-GC'd.
      }
    }
    this.trimInMemoryHistory(record)
    await this.commitSettingsRegistrations(generation)
    await this.auditMount(id, definition.version, generation.number, record.origin === 'static' ? 'runtime-api' : record.origin)
    const providesPath = lost.length > 0 ? 'dropped' : added.length > 0 ? 'added' : 'unchanged'
    this.emit('plugin/replaced', {
      ...this.eventPayload(id, definition, generation.number),
      displaced: plan.displaced,
      providesPath,
    })
    return this.handleOf(record)
  }

  private async waitForQuiescence(
    policy: 'drain' | 'next-idle',
    events: readonly string[],
    id: string,
  ): Promise<void> {
    if (policy === 'drain') {
      await this.waitForDrainIdle(events, id)
      return
    }
    // next-idle 没有事件信号（isTurnBusy 是宿主回调），保持有界轮询。
    const deadline = this.now() + this.swapTimeoutMs
    for (;;) {
      if (!(await this.isTurnBusy())) return
      const waitedMs = this.now() - deadline + this.swapTimeoutMs
      if (waitedMs >= this.swapTimeoutMs) {
        throw fail('swap-timeout', { policy, waitedMs }, id)
      }
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  /**
   * Event-driven drain wait: subscribe to each affected event's idle signal
   * instead of polling. Resolves the moment every affected event is idle at
   * the same instant; bounded by the same swapTimeoutMs deadline. A signal
   * fires only on a transition to zero, so the initial check after
   * subscription covers events that are already idle (they never signal).
   */
  private async waitForDrainIdle(events: readonly string[], id: string): Promise<void> {
    const allIdle = (): boolean => events.every(event => this.dispatch.inFlightCount(event) === 0)
    if (allIdle()) return
    const deadline = this.now() + this.swapTimeoutMs
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const disposers: (() => void)[] = []
      const cleanup = (): void => {
        for (const disposer of disposers) disposer()
        disposers.length = 0
      }
      const check = (): void => {
        if (settled) return
        if (allIdle()) {
          settled = true
          cleanup()
          resolve()
          return
        }
        const waitedMs = this.now() - deadline + this.swapTimeoutMs
        if (waitedMs >= this.swapTimeoutMs) {
          settled = true
          cleanup()
          reject(fail('swap-timeout', { policy: 'drain', waitedMs }, id))
        }
      }
      for (const event of events) {
        disposers.push(this.dispatch.onIdle(event, check))
      }
      // 订阅后立即初查：订阅前已 idle 的事件不会再有信号，初查兜住并发状态。
      check()
      if (settled) return
      // 兜底定时器：事件可能永不 idle（如常驻事件流），按 deadline 超时。
      const remaining = Math.max(0, deadline - this.now())
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(fail('swap-timeout', { policy: 'drain', waitedMs: this.swapTimeoutMs }, id))
      }, remaining)
      disposers.push(() => clearTimeout(timer))
    })
  }

  /**
   * 释放旧代：事件在飞时延迟 dispose（等 onIdle 排空，保住旧代直到在飞
   * 处理器结束），但等待有界（swapTimeoutMs，R2）——常驻事件流（周期
   * 事件/长事务）永不排空时按 deadline 强制释放旧代并告警
   * （deferred-dispose-abandoned，与 dispose-abandoned 同口径：诚实声明
   * 可能打断在飞处理器），杜绝 HMR 换代后旧代无限滞留。
   */
  private async releaseGeneration(
    record: ManagedRecord,
    generation: EngineGeneration,
    events: readonly string[],
  ): Promise<void> {
    const inFlight = events.filter(event => this.dispatch.inFlightCount(event) > 0)
    if (inFlight.length === 0) {
      this.disposeGeneration(generation)
      await this.disposeGenerationBounded(generation)
      this.emit('plugin/deactivated', this.eventPayload(record.id, generation.manifest, generation.number))
      return
    }
    generation.remainingEvents = new Set(inFlight)
    await new Promise<void>((resolve) => {
      let settled = false
      let disposing = false
      const disposers: (() => void)[] = []
      const cleanup = (): void => {
        for (const disposer of disposers) disposer()
        disposers.length = 0
      }
      const settle = (): void => {
        if (settled) return
        settled = true
        resolve()
      }
      const disposeNow = async (abandoned: boolean): Promise<void> => {
        // 竞态守卫：onIdle 排空与兜底定时器可能同时触发，只允许一次释放
        // （disposeGeneration 幂等，但 plugin/deactivated 只能发一次）。
        if (settled || disposing) return
        disposing = true
        cleanup()
        this.idleDisposers.delete(record.id)
        this.disposeGeneration(generation)
        await this.disposeGenerationBounded(generation)
        this.emit('plugin/deactivated', this.eventPayload(record.id, generation.manifest, generation.number))
        if (abandoned) {
          this.logger.warn(
            `deferred-dispose-abandoned: plugin ${record.id} 旧代（generation ${generation.number}）`
            + `的事件在 ${this.swapTimeoutMs}ms 内未排空；已放弃等待并释放旧代`
            + `（可能打断在飞处理器，诚实声明）`,
          )
        }
        settle()
      }
      for (const event of inFlight) {
        disposers.push(this.dispatch.onIdle(event, () => {
          generation.remainingEvents.delete(event)
          if (generation.remainingEvents.size > 0) return
          void disposeNow(false)
        }))
      }
      // 兜底定时器：常驻事件流永不排空 → 按 swapTimeoutMs 有界等待后强制释放。
      const timer = setTimeout(() => {
        void disposeNow(true)
      }, this.swapTimeoutMs)
      disposers.push(() => clearTimeout(timer))
      this.idleDisposers.set(record.id, () => {
        // releaseRecord 已自行释放各代；此处只摘订阅并结算等待。
        cleanup()
        settle()
      })
    })
  }

  /**
   * Roll back a replace/adopt after the incumbent was already released:
   * re-stage the incumbent definition (fresh apply, fresh host seats) and
   * commit it in place under its original generation number. The store is
   * untouched — it still points at the incumbent generation, so a restored
   * record needs no write.
   */
  private async restoreIncumbent(
    record: ManagedRecord,
    incumbent: EngineGeneration,
    stage: string,
  ): Promise<void> {
    const id = record.id
    const previous = { generation: incumbent.number, version: incumbent.manifest.version }
    let restored: EngineGeneration
    try {
      restored = await this.stageNew(incumbent.manifest, incumbent.source, incumbent.resolvedConfig, previous, record.state)
      this.assertToolNamesAvailable(restored, id)
      this.assertToolRegistryConflicts(restored, id)
    } catch (error) {
      throw fail('staging-failed', { stage: `rollback:${stage}`, cause: String(error) }, id, error)
    }
    this.applyRegistrations(restored)
    this.replaceTables(id, null, restored)
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.reconcileRequiresGates()
    const index = record.generations.findIndex(candidate => candidate.number === incumbent.number)
    if (index === -1) record.generations.push(restored)
    else record.generations[index] = restored
    record.status = 'enabled'
    delete record.reason
    this.refreshOrders()
    await this.commitSettingsRegistrations(restored)
    this.emit('plugin/activated', this.eventPayload(id, incumbent.manifest, incumbent.number))
  }

  private releaseRecord(record: ManagedRecord): void {
    for (const generation of record.generations) {
      this.disposeGeneration(generation)
      this.emit('plugin/deactivated', this.eventPayload(record.id, generation.manifest, generation.number))
    }
    for (const [capability, entry] of this.provideTable) {
      if (entry.pluginId === record.id) {
        this.provideTable.delete(capability)
        this.dropProvideAccounting(capability, record.id)
      }
    }
    for (const [name, entry] of this.toolIndirections) {
      if (entry.pluginId === record.id) this.toolIndirections.delete(name)
    }
    for (const [name, entry] of this.promptSectionTable) {
      if (entry.pluginId === record.id) this.promptSectionTable.delete(name)
    }
    for (const [key, entry] of this.httpRouteIndirections) {
      if (entry.pluginId === record.id) this.httpRouteIndirections.delete(key)
    }
    for (const [name, entry] of this.skillIndirections) {
      if (entry.pluginId === record.id) this.skillIndirections.delete(name)
    }
    for (const [name, entry] of this.commandIndirections) {
      if (entry.pluginId === record.id) this.commandIndirections.delete(name)
    }
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.reconcileRequiresGates()
    this.idleDisposers.get(record.id)?.()
    this.idleDisposers.delete(record.id)
  }

  private disposeGeneration(generation: EngineGeneration): void {
    // Host side effects first: they may be shared with the host (index taps,
    // skill providers, upgrade routes) and must leave before the managed
    // registrations. Both lists are drained so release is idempotent.
    for (const disposer of generation.hostEffectDisposers) {
      try {
        disposer()
      } catch (error) {
        this.logger.warn(`plugin ${generation.manifest.id} host effect disposer failed: ${String(error)}`)
      }
    }
    generation.hostEffectDisposers.length = 0
    for (const disposer of generation.policyDisposers) disposer()
    generation.policyDisposers.length = 0
    for (const disposer of generation.policyHostDisposers) disposer()
    generation.policyHostDisposers.length = 0
    for (const disposer of generation.disposers) disposer()
    generation.disposers.length = 0
    // A15 按代修剪：只移除归属本代插件的动态访问记录与消费方包装缓存。
    const survivors = this.providedAccessRecords.filter(record => record.pluginId !== generation.manifest.id)
    this.providedAccessRecords.length = 0
    this.providedAccessRecords.push(...survivors)
    this.consumerWrappers.delete(generation.manifest.id)
    // Entrypoint contributions are per-generation: withdraw exactly this
    // generation's tokens so a replaced generation never steals the new one's
    // contributions (same provider id, distinct tokens).
    for (const token of generation.entrypointTokens) this.entrypoints.removeToken(token)
    generation.entrypointTokens.length = 0
    // Settings owner fiber: the namespace registration rides this fiber, so
    // disposal removes it from the host settings service. Release paths that
    // must sequence (replace) await `settingsOwnerDisposal`; every other path
    // lets it settle in the background.
    const owner = generation.settingsOwner
    delete generation.settingsOwner
    if (owner !== undefined) {
      generation.settingsOwnerDisposal = Promise.resolve(owner.fiber.dispose()).catch(() => undefined)
    }
    // Lifecycle sovereignty: the author hooks release resources the
    // registrations do not own. Both are best-effort (async results are
    // contained; failures only warn) so disposal never blocks the engine.
    try {
      const deactivated = generation.manifest.hooks.deactivate?.('shutdown')
      if (deactivated !== undefined && typeof (deactivated as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(deactivated).catch((error: unknown) => {
          this.logger.warn(`plugin ${generation.manifest.id} deactivate hook failed: ${String(error)}`)
        })
      }
    } catch (error) {
      this.logger.warn(`plugin ${generation.manifest.id} deactivate hook failed: ${String(error)}`)
    }
    try {
      const disposed = generation.manifest.hooks.dispose?.()
      if (disposed !== undefined && typeof (disposed as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(disposed).catch((error: unknown) => {
          this.logger.warn(`plugin ${generation.manifest.id} dispose hook failed: ${String(error)}`)
        })
      }
    } catch (error) {
      this.logger.warn(`plugin ${generation.manifest.id} dispose hook failed: ${String(error)}`)
    }
  }

  /**
   * 有界等待一次 generation 的 dispose 过渡（EB-D21/B8）：默认 5000ms、
   * 0..30000 可配，0=立即放弃。超时 = 停止等待并放弃所有权（JS 无法中止
   * 运行中的异步生成器）——后续 resolve/reject 被忽略并计入
   * `dispose-abandoned` 报告（可能资源泄漏，报告显式警告）；过渡队列已由
   * 调用方释放，后续过渡不被阻塞。
   */
  private async disposeGenerationBounded(generation: EngineGeneration): Promise<void> {
    const disposal = generation.settingsOwnerDisposal
    if (disposal === undefined) return
    const timeoutMs = this.disposeTimeoutMs
    if (timeoutMs <= 0) {
      this.logger.warn(
        `dispose-abandoned: plugin ${generation.manifest.id} 立即放弃等待（disposeTimeoutMs=0）`
        + `；可能残留资源（generation ${generation.number}）`,
      )
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`dispose 超时（${timeoutMs}ms）`))
      }, timeoutMs)
    })
    try {
      await Promise.race([disposal, deadline])
    } catch {
      this.logger.warn(
        `dispose-abandoned: plugin ${generation.manifest.id} 的 dispose 在 ${timeoutMs}ms 内未完成`
        + `（generation ${generation.number}）；已放弃等待并释放过渡队列，可能资源泄漏`,
      )
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /**
   * Commit staged settings namespaces on a per-generation host fiber. Runs
   * after the incumbent is released (the replace protocol releases before
   * the new generation applies), so the global namespace map never sees two
   * owners. The fiber is disposed with the generation.
   */
  private async commitSettingsRegistrations(generation: EngineGeneration): Promise<void> {
    if (generation.settingsRegistrations.length === 0) return
    if (this.ctx.get('settings') === undefined) return
    const items = [...generation.settingsRegistrations]
    try {
      const fiber = this.ctx.plugin({
        inject: ['settings'],
        apply(owner) {
          const settings = (owner as unknown as {
            settings: {
              register(
                ns: string,
                schema: unknown,
                options?: object,
              ): { get(): unknown; watch(callback: (next: unknown, prev: unknown) => void | Promise<void>): () => void }
            }
          }).settings
          for (const item of items) {
            const scope = settings.register(item.ns, item.schema, item.options ?? {})
            item.stagedScope.attach(scope)
          }
        },
      })
      generation.settingsOwner = { fiber }
      // Settle the owner fiber load so the namespace is actually registered
      // (or its startup error surfaced) before the caller reports success.
      await fiber
    } catch (error) {
      this.logger.warn(
        `plugin ${generation.manifest.id} settings namespace commit failed: ${String(error)}`,
      )
      delete generation.settingsOwner
    }
  }

  private applyRegistrations(generation: EngineGeneration): void {
    for (const registration of generation.registrations) {
      if (registration.kind === 'listener') {
        if (!this.dispatch.knows(registration.event)) {
          this.dispatch.declareEvent(registration.event)
        }
        const disposer = this.dispatch.register(registration.event, {
          pluginId: registration.pluginId,
          mode: registration.mode,
          position: registration.position,
          ...(registration.returns === undefined ? {} : { returns: registration.returns }),
          ...(registration.scope === undefined ? {} : { scope: registration.scope }),
          listener: registration.listener,
        })
        generation.policyDisposers.push(disposer)
      } else if (registration.kind === 'host-listener') {
        // Zero-intrusion raw-facade surface: register directly on the raw
        // host bus so the listener keeps real Cordis semantics (options,
        // once, scope filters). The returned disposer is tracked per
        // generation, so disable/uninstall/replace revoke it exactly once.
        const host = this.ctx as unknown as {
          on(
            name: string,
            listener: (...args: unknown[]) => unknown,
            options?: { readonly prepend?: boolean },
          ): () => boolean
          once(
            name: string,
            listener: (...args: unknown[]) => unknown,
            options?: { readonly prepend?: boolean },
          ): () => boolean
        }
        try {
          const options = registration.prepend === true ? { prepend: true } : undefined
          const disposer = registration.once === true
            ? host.once(registration.event, registration.listener, options)
            : host.on(registration.event, registration.listener, options)
          // Host listeners are hot-revocable: disable revokes them right
          // away (unlike managed dispatch registrations, which keep the
          // "stopped" interception semantics), and replace/uninstall drain
          // them again through the host-effect list. 修复批次 2 起入
          // policyHostDisposers：政策停用（INACTIVE）同样撤销、恢复重建。
          generation.policyHostDisposers.push(disposer)
        } catch (error) {
          throw fail('staging-failed', {
            stage: 'host-listener',
            cause: String(error),
          }, registration.pluginId, error)
        }
      } else if (registration.kind === 'provide') {
        generation.provides.set(registration.capability, registration.value)
      } else if (registration.kind === 'prompt-section') {
        generation.promptSections.set(registration.section.name, registration.section)
      } else if (registration.kind === 'http-route') {
        const key = `${registration.spec.method}:${registration.spec.path}`
        const existing = this.httpRouteIndirections.get(key)
        if (existing !== undefined && existing.pluginId !== registration.pluginId) {
          throw fail('staging-failed', {
            stage: 'http-route',
            cause: `http route ${key} is already registered by plugin ${existing.pluginId}`,
          }, registration.pluginId)
        }
        generation.httpRoutes.set(key, registration.spec)
      } else if (registration.kind === 'skill') {
        const existing = this.skillIndirections.get(registration.definition.name)
        if (existing !== undefined && existing.pluginId !== registration.pluginId) {
          throw fail('staging-failed', {
            stage: 'skill',
            cause: `skill ${registration.definition.name} is already registered by plugin ${existing.pluginId}`,
          }, registration.pluginId)
        }
        generation.skills.set(registration.definition.name, registration.definition)
      } else if (registration.kind === 'command') {
        const existing = this.commandIndirections.get(registration.definition.name)
        if (existing !== undefined && existing.pluginId !== registration.pluginId) {
          throw fail('staging-failed', {
            stage: 'command',
            cause: `command ${registration.definition.name} is already registered by plugin ${existing.pluginId}`,
          }, registration.pluginId)
        }
        generation.commands.set(registration.definition.name, registration.definition)
      } else if (registration.kind === 'entrypoint') {
        try {
          const token = this.entrypoints.add(registration.pluginId, registration.key, registration.raw)
          generation.entrypointTokens.push(token)
        } catch (error) {
          throw fail('staging-failed', {
            stage: `entrypoint:${registration.key}`,
            cause: String(error),
          }, registration.pluginId, error)
        }
      } else if (registration.kind === 'host-effect') {
        generation.hostEffectDisposers.push(registration.disposer)
      } else if (registration.kind === 'effect') {
        generation.disposers.push(registration.disposer)
      } else if (registration.kind === 'settings-registration') {
        // Registered on a per-generation host fiber at commit; the owner
        // fiber's disposal removes the namespace with the generation.
        generation.settingsRegistrations.push(registration)
      } else {
        // The registration union is closed: not a listener or provide is a tool.
        generation.tools.set(registration.definition.name, registration.definition)
      }
    }
  }

  private assertToolNamesAvailable(generation: EngineGeneration, id: string): void {
    for (const registration of generation.registrations) {
      if (registration.kind !== 'tool') continue
      const name = registration.definition.name
      const existing = this.toolIndirections.get(name)
      if (existing !== undefined && existing.pluginId !== id) {
        throw fail('staging-failed', { stage: 'tool-output', cause: `tool ${name} is already registered by plugin ${existing.pluginId}` }, id)
      }
    }
  }

  /**
   * Staging claims/shadow checks against the real registry (Proposal A,
   * ruling question ②): a managed tool whose name a raw registration already
   * holds is rejected loudly — claims on the slot are `claims-unmanaged-incumbent`
   * (a raw holder's disposer is not the manager's to call), a scoped shadow
   * without a claims declaration is `shadow-undeclared`, and an unscoped
   * registration without claims is `staging-failed`. The later registrant
   * never silently wins.
   */
  private assertToolRegistryConflicts(generation: EngineGeneration, id: string): void {
    const registry = this.toolRegistry
    if (registry === undefined) return
    const claims = new Set(generation.manifest.permissions.claims)
    for (const registration of generation.registrations) {
      if (registration.kind !== 'tool') continue
      const name = registration.definition.name
      if (this.toolRegistryDisposers.has(name)) continue
      if (registry.get(name) === undefined) continue
      const slot = `tool:${name}`
      if (claims.has(slot)) {
        throw fail('claims-unmanaged-incumbent', { slot }, id)
      }
      if (registration.scope !== undefined) {
        throw fail('shadow-undeclared', { tool: name, holder: 'unmanaged registration' }, id)
      }
      throw fail('staging-failed', {
        stage: 'tool-output',
        cause: `tool ${name} is held by an unmanaged registration; the manager cannot evict it`,
      }, id)
    }
  }

  private updateProvideTable(generation: EngineGeneration, id: string): void {
    for (const [capability, value] of generation.provides) {
      const snapshot: ProviderSymbolSnapshot = {
        pluginId: id,
        version: generation.manifest.version,
        exports: captureExports(value),
        ...(generation.manifest.symbolAliases === undefined
          ? {}
          : { aliases: generation.manifest.symbolAliases }),
      }
      this.fineEpochRegistry.set(capability, snapshot)
      this.providerObservations.observe(capability, id, generation.manifest.version, this.now())
      this.provideTable.set(capability, { pluginId: id, value: this.wrapProvided(capability, value, id) })
    }
  }

  /** 摘除一个能力的所有运行期记账（快照 + 观测）。 */
  private dropProvideAccounting(capability: string, id: string): void {
    this.fineEpochRegistry.delete(capability)
    this.providerObservations.remove(capability, id)
  }

  /**
   * Publish every manager-held provide into the host context. Values are
   * re-provided only when they change identity; disposed publishes are
   * removed with their owning record.
   */
  private syncProvideState(): void {
    const seam = this.hostProvideSeam
    if (seam === undefined) return
    const wanted = new Set<string>()
    for (const capability of this.provideTable.keys()) {
      wanted.add(capability)
    }
    for (const [capability, disposer] of [...this.hostProvideDisposers]) {
      if (wanted.has(capability)) continue
      disposer()
      this.hostProvideDisposers.delete(capability)
      this.hostProvideValues.delete(capability)
    }
    for (const capability of wanted) {
      const entry = this.provideTable.get(capability)
      if (entry === undefined) continue
      if (this.hostProvideDisposers.has(capability) && this.hostProvideValues.get(capability) === entry.value) continue
      this.hostProvideDisposers.get(capability)?.()
      this.hostProvideValues.set(capability, entry.value)
      this.hostProvideDisposers.set(capability, seam(capability, entry.value))
    }
  }

  private updateToolTable(generation: EngineGeneration, id: string): void {
    for (const [name, definition] of generation.tools) {
      this.toolIndirections.set(name, { pluginId: id, definition })
    }
  }

  private updatePromptSectionTable(generation: EngineGeneration, id: string): void {
    for (const [name, section] of generation.promptSections) {
      this.promptSectionTable.set(name, { pluginId: id, section })
    }
  }

  private updateHttpRouteTable(generation: EngineGeneration, id: string): void {
    for (const [key, spec] of generation.httpRoutes) {
      this.httpRouteIndirections.set(key, { pluginId: id, spec })
    }
  }

  private updateSkillTable(generation: EngineGeneration, id: string): void {
    for (const [name, definition] of generation.skills) {
      this.skillIndirections.set(name, { pluginId: id, definition })
    }
  }

  private updateCommandTable(generation: EngineGeneration, id: string): void {
    for (const [name, definition] of generation.commands) {
      this.commandIndirections.set(name, { pluginId: id, definition })
    }
  }

  /**
   * Publish every live manager-held tool into the real registry exactly once,
   * and dispose the indirection of any name that is no longer live. The
   * registry-facing definition is a live view over the manager's current
   * `toolIndirections` entry, so a replace mutates the manager's table and
   * the registry sees no re-registration (no `tools/change`, stable
   * `schemas()` position — F1).
   */
  private syncToolPublishState(): void {
    const registry = this.toolRegistry
    if (registry === undefined) return
    const wanted = new Set(this.toolIndirections.keys())
    for (const [name, disposer] of [...this.toolRegistryDisposers]) {
      if (wanted.has(name)) continue
      disposer()
      this.toolRegistryDisposers.delete(name)
    }
    for (const name of wanted) {
      if (this.toolRegistryDisposers.has(name)) continue
      this.toolRegistryDisposers.set(name, registry.register(this.registryToolView(name)))
    }
  }

  /**
   * Publish every live manager-held prompt section into the host systemPrompt
   * service exactly once as a live view (name/order/text resolve through the
   * current table entry), and dispose the published contribution of any name
   * that is no longer live (Proposal B; HMR-safety).
   */
  private syncPromptSectionState(): void {
    const service = this.promptService
    if (service === undefined) return
    const wanted = new Set(this.promptSectionTable.keys())
    for (const [name, disposer] of [...this.promptSectionDisposers]) {
      if (wanted.has(name)) continue
      disposer()
      this.promptSectionDisposers.delete(name)
    }
    for (const name of wanted) {
      if (this.promptSectionDisposers.has(name)) continue
      this.promptSectionDisposers.set(name, service.section(this.promptSectionView(name)))
    }
  }

  /**
   * Publish every live manager-held http route into the host httpServer
   * service exactly once as a live view (the spec resolves through the
   * current table entry), and dispose the published route of any key that is
   * no longer live. Without a host server the routes stay manager-held.
   */
  private syncHttpRouteState(): void {
    const host = this.httpServerHost
    if (host === undefined) return
    const wanted = new Set(this.httpRouteIndirections.keys())
    for (const [key, disposer] of [...this.httpRouteDisposers]) {
      if (wanted.has(key)) continue
      disposer()
      this.httpRouteDisposers.delete(key)
    }
    for (const key of wanted) {
      if (this.httpRouteDisposers.has(key)) continue
      this.httpRouteDisposers.set(key, host.register(this.httpRouteView(key)))
    }
  }

  /** Live host-server view of one manager-held http route. */
  private httpRouteView(key: string): unknown {
    const current = (): PluginHttpRouteSpec => {
      const entry = this.httpRouteIndirections.get(key)
      if (entry === undefined) throw new Error(`managed http route ${key} is not live`)
      return entry.spec
    }
    // Snapshot the registration-time shape: the host webserver's route
    // disposer re-reads `route.path` when it runs, which happens AFTER the
    // table entry was removed during teardown/replace. A stable snapshot
    // keeps that disposer valid without re-resolving a gone indirection.
    const snapshot = current()
    return {
      get kind(): 'exact' | 'prefix' {
        return snapshot.kind ?? 'exact'
      },
      get path(): string {
        return snapshot.path
      },
      handler: (req: unknown, res: unknown): void | Promise<void> => {
        return this.dispatchHttpRoute(current(), req, res)
      },
    }
  }

  /** Bridge one managed route handler onto a node:http request/response pair. */
  private async dispatchHttpRoute(spec: PluginHttpRouteSpec, req: unknown, res: unknown): Promise<void> {
    const incoming = req as {
      readonly method?: string
      readonly url?: string
      readonly headers?: Readonly<Record<string, string | string[] | undefined>>
      on?(event: 'data', listener: (chunk: Buffer) => void): void
      on?(event: 'end', listener: () => void): void
    }
    const outgoing = res as {
      statusCode: number
      setHeader(name: string, value: string): void
      write(chunk: string | Buffer): boolean
      end(body?: string | Buffer): void
    }
    const body = await new Promise<string>((resolve) => {
      if (incoming.on === undefined) {
        resolve('')
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      incoming.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 1_000_000) return
        chunks.push(chunk)
      })
      incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries(incoming.headers ?? {})) {
      if (typeof value === 'string') headers[name] = value
    }
    const managed = await spec.handler({
      method: incoming.method ?? 'GET',
      path: (incoming.url ?? '/').split('?')[0] ?? '/',
      ...(incoming.url === undefined ? {} : { url: incoming.url }),
      headers,
      body,
    })
    outgoing.statusCode = managed.status
    for (const [name, value] of Object.entries(managed.headers ?? {})) {
      outgoing.setHeader(name, value)
    }
    // Live stream (SSE-style raw routes): forward every chunk as it arrives
    // and end only when the managed stream closes (res.end / piped source end
    // / idle timeout), so long-lived event streams do not buffer for 30s.
    if (managed.stream !== undefined) {
      for await (const chunk of managed.stream) {
        outgoing.write(Buffer.from(chunk))
      }
      outgoing.end()
      return
    }
    const responseBody: string | Buffer = typeof managed.body === 'string'
      ? managed.body
      : managed.body === undefined
        ? ''
        : managed.body instanceof Uint8Array
          ? Buffer.from(managed.body)
          : JSON.stringify(managed.body)
    const hasContentType = Object.keys(managed.headers ?? {}).some(name => name.toLowerCase() === 'content-type')
    if (typeof managed.body === 'object' && managed.body !== undefined && !(managed.body instanceof Uint8Array) && !hasContentType) {
      outgoing.setHeader('Content-Type', 'application/json')
    }
    outgoing.end(responseBody)
  }

  /**
   * Publish every live manager-held skill into the host skills service as one
   * provider per owning plugin, and dispose the provider of any plugin that
   * no longer holds skills. Without a host service the skills stay
   * manager-held.
   */
  private syncSkillState(): void {
    const service = this.skillServiceHost
    if (service === undefined) return
    const owners = new Set<string>()
    for (const entry of this.skillIndirections.values()) owners.add(entry.pluginId)
    for (const [pluginId, disposer] of [...this.skillProviderDisposers]) {
      if (owners.has(pluginId)) continue
      disposer()
      this.skillProviderDisposers.delete(pluginId)
    }
    for (const pluginId of owners) {
      if (this.skillProviderDisposers.has(pluginId)) continue
      this.skillProviderDisposers.set(pluginId, service.registerProvider(() => this.skillProviderView(pluginId)))
    }
  }

  /** Live provider view over one plugin's manager-held skills. */
  private skillProviderView(pluginId: string): unknown {
    const providerName = `managed-${pluginId}`
    return {
      get name(): string {
        return providerName
      },
      list: async () => {
        const candidates: unknown[] = []
        for (const [name, entry] of this.skillIndirections) {
          if (entry.pluginId !== pluginId) continue
          candidates.push(this.skillCandidateView(entry, name, providerName))
        }
        return candidates
      },
      get: async (candidate: { locator?: unknown }) => {
        if (typeof candidate.locator !== 'string') return undefined
        const entry = this.skillIndirections.get(candidate.locator)
        if (entry === undefined || entry.pluginId !== pluginId) return undefined
        return {
          name: entry.definition.name,
          description: entry.definition.description,
          content: entry.definition.content,
          ...(entry.definition.whenToUse === undefined ? {} : { whenToUse: entry.definition.whenToUse }),
          invocation: entry.definition.invocation ?? { modelInvocable: true, userInvocable: true },
          source: entry.definition.source ?? 'runtime',
          provider: entry.definition.provider ?? providerName,
          ...(entry.definition.resourceBase === undefined ? {} : { resourceBase: entry.definition.resourceBase }),
          ...(entry.definition.path === undefined ? {} : { path: entry.definition.path }),
          ...(entry.definition.metadata === undefined ? {} : { metadata: entry.definition.metadata }),
        }
      },
    }
  }

  /** One provider-catalog candidate over a plugin's skill, preserving plugin-declared fields. */
  private skillCandidateView(
    entry: { readonly pluginId: string; readonly definition: PluginSkillDefinition },
    name: string,
    providerName: string,
  ): unknown {
    const definition = entry.definition
    return {
      name,
      description: definition.description,
      ...(definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse }),
      invocation: definition.invocation ?? { modelInvocable: true, userInvocable: true },
      source: definition.source ?? 'runtime',
      provider: definition.provider ?? providerName,
      rank: definition.rank ?? 0,
      locator: name,
      ...(definition.resourceBase === undefined ? {} : { resourceBase: definition.resourceBase }),
      ...(definition.path === undefined ? {} : { path: definition.path }),
      ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
    }
  }

  /**
   * Publish every live manager-held command into the host commands service
   * exactly once as a live view, and dispose commands that are no longer
   * live. Without a host service the commands stay manager-held.
   */
  private syncCommandState(): void {
    const service = this.commandServiceHost
    if (service === undefined) return
    const wanted = new Set(this.commandIndirections.keys())
    for (const [name, disposer] of [...this.commandDisposers]) {
      if (wanted.has(name)) continue
      disposer()
      this.commandDisposers.delete(name)
    }
    for (const name of wanted) {
      if (this.commandDisposers.has(name)) continue
      this.commandDisposers.set(name, service.register(this.commandView(name)))
    }
  }

  /** Live host-service view of one manager-held command. */
  private commandView(name: string): unknown {
    const current = (): PluginCommandDefinition => {
      const entry = this.commandIndirections.get(name)
      if (entry === undefined) throw new Error(`managed command ${name} is not live`)
      return entry.definition
    }
    return {
      get name(): string {
        return current().name
      },
      get description(): string {
        return current().description
      },
      get input(): { readonly hint?: string } | undefined {
        return current().input
      },
      handler: (input: unknown) => current().handler(input as PluginCommandInvocation),
    }
  }

  /** Live host-service view of one manager-held prompt section. */
  private promptSectionView(name: string): unknown {
    const current = (): PluginPromptSection => {
      const entry = this.promptSectionTable.get(name)
      if (entry === undefined) throw new Error(`managed prompt section ${name} is not live`)
      return entry.section
    }
    return {
      get name(): string {
        return current().name
      },
      get order(): number {
        return current().order
      },
      get text(): string | ((context: unknown) => string) {
        return current().text
      },
    }
  }

  /** Live registry-facing view of one manager-held tool. */
  private registryToolView(name: string): unknown {
    const current = (): PluginToolDefinition => {
      const entry = this.toolIndirections.get(name)
      if (entry === undefined) throw new Error(`managed tool ${name} is not live`)
      return entry.definition
    }
    return {
      get name(): string {
        return name
      },
      get description(): string {
        return current().description
      },
      get parameters(): Record<string, unknown> {
        return current().input
      },
      get output(): {
        readonly schema: Record<string, unknown>
        render(args: unknown, value: unknown): unknown[]
        readonly presentationMeta: ((args: unknown, value: unknown) => unknown) | undefined
      } {
        return {
          get schema(): Record<string, unknown> {
            return current().output
          },
          render: (args: unknown, value: unknown) => {
            const render = current().outputRender
            if (render !== undefined) {
              const projected = render(args, value)
              if (Array.isArray(projected)) return projected as unknown[]
              return [{
                type: 'text',
                text: typeof projected === 'string' ? projected : JSON.stringify(projected),
              }]
            }
            return [{
              type: 'text',
              text: typeof value === 'string' ? value : JSON.stringify(value),
            }]
          },
          get presentationMeta(): ((args: unknown, value: unknown) => unknown) | undefined {
            return current().outputPresentationMeta
          },
        }
      },
      get presentCall(): ((args: unknown) => unknown) | undefined {
        return current().presentCall
      },
      get presentResult(): ((args: unknown, result: unknown) => unknown) | undefined {
        return current().presentResult
      },
      get timeoutMs(): number | undefined {
        return current().timeoutMs
      },
      get isConcurrencySafe(): ((args: unknown) => boolean) | undefined {
        return current().isConcurrencySafe
      },
      get finalizeContent(): ((exec: unknown, result: unknown) => unknown[] | undefined) | undefined {
        return current().finalizeContent
      },
      execute: (args: unknown, exec: unknown) => {
        // Disabled plugins keep their tools in the registry (so callers see
        // the tool), but every execution is intercepted with a clear reason.
        const entry = this.toolIndirections.get(name)
        if (entry !== undefined) {
          const record = this.records.get(entry.pluginId)
          if (record !== undefined && record.status === 'disabled') {
            throw new Error(`插件 ${entry.pluginId} 已停用，请先在设置页启用`)
          }
        }
        return current().execute(args, exec as PluginToolExecutionContext)
      },
    }
  }

  /** Live managed tool definition for one name, or undefined when not registered. */
  managedTool(name: string): PluginToolDefinition | undefined {
    return this.toolIndirections.get(name)?.definition
  }

  /** Every live managed tool definition, in registration order. */
  managedTools(): readonly PluginToolDefinition[] {
    return [...this.toolIndirections.values()].map(entry => entry.definition)
  }

  /**
   * Resolve one tool name against uninstall tombstones: names an uninstalled
   * plugin used to own. Lets the host registry return a friendly
   * "plugin removed" message instead of a bare unknown-tool failure.
   * @param name - tool name the host registry could not find.
   * @returns the tombstone owner, or `undefined` when the name is not attributed.
   */
  resolveUnknownTool(name: string): ToolTombstone | undefined {
    return this.toolTombstones.get(name)
  }

  /**
   * Remove an uninstall tombstone so a static/bundle plugin can be adopted
   * again (reinstall after uninstall).
   * @param id - plugin id whose tombstone should be cleared.
   */
  async clearUninstallTombstone(id: string): Promise<void> {
    const status = await this.store.readStatus(id)
    if (status === undefined || status.status !== 'uninstalled') return
    await this.store.deletePlugin(id)
    for (const [name, tombstone] of [...this.toolTombstones]) {
      if (tombstone.pluginId === id) this.toolTombstones.delete(name)
    }
  }

  /** Go-live table swap: publish `next` values, then drop entries the previous
      generation owned that `next` does not re-register (§14 step ⑤). */
  private replaceTables(id: string, previous: EngineGeneration | null, next: EngineGeneration): void {
    this.updateProvideTable(next, id)
    // A2：reload 前置门——被替换能力的导出快照 vs 消费者被用符号投影，
    // 缺符号 → 政策停用 + symbol-missing 报告（词汇分工，任务 2.2）。
    this.verifyConsumerSymbolsAfterReplace(next)
    this.updateToolTable(next, id)
    this.updatePromptSectionTable(next, id)
    this.updateHttpRouteTable(next, id)
    this.updateSkillTable(next, id)
    this.updateCommandTable(next, id)
    if (previous === null) return
    for (const capability of previous.provides.keys()) {
      if (next.provides.has(capability)) continue
      const entry = this.provideTable.get(capability)
      if (entry?.pluginId === id) {
        this.provideTable.delete(capability)
        this.dropProvideAccounting(capability, id)
      }
    }
    for (const name of previous.tools.keys()) {
      if (next.tools.has(name)) continue
      // Tool names are globally unique (assertToolNamesAvailable), so an old
      // generation's un-re-registered tool cannot belong to another plugin.
      this.toolIndirections.delete(name)
    }
    for (const name of previous.promptSections.keys()) {
      if (next.promptSections.has(name)) continue
      this.promptSectionTable.delete(name)
    }
    for (const key of previous.httpRoutes.keys()) {
      if (next.httpRoutes.has(key)) continue
      this.httpRouteIndirections.delete(key)
    }
    for (const name of previous.skills.keys()) {
      if (next.skills.has(name)) continue
      this.skillIndirections.delete(name)
    }
    for (const name of previous.commands.keys()) {
      if (next.commands.has(name)) continue
      this.commandIndirections.delete(name)
    }
  }

  private compensate(
    id: string,
    generation: EngineGeneration,
    previousOrders: ReadonlyMap<string, readonly string[]>,
    previousGeneration: EngineGeneration | null,
  ): void {
    this.disposeGeneration(generation)
    this.dispatch.setOrders(new Map(previousOrders))
    // The failed generation must leave no effects behind: drop every table
    // entry this id owns that the previous generation does not re-provide,
    // then restore the previous generation's exact tables.
    for (const [capability, entry] of this.provideTable) {
      if (entry.pluginId === id && !previousGeneration?.provides.has(capability)) {
        this.provideTable.delete(capability)
        this.dropProvideAccounting(capability, id)
      }
    }
    for (const [name, entry] of this.toolIndirections) {
      if (entry.pluginId === id && !previousGeneration?.tools.has(name)) {
        this.toolIndirections.delete(name)
      }
    }
    for (const [name, entry] of this.promptSectionTable) {
      if (entry.pluginId === id && !previousGeneration?.promptSections.has(name)) {
        this.promptSectionTable.delete(name)
      }
    }
    for (const [key, entry] of this.httpRouteIndirections) {
      if (entry.pluginId === id && !previousGeneration?.httpRoutes.has(key)) {
        this.httpRouteIndirections.delete(key)
      }
    }
    for (const [name, entry] of this.skillIndirections) {
      if (entry.pluginId === id && !previousGeneration?.skills.has(name)) {
        this.skillIndirections.delete(name)
      }
    }
    for (const [name, entry] of this.commandIndirections) {
      if (entry.pluginId === id && !previousGeneration?.commands.has(name)) {
        this.commandIndirections.delete(name)
      }
    }
    if (previousGeneration !== null) {
      for (const [capability, value] of previousGeneration.provides) {
        this.provideTable.set(capability, { pluginId: id, value: this.wrapProvided(capability, value, id) })
      }
      for (const [name, definition] of previousGeneration.tools) {
        this.toolIndirections.set(name, { pluginId: id, definition })
      }
      for (const [name, section] of previousGeneration.promptSections) {
        this.promptSectionTable.set(name, { pluginId: id, section })
      }
      for (const [key, spec] of previousGeneration.httpRoutes) {
        this.httpRouteIndirections.set(key, { pluginId: id, spec })
      }
      for (const [name, definition] of previousGeneration.skills) {
        this.skillIndirections.set(name, { pluginId: id, definition })
      }
      for (const [name, definition] of previousGeneration.commands) {
        this.commandIndirections.set(name, { pluginId: id, definition })
      }
    }
    this.syncToolPublishState()
    this.syncPromptSectionState()
    this.syncHttpRouteState()
    this.syncSkillState()
    this.syncCommandState()
    this.syncProvideState()
    this.reconcileRequiresGates()
  }

  private refreshOrders(): void {
    const derived = deriveOrders(this.planState())
    this.dispatch.setOrders(derived.orders)
    this.neutral.clear()
    for (const [id, flag] of derived.orderNeutral) this.neutral.set(id, flag)
  }

  private deriveOrderMap(): ReadonlyMap<string, readonly string[]> {
    return deriveOrders(this.planState()).orders
  }

  private planState(): PlanState {
    const bundleDeclarations: PluginDeclarationInput[] = (this.bundleRail?.members() ?? []).map(member => ({
      id: member.id,
      ...(member.version === undefined ? {} : { version: member.version }),
      permissions: emptyPermissions(),
      requires: [],
      provides: member.provides ?? [],
      enabled: member.enabled,
      origin: 'static',
      rail: 'bundle',
      ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
    }))
    const managerDeclaration: PluginDeclarationInput = {
      id: MYGO_MANAGER_ID,
      version: MYGO_MANAGER_VERSION,
      permissions: emptyPermissions(),
      requires: [],
      provides: [MYGO_MANAGER_CAPABILITY],
      enabled: true,
      origin: 'static',
      rail: 'bridge',
    }
    // rc.3 去重（旧形态双账本语义残留修复）：records（桥接轨账）与
    // bundleDeclarations（profile 组合真相源）可能同 id——bundle 成员包名
    // 推导的 id 恰为 MYGO_MANAGER_ID 时（@r05en1cu/dsh-mygo 是 bundle 成员），
    // 与管理器自描述重叠。口径：bundle 真相源覆盖 records 同 id 记录；
    // MYGO_MANAGER_ID 一律由管理器自描述兜底（provides service:mygo-core
    // 与版本事实以运行体为准）。
    const byId = new Map<string, PluginDeclarationInput>()
    for (const record of this.records.values()) {
      // Shadowed rows are part of the managed set with empty placeholder
      // declarations; the derivation excludes them from orders (not enabled).
      if (record.status !== 'enabled' && record.status !== 'disabled' && record.status !== 'shadowed') continue
      const declaration = this.declarationOf(record)
      if (declaration.id === MYGO_MANAGER_ID) continue
      byId.set(declaration.id, declaration)
    }
    for (const declaration of bundleDeclarations) {
      if (declaration.id === MYGO_MANAGER_ID) continue
      byId.set(declaration.id, declaration)
    }
    byId.set(MYGO_MANAGER_ID, managerDeclaration)
    return {
      plugins: [...byId.values()],
      slotKinds: this.slotKinds,
      packageVersions: this.installedVersions(),
    }
  }

  private declarationOf(record: ManagedRecord): PluginDeclarationInput {
    const generation = record.generations.at(-1)
    return {
      id: record.id,
      permissions: generation?.manifest.permissions ?? emptyPermissions(),
      requires: generation?.manifest.requires ?? [],
      provides: generation?.manifest.provides ?? [],
      scopes: this.existingScopes(record.id),
      enabled: record.status === 'enabled',
      origin: record.origin === 'static' ? 'static' : record.origin,
      ...(generation?.manifest.version === undefined
        ? {}
        : { version: generation?.manifest.version }),
      ...(generation?.manifest.compatibility === undefined
        ? {}
        : { compatibility: generation?.manifest.compatibility }),
    }
  }

  /** Plan declaration for one resolved definition (assumed enabled). */
  private declarationFromDefinition(definition: PluginDefinition): PluginDeclarationInput {
    return {
      id: definition.id,
      ...(definition.version === undefined || definition.version === ''
        ? {}
        : { version: definition.version }),
      permissions: definition.permissions,
      requires: definition.requires,
      provides: definition.provides,
      enabled: true,
      ...(definition.compatibility === undefined ? {} : { compatibility: definition.compatibility }),
    }
  }

  private dependentsOf(id: string, services?: readonly string[]): string[] {
    const lost = services ?? this.records.get(id)?.generations.at(-1)?.manifest.provides ?? []
    return [...this.records.values()]
      .filter(record => record.id !== id)
      .filter(record => (record.generations.at(-1)?.manifest.requires ?? []).some(service => lost.includes(service)))
      .map(record => record.id)
      .sort()
  }

  private trimInMemoryHistory(record: ManagedRecord): void {
    while (record.generations.length > this.historyKeep) {
      // The loop condition guarantees a shift result.
      this.disposeGeneration(record.generations.shift() as EngineGeneration)
    }
  }

  private async trimHistory(id: string, status: StatusRecord): Promise<number> {
    const gens = await this.store.readGenerations(id)
    const keep = new Set<number>([status.currentGen, ...(status.previousGen === null ? [] : [status.previousGen])])
    let trimmed = 0
    for (const entry of gens) {
      if (keep.has(entry.gen)) continue
      await this.store.deleteGeneration(id, entry.gen)
      trimmed += 1
    }
    return trimmed
  }

  private handleOf(record: ManagedRecord): PluginHandleInfo {
    const generation = record.generations.at(-1)
    return {
      id: record.id,
      version: generation?.manifest.version ?? '',
      generation: generation?.number ?? 0,
      origin: record.origin,
      status: record.status,
      ...(record.reason === undefined ? {} : { reason: record.reason }),
      kinds: generation?.manifest.kinds ?? [],
      requires: generation?.manifest.requires ?? [],
      provides: generation?.manifest.provides ?? [],
      orderNeutral: this.neutral.get(record.id) ?? false,
      source: record.source,
      ...(generation?.manifest.entrypoints === undefined
        ? {}
        : { entrypoints: Object.keys(generation.manifest.entrypoints) }),
      ...(generation?.manifest.compatibility === undefined
        ? {}
        : { compatibility: generation.manifest.compatibility }),
      policyStatus: this.policyStatusOf(record),
    }
  }

  private record(id: string): ManagedRecord {
    // Every caller has just created or adopted the record.
    return this.records.get(id) as ManagedRecord
  }

  /** The latest generation's manifest, or an empty placeholder for status-only records. */
  private manifestOf(record: ManagedRecord): PluginDefinition {
    return record.generations.at(-1)?.manifest ?? emptyManifest(record.id)
  }

  /** The latest generation number, or 0 for status-only records. */
  private generationNumber(record: ManagedRecord): number {
    return record.generations.at(-1)?.number ?? 0
  }

  private statusRecord(record: ManagedRecord, reason?: string): StatusRecord {
    // Every managed record owns at least one generation (recovered shadowed
    // rows are the only generation-less records and never reach this path).
    const generation = record.generations.at(-1) as EngineGeneration
    return {
      v: 1,
      currentGen: generation.number,
      previousGen: record.generations.length > 1 ? (record.generations.at(-2) as EngineGeneration).number : null,
      status: record.status,
      ...(reason === undefined ? {} : { reason }),
      ...(record.snapshot === undefined ? {} : { snapshot: record.snapshot }),
      provenance: { origin: record.origin, mountedAt: this.now() },
    }
  }

  private eventPayload(id: string, manifest: PluginDefinition, generation: number): PluginLifecycleEventPayload {
    return { id, name: id, version: manifest.version, generation }
  }

  private failurePayload(
    id: string,
    manifest: PluginDefinition,
    generation: number,
    code: string,
    message: string,
  ): PluginLifecycleEventPayload {
    return { ...this.eventPayload(id, manifest, generation), error: { code, message } }
  }

  private emit(event: string, payload: PluginLifecycleEventPayload): void {
    // 0811 的 Events 泛型不再包含 plugin/* 事件名；按松散 emit 面转发
    // （事件名/载荷由 mygo 词汇表与监听端共同约束）。
    ;(this.ctx as unknown as { emit(name: string, payload: unknown): void }).emit(event, payload)
  }
}

function declarationOf(definition: PluginDefinition): PluginDeclarationInput {
  return {
    id: definition.id,
    permissions: definition.permissions,
    requires: definition.requires,
    provides: definition.provides,
    version: definition.version,
    ...(definition.compatibility === undefined
      ? {}
      : { compatibility: definition.compatibility }),
  }
}

/** Merge optional declarative overrides (`dsh.mygo`) into a derived raw manifest. */
function mergeRawDeclaration(
  derived: PluginDefinition,
  id: string | undefined,
  declaration: RawPluginDeclaration | undefined,
): PluginDefinition {
  let definition = id === undefined || id === derived.id ? derived : { ...derived, id }
  if (declaration === undefined) return definition
  if (declaration.version !== undefined) {
    definition = { ...definition, version: declaration.version }
  }
  if (declaration.entrypoints !== undefined) {
    definition = { ...definition, entrypoints: declaration.entrypoints }
  }
  if (declaration.compatibility !== undefined) {
    definition = { ...definition, compatibility: declaration.compatibility }
  }
  if (declaration.provides !== undefined && declaration.provides.length > 0) {
    const merged = [...new Set([...definition.provides, ...declaration.provides])]
    definition = { ...definition, provides: merged }
  }
  return definition
}

function emptyPermissions(): PluginDefinition['permissions'] {
  return { observe: [], transform: [], intercept: [], position: 'derived', claims: [] }
}

function emptyManifest(id: string): PluginDefinition {
  return {
    id,
    version: '',
    kinds: [],
    requires: [],
    serviceRequires: {},
    provides: [],
    permissions: emptyPermissions(),
    stateful: false,
    swapPolicy: 'immediate',
    config: {} as PluginDefinition['config'],
    hooks: {} as PluginDefinition['hooks'],
  }
}

function affectedEvents(generation: EngineGeneration | undefined): string[] {
  return [...new Set((generation?.registrations ?? [])
    .filter(registration => registration.kind === 'listener')
    .map(registration => registration.event))]
    .filter(event => event !== '')
    .sort()
}

function assertToolOutputShape(definition: PluginToolDefinition, pluginId: string): void {
  const output: unknown = definition.output
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    throw fail('staging-failed', { stage: 'tool-output', cause: `output schema of ${definition.name} is not an object` }, pluginId)
  }
}

function assertJsonState(state: unknown, pluginId: string): void {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(state))
    if (bytes.length > 10 * 1024 * 1024) {
      throw new Error('state exceeds 10MB')
    }
  } catch (error) {
    throw fail('staging-failed', { stage: 'capture', cause: String(error) }, pluginId, error)
  }
}

function isManifestShaped(value: unknown): value is PluginDefinition {
  return typeof value === 'object' && value !== null && typeof (value as PluginDefinition).id === 'string'
}

function isRelationshipCode(code: PluginErrorCode): boolean {
  return [
    'write-conflict',
    'intercept-branch-conflict',
    'ordering-cycle',
    'veto-position-conflict',
    'claims-conflict',
    'claims-unmanaged-incumbent',
    'shadow-undeclared',
  ].includes(code)
}

function firstPeer(details: Record<string, unknown>, id: string): string {
  const candidates = [details.a, details.b, details.companion, details.slot]
    .filter((value): value is string => typeof value === 'string')
  return candidates.find(candidate => candidate !== id) ?? String(candidates[0])
}

function errorCodeOf(error: unknown): PluginErrorCode {
  // The engine wraps every staging failure into a PluginError before this point.
  return (error as PluginError).code
}

function fail(code: PluginErrorCode, details: Record<string, unknown>, pluginId: string | undefined, cause?: unknown): PluginError {
  const error = new PluginError(code, formatPluginError(code, details), details, pluginId)
  if (cause !== undefined) (error as PluginError & { cause?: unknown }).cause = cause
  return error
}
