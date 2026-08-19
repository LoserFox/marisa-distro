/**
 * Type-only contract surface of `@r05en1cu/dsh-mygo`: the
 * `ctx.pluginManager` service key, manager Config, and the mount-time
 * validation options. This module deliberately contains no runtime code; the
 * validation chain itself lives in `mount.ts`.
 * @module @r05en1cu/dsh-mygo/src/types
 */

import type {
  CompatibilityReport,
  InstallOrigin,
  InstallOptions,
  PermissionsBlock,
  PluginCompatibility,
  PluginDefinition,
  PluginErrorCode,
  PluginHandleInfo,
  PluginSource,
  RawCordisFunctionPlugin,
  RawPluginDeclaration,
} from '@r05en1cu/dsh-mygo-api'
import type { PluginEventVocabularyEntry } from './event-vocabulary.ts'
import type { EntrypointsService } from './entrypoints.ts'

/** Manager deployment Config. */
export interface PluginManagerConfig {
  /** Max inline source code bytes per install, checked before staging. */
  readonly maxCodeBytes: number
  /** Max registry bytes per profile. */
  readonly maxRegistryBytes: number
  /** Max dynamic plugin rows per profile. */
  readonly maxDynamicPlugins: number
  /** Audit stream rotation size. */
  readonly auditMaxBytes: number
  /** Audit stream rotation file count. */
  readonly auditKeepFiles: number
  /** Root for state snapshots; defaults to `dshHomePath('plugin-state')`. */
  readonly stateRoot: string
  /** Generation history retained per plugin. */
  readonly historyKeep: number
  /** Bounded drain/next-idle wait for replace (HP:139). */
  readonly swapTimeoutMs: number
  /** dispose/unload 过渡超时（EB-D21/B8）：默认 5000ms，0..30000，0=立即放弃等待。 */
  readonly disposeTimeoutMs?: number
  /** `'<event>.<property>'` fields that `writes` may not touch (PO:219/SEC:152). */
  readonly protectedFields?: readonly string[]
}

/** One operation fed to `plan()` (§15.3). */
export type PluginOperation =
  | { readonly op: 'install'; readonly source: PluginSource; readonly config?: unknown }
  | { readonly op: 'uninstall'; readonly id: string }
  | { readonly op: 'replace'; readonly id: string; readonly source: PluginSource; readonly force?: boolean }
  | { readonly op: 'enable' | 'disable'; readonly id: string; readonly force?: boolean }

/** Plan preview for one operation against the current managed set (§15.3). */
export interface PluginOperationPlan {
  readonly accepted: boolean
  /** The code the operation would throw, when rejected. */
  readonly error?: {
    readonly code: PluginErrorCode
    readonly message: string
    readonly details?: Readonly<Record<string, unknown>>
  }
  /** Rendered soft / derived compatibility notes discovered while planning. */
  readonly warnings?: readonly string[]
  /** Bystanders whose observable position changes, with the displacing edge. */
  readonly displaced: readonly {
    readonly id: string
    readonly edge: { readonly from: string; readonly to: string; readonly property: string }
  }[]
  /** Dynamic installs shadowed by a static entry report `true` (T2-4). */
  readonly wouldShadow?: boolean
}

/**
 * The full manager operation surface (§15.3). The #12 skeleton ships the
 * typed surface plus the mount-time validation chain; operation semantics
 * land with the schedule's later stages (#13 plan, #15 lifecycle engine).
 */
