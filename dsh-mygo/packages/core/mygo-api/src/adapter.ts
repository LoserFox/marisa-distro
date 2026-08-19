/**
 * §23.1 Cordis bridge: `fromCordisPlugin` bridges a raw Cordis plugin into a
 * managed definition whose hooks run against a restricted facade
 * (`on`/`get`/`provide`/`logger`), rejecting direct EventOptions with
 * `unsupported-event-option`.
 *
 * P2 裁决（2026-08-13）：`toCordisPlugin` 已删除——它对 manifest 的包装与
 * `definePlugin` 的直接产出语义重复（恒等桥接），挂载面并入 define.ts
 * （非枚举属性形态）。`fromCordisPlugin` 保留且不可替代：它承载零侵入桥接
 * 的全部真实语义——注册面拦截（tools/systemPrompt/httpServer/skills/
 * commands/settings/timers/inject/effect 逐世代跟踪）、宿主副作用热撤销
 * （hostEffect 记账）、node:http 风格 route handler 桥接（SSE 流式响应）、
 * Service 风格类插件挂载。这些不是恒等包装，删除即丢失 adoptRaw 路径。
 * @module @r05en1cu/dsh-mygo-api/src/adapter
 */

import z from '@deepseek-ai/schemastery'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PluginError, formatPluginError } from './error.ts'
import type {
  Logger,
  PluginDefinition,
  PluginEnv,
  Schemastery,
} from './types.ts'
import type {
  PluginCommandDefinition,
  PluginHttpRequest,
  PluginHttpResponse,
  PluginPromptSection,
  StagedSettingsRegistration,
  StagedSettingsScope,
  PluginSkillDefinition,
  PluginToolDefinition,
} from './env.ts'

/**
 * Structural shape of a raw Cordis plugin consumed by {@link fromCordisPlugin}:
 * either a function/`apply`-object plugin, or a Service-style constructor
 * class (the token-meter / compact-basic pattern) whose static `inject` and
 * `Config` are read the same way.
 */
export type RawCordisFunctionPlugin =
  | {
    readonly name?: string
    readonly inject?: readonly string[]
    readonly Config?: unknown
    apply(ctx: unknown, config: unknown): unknown
  }
  | {
    readonly name?: string
    readonly inject?: readonly string[]
    readonly Config?: unknown
    new (ctx: unknown, config?: unknown): unknown
  }

/** Restricted facade a raw plugin's `apply` runs against (§23.1 migration bridge). */
export interface CordisFacade {
  /**
   * Register a listener. Events claimed by the manager (harness vocabulary
   * or the plugin's declared custom events) route through managed dispatch;
   * every other host event is bridged to the raw host bus with Cordis
   * semantics, and `prepend` is honored on that path.
   */
  on(
    event: string,
    listener: (...args: unknown[]) => unknown,
    options?: { readonly prepend?: boolean },
  ): () => void
  /** Register a one-shot listener through the host bridge (tracked for HMR revocation). */
  once(event: string, listener: (...args: unknown[]) => unknown): () => void
  /** Resolve one capability; undeclared capabilities are `undefined` (SEC:86). */
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T is the caller-chosen service type at each call site.
  get<T>(capability: string): T | undefined
  /** Provide one service value through the manager-held table. */
  provide(capability: string, value: unknown): () => void
  /**
   * Register one tool through the manager-held tool table. Accepts the
   * structural `defineTool` output (compiled `parameters`, `output.schema`,
   * `execute`) and maps it to the managed `PluginToolDefinition`; the raw
   * shape's render/presentation functions are not representable and fall
   * back to the generic card.
   */
  tools: {
    register(tool: unknown): () => void
  }
  /**
   * Prompt-section contribution surface (Proposal B): `section` maps onto the
   * manager-held prompt-section table.
   */
  systemPrompt: {
    section(section: unknown): () => void
  }
  /**
   * The declared `sessionPersistence` capability: the manager's read-only
   * projection, or `undefined` when undeclared (SEC:86).
   */
  readonly sessionPersistence: unknown
  readonly logger: Logger
}

