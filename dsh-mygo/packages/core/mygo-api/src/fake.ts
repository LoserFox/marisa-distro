/**
 * Fake-env test surface: a faithful-in-shape `PluginEnv` implementation with
 * recording and trigger helpers, so plugin authors can unit-test a
 * `definePlugin` without importing Cordis.
 * @module @r05en1cu/dsh-mygo-api/src/fake
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PluginError, formatPluginError } from './error.ts'
import type {
  Disposable,
  Logger,
  PluginEnv,
  PluginEventArgs,
  PluginEventName,
  PluginEventListener,
  PluginHandleInfo,
  PluginSource,
  InstallOptions,
} from './types.ts'
import type {
  PluginCommandDefinition,
  PluginCommands,
  PluginExec,
  PluginExecRequest,
  PluginExecResult,
  PluginFs,
  PluginHttp,
  PluginHttpRouteSpec,
  PluginModel,
  PluginModelRequest,
  PluginModelResponse,
  PluginPromptSection,
  PluginSkillDefinition,
  PluginSkills,
  StagedSettingsRegistration,
  PluginToolDefinition,
  PluginVars,
} from './env.ts'

/** Options accepted by {@link createFakeEnv}. */
export interface FakePluginEnvOptions {
  /** Capabilities the fixture plugin declares in `requires`; everything else resolves as `undefined`. */
  readonly requires?: readonly string[]
  /** Values `get` returns for declared capabilities. */
  readonly services?: Readonly<Record<string, unknown>>
  /** View returned by `plugins()`. */
  readonly plugins?: readonly PluginHandleInfo[]
  /** Seed store for `env.fs`; `write` updates it and `read` falls back to an empty buffer. */
  readonly files?: ReadonlyMap<string, Uint8Array>
  /** Seed store for `env.vars`; `set` updates it. */
  readonly vars?: Readonly<Record<string, string>>
  /** Response producer for `env.llm.complete`; defaults to an empty completion. */
  readonly llmHandler?: (request: PluginModelRequest) => Promise<PluginModelResponse>
  /** Result producer for `env.exec.run`; defaults to a zero-exit empty result. */
  readonly execHandler?: (request: PluginExecRequest) => Promise<PluginExecResult>
  /** Result producer for `env.install`; defaults to a canned handle. */
  readonly installHandler?: (source: PluginSource, options?: InstallOptions) => PluginHandleInfo | Promise<PluginHandleInfo>
  /** Response returned by every `env.fetch` call. */
  readonly fetchResponse?: Response
  /** Per-call response producer for `env.fetch`; overrides `fetchResponse` when set. */
  readonly fetchHandler?: (url: string, init?: RequestInit) => Promise<Response>
  /** Raw host context returned by `env.host` (zero-intrusion passthrough). */
  readonly host?: unknown
  /** Scope label set by `scope()` on the derived env. */
  readonly scopedTo?: SessionId
}

/** One recorded logger call. */
export interface FakeLogRecord {
  /** Severity level of the call. */
  readonly level: 'error' | 'info' | 'warn' | 'debug'
  /** Arguments passed to the logger method. */
  readonly args: readonly unknown[]
}

/** One recorded listener registration. */
export interface FakeListenerRecord {
  /** Event name the listener registered for. */
  readonly event: string
  /** Registered listener; heterogeneous signatures are stored lossily, typed at the `on` front door. */
  // The explicit any is deliberate: records hold listeners of many event
  // signatures at once, and no single parameter type can describe all of them.
  // oxlint-disable-next-line typescript/no-explicit-any -- erased-heterogeneous store; see comment above.
  readonly listener: (...args: any[]) => unknown
}

/** One recorded host-side listener registration (`env.onHost`). */
export interface FakeHostListenerRecord {
  /** Host event name the listener registered for. */
  readonly event: string
  /** Registered listener. */
  readonly listener: (...args: unknown[]) => unknown
  /** Whether the listener self-disposes after its first call. */
  readonly once?: boolean
  /** Whether the listener is prepended on the host bus. */
  readonly prepend?: boolean
}