export interface PluginManager {
  /** Install one plugin; runtime commit → persist → return (T3 rule 1). */
  install(source: PluginSource, options?: InstallOptions): Promise<PluginHandleInfo>
  /** Uninstall one plugin; idempotent (T2-3), persist first (T3 rule 2). */
  uninstall(id: string): Promise<void>
  /** Enable a disabled plugin (create-class write order). */
  enable(id: string): Promise<void>
  /** Disable an enabled plugin (delete-class write order). */
  disable(id: string, reason?: string, force?: boolean): Promise<void>
  /** Hot replacement seven-step protocol (HP:82-90). */
  replace(id: string, source: PluginSource, options?: { readonly force?: boolean; readonly config?: unknown }): Promise<PluginHandleInfo>
  /** Reuse the replace path with the same code (HP:98). */
  updateConfig(id: string, patch: unknown, expectedRevision?: number): Promise<void>
  /** Read-only view of the current managed set, including static/quarantined/shadowed. */
  plugins(): readonly PluginHandleInfo[]
  /** Current resolved config of one managed plugin's live generation. */
  configOf(id: string): unknown | undefined
  /** Current config revision; unknown id returns undefined. */
  configRevisionOf(id: string): number | undefined
  /**
   * Evaluate one operation without changing state (PO:242). Async since
   * install/replace sources resolve through the manager's resolver; source
   * resolution is pure-read with zero staging side effects (2026-08-08
   * ruling #4).
   */
  plan(operation: PluginOperation): Promise<PluginOperationPlan>
  /**
   * Plan one declarative install (`dsh.mygo` from a folder/archive/git
   * source) against the live managed set, without resolving an inline/npm
   * source. Panel installers call this to preview required-by actions and
   * warnings before writing any bridge row.
   */
  planInstall(declaration: {
    readonly id: string
    readonly version?: string
    readonly compatibility?: PluginCompatibility
    readonly provides?: readonly string[]
  }): Promise<PluginOperationPlan>
  /** Bundle rail members (empty when the rail is not wired). */
  bundleList(): readonly import('./bundle-rail.ts').BundleMember[]
  /** 当前 profile 的治理视图（P3：pnpm 安装状态为唯一真相源，实时重建）。 */
  governanceView(): import('./governance.ts').GovernanceView
  /**
   * P4 多实例：用户级实例登记处（家目录 .dsh-mygo/instances.json）只读面。
   * 实例 = $DSH_HOME；每条记录仅 {home, dshVersion, lastSeenAt}，不含插件账。
   */
  instances(): readonly import('./instances.ts').InstanceRecord[]
  /**
   * P5 loader 扩展体系：注册一个安装来源适配器（LoaderAdapter）。受管
   * 插件在 activate/apply 时调用；返回的注销器随插件 fiber 清理调用
   * （启停走治理面）。重复 id 拒绝。
   */
  registerLoaderAdapter(adapter: import('@r05en1cu/dsh-mygo-api').LoaderAdapter): () => void
  /** P5：已注册 loader adapter 发现面（按 id 字典序，确定性）。 */
  loaderAdapters(): readonly import('@r05en1cu/dsh-mygo-api').LoaderAdapter[]
  /**
   * P6 extension 登记表：登记一个扩展（受管扩展插件 activate/apply 时
   * 调用；返回的注销器随插件 fiber 清理）。重复 id 拒绝。
   */
  registerExtension(registration: import('./extensions.ts').ExtensionRegistration): () => void
  /** P6：扩展治理视图（启用态从 profile patch 层受管块推导；版本取 dependencies 子集）。 */
  extensions(): readonly import('./extensions.ts').ExtensionView[]
  /** P4 BOM：导出当前统一依赖图为 `dsh.bom/v1`（JSON + Markdown，原子写）。 */
  bomExport(): Promise<{ readonly bom: import('./bom.ts').BomDocument; readonly jsonPath: string; readonly mdPath: string }>
  /**
   * P4 BOM：只读对账。无参数 = BOM lock vs 当前 profile 集合
   * （missing/extra/drift/约束违例链，零修改）；`target` = 校验新插件
   * 目录的 package.json 声明是否落在 BOM 生态带内。
   */
  bomCheck(options?: { readonly target?: string }): Promise<import('./bom.ts').BomCheckReport>
  /** Install one profile bundle via the official CLI. */
  bundleInstall(spec: string): Promise<import('./bundle-rail.ts').BundleInstallResult>
  /** Uninstall one profile bundle (dependents block first). */
  bundleUninstall(id: string): Promise<void>
  /** Enable/disable one profile bundle through the unified graph. */
  bundleSetEnabled(id: string, enabled: boolean, force?: boolean): Promise<void>
  /** Static-composition self-adoption; not persisted, `origin: 'static'` (#12). */
  adopt(definition: PluginDefinition, config: unknown): Promise<void>
  /**
   * Zero-intrusion static adoption of a raw Cordis plugin module: the
   * manifest is auto-derived from `name`/`inject`/`Config`/`apply` and the
   * generation runs through the host-shaped transparent facade.
   * @param raw - the raw cordis plugin module.
   * @param config - deployment config validated against the raw Config schema.
   * @param id - optional manager-side plugin id; defaults to the derived id.
   * @param declaration - optional declarative overrides read from the
   * installed package's `dsh.mygo` section (version / entrypoints /
   * compatibility).
   */
  adoptRaw(
    raw: RawCordisFunctionPlugin,
    config: unknown,
    id?: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginHandleInfo>
  /**
   * Live-update a previously adopted raw plugin: re-derive the manifest from
   * the new module and run the HMR replace protocol (capture → stage → swap
   * → dispose) so in-progress sessions and the host process stay live.
   * @param raw - the new raw Cordis plugin module.
   * @param config - deployment config for the new generation.
   * @param id - the existing manager-side plugin id (required).
   * @param declaration - optional declarative overrides from the new package.
   * @returns the updated plugin handle.
   */
  updateRaw(
    raw: RawCordisFunctionPlugin,
    config: unknown,
    id: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginHandleInfo>
  /**
   * Remove an uninstall tombstone so a previously uninstalled static/bundle
   * plugin can be adopted again.
   * @param id - plugin id whose tombstone should be cleared.
   */
  clearUninstallTombstone(id: string): Promise<void>
  /**
   * Pre-mount support check: derive the managed manifest from a raw plugin
   * and verify the host can satisfy its declared requires, without mutating
   * any state. Bridge callers use this to skip unsupported plugins at boot
   * instead of letting one broken row fail the whole plugin tree.
   * @param raw - the raw Cordis plugin module.
   * @param id - optional manager-side plugin id; defaults to the derived id.
   * @param declaration - optional declarative overrides to include in the
   * support verdict (entrypoints need no host support; compatibility does).
   * @returns `{ ok: true }` or `{ ok: false, reason }`.
   */
  checkSupport(
    raw: RawCordisFunctionPlugin,
    id?: string,
    declaration?: RawPluginDeclaration,
  ): Promise<PluginSupportCheck>
  /**
   * Pure compatibility preflight against the live managed set: whether a
   * plugin declaring `version`/`compatibility` would violate any
   * `requires`/`breaks` constraint. The panel installer calls this before
   * writing the bridge so a bad combination is refused early.
   */
  checkCompatibility(declaration: {
    readonly id: string
    readonly version?: string
    readonly compatibility?: PluginCompatibility
  }): CompatibilityReport
}

/** Result of a pre-mount support check. */
export type PluginSupportCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** Inputs the mount-time validation chain needs beyond the manifest. */
export interface MountValidationOptions {
  /** Source the plugin comes from. */
  readonly source: PluginSource | { readonly type: 'static' }
  /** Channel identity. */
  readonly origin: 'static' | InstallOrigin
  /** Deployment-protected `'<event>.<property>'` fields. */
  readonly protectedFields?: readonly string[]
  /** Harness event vocabulary; defaults to the generated `EVENT_VOCABULARY`. */
  readonly vocabulary?: readonly PluginEventVocabularyEntry[]
}

/** Outcome of a successful mount-time validation pass. */
export interface MountValidationResult {
  /** Non-fatal warnings the caller must surface (16.4), e.g. `development-mode`. */
  readonly warnings: readonly string[]
}

/**
 * Slot classification for append ordering (§9, #4): host-sorted slots carry
 * their own contribution order key (`systemPrompt.section({order})`), so
 * appends are order-neutral; chain-ordered slots assemble in derived order
 * (`PostToolDecision.additionalContexts`), so appends are position-observable.
 * Unknown slots default to `chain-ordered` (conservative).
 */
export type SlotKind = 'host-sorted' | 'chain-ordered'

/**
 * One validated plugin declaration in the installed set (#13 input). The
 * manager's derivation is a pure function of this set: no install history,
 * config line order, import resolution order, or timing enters the verdict.
 */
export interface PluginDeclarationInput {
  /** Plugin id; the ordering tie-break and registry identity. */
  readonly id: string
  /** Manifest version; the package-constraint check anchor. */
  readonly version?: string
  /** Validated §5 declaration block (observe/transform/intercept/position/claims). */
  readonly permissions: PermissionsBlock
  /** Service ids this plugin consumes; the dependent graph for uninstall/replace. */
  readonly requires: readonly string[]
  /** Service ids this plugin provides; the claims/shadowing surface (§12). */
  readonly provides: readonly string[]
  /** Scope keys this plugin is registered on; empty/absent = unscoped (every scope). */
  readonly scopes?: readonly string[]
  /** Enabled plugins participate in derived dispatch order; default `true`. */
  readonly enabled?: boolean
  /** Static compositions win over dynamic installs of the same id (T2-4); default `runtime-api`. */
  readonly origin?: 'static' | InstallOrigin
  /** Which management rail owns this member; defaults to the bridge rail. */
  readonly rail?: 'bridge' | 'bundle'
  /** Declared package-level constraints against sibling managed plugins. */
  readonly compatibility?: PluginCompatibility
}

/** Pure derivation and plan input: the installed set plus deployment facts. */
export interface PlanState {
  /** Validated declaration set, unique plugin ids. */
  readonly plugins: readonly PluginDeclarationInput[]
  /** `'event.property'` slot classification; unknown slots default to `chain-ordered`. */
  readonly slotKinds?: ReadonlyMap<string, SlotKind>
  /**
   * Slots held by raw (unmanaged) Cordis registrations, snapshot supplied by
   * the caller; claims on these fail `claims-unmanaged-incumbent`.
   */
  readonly heldOutsideManager?: readonly string[]
  /** Installed versions by plugin id for package-constraint evaluation. */
  readonly packageVersions?: Readonly<Record<string, string>>
}

/** Derived dispatch order per scope (§9/§11). */
export interface DerivationResult {
  /**
   * Complete per-scope chain order. `'*'` is the unscoped-only order, used
   * for scopes without scoped plugins; each scoped key holds the combined
   * unscoped + scoped order for that scope. Cyclic scopes are absent.
   */
  readonly orders: ReadonlyMap<string, readonly string[]>
  /** Per-plugin order-neutrality flag (#6, PO:53). */
  readonly orderNeutral: ReadonlyMap<string, boolean>
  /** Derived-edge cycles per scope (§10 rule 3). */
  readonly cycles: readonly { readonly scope: string; readonly cycle: readonly string[] }[]
}

/** One relationship conflict or claims verdict from the five rules + §12. */
export interface ConflictIssue {
  /** The §16.2 code the operation would throw. */
  readonly code: PluginErrorCode
  /** Machine-readable naming entities for the code. */
  readonly details: Record<string, unknown>
}

/**
 * Pure plan input: the operation with its validated candidate declaration.
 * The §15.3 `PluginOperation` carries `source`; the service method resolves
 * source → declaration (non-pure evaluation) before calling this function.
 */
export type PlanOperationInput =
  | { readonly op: 'install'; readonly plugin: PluginDeclarationInput }
  | { readonly op: 'uninstall'; readonly id: string }
  | { readonly op: 'replace'; readonly id: string; readonly plugin: PluginDeclarationInput; readonly force?: boolean }
  | { readonly op: 'enable' | 'disable'; readonly id: string; readonly force?: boolean }

/** Base payload of every `plugin/*` event (§15.5). */
export interface PluginLifecycleEventPayload {
  /** Plugin id. */
  readonly id: string
  /** Plugin id, also serving as the display name. */
  readonly name: string
  /** Manifest version of the generation involved. */
  readonly version: string
  /** Generation sequence number involved. */
  readonly generation: number
  /** §16.3 reason when the event accompanies a non-enabled status. */
  readonly reason?: string
  /** Failure code/message on `plugin/replace-failed`. */
  readonly error?: { readonly code: string; readonly message: string }
  /** Bystander displacement on installed/replaced/uninstalled (§15.3 plan). */
  readonly displaced?: readonly {
    readonly id: string
    readonly edge: { readonly from: string; readonly to: string; readonly property: string }
  }[]
  /** Which provides-diff path a replace ran (HP:137 names the three paths). */
  readonly providesPath?: 'unchanged' | 'dropped' | 'added'
}

/**
 * The `ctx.pluginManager` service key (§15). The manager package bridges the
 * upper plugin contract into Cordis; plugin authors never see this key.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Managed-plugin service surface (§15.3): install/uninstall/enable/
     * disable/replace/updateConfig, the read-only plugins() view, the async
     * plan() preview, and static self-adoption through adopt().
     * @dshScopeScan unsupported - one process-global manager per profile.
     */
    pluginManager: PluginManager
    /**
     * Declarative contribution aggregation (entrypoints v1): the owner of an
     * extension-point key registers its adapt function here; any plugin's
     * static manifest contributions surface through `get(key)` in
     * declaring-plugin order.
     */
    entrypoints: EntrypointsService
  }
  interface Events {
    /**
     * A dynamic plugin was installed and activated (§15.5). Observe-only.
     * @param payload - id, name, version, generation, displaced bystanders.
     * @mode emit
     */
    'plugin/installed'(payload: PluginLifecycleEventPayload): void
    /**
     * A plugin generation went live (install, replace, enable, recovery).
     * @param payload - id, name, version, generation.
     * @mode emit
     */
    'plugin/activated'(payload: PluginLifecycleEventPayload): void
    /**
     * A plugin generation was released (replace step ⑥, uninstall, dispose).
     * @param payload - id, name, version, generation.
     * @mode emit
     */
    'plugin/deactivated'(payload: PluginLifecycleEventPayload): void
    /**
     * A replace protocol started; observe-only (decision #2).
     * @param payload - id, name, version, generation.
     * @mode emit
     */
    'plugin/replacing'(payload: PluginLifecycleEventPayload): void
    /**
     * A replace committed; carries the provides-diff path and displacement.
     * @param payload - id, name, version, generation, providesPath, displaced.
     * @mode emit
     */
    'plugin/replaced'(payload: PluginLifecycleEventPayload): void
    /**
     * A replace failed before go-live; the current generation stays live.
     * @param payload - id, name, version, generation, error.
     * @mode emit
     */
    'plugin/replace-failed'(payload: PluginLifecycleEventPayload): void
    /**
     * A plugin was enabled.
     * @param payload - id, name, version, generation.
     * @mode emit
     */
    'plugin/enabled'(payload: PluginLifecycleEventPayload): void
    /**
     * A plugin was disabled; reason when non-empty.
     * @param payload - id, name, version, generation, reason.
     * @mode emit
     */
    'plugin/disabled'(payload: PluginLifecycleEventPayload): void
    /**
     * A plugin was uninstalled; carries displaced bystanders.
     * @param payload - id, name, version, generation, displaced.
     * @mode emit
     */
    'plugin/uninstalled'(payload: PluginLifecycleEventPayload): void
  }
}