/**
 * Bridge a raw Cordis function plugin into a managed definition (§23.1
 * migration bridge): the original `apply` runs against a host-shaped
 * transparent facade inside the managed `activate`. When no declaration is
 * supplied the manifest is derived from the plugin itself (`name`, `inject`,
 * `Config`), so a stock dsh-external Cordis plugin mounts with zero code
 * changes. Registration-facing surfaces (`on`, `tools`, `systemPrompt`,
 * `httpServer`, `skills`, `commands`, `provide`, `effect`, timer verbs) are
 * intercepted and tracked per generation; every other `ctx.*` property is
 * forwarded to the raw host context.
 * @param raw - the raw cordis plugin (its own inject list is not honored).
 * @param declaration - optional explicit managed manifest without hooks;
 * when omitted the manifest is auto-derived from the raw plugin shape.
 * @returns the managed definition.
 */
export function fromCordisPlugin(
  raw: RawCordisFunctionPlugin,
  declaration?: Omit<PluginDefinition, 'hooks'>,
): PluginDefinition {
  const id = declaration?.id ?? pluginIdOf(raw)
  const config = (raw.Config ?? z.object({})) as Schemastery
  let resolvedConfig: unknown = undefined
  return {
    ...(declaration ?? {
      id,
      version: '0.0.0-raw',
      kinds: [],
      events: [],
      requires: raw.inject ?? [],
      provides: [],
      permissions: {
        observe: [],
        transform: [],
        intercept: [],
        position: 'derived',
        claims: [],
      },
      stateful: false,
      swapPolicy: 'immediate',
    }),
    config,
    hooks: {
      async setup(_env, configValue) {
        resolvedConfig = configValue
        return Promise.resolve()
      },
      activate(env) {
        const facade = createFacade(env, id)
        const configValue = resolvedConfig === undefined
          ? (raw.Config === undefined ? {} : (raw.Config as (input?: unknown) => unknown)({}))
          : resolvedConfig
        if (isConstructor(raw)) {
          // Service-style plugins mount as classes (`new raw(ctx, config)`),
          // the token-meter / compact-basic pattern.
          new (raw as new (ctx: unknown, config?: unknown) => unknown)(facade, configValue)
          return undefined
        }
        // Return the apply result so async activations settle inside staging:
        // a rejection becomes a clean staging failure instead of an
        // unhandled rejection that can take the host process down.
        return raw.apply(facade, configValue)
      },
    },
  } as PluginDefinition
}

/** Whether a raw plugin entry is a class constructor rather than a function plugin. */
function isConstructor(
  value: RawCordisFunctionPlugin,
): value is RawCordisFunctionPlugin & { new (ctx: unknown, config?: unknown): unknown } {
  return typeof value === 'function'
    && /^class\s/.test(Function.prototype.toString.call(value))
}

/** Derive a manifest-safe plugin id from a raw Cordis plugin name. */
function pluginIdOf(raw: RawCordisFunctionPlugin): string {
  const name = raw.name ?? 'raw-plugin'
  const base = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name
  const cleaned = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'raw-plugin'
}

/** Resolve the host settings service through the facade's host escape hatch. */
function liveSettings(env: PluginEnv): Record<string, any> | undefined {
  const fromEnv = env.get?.('settings')
  if (fromEnv !== undefined) return fromEnv as Record<string, any>
  try {
    const host = env.host as { settings?: Record<string, any> } | undefined
    return host?.settings
  } catch {
    return undefined
  }
}

/**
 * Layer `over` onto `under` like the settings service does: plain objects
 * merge recursively, every other value replaces wholesale, and `undefined`
 * entries are skipped. Kept local so staging can resolve a namespace value
 * without touching the live settings registry.
 */
function mergeSettingsLayers(under: unknown, over: unknown): unknown {
  if (over === undefined) return under
  if (typeof under !== 'object' || under === null || Array.isArray(under)
    || typeof over !== 'object' || over === null || Array.isArray(over)) return over
  const merged: Record<string, unknown> = { ...(under as Record<string, unknown>) }
  for (const [key, value] of Object.entries(over as Record<string, unknown>)) {
    merged[key] = key in merged ? mergeSettingsLayers(merged[key], value) : value
  }
  return merged
}

/** Deep-freeze one resolved settings snapshot, matching host scope semantics. */
function freezeSettingsValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const entry of Object.values(value as Record<string, unknown>)) freezeSettingsValue(entry)
  return Object.freeze(value)
}

/**
 * Resolve a staged namespace value: schema defaults, then the new generation's
 * composition `base`, then the stored user section (read through `describe`
 * when the namespace is currently registered by the incumbent).
 */