/** One recorded service provision. */
export interface FakeProvidedRecord {
  /** Capability id provided. */
  readonly capability: string
  /** Provided value. */
  readonly value: unknown
  /** False after the disposer ran; mutable because disposal flips it in place. */
  active: boolean
}

/** One recorded filesystem write. */
export interface FakeFsWriteRecord {
  /** Path written. */
  readonly path: string
  /** Normalized bytes written. */
  readonly data: Uint8Array
}

/** One recorded env-var write. */
export interface FakeVarsSetRecord {
  /** Variable name written. */
  readonly name: string
  /** Value written. */
  readonly value: string
}

/** One recorded fetch call. */
export interface FakeFetchCallRecord {
  /** URL requested. */
  readonly url: string
  /** Fetch options passed by the caller, when any. */
  readonly init?: RequestInit
}

/** One recorded managed emit. */
export interface FakeEmitCallRecord {
  /** Event name emitted. */
  readonly event: string
  /** Payload passed to the emit, when any. */
  readonly payload?: unknown
}

/**
 * Recording `PluginEnv` implementation for plugin unit tests. It implements
 * the env semantics this package owns: `get` returns `undefined` for
 * capabilities outside `requires`, and `on`/`registerTool`/`provide` throw
 * `setup-registration` while `phase` is `'setup'`. It performs no validation —
 * mount-time validation belongs to the plugin manager.
 */
export interface FakePluginEnv extends PluginEnv {
  /** Current registration phase; set to `'setup'` to exercise the setup guard. */
  phase: 'setup' | 'activate'
  /** Scope label of this env, set by `scope()` on the derived env. */
  readonly scopedTo: SessionId | undefined
  /** Derive an agent-scoped fake with its own independent records. */
  scope(agentId: SessionId): FakePluginEnv
  /** Recorded listener registrations, in registration order. */
  readonly listeners: readonly FakeListenerRecord[]
  /** Recorded host-side listener registrations (`env.onHost`), in registration order. */
  readonly hostListeners: readonly FakeHostListenerRecord[]
  /** Recorded tool registrations, in registration order. */
  readonly tools: readonly PluginToolDefinition[]
  /** Recorded prompt-section registrations, in registration order. */
  readonly promptSections: readonly PluginPromptSection[]
  /** Recorded service provisions, in registration order. */
  readonly provided: readonly FakeProvidedRecord[]
  /** Recorded `updateConfig` patches. */
  readonly updateConfigCalls: readonly unknown[]
  /** Agent ids passed to `scope()`. */
  readonly scopeCalls: readonly string[]
  /** Paths passed to `fs.read`. */
  readonly fsReads: readonly string[]
  /** Recorded `fs.write` calls. */
  readonly fsWrites: readonly FakeFsWriteRecord[]
  /** Recorded `fs.append` calls. */
  readonly fsAppends: readonly FakeFsWriteRecord[]
  /** Paths passed to `fs.readdir`. */
  readonly fsReaddirs: readonly string[]
  /** Paths passed to `fs.stat`. */
  readonly fsStats: readonly string[]
  /** Names passed to `vars.get`. */
  readonly varsGets: readonly string[]
  /** Recorded `vars.set` calls. */
  readonly varsSets: readonly FakeVarsSetRecord[]
  /** Recorded `llm.complete` requests. */
  readonly llmCalls: readonly PluginModelRequest[]
  /** Recorded `exec.run` requests. */
  readonly execCalls: readonly PluginExecRequest[]
  /** Recorded `http.register` specs. */
  readonly httpRegistrations: readonly PluginHttpRouteSpec[]
  /** Recorded `skills.register` definitions. */
  readonly registeredSkills: readonly PluginSkillDefinition[]
  /** Recorded `commands.register` definitions. */
  readonly commandRegistrations: readonly PluginCommandDefinition[]
  /** Recorded `fetch` calls. */
  readonly fetchCalls: readonly FakeFetchCallRecord[]
  /** Recorded `effect` disposers. */
  readonly effects: readonly FakeEffectRecord[]
  /** Recorded host-side effect disposers (`env.hostEffect`). */
  readonly hostEffects: readonly FakeEffectRecord[]
  /** Recorded `install` calls. */
  readonly installCalls: readonly { readonly source: PluginSource; readonly options?: InstallOptions }[]
  /** Recorded `uninstall` calls. */
  readonly uninstallCalls: readonly string[]
  /** Recorded `emit` calls, in call order. */
  readonly emitCalls: readonly FakeEmitCallRecord[]
  /** Recorded logger calls. */
  readonly logs: readonly FakeLogRecord[]
  /**
   * Invoke every registered listener for one event in registration order,
   * awaiting each result. This helper performs no mode-specific dispatch:
   * return values and `next` arguments are forwarded verbatim and never
   * composed into bail/waterfall behavior.
   * @param event - event to dispatch.
   * @param args - dispatch arguments for the event.
   * @returns a promise settling after every listener.
   */
  trigger<E extends PluginEventName>(event: E, ...args: PluginEventArgs<E>): Promise<void>
}