function resolveStagedSettingsValue(
  ns: string,
  schema: unknown,
  options: StagedSettingsRegistration['options'],
  env: PluginEnv,
): unknown {
  let user: Record<string, unknown> | undefined
  try {
    const descriptors = liveSettings(env)?.describe?.() ?? []
    user = descriptors.find((descriptor: { ns?: unknown }) => String(descriptor.ns) === String(ns))?.user
  } catch {
    user = undefined
  }
  const value = (schema as (input: unknown) => unknown)(mergeSettingsLayers(options?.base, user))
  options?.validate?.(value)
  return freezeSettingsValue(value)
}

/** Staging scope handed to a raw plugin until the generation commits. */
type LiveSettingsScope = {
  get(): unknown
  watch(callback: (next: unknown, prev: unknown) => void | Promise<void>): () => void
}

function createStagedSettingsScope(
  env: PluginEnv,
  ns: string,
  schema: unknown,
  options: StagedSettingsRegistration['options'],
): StagedSettingsScope {
  let liveScope: LiveSettingsScope | undefined
  const pending = new Set<(next: unknown, prev: unknown) => void | Promise<void>>()
  return {
    get(): unknown {
      return liveScope === undefined
        ? resolveStagedSettingsValue(ns, schema, options, env)
        : liveScope.get()
    },
    watch(callback) {
      const attached = liveScope
      if (attached !== undefined) return attached.watch(callback)
      pending.add(callback)
      return () => { pending.delete(callback) }
    },
    attach(live: unknown) {
      if (liveScope !== undefined) return
      const target = live as LiveSettingsScope | undefined
      liveScope = target
      if (target !== undefined) {
        for (const callback of pending) target.watch(callback)
      }
      pending.clear()
    },
  }
}

/**
 * Staged settings surface for the zero-intrusion facade. `register` captures
 * the namespace for commit (the live host service is never touched during
 * staging, because its registration map is global and the incumbent still
 * owns the namespace); every other verb delegates to the live service. When
 * the host has no settings service the surface is `undefined`, preserving the
 * raw-host fallback semantics (a plugin reading `ctx.settings` sees nothing).
 */
function createStagedSettings(env: PluginEnv, pluginId: string): Record<string, any> | undefined {
  if (liveSettings(env) === undefined) return undefined
  return new Proxy({
    register(ns: string, schema: unknown, options?: StagedSettingsRegistration['options']) {
      const stagedScope = createStagedSettingsScope(env, ns, schema, options)
      env.registerSettings({
        kind: 'settings-registration',
        pluginId,
        ns,
        schema,
        stagedScope,
        ...(options === undefined ? {} : { options }),
      })
      return stagedScope
    },
  }, {
    get(target, prop) {
      if (prop === 'register') return target.register
      const service = liveSettings(env)
      if (service === undefined) return undefined
      const value = service[prop as string]
      return typeof value === 'function' ? value.bind(service) : value
    },
  })
}

function createFacade(env: PluginEnv, pluginId: string): CordisFacade {
  // The harness's raw-plugin idiom historically supports both `ctx.logger('name')`
  // (factory) and `ctx.logger.info(...)` (object). The facade logger is the
  // manager's rate-limited object; calling it as a function returns the same
  // object so both shapes mount without plugin-side edits.
  const loggerObject = env.logger
  const logger = ((_name: string) => logger) as unknown as Logger & ((name: string) => Logger)
  Object.assign(logger, loggerObject)

  const toolsService = hostPassthrough({
    register(tool: unknown): () => void {
      const raw = tool as {
        readonly name?: unknown
        readonly description?: unknown
        readonly parameters?: Record<string, unknown>
        readonly output?: {
          readonly schema?: Record<string, unknown>
          readonly render?: (args: unknown, value: unknown) => unknown
          readonly presentationMeta?: (args: unknown, value: unknown) => unknown
        }
        readonly presentCall?: (args: unknown) => unknown
        readonly presentResult?: (args: unknown, result: unknown) => unknown
        readonly timeoutMs?: number
        readonly isConcurrencySafe?: (args: unknown) => boolean
        readonly finalizeContent?: (exec: unknown, result: unknown) => unknown[] | undefined
        readonly execute?: (args: unknown, exec?: unknown) => unknown
      }
      if (typeof raw.name !== 'string' || typeof raw.description !== 'string'
        || typeof raw.execute !== 'function') {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'tool',
            expected: 'name/description strings and an execute function',
          }),
          { field: 'tool', expected: 'name/description strings and an execute function' },
          pluginId,
        )
      }
      const definition: PluginToolDefinition = {
        name: raw.name,
        description: raw.description,
        input: raw.parameters ?? {},
        output: raw.output?.schema ?? {},
        ...(raw.output?.render === undefined ? {} : { outputRender: raw.output.render }),
        ...(raw.output?.presentationMeta === undefined
          ? {}
          : { outputPresentationMeta: raw.output.presentationMeta }),
        ...(raw.presentCall === undefined ? {} : { presentCall: raw.presentCall }),
        ...(raw.presentResult === undefined ? {} : { presentResult: raw.presentResult }),
        ...(raw.timeoutMs === undefined ? {} : { timeoutMs: raw.timeoutMs }),
        ...(raw.isConcurrencySafe === undefined ? {} : { isConcurrencySafe: raw.isConcurrencySafe }),
        ...(raw.finalizeContent === undefined ? {} : { finalizeContent: raw.finalizeContent }),
        execute: (args: unknown, exec) => Promise.resolve(raw.execute?.(args, exec)),
        renderIntent: { card: 'generic' },
      }
      return env.registerTool(definition)
    },
  }, 'tools', env, pluginId)

  const promptService = hostPassthrough({
    section(section: unknown): () => void {
      const raw = section as {
        readonly name?: unknown
        readonly order?: unknown
        readonly text?: unknown
      }
      if (typeof raw.name !== 'string' || typeof raw.order !== 'number' || !Number.isFinite(raw.order)
        || (typeof raw.text !== 'string' && typeof raw.text !== 'function')) {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'prompt-section',
            expected: 'name string, finite order, and string-or-function text',
          }),
          { field: 'prompt-section', expected: 'name string, finite order, and string-or-function text' },
          pluginId,
        )
      }
      return env.registerPromptSection({
        name: raw.name,
        order: raw.order,
        text: raw.text as PluginPromptSection['text'],
      })
    },
  }, 'systemPrompt', env, pluginId)

  const skillsService = hostPassthrough({
    register(definition: PluginSkillDefinition): () => void {
      if (typeof definition?.name !== 'string' || typeof definition?.description !== 'string'
        || typeof definition?.content !== 'string') {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'skill',
            expected: 'name/description/content strings',
          }),
          { field: 'skill', expected: 'name/description/content strings' },
          pluginId,
        )
      }
      return env.skills.register(definition)
    },
  }, 'skills', env, pluginId)

  const commandsService = hostPassthrough({
    register(definition: PluginCommandDefinition): () => void {
      if (typeof definition?.name !== 'string' || typeof definition?.description !== 'string'
        || typeof definition?.handler !== 'function') {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'command',
            expected: 'name/description strings and a handler function',
          }),
          { field: 'command', expected: 'name/description strings and a handler function' },
          pluginId,
        )
      }
      return env.commands.register(definition)
    },
  }, 'commands', env, pluginId)

  const httpServerService = hostPassthrough({
    register(route: unknown): () => void {
      const raw = route as {
        readonly kind?: unknown
        readonly path?: unknown
        readonly handler?: unknown
        readonly streamIdleMs?: number
      }
      if (typeof raw?.path !== 'string' || typeof raw?.handler !== 'function') {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'http-route',
            expected: 'path string and a node:http-style handler',
          }),
          { field: 'http-route', expected: 'path string and a node:http-style handler' },
          pluginId,
        )
      }
      return env.http.register({
        method: '*',
        path: raw.path,
        kind: raw.kind === 'prefix' ? 'prefix' : 'exact',
        ...(typeof raw.streamIdleMs === 'number' ? { streamIdleMs: raw.streamIdleMs } : {}),
        handler: async (request: PluginHttpRequest): Promise<PluginHttpResponse> => {
          return await rawHttpBridge(
            request,
            raw.handler as (req: unknown, res: unknown) => unknown,
            { ...(typeof raw.streamIdleMs === 'number' ? { streamIdleMs: raw.streamIdleMs } : {}) },
          )
        },
      })
    },
  }, 'httpServer', env, pluginId)

  const trackedTimers = new Set<NodeJS.Timeout>()
  const settingsSurface = createStagedSettings(env, pluginId)
  env.effect(() => {
    for (const handle of trackedTimers) clearTimeout(handle)
    trackedTimers.clear()
  }, `${pluginId}:timers`)

  const timerVerbs = {
    setTimeout(callback: () => void, ms?: number, ...args: unknown[]): NodeJS.Timeout {
      const handle = setTimeout(callback, ms, ...args) as unknown as NodeJS.Timeout
      trackedTimers.add(handle)
      return handle
    },
    setInterval(callback: () => void, ms?: number, ...args: unknown[]): NodeJS.Timeout {
      const handle = setInterval(callback, ms, ...args) as unknown as NodeJS.Timeout
      trackedTimers.add(handle)
      return handle
    },
    clearTimeout(handle: NodeJS.Timeout): void {
      trackedTimers.delete(handle)
      clearTimeout(handle)
    },
    clearInterval(handle: NodeJS.Timeout): void {
      trackedTimers.delete(handle)
      clearInterval(handle)
    },
  }

  const interceptGet = (capability: string): unknown => {
    switch (capability) {
      case 'tools': return toolsService
      case 'systemPrompt': return promptService
      case 'httpServer': return httpServerService
      case 'skills': return skillsService
      case 'commands': return commandsService
      case 'settings': return settingsSurface
      default: return env.get(capability)
    }
  }

  const inject = (deps: unknown, callback: unknown): (() => void) => {
    if (typeof callback !== 'function') {
      throw new PluginError(
        'manifest-invalid',
        formatPluginError('manifest-invalid', {
          field: 'inject',
          expected: 'a callback function',
        }),
        { field: 'inject', expected: 'a callback function' },
        pluginId,
      )
    }
    void deps
    const scoped = createFacade(env, pluginId)
    const disposer = (callback as (ctx: unknown) => unknown)(scoped)
    if (typeof disposer === 'function') {
      env.effect(disposer as () => void, `${pluginId}:inject`)
    }
    return () => {}
  }

  const target: CordisFacade & Record<string, unknown> = {
    on(event, listener, options) {
      return (env.on as (
        eventName: string,
        fn: (...args: unknown[]) => unknown,
        options?: { readonly prepend?: boolean },
      ) => () => void)(event, listener, options)
    },
    once(event, listener) {
      return env.onHost(event, listener, { once: true })
    },
    effect(callback: unknown, name?: string): void {
      if (typeof callback !== 'function') {
        throw new PluginError(
          'manifest-invalid',
          formatPluginError('manifest-invalid', {
            field: 'effect',
            expected: 'a callback function',
          }),
          { field: 'effect', expected: 'a callback function' },
          pluginId,
        )
      }
      // Cordis semantics: the effect callback runs NOW (it usually performs the
      // registration and returns a disposer); only the returned disposer is
      // collected for generation teardown.
      const disposer = (callback as () => unknown)()
      if (typeof disposer === 'function') {
        // Host-registration passthrough already registered the disposer as a
        // hot-revocable host side effect; do not double-register it.
        if (isHostSideEffect(disposer)) return
        env.effect(() => { (disposer as () => void)() }, name)
      }
    },
    inject,
    get: <T>(capability: string): T | undefined => interceptGet(capability) as T | undefined,
    provide: (capability, value) => env.provide(capability, value),
    plugin(): never {
      throw new Error(
        'mygo 暂不支持插件在 apply 内通过 ctx.plugin 组合子插件（Service/工具子插件）；'
        + '请把子插件作为独立插件安装，或让插件作者改为直接注册',
      )
    },
    tools: toolsService as CordisFacade['tools'],
    systemPrompt: promptService as CordisFacade['systemPrompt'],
    httpServer: httpServerService,
    skills: skillsService,
    commands: commandsService,
    settings: settingsSurface,
    scope(agentId: string): CordisFacade {
      return createFacade(env.scope(agentId as SessionId), pluginId)
    },
    emit(event: string, payload?: unknown): void {
      env.emit(event, payload)
    },
    get sessionPersistence(): unknown {
      return env.get('sessionPersistence')
    },
    logger,
  }

  return new Proxy(target, {
    get(proxyTarget, prop, receiver) {
      if (typeof prop !== 'string') return undefined
      if (prop in proxyTarget) {
        if (prop === 'logger') return proxyTarget.logger
        const value = Reflect.get(proxyTarget, prop, receiver)
        return typeof value === 'function' ? value.bind(proxyTarget) : value
      }
      if (prop === 'setTimeout' || prop === 'setInterval' || prop === 'clearTimeout' || prop === 'clearInterval') {
        return timerVerbs[prop]
      }
      // Declared capabilities first (raw `inject` → derived `requires`): the
      // manager/host seam resolves them without Cordis's inject guard, so a
      // plugin reading `ctx.settings` etc. gets the service (or `undefined`
      // when the host genuinely lacks it) instead of "without inject".
      const managed = env.get(prop)
      if (managed !== undefined) return managed
      // Host property passthrough for the zero-intrusion escape hatch. Cordis
      // ctx property getters throw "without inject" for undeclared services;
      // that is a fallback signal, not a failure — `env.get` already answered.
      const host = env.host as Record<string, unknown> | undefined
      if (host !== undefined) {
        try {
          const value = (host as Record<string, unknown>)[prop]
          if (value !== undefined) return typeof value === 'function' ? value.bind(host) : value
        } catch {
          // not injectable through the raw host: stay undefined
        }
      }
      return undefined
    },
  })
}