/** Options plus the internal mutable record arrays of one fake env. */
interface FakeEnvState {
  readonly listeners: FakeListenerRecord[]
  readonly hostListeners: FakeHostListenerRecord[]
  readonly tools: PluginToolDefinition[]
  readonly promptSections: PluginPromptSection[]
  readonly provided: FakeProvidedRecord[]
  readonly updateConfigCalls: unknown[]
  readonly scopeCalls: string[]
  readonly fsReads: string[]
  readonly fsWrites: FakeFsWriteRecord[]
  readonly fsAppends: FakeFsWriteRecord[]
  readonly fsReaddirs: string[]
  readonly fsStats: string[]
  readonly varsGets: string[]
  readonly varsSets: FakeVarsSetRecord[]
  readonly llmCalls: PluginModelRequest[]
  readonly execCalls: PluginExecRequest[]
  readonly httpRegistrations: PluginHttpRouteSpec[]
  readonly registeredSkills: PluginSkillDefinition[]
  readonly commandRegistrations: PluginCommandDefinition[]
  readonly fetchCalls: FakeFetchCallRecord[]
  readonly effects: FakeEffectRecord[]
  readonly hostEffects: FakeEffectRecord[]
  readonly installCalls: Array<{ source: PluginSource; options?: InstallOptions }>
  readonly uninstallCalls: string[]
  readonly emitCalls: FakeEmitCallRecord[]
  readonly logs: FakeLogRecord[]
}

/** One recorded `effect` registration. */
export interface FakeEffectRecord {
  readonly disposer: () => void
  readonly name?: string
}

/** Internal implementation class behind the exported interface. */
class FakePluginEnvImpl implements FakePluginEnv {
  readonly logger: Logger
  readonly fs: PluginFs
  readonly vars: PluginVars
  readonly llm: PluginModel
  readonly exec: PluginExec
  readonly http: PluginHttp
  readonly skills: PluginSkills
  readonly commands: PluginCommands
  phase: 'setup' | 'activate' = 'activate'
  readonly scopedTo: SessionId | undefined

  private readonly state: FakeEnvState
  private readonly options: FakePluginEnvOptions
  private readonly files: Map<string, Uint8Array>
  private readonly varsStore: Map<string, string>
  private readonly fetchResponse: Response
  private readonly fetchHandler: ((url: string, init?: RequestInit) => Promise<Response>) | undefined
  private readonly installHandler: ((source: PluginSource, options?: InstallOptions) => PluginHandleInfo | Promise<PluginHandleInfo>) | undefined