/**
 * Wrap one manager-mediated service shape as a proxy: known members stay
 * manager-held (staged registrations with generation disposal), every other
 * member forwards to the real host service of the same name — the
 * `httpServer.tapIndex` pattern generalized to tools / systemPrompt / skills /
 * commands. Host methods are bound to the host service so `this` works.
 *
 * Registration-class host methods (`tapIndex`, `registerUpgrade`,
 * `registerProvider`, `registerFallback`, `context`) are wrapped: when the
 * call returns a disposer, it is recorded through `env.hostEffect` so the
 * manager can revoke the host side effect on release AND on disable — even
 * when the plugin discards the return value. The disposer is also tagged, so
 * a plugin passing it to `ctx.effect` does not double-register it.
 * @param registered - the manager-mediated members.
 * @param hostName - host service name resolved through `env.get`.
 * @param env - the managed env whose host seam resolves the service.
 * @param pluginId - owning plugin id for effect labels.
 */
function hostPassthrough(
  registered: Record<string, unknown>,
  hostName: string,
  env: PluginEnv,
  pluginId: string,
): Record<string, unknown> {
  return new Proxy(registered, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') return undefined
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }
      let host = env.get(hostName) as Record<string, unknown> | undefined
      if (host === undefined) {
        // Test harnesses (and hosts without an explicit hostService seam)
        // resolve the service through the raw host context instead.
        try {
          const raw = env.host as { [key: string]: unknown } | undefined
          host = raw?.[hostName] as Record<string, unknown> | undefined
        } catch {
          host = undefined
        }
      }
      if (host === undefined) return undefined
      const value = (host as Record<string, unknown>)[prop]
      if (typeof value !== 'function') return value
      const bound = (value as (...args: unknown[]) => unknown).bind(host)
      if (!HOST_REGISTRATION_METHODS.has(String(prop))) return bound
      // Registration-class host method: record the returned disposer as a
      // hot-revocable host side effect and tag it against double registration.
      const wrapped = (...args: unknown[]): unknown => {
        const result = bound(...args)
        if (typeof result === 'function') {
          tagHostSideEffect(result)
          env.hostEffect(() => { (result as () => void)() }, `${pluginId}:${hostName}.${String(prop)}`)
        }
        return result
      }
      return wrapped
    },
  })
}

/** Host-registration methods whose returned disposer the manager may revoke. */
const HOST_REGISTRATION_METHODS: ReadonlySet<string> = new Set([
  'tapIndex',
  'registerProvider',
  'context',
  'registerUpgrade',
  'registerFallback',
])

/** Tag key marking a disposer already recorded as a host side effect. */
const HOST_SIDE_EFFECT = Symbol.for('dsh.mygo.hostSideEffect')

function tagHostSideEffect(disposer: unknown): void {
  try {
    ;(disposer as unknown as Record<PropertyKey, unknown>)[HOST_SIDE_EFFECT] = true
  } catch {
    // Frozen/opaque disposer: the env.hostEffect registration above already
    // covers revocation; the tag only guards against double registration.
  }
}

function isHostSideEffect(disposer: unknown): boolean {
  try {
    return (disposer as unknown as Record<PropertyKey, unknown>)[HOST_SIDE_EFFECT] === true
  } catch {
    return false
  }
}

/** Options accepted by the raw HTTP bridge. */
interface RawHttpBridgeOptions {
  /** Idle timeout (no writes) after which an open response stream closes; default 30s. */
  readonly streamIdleMs?: number
}

/** Default idle timeout for open (SSE-style) response streams. */
const DEFAULT_STREAM_IDLE_MS = 30_000