  constructor(options: FakePluginEnvOptions) {
    this.options = options
    this.scopedTo = options.scopedTo
    this.files = new Map(options.files)
    this.varsStore = new Map(Object.entries(options.vars ?? {}))
    this.fetchResponse = options.fetchResponse ?? new Response()
    this.fetchHandler = options.fetchHandler
    this.installHandler = options.installHandler
    this.state = {
      listeners: [],
      hostListeners: [],
      tools: [],
      promptSections: [],
      provided: [],
      updateConfigCalls: [],
      scopeCalls: [],
      fsReads: [],
      fsWrites: [],
      fsAppends: [],
      fsReaddirs: [],
      fsStats: [],
      varsGets: [],
      varsSets: [],
      llmCalls: [],
      execCalls: [],
      httpRegistrations: [],
      registeredSkills: [],
      commandRegistrations: [],
      fetchCalls: [],
      effects: [],
      hostEffects: [],
      installCalls: [],
      uninstallCalls: [],
      emitCalls: [],
      logs: [],
    }
    this.logger = {
      error: (format, ...params) => this.state.logs.push({ level: 'error', args: [format, ...params] }),
      info: (format, ...params) => this.state.logs.push({ level: 'info', args: [format, ...params] }),
      warn: (format, ...params) => this.state.logs.push({ level: 'warn', args: [format, ...params] }),
      debug: (format, ...params) => this.state.logs.push({ level: 'debug', args: [format, ...params] }),
    }
    this.fs = {
      read: (path: string) => {
        this.state.fsReads.push(path)
        return Promise.resolve(this.files.get(path) ?? new Uint8Array())
      },
      write: (path: string, data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        this.state.fsWrites.push({ path, data: bytes })
        this.files.set(path, bytes)
        return Promise.resolve()
      },
      append: (path: string, data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
        this.state.fsAppends.push({ path, data: bytes })
        const existing = this.files.get(path) ?? new Uint8Array()
        const merged = new Uint8Array(existing.length + bytes.length)
        merged.set(existing, 0)
        merged.set(bytes, existing.length)
        this.files.set(path, merged)
        return Promise.resolve()
      },
      readdir: (path: string) => {
        this.state.fsReaddirs.push(path)
        const prefix = `${path.replace(/\/+$/, '')}/`
        const names = new Map<string, 'file' | 'directory'>()
        for (const key of this.files.keys()) {
          if (!key.startsWith(prefix)) continue
          const rest = key.slice(prefix.length)
          if (rest.length === 0) continue
          const name = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest
          if (name.length === 0) continue
          const kind = rest.includes('/') ? 'directory' : 'file'
          const existing = names.get(name)
          if (existing === undefined || (existing === 'file' && kind === 'directory')) names.set(name, kind)
        }
        return Promise.resolve([...names].map(([name, kind]) => ({ name, kind })))
      },
      stat: (path: string) => {
        this.state.fsStats.push(path)
        const bytes = this.files.get(path)
        if (bytes === undefined) return Promise.reject(new Error(`ENOENT: no such file or directory, stat '${path}'`))
        return Promise.resolve({ kind: 'file' as const, size: bytes.length, mtimeMs: 0 })
      },
    }
    this.vars = {
      get: (name: string): string | undefined => {
        this.state.varsGets.push(name)
        return this.varsStore.get(name)
      },
      set: (name: string, value: string): void => {
        this.state.varsSets.push({ name, value })
        this.varsStore.set(name, value)
      },
    }
    this.llm = {
      complete: (request: PluginModelRequest): Promise<PluginModelResponse> => {
        this.state.llmCalls.push(request)
        const handler = this.options.llmHandler ?? (async (req) => ({ content: '', model: req.model }))
        return handler(request)
      },
    }
    this.exec = {
      run: (request: PluginExecRequest): Promise<PluginExecResult> => {
        this.state.execCalls.push(request)
        const handler = this.options.execHandler ?? (async () => ({ stdout: '', stderr: '', code: 0 }))
        return handler(request)
      },
    }
    this.http = {
      register: (spec: PluginHttpRouteSpec): (() => void) => {
        this.state.httpRegistrations.push(spec)
        return () => {
          const index = this.state.httpRegistrations.indexOf(spec)
          if (index !== -1) this.state.httpRegistrations.splice(index, 1)
        }
      },
    }
    this.skills = {
      register: (definition: PluginSkillDefinition): (() => void) => {
        this.state.registeredSkills.push(definition)
        return () => {
          const index = this.state.registeredSkills.indexOf(definition)
          if (index !== -1) this.state.registeredSkills.splice(index, 1)
        }
      },
    }
    this.commands = {
      register: (definition: PluginCommandDefinition): (() => void) => {
        this.state.commandRegistrations.push(definition)
        return () => {
          const index = this.state.commandRegistrations.indexOf(definition)
          if (index !== -1) this.state.commandRegistrations.splice(index, 1)
        }
      },
    }
  }