/**
 * Bridge a node:http-style raw route handler onto the managed request/response
 * contract. The request shim exposes the buffered body through the async
 * iterator and `data`/`end` events; the response shim carries the node
 * semantics ecosystem handlers use (`writeHead`/`write`/`end`/`pipe`/
 * `flushHeaders`/statusMessage) and, when the handler keeps the response open
 * (SSE, file pipes), returns a live `stream` so the host pipeline forwards
 * chunks as they arrive instead of buffering until a 30s timeout.
 */
async function rawHttpBridge(
  request: PluginHttpRequest,
  handler: (req: unknown, res: unknown) => unknown,
  options: RawHttpBridgeOptions = {},
): Promise<PluginHttpResponse> {
  const streamIdleMs = options.streamIdleMs ?? DEFAULT_STREAM_IDLE_MS
  const body = request.body
  const reqListeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const reqEmit = (event: string, ...args: unknown[]): void => {
    for (const listener of [...(reqListeners.get(event) ?? [])]) listener(...args)
  }
  const req = {
    method: request.method,
    url: request.url ?? request.path,
    headers: request.headers,
    // Node's `IncomingMessage` is an async iterable stream; plugins commonly
    // read bodies with `for await (const chunk of req)`. The shim yields the
    // buffered body once so those handlers work unchanged.
    async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
      if (body.length > 0) yield Buffer.from(body, 'utf8')
    },
    on(event: string, listener: (...args: unknown[]) => void): unknown {
      if (event === 'data' && body.length > 0) listener(Buffer.from(body, 'utf8'))
      if (event === 'end') listener()
      const list = reqListeners.get(event) ?? []
      list.push(listener)
      reqListeners.set(event, list)
      return req
    },
    once(event: string, listener: (...args: unknown[]) => void): unknown {
      const wrapper = (...args: unknown[]): void => {
        const list = reqListeners.get(event)
        if (list !== undefined) {
          const index = list.indexOf(wrapper)
          if (index >= 0) list.splice(index, 1)
        }
        listener(...args)
      }
      return this.on(event, wrapper)
    },
    removeListener(event: string, listener: (...args: unknown[]) => void): unknown {
      const list = reqListeners.get(event)
      if (list !== undefined) {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      }
      return req
    },
    off(event: string, listener: (...args: unknown[]) => void): unknown {
      return this.removeListener(event, listener)
    },
    emit: reqEmit,
    setEncoding(_encoding: string): unknown {
      return req
    },
    destroy(): unknown {
      return req
    },
    get aborted(): boolean {
      return false
    },
    get complete(): boolean {
      return true
    },
    get readable(): boolean {
      return true
    },
    get socket(): undefined {
      return undefined
    },
  }
  const state: { statusCode: number; statusMessage: string | undefined; headers: Record<string, string> } = {
    statusCode: 200,
    statusMessage: undefined,
    headers: {},
  }
  const chunks: Buffer[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const waiters: Array<() => void> = []
  let ended = false
  let idleTimer: NodeJS.Timeout | undefined
  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(...args)
  }
  const finish = (): void => {
    if (ended) return
    ended = true
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = undefined
    for (const waiter of waiters.splice(0)) waiter()
    emit('finish')
    emit('end')
    emit('close')
    reqEmit('close')
  }
  const resetIdle = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = setTimeout(finish, streamIdleMs)
    idleTimer.unref?.()
  }
  const push = (chunk: Buffer): void => {
    chunks.push(chunk)
    for (const waiter of waiters.splice(0)) waiter()
    resetIdle()
  }
  const toBuffer = (chunk: unknown): Buffer => {
    if (Buffer.isBuffer(chunk)) return chunk
    if (chunk instanceof Uint8Array) return Buffer.from(chunk)
    return Buffer.from(String(chunk))
  }
  const res = {
    get statusCode(): number {
      return state.statusCode
    },
    set statusCode(value: number) {
      state.statusCode = value
    },
    get statusMessage(): string | undefined {
      return state.statusMessage
    },
    set statusMessage(value: string | undefined) {
      state.statusMessage = value
    },
    setHeader(name: string, value: string | readonly string[]): void {
      state.headers[name] = Array.isArray(value) ? value.join(', ') : String(value)
    },
    getHeader(name: string): string | undefined {
      return state.headers[name]
    },
    getHeaders(): Record<string, string> {
      return { ...state.headers }
    },
    hasHeader(name: string): boolean {
      return name in state.headers
    },
    removeHeader(name: string): void {
      delete state.headers[name]
    },
    writeHead(status: number, reasonOrHeaders?: string | Record<string, string>, headers?: Record<string, string>): void {
      state.statusCode = status
      if (typeof reasonOrHeaders === 'string') {
        state.statusMessage = reasonOrHeaders
        if (headers !== undefined) Object.assign(state.headers, headers)
      } else if (reasonOrHeaders !== undefined) {
        Object.assign(state.headers, reasonOrHeaders)
      }
    },
    flushHeaders(): void {
      // Headers are carried by the returned managed response; nothing to flush.
    },
    write(chunk: string | Buffer | Uint8Array, _encoding?: unknown, callback?: () => void): boolean {
      push(toBuffer(chunk))
      callback?.()
      return true
    },
    end(chunk?: string | Buffer | Uint8Array, _encoding?: unknown, callback?: () => void): void {
      if (chunk !== undefined) push(toBuffer(chunk))
      finish()
      callback?.()
    },
    // dsh-stickers-style file delivery: `createReadStream(path).pipe(response)`.
    pipe(source: unknown): unknown {
      const readable = source as { on(event: string, listener: (...args: unknown[]) => void): unknown }
      readable.on('data', (chunk: unknown) => { push(toBuffer(chunk)) })
      readable.on('end', () => { finish() })
      readable.on('close', () => { finish() })
      readable.on('error', (error: unknown) => {
        emit('error', error)
        finish()
      })
      return res
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return res
    },
    once(event: string, listener: (...args: unknown[]) => void) {
      const wrapper = (...args: unknown[]): void => {
        const list = listeners.get(event)
        if (list !== undefined) {
          const index = list.indexOf(wrapper)
          if (index >= 0) list.splice(index, 1)
        }
        listener(...args)
      }
      return this.on(event, wrapper)
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      const list = listeners.get(event)
      if (list !== undefined) {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      }
      return res
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      return this.removeListener(event, listener)
    },
    emit,
    destroy(): void {
      finish()
    },
    get writableEnded(): boolean {
      return ended
    },
    get writableFinished(): boolean {
      return ended
    },
  }
  // Run the raw handler without blocking on long-lived SSE handlers that
  // never settle. Static handlers settle on the next microtask; handlers that
  // end synchronously produce the static response below, everything else
  // returns a live stream consumed by the host pipeline.
  const handlerPromise = Promise.resolve().then(() => handler(req, res))
  void handlerPromise.then(
    () => {},
    (error: unknown) => {
      emit('error', error)
      finish()
    },
  )
  await Promise.resolve()
  if (ended) return staticResponse()
  resetIdle()
  return streamingResponse()

  function staticResponse(): PluginHttpResponse {
    const buffer = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks)
    const contentType = state.headers['content-type'] ?? state.headers['Content-Type'] ?? ''
    const textLike = /^(?:text\/|application\/(?:json|javascript)|image\/svg\+xml)/i.test(contentType)
    return {
      status: state.statusCode,
      headers: state.headers,
      body: textLike ? buffer.toString('utf8') : new Uint8Array(buffer),
    }
  }

  function streamingResponse(): PluginHttpResponse {
    const nextChunk = (): Promise<Buffer | undefined> => {
      return (async () => {
        for (;;) {
          if (chunks.length > 0) return chunks.shift()
          if (ended) return undefined
          await new Promise<void>((resolve) => { waiters.push(resolve) })
        }
      })()
    }
    const stream = (async function* (): AsyncGenerator<Uint8Array> {
      try {
        for (;;) {
          const chunk = await nextChunk()
          if (chunk === undefined) return
          yield chunk
        }
      } finally {
        if (idleTimer !== undefined) clearTimeout(idleTimer)
        idleTimer = undefined
        // A consumer that abandons the stream must not leave waiters pending.
        for (const waiter of waiters.splice(0)) waiter()
      }
    })()
    return {
      status: state.statusCode,
      headers: state.headers,
      stream,
    }
  }
}