  get listeners(): readonly FakeListenerRecord[] {
    return this.state.listeners
  }

  get hostListeners(): readonly FakeHostListenerRecord[] {
    return this.state.hostListeners
  }

  get tools(): readonly PluginToolDefinition[] {
    return this.state.tools
  }

  get promptSections(): readonly PluginPromptSection[] {
    return this.state.promptSections
  }

  get provided(): readonly FakeProvidedRecord[] {
    return this.state.provided
  }

  get updateConfigCalls(): readonly unknown[] {
    return this.state.updateConfigCalls
  }

  get scopeCalls(): readonly string[] {
    return this.state.scopeCalls
  }

  get fsReads(): readonly string[] {
    return this.state.fsReads
  }

  get fsWrites(): readonly FakeFsWriteRecord[] {
    return this.state.fsWrites
  }

  get fsAppends(): readonly FakeFsWriteRecord[] {
    return this.state.fsAppends
  }

  get fsReaddirs(): readonly string[] {
    return this.state.fsReaddirs
  }

  get fsStats(): readonly string[] {
    return this.state.fsStats
  }

  get varsGets(): readonly string[] {
    return this.state.varsGets
  }

  get varsSets(): readonly FakeVarsSetRecord[] {
    return this.state.varsSets
  }

  get llmCalls(): readonly PluginModelRequest[] {
    return this.state.llmCalls
  }

  get execCalls(): readonly PluginExecRequest[] {
    return this.state.execCalls
  }

  get httpRegistrations(): readonly PluginHttpRouteSpec[] {
    return this.state.httpRegistrations
  }

  get registeredSkills(): readonly PluginSkillDefinition[] {
    return this.state.registeredSkills
  }

  get commandRegistrations(): readonly PluginCommandDefinition[] {
    return this.state.commandRegistrations
  }

  get fetchCalls(): readonly FakeFetchCallRecord[] {
    return this.state.fetchCalls
  }

  get effects(): readonly FakeEffectRecord[] {
    return this.state.effects
  }

  get hostEffects(): readonly FakeEffectRecord[] {
    return this.state.hostEffects
  }

  get installCalls(): readonly { source: PluginSource; options?: InstallOptions }[] {
    return this.state.installCalls
  }

  get uninstallCalls(): readonly string[] {
    return this.state.uninstallCalls
  }

  get emitCalls(): readonly FakeEmitCallRecord[] {
    return this.state.emitCalls
  }

  get logs(): readonly FakeLogRecord[] {
    return this.state.logs
  }

  on<E extends PluginEventName>(event: E, listener: PluginEventListener<E>): Disposable {
    this.assertRegistrable('on')
    // oxlint-disable-next-line typescript/no-explicit-any -- same erased-heterogeneous store as FakeListenerRecord.listener.
    const record: FakeListenerRecord = { event, listener: listener as (...args: any[]) => unknown }
    this.state.listeners.push(record)
    return () => {
      const index = this.state.listeners.indexOf(record)
      if (index !== -1) this.state.listeners.splice(index, 1)
    }
  }

  onHost(
    event: string,
    listener: (...args: unknown[]) => unknown,
    options?: { readonly once?: boolean; readonly prepend?: boolean },
  ): Disposable {
    this.assertRegistrable('onHost')
    const record: FakeHostListenerRecord = {
      event,
      listener,
      ...(options?.once === true ? { once: true } : {}),
      ...(options?.prepend === true ? { prepend: true } : {}),
    }
    this.state.hostListeners.push(record)
    return () => {
      const index = this.state.hostListeners.indexOf(record)
      if (index !== -1) this.state.hostListeners.splice(index, 1)
    }
  }

  scope(agentId: SessionId): FakePluginEnv {
    this.state.scopeCalls.push(agentId)
    return createFakeEnv({ ...this.options, scopedTo: agentId })
  }

  registerTool(definition: PluginToolDefinition): Disposable {
    this.assertRegistrable('registerTool')
    this.state.tools.push(definition)
    return () => {
      const index = this.state.tools.indexOf(definition)
      if (index !== -1) this.state.tools.splice(index, 1)
    }
  }

  getTool(name: string): PluginToolDefinition | undefined {
    return this.state.tools.find(tool => tool.name === name)
  }

  listTools(): readonly PluginToolDefinition[] {
    return [...this.state.tools]
  }

  registerPromptSection(section: PluginPromptSection): Disposable {
    this.assertRegistrable('registerPromptSection')
    this.state.promptSections.push(section)
    return () => {
      const index = this.state.promptSections.indexOf(section)
      if (index !== -1) this.state.promptSections.splice(index, 1)
    }
  }

  provide(capability: string, value: unknown): Disposable {
    this.assertRegistrable('provide')
    const record: FakeProvidedRecord = { capability, value, active: true }
    this.state.provided.push(record)
    return () => {
      record.active = false
    }
  }

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T is the call-site service type, per the PluginEnv contract.
  get<T>(capability: string): T | undefined {
    return this.options.services?.[capability] as T | undefined
  }

  get host(): unknown {
    return this.options.host
  }

  effect(disposer: () => void, name?: string): void {
    this.state.effects.push(name === undefined ? { disposer } : { disposer, name })
  }

  hostEffect(disposer: () => void, name?: string): void {
    this.state.hostEffects.push(name === undefined ? { disposer } : { disposer, name })
  }

  registerSettings(_registration: StagedSettingsRegistration): void {
    // The fake env has no host settings service; staged namespace
    // registrations are dropped so plugin tests keep working.
  }

  plugins(): readonly PluginHandleInfo[] {
    return this.options.plugins ?? []
  }

  updateConfig(patch: unknown, expectedRevision?: number): Promise<void> {
    this.state.updateConfigCalls.push(expectedRevision === undefined ? patch : { patch, expectedRevision })
    return Promise.resolve()
  }

  fetch(url: string, init?: RequestInit): Promise<Response> {
    this.state.fetchCalls.push(init === undefined ? { url } : { url, init })
    if (this.fetchHandler !== undefined) return this.fetchHandler(url, init)
    return Promise.resolve(this.fetchResponse)
  }

  install(source: PluginSource, options?: InstallOptions): Promise<PluginHandleInfo> {
    this.state.installCalls.push(options === undefined ? { source } : { source, options })
    if (this.installHandler !== undefined) return Promise.resolve(this.installHandler(source, options))
    return Promise.resolve({
      id: 'fake-installed',
      version: '0.0.0',
      generation: 0,
      origin: options?.origin ?? 'runtime-api',
      status: 'enabled',
      kinds: [],
      requires: [],
      provides: [],
      orderNeutral: true,
      source,
    })
  }

  async uninstall(id: string): Promise<void> {
    this.state.uninstallCalls.push(id)
  }

  emit(event: string, payload?: unknown): void {
    this.state.emitCalls.push(payload === undefined ? { event } : { event, payload })
    for (const record of this.state.listeners) {
      if (record.event === event) {
        // Fire-and-forget, matching real managed emit semantics; listener
        // return values are not awaited or inspected by the fake.
        void Promise.resolve(record.listener(payload))
      }
    }
  }

  async trigger<E extends PluginEventName>(event: E, ...args: PluginEventArgs<E>): Promise<void> {
    for (const record of this.state.listeners) {
      if (record.event === event) await record.listener(...args)
    }
  }

  private assertRegistrable(method: string): void {
    if (this.phase !== 'setup') return
    throw new PluginError(
      'setup-registration',
      formatPluginError('setup-registration', { method }),
      { method },
    )
  }
}

/**
 * Create a fake `PluginEnv` for unit-testing a plugin. Seed the fixture's
 * `requires` (and optional service values) so `get` returns declared services
 * and `undefined` for undeclared ones; use `phase` to exercise the setup
 * registration guard, and the record arrays plus `trigger` to drive and assert
 * listener behavior.
 * @param options - fixture declaration surface and seeded values.
 * @returns a recording fake env.
 */
export function createFakeEnv(options: FakePluginEnvOptions = {}): FakePluginEnv {
  return new FakePluginEnvImpl(options)
}
