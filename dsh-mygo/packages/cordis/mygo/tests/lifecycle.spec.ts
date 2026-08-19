/**
 * Lifecycle engine (#15): generation registry, seven-step replace with
 * crash/persist semantics, staging cross-scope atomicity, swapPolicy bounded
 * waits, provides/tool indirection, T3 ordering, and T4 boot recovery.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginDefinition, PluginHandleInfo, PluginHooks, PluginSource } from '@r05en1cu/dsh-mygo-api'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  DispatchMachine,
  InMemoryRegistryStore,
  LifecycleEngine,
  resolvePluginManagerConfig,
  type EventDispatchMode,
  type LifecycleEngineOptions,
  type PluginLifecycleEventPayload,
  type PluginManagerConfig,
  type PluginEventVocabularyEntry,
  type PluginIo,
  type PromptServiceLike,
  type SessionPersistenceProjection,
  type ToolRegistryLike,
} from '@r05en1cu/dsh-mygo'

declare module '@r05en1cu/dsh-mygo-api' {
  interface PluginEvents {
    'lifecycle/emit'(payload: { readonly n: number }): void
    'lifecycle/parallel'(payload: { readonly n: number }): void | Promise<void>
    'lifecycle/waterfall'(payload: { readonly n: number }, next: () => unknown): unknown
  }
}

declare module 'cordis' {
  interface Events {
    'lifecycle/emit'(payload: { readonly n: number }): void
    'lifecycle/parallel'(payload: { readonly n: number }): void | Promise<void>
    'lifecycle/waterfall'(payload: { readonly n: number }, next: () => unknown): unknown
    'pi-ext/from-plugin'(payload: { readonly n: number }): void
    'pi-ext/secret'(payload: { readonly n: number }): void
    'tools/change'(): void
  }
}

const VOCABULARY = new Map<string, EventDispatchMode>([
  ['lifecycle/emit', 'emit'],
  ['lifecycle/parallel', 'parallel'],
  ['lifecycle/waterfall', 'waterfall'],
])

const TEST_EVENT_VOCABULARY: readonly PluginEventVocabularyEntry[] = [
  { name: 'lifecycle/emit', mode: 'emit', properties: ['n'], branches: [] },
  { name: 'lifecycle/parallel', mode: 'parallel', properties: ['n'], branches: [] },
  { name: 'lifecycle/waterfall', mode: 'waterfall', properties: ['n', 'x', 'y'], branches: ['deny'] },
]

interface RecordedEvent {
  readonly name: string
  readonly payload: PluginLifecycleEventPayload
}

interface Harness {
  readonly ctx: Context
  readonly store: InMemoryRegistryStore
  readonly machine: DispatchMachine
  readonly engine: LifecycleEngine
  readonly definitions: Map<string, PluginDefinition>
  readonly events: RecordedEvent[]
}

interface EnginePair {
  readonly ctx: Context
  readonly machine: DispatchMachine
  readonly engine: LifecycleEngine
  readonly events: RecordedEvent[]
}

function fixture(
  id: string,
  overrides: Omit<Partial<PluginDefinition>, 'hooks'> & { readonly hooks?: Partial<PluginHooks> } = {},
): PluginDefinition {
  const hooks: PluginHooks = {
    activate: overrides.hooks?.activate ?? (() => {}),
    ...(overrides.hooks?.setup === undefined ? {} : { setup: overrides.hooks.setup }),
    ...(overrides.hooks?.deactivate === undefined ? {} : { deactivate: overrides.hooks.deactivate }),
    ...(overrides.hooks?.captureState === undefined ? {} : { captureState: overrides.hooks.captureState }),
    ...(overrides.hooks?.restoreState === undefined ? {} : { restoreState: overrides.hooks.restoreState }),
    ...(overrides.hooks?.dispose === undefined ? {} : { dispose: overrides.hooks.dispose }),
  }
  const base: PluginDefinition = {
    id,
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
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
    config: z.object({}),
    hooks,
  }
  return {
    ...base,
    ...overrides,
    hooks,
  }
}

const EVENT_NAMES = [
  'plugin/installed',
  'plugin/activated',
  'plugin/deactivated',
  'plugin/replacing',
  'plugin/replaced',
  'plugin/replace-failed',
  'plugin/enabled',
  'plugin/disabled',
  'plugin/uninstalled',
] as const

function harness(options: Partial<LifecycleEngineOptions> = {}): Harness {
  const store = new InMemoryRegistryStore()
  const definitions = new Map<string, PluginDefinition>()
  const pair = freshHarness(store, definitions, options)
  const engine = pair.engine
  return {
    ctx: pair.ctx,
    store,
    machine: pair.machine,
    engine,
    definitions,
    events: pair.events,
  }
}

function freshHarness(
  store: InMemoryRegistryStore,
  definitions: Map<string, PluginDefinition>,
  options: Partial<LifecycleEngineOptions> = {},
): EnginePair {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
  machine.start()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store,
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: TEST_EVENT_VOCABULARY,
    resolveSource: async (source: PluginSource) => {
      const key = source.type === 'inline' ? source.code : source.package
      const definition = definitions.get(key)
      if (definition === undefined) throw new Error(`source ${key} not resolvable`)
      return definition
    },
    ...options,
  })
  const events: RecordedEvent[] = []
  for (const name of EVENT_NAMES) {
    ctx.on(name, (payload: PluginLifecycleEventPayload) => { events.push({ name, payload }) })
  }
  return { ctx, machine, engine, events }
}

function source(id: string): PluginSource {
  return { type: 'inline', code: id }
}

/** Recording tools-registry seam for the Proposal A registry bridge. */
class FakeToolRegistry implements ToolRegistryLike {
  readonly registrations = new Map<string, unknown>()
  readonly disposed: string[] = []

  register(definition: unknown): () => void {
    const name = (definition as { name?: unknown }).name
    if (typeof name !== 'string' || this.registrations.has(name)) {
      throw new Error(`duplicate tool ${String(name)}`)
    }
    this.registrations.set(name, definition)
    return () => {
      this.registrations.delete(name)
      this.disposed.push(name)
    }
  }

  get(name: string): unknown {
    return this.registrations.get(name)
  }

  seed(name: string): void {
    this.registrations.set(name, { name })
  }
}

function toolFixture(id: string, toolName: string, result: string, description = 'description'): PluginDefinition {
  return fixture(id, {
    hooks: {
      activate(env) {
        env.registerTool({
          name: toolName,
          description,
          input: { type: 'object' },
          output: { type: 'string' },
          execute: async () => result,
          renderIntent: { card: 'generic' },
        })
      },
    },
  })
}

interface ToolView {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
  readonly output: { readonly schema: Record<string, unknown>; render(args: unknown, value: unknown): unknown[] }
  execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown>
}

/** Recording host systemPrompt seam for Proposal B prompt-section publication. */
class FakePromptService implements PromptServiceLike {
  readonly sections = new Map<string, unknown>()
  readonly disposed: string[] = []

  section(section: unknown): () => void {
    const name = (section as { name?: unknown }).name
    if (typeof name !== 'string' || this.sections.has(name)) throw new Error(`duplicate prompt section ${String(name)}`)
    this.sections.set(name, section)
    return () => {
      this.sections.delete(name)
      this.disposed.push(name)
    }
  }
}

/** Host sessionPersistence stub with the consumer's read methods. */
class FakeSessionPersistence {
  listSnapshots = async (): Promise<unknown[]> => [{ header: { id: 'session-1' }, revision: 1 }]
  create = vi.fn(async () => undefined)
  append = vi.fn(async () => undefined)
}

/** Minimal host settings service faithful to the real per-fiber registration semantics. */
class FakeSettingsService extends Service {
  readonly namespaces = new Map<string, {
    value: unknown
    watchers: Set<(next: unknown, prev: unknown) => void>
  }>()

  constructor(ctx: Context) {
    super(ctx, 'settings')
  }

  register(
    ns: string,
    schema: z<any>,
    options?: { readonly base?: unknown; readonly validate?: (value: unknown) => void },
  ): {
    get(): unknown
    watch(callback: (next: unknown, prev: unknown) => void): () => void
  } {
    if (this.namespaces.has(ns)) throw new Error(`settings namespace "${ns}" is already registered`)
    const value = schema(options?.base ?? {})
    options?.validate?.(value)
    const registration = { value, watchers: new Set<(next: unknown, prev: unknown) => void>() }
    this.ctx.effect(() => {
      this.namespaces.set(ns, registration)
      return () => { this.namespaces.delete(ns) }
    })
    return {
      get: () => registration.value,
      watch: (callback) => {
        registration.watchers.add(callback)
        return () => { registration.watchers.delete(callback) }
      },
    }
  }

  get(ns: string): unknown {
    return this.namespaces.get(ns)?.value
  }
}

/** Minimal host webserver service faithful to the real per-fiber registration semantics. */
class FakeHttpServerService extends Service {
  readonly upgrades = new Map<string, unknown>()

  constructor(ctx: Context) {
    super(ctx, 'httpServer')
  }

  registerUpgrade(route: { readonly path: string; readonly handler: unknown }): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`webserver: duplicate upgrade route "${route.path}"`)
    }
    const registration = { route }
    this.ctx.effect(() => {
      this.upgrades.set(route.path, registration)
      return () => { this.upgrades.delete(route.path) }
    })
    return () => { this.upgrades.delete(route.path) }
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('LifecycleEngine install', () => {
  it('reports a host service conflict with a readable cause', async () => {
    const h = harness()
    class FakePersistence extends Service {
      constructor(ctx: Context) {
        super(ctx, 'conflictSvc')
      }
    }
    h.ctx.provide('conflictSvc', {})
    await expect(h.engine.adoptRaw(FakePersistence, {})).rejects.toMatchObject({
      code: 'staging-failed',
    })
    try {
      await h.engine.adoptRaw(FakePersistence, {})
    } catch (error) {
      expect((error as { message: string }).message).toContain('host-conflict')
      expect((error as { message: string }).message).toContain('conflictSvc')
    }
  })

  it('reports a missing required config with the plugin schema description', async () => {
    const h = harness()
    h.definitions.set('rdb', fixture('rdb', {
      config: z.union([
        z.object({ type: z.const('sqlite'), path: z.string().required() }),
        z.object({ type: z.const('postgres'), connectionString: z.string().required() }),
      ]),
    }))
    await expect(h.engine.install(source('rdb'))).rejects.toMatchObject({
      code: 'manifest-invalid',
      details: { field: 'config' },
    })
    try {
      await h.engine.install(source('rdb'))
    } catch (error) {
      const message = (error as { message: string }).message
      expect(message).toContain('配置不合法')
      expect(message).toContain('path')
      expect(message).toContain('connectionString')
      expect(message).toContain('请在安装时填写')
    }
  })

  it('installs, activates, dispatches, and emits both events', async () => {
    const h = harness()
    const received: number[] = []
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', (payload: { readonly n: number }) => received.push(payload.n))
        },
      },
    }))
    const handle = await h.engine.install(source('p'))
    expect(handle).toMatchObject({ id: 'p', version: '1.0.0', generation: 1, status: 'enabled', origin: 'runtime-api' })
    expect(handle.orderNeutral).toBe(true)
    h.ctx.emit('lifecycle/emit', { n: 1 })
    expect(received).toEqual([1])
    expect(h.events.map(event => event.name)).toEqual(['plugin/installed', 'plugin/activated'])
    expect(h.events[0]?.payload).toMatchObject({ id: 'p', generation: 1 })
  })

  it('materializes namespace-pattern events for listeners and managed emits', async () => {
    const h = harness()
    const state = globalThis as { patternBus?: Array<{ event: string; payload: unknown }> }
    delete state.patternBus
    h.definitions.set('pattern', fixture('pattern', {
      events: ['pi-ext/*'],
      hooks: {
        activate(env) {
          env.on('pi-ext/from-plugin' as never, (payload: unknown) => {
            state.patternBus = [...(state.patternBus ?? []), { event: 'pi-ext/from-plugin', payload }]
          })
          env.on('lifecycle/emit' as never, () => {
            env.emit('pi-ext/from-plugin', { n: 99 })
          })
        },
      },
    }))
    await h.engine.install(source('pattern'))
    h.ctx.emit('lifecycle/emit', { n: 1 })
    await sleep(10)
    expect(state.patternBus).toEqual([{ event: 'pi-ext/from-plugin', payload: { n: 99 } }])

    // Raw host listeners observe the same materialized event.
    const raw: unknown[] = []
    h.ctx.on('pi-ext/from-plugin', (payload: { readonly n: number }) => { raw.push(payload) })
    h.ctx.emit('pi-ext/from-plugin', { n: 7 })
    await sleep(10)
    expect(raw).toEqual([{ n: 7 }])
  })

  it('materializes undeclared managed emits through the dispatch machine', async () => {
    const h = harness()
    const raw: unknown[] = []
    h.ctx.on('pi-ext/secret', (payload: { readonly n: number }) => { raw.push(payload) })
    h.definitions.set('strict', fixture('strict', {
      hooks: {
        activate(env) {
          env.emit('pi-ext/secret', { n: 1 })
        },
      },
    }))
    await h.engine.install(source('strict'))
    await sleep(10)
    expect(raw).toEqual([{ n: 1 }])
  })

  it('rejects setup-phase registrations with setup-registration', async () => {
    const h = harness()
    h.definitions.set('bad', fixture('bad', {
      hooks: {
        async setup(env) {
          env.on('lifecycle/emit', () => {})
        },
      },
    }))
    await expect(h.engine.install(source('bad'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()).toEqual([])
  })

  it('compensates a failed persist and leaves no residue', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    h.store.fail('status')
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(h.engine.plugins()).toEqual([])
    // The status pointer never committed; the gens row is an orphan that
    // boot GC removes (T3 rule 1 compensation leaves durable state cleanable).
    expect(await h.store.readStatus('p')).toBeUndefined()
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.gc.orphanGenerations).toBe(1)
    expect(await h.store.listIds()).toEqual([])
    h.ctx.emit('lifecycle/emit', { n: 1 })
    expect(h.events).toEqual([])
  })

  it('names the gens table when the generation write fails', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    h.store.fail('gens')
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({
      code: 'persist-failed',
      details: { table: 'gens' },
    })
  })

  it('rejects an install onto an existing dynamic id and shadows a static one', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'concurrent-operation' })
  })

  it('rejects conflicting installs with the relationship code and details', async () => {
    const h = harness()
    h.definitions.set('a', fixture('a', {
      permissions: { ...fixture('a').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    h.definitions.set('b', fixture('b', {
      permissions: { ...fixture('b').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    await h.engine.install(source('a'))
    await expect(h.engine.install(source('b'))).rejects.toMatchObject({
      code: 'write-conflict',
      pluginId: 'b',
    })
  })

  it('exposes the staging env surfaces and guards setup registrations', async () => {
    const h = harness()
    const seen: unknown[] = []
    h.definitions.set('p', fixture('p', {
      requires: ['svc'],
      hooks: {
        async setup(env) {
          expect(() => env.provide('svc', 1)).toThrow(/not allowed during setup/)
          expect(() => env.on('lifecycle/emit', () => {})).toThrow(/not allowed during setup/)
          expect(() => env.registerTool({
            name: 't',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })).toThrow(/not allowed during setup/)
        },
        async activate(env) {
          expect(env.get('svc')).toBeUndefined()
          expect(env.get('other')).toBeUndefined()
          seen.push(env.plugins().length)
          seen.push(env.scope('agent-1' as SessionId))
          void env.fetch('https://example.dev').catch(() => {})
          void env.fs.read('/x').catch(() => {})
          void env.fs.write('/x', 'y').catch(() => {})
          // Self-service updateConfig cannot run while the install lock is held.
          await expect(env.updateConfig({})).rejects.toMatchObject({ code: 'concurrent-operation' })
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(seen).toHaveLength(2)
  })

  it('resolves declared requires from the provide table', async () => {
    const h = harness()
    let got: unknown
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { v: 1 })
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      requires: ['svc'],
      hooks: {
        activate(env) {
          got = env.get('svc')
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(got).toEqual({ v: 1 })
  })

  it('wraps every provided value at the publish points and records dynamic symbol access (T14/B3)', async () => {
    const h = harness()
    const raw = { v: 1, bump(): number { return ++this.v } }
    let viaGet: unknown
    let viaInject: unknown
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', raw)
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      requires: ['svc'],
      hooks: {
        activate(env) {
          viaGet = env.get('svc')
          viaInject = env.scope('agent-1' as SessionId).get('svc')
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))

    // 三路径（ctx.get / ctx.<prop> / ctx.inject 同源）都拿到包装值而非原始引用。
    expect(viaGet).not.toBe(raw)
    expect(viaGet).toEqual(raw)
    expect(viaInject).not.toBe(raw)
    expect(viaInject).toBe(viaGet)
    // 动态符号访问被记录（A11 运行时代理兜底）。
    expect(h.engine.providedAccessLog().some(record => record.capability === 'svc' && record.symbol === 'v')).toBe(true)
    expect(h.engine.providedAccessLog().some(record => record.capability === 'svc' && record.symbol === 'bump')).toBe(true)
  })

  it('publishes the wrapped value through the host provide seam and never the raw reference (T14/B3)', async () => {
    const published = new Map<string, unknown>()
    const h = harness({
      hostProvide: (name, value) => {
        published.set(name, value)
        return () => published.delete(name)
      },
      config: resolvePluginManagerConfig({ grants: { provider: { hostPublish: true } } }),
    })
    const raw = { hello: 'world' }
    h.definitions.set('provider', fixture('provider', {
      provides: ['bash'],
      hostPublishAccess: true,
      hooks: {
        activate(env) {
          env.provide('bash', raw)
        },
      },
    }))
    await h.engine.install(source('provider'))
    expect(published.get('bash')).not.toBe(raw)
    expect(published.get('bash')).toEqual(raw)
    expect(h.engine.provideValue('bash')).toBe(published.get('bash'))
    await h.engine.uninstall('provider')
    expect(published.has('bash')).toBe(false)
  })

  it('freezes the bridge export surface: mutation through the wrapped value is rejected (T14/B4)', async () => {
    const h = harness()
    const raw = { version: 1, helper: () => 'ok' }
    let seen: unknown
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', raw)
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      requires: ['svc'],
      hooks: {
        activate(env) {
          seen = env.get('svc')
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    const wrapped = seen as Record<string, unknown>
    expect(() => { wrapped.version = 2 }).toThrow(TypeError)
    expect(() => { delete wrapped.helper }).toThrow(TypeError)
    // 原始对象未被触碰：冻结只作用于桥接导出面（EB-D8）。
    expect(raw).toEqual({ version: 1, helper: expect.any(Function) })
    expect((wrapped as { helper(): string }).helper()).toBe('ok')
  })

  it('records mount-time export snapshots and provider observations, and clears them on uninstall (B13/B19)', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 1, run() { return 'ok' } })
        },
      },
    }))
    await h.engine.install(source('provider'))
    const snapshot = h.engine.fineEpoch().get('svc')
    expect(snapshot?.pluginId).toBe('provider')
    expect(snapshot?.version).toBe('1.0.0')
    expect(snapshot?.exports).toContain('version')
    expect(snapshot?.exports).toContain('run')
    const observed = h.engine.providerObservationRegistry().candidates('svc')
    expect(observed).toHaveLength(1)
    expect(observed[0]?.pluginId).toBe('provider')
    expect(observed[0]?.state).toBe('active')

    await h.engine.uninstall('provider')
    expect(h.engine.fineEpoch().get('svc')).toBeUndefined()
    expect(h.engine.providerObservationRegistry().candidates('svc')).toEqual([])
  })

  it('refreshes the snapshot on replace and drops stale provides from accounting (B13/B19)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      provides: ['svc', 'old'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 1 })
          env.provide('old', { legacy: true })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 2 })
        },
      },
    }))
    await h.engine.replace('p', source('p2'))
    expect(h.engine.fineEpoch().get('svc')?.version).toBe('2.0.0')
    expect(h.engine.fineEpoch().get('svc')?.exports).toEqual(['version'])
    expect(h.engine.fineEpoch().get('old')).toBeUndefined()
    expect(h.engine.providerObservationRegistry().candidates('old')).toEqual([])
    expect(h.engine.providerObservationRegistry().candidates('svc').map(item => item.version)).toEqual(['2.0.0'])
  })

  it('requires policy gate: install is not blocked, INACTIVE flips to active when the provider appears (B6/T20)', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { 'voice-chat': '>=0.1.0' },
      requires: ['voice-chat'],
    }))
    // 安装期不阻断：无提供者时插件仍可安装（仅运行期政策闸）。
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('inactive')

    // 提供者上线 → INACTIVE 自动激活。
    h.definitions.set('provider', fixture('provider', {
      provides: ['voice-chat'],
      hooks: {
        activate(env) {
          env.provide('voice-chat', { speak() { return 'ok' } })
        },
      },
    }))
    await h.engine.install(source('provider'))
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('active')

    // 提供者版本不满足区间 → provider-version-mismatch → INACTIVE。
    h.definitions.set('p2', fixture('provider', {
      version: '0.0.9',
      provides: ['voice-chat'],
      hooks: {
        activate(env) {
          env.provide('voice-chat', { speak() { return 'old' } })
        },
      },
    }))
    await h.engine.replace('provider', source('p2'))
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('inactive')
  })

  it('requires policy gate reports candidates from the provider observation registry (B6/B19)', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { 'voice-chat': '>=0.1.0' },
    }))
    await h.engine.install(source('consumer'))
    const consumer = h.engine.plugins().find(plugin => plugin.id === 'consumer')
    expect(consumer?.policyStatus).toBe('inactive')
    // 观测记录仍是空（无提供者出现过）→ 候选集为空但不阻断。
    expect(h.engine.providerObservationRegistry().candidates('voice-chat')).toEqual([])
  })

  it('tags listener modes from declarations and disposes staging disposers', async () => {
    const h = harness({
      config: resolvePluginManagerConfig({ grants: { p: { intercept: true }, i: { intercept: true } } }),
    })
    h.definitions.set('p', fixture('p', {
      permissions: {
        ...fixture('p').permissions,
        transform: [{ event: 'lifecycle/waterfall', reads: ['n'] }],
      },
      hooks: {
        activate(env) {
          env.on('lifecycle/waterfall', () => 'transformed')
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(h.engine.plugins()[0]?.id).toBe('p')

    h.definitions.set('i', fixture('i', {
      permissions: {
        ...fixture('i').permissions,
        intercept: [{ event: 'lifecycle/waterfall', returns: ['deny'] }],
      },
      hooks: {
        activate(env) {
          const disposer = env.on('lifecycle/waterfall', () => ({ kind: 'deny' }))
          disposer()
          const toolDisposer = env.registerTool({
            name: 'stage_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
          toolDisposer()
          const provideDisposer = env.provide('svc2', 1)
          provideDisposer()
        },
      },
    }))
    await h.engine.install(source('i'))
    expect(h.engine.plugins().map(handle => handle.id)).toEqual(['i', 'p'])
  })

  it('installs claims-level plugins from the model channel without a ceiling', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      permissions: { ...fixture('p').permissions, claims: ['service:x'] },
    }))
    await h.engine.install(source('p'), { origin: 'model' })
    expect(h.engine.plugins().find(handle => handle.id === 'p')?.status).toBe('enabled')
  })
})

describe('LifecycleEngine uninstall/enable/disable', () => {
  it('uninstalls idempotently and rejects dependents', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', { provides: ['svc'] }))
    h.definitions.set('consumer', fixture('consumer', { requires: ['svc'] }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    await expect(h.engine.uninstall('provider')).rejects.toMatchObject({ code: 'dependent-exists' })
    await h.engine.uninstall('consumer')
    await h.engine.uninstall('consumer')
    await h.engine.uninstall('provider')
    expect(h.engine.plugins()).toEqual([])
    expect(h.events.map(event => event.name)).toEqual([
      'plugin/installed', 'plugin/activated',
      'plugin/installed', 'plugin/activated',
      'plugin/deactivated', 'plugin/uninstalled',
      'plugin/deactivated', 'plugin/uninstalled',
    ])
  })

  it('cleans provides and tools on uninstall', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', 1)
          env.registerTool({
            name: 'uninstall_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    h.definitions.set('other', fixture('other', {
      provides: ['other-svc'],
      hooks: {
        activate(env) {
          env.provide('other-svc', 2)
          env.registerTool({
            name: 'other_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    await h.engine.install(source('other'))
    await h.engine.uninstall('p')
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(1)
    expect(h.engine.plugins().map(handle => handle.id)).toEqual(['other'])
  })

  it('persists uninstall before removing runtime state (T3 rule 2)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    h.store.fail('delete')
    await expect(h.engine.uninstall('p')).rejects.toMatchObject({ code: 'persist-failed' })
    expect(h.engine.plugins().map(handle => handle.id)).toEqual(['p'])
  })

  it('enable/disable with persist ordering and events', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p', 'manual')
    expect(h.engine.plugins()[0]?.status).toBe('disabled')
    expect(h.engine.plugins()[0]?.reason).toBe('manual')
    await h.engine.disable('p')
    await h.engine.enable('p')
    await h.engine.enable('p')
    expect(h.engine.plugins()[0]?.status).toBe('enabled')
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await h.engine.replace('p', source('p2'))
    await h.engine.enable('p')
    expect(h.engine.plugins()[0]?.reason).toBeUndefined()
    await expect(h.engine.enable('missing')).rejects.toMatchObject({ code: 'plugin-not-found' })
    expect(h.events.map(event => event.name)).toEqual([
      'plugin/installed', 'plugin/activated',
      'plugin/disabled',
      'plugin/enabled',
      'plugin/replacing', 'plugin/deactivated', 'plugin/replaced',
    ])
  })

  it('enable compensates a failed persist; disable leaves the runtime state when persist fails', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    h.store.fail('status')
    await expect(h.engine.enable('p')).rejects.toMatchObject({ code: 'persist-failed' })
    expect(h.engine.plugins()[0]?.status).toBe('disabled')

    const h2 = harness()
    h2.definitions.set('p', fixture('p'))
    await h2.engine.install(source('p'))
    h2.store.fail('status')
    await expect(h2.engine.disable('p')).rejects.toMatchObject({ code: 'persist-failed' })
    expect(h2.engine.plugins()[0]?.status).toBe('enabled')
  })

  it('disabled plugins keep tools registered and block execution with a clear message', async () => {
    const registry = new FakeToolRegistry()
    const h = harness({ toolRegistry: registry })
    h.definitions.set('p', toolFixture('p', 'probe_tool', 'v1'))
    await h.engine.install(source('p'))
    const view = registry.get('probe_tool') as ToolView
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('v1')

    await h.engine.disable('p')
    expect(h.engine.plugins()[0]?.status).toBe('disabled')
    // The tool stays registered so callers still see it…
    expect(registry.registrations.has('probe_tool')).toBe(true)
    expect(h.engine.managedTool('probe_tool')).toBeDefined()
    // …but mygo intercepts execution with the disabled message.
    expect(() => view.execute({}, { signal: new AbortController().signal })).toThrow(/已停用/)

    await h.engine.enable('p')
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('v1')
  })

  it('disable/enable on static plugins never writes registry rows', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.adoptStatic(h.definitions.get('p')!, {})
    await h.engine.disable('p')
    expect(h.engine.plugins()[0]?.status).toBe('disabled')
    await h.engine.enable('p')
    expect(h.engine.plugins()[0]?.status).toBe('enabled')
    expect(await h.store.readStatus('p')).toBeUndefined()
  })

  it('uninstalling a static plugin persists a tombstone and skips re-adoption', async () => {
    const h = harness()
    h.definitions.set('p', toolFixture('p', 'ghost_tool', 'v1'))
    await h.engine.adoptStatic(h.definitions.get('p')!, {})
    await h.engine.uninstall('p')
    expect(await h.store.readStatus('p')).toMatchObject({ status: 'uninstalled', tools: ['ghost_tool'] })
    expect(h.engine.resolveUnknownTool('ghost_tool')).toEqual({ pluginId: 'p' })

    const skipped = await h.engine.adoptStatic(h.definitions.get('p')!, {})
    expect(skipped.status).toBe('uninstalled')
    expect(h.engine.plugins()).toEqual([])
    expect(h.engine.resolveUnknownTool('ghost_tool')).toEqual({ pluginId: 'p' })

    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.rows.find(row => row.id === 'p')?.status).toBe('ignored')
    expect(boot.engine.resolveUnknownTool('ghost_tool')).toEqual({ pluginId: 'p' })
  })

  it('persists previousGen and reason when disabling a multi-generation record', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await h.engine.replace('p', source('p2'))
    await h.engine.disable('p', 'manual')
    const status = await h.store.readStatus('p')
    expect(status?.status).toBe('disabled')
    expect(status?.previousGen).toBe(1)
    expect(status?.reason).toBe('manual')
  })

  it('keeps recovered disabled rows as dependency edges (#17 closure)', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', { provides: ['svc'] }))
    h.definitions.set('consumer', fixture('consumer', { requires: ['svc'] }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    await h.engine.disable('consumer')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    await expect(boot.engine.uninstall('provider')).rejects.toMatchObject({ code: 'dependent-exists' })
    expect(boot.engine.plugins().map(handle => handle.id)).toEqual(['consumer', 'provider'])
  })
})

describe('LifecycleEngine replace seven steps', () => {
  it('rejects at step 1 before any event and honors force', async () => {
    const h = harness()
    h.definitions.set('b', fixture('b', {
      permissions: { ...fixture('b').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    h.definitions.set('a2', fixture('a', {
      version: '2.0.0',
    }))
    await h.engine.install(source('b'))
    await h.engine.install(source('a2'))
    h.definitions.set('a3', fixture('a', {
      version: '3.0.0',
      permissions: { ...fixture('a').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    await expect(h.engine.replace('a', source('a3'))).rejects.toMatchObject({ code: 'write-conflict' })
    expect(h.events.map(event => event.name)).toEqual([
      'plugin/installed', 'plugin/activated',
      'plugin/installed', 'plugin/activated',
    ])
    await h.engine.replace('a', source('a3'), { force: true })
    expect(h.events.map(event => event.name)).toEqual([
      'plugin/installed', 'plugin/activated',
      'plugin/installed', 'plugin/activated',
      'plugin/replacing', 'plugin/deactivated', 'plugin/replaced',
    ])
  })

  it('keeps the current generation live on a step-3 capture failure and emits replace-failed once (HP:136)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        captureState: () => {
          throw new Error('capture boom')
        },
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: {
        activate: () => {},
      },
    }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(h.events.filter(event => event.name === 'plugin/replace-failed')).toHaveLength(1)
  })

  it('keeps the current generation live on a step-4 staging failure (HP:136)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        setup: async () => {
          throw new Error('setup boom')
        },
      },
    }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(h.events.filter(event => event.name === 'plugin/replace-failed')).toHaveLength(1)
    expect(h.events.filter(event => event.name === 'plugin/replaced')).toHaveLength(0)
  })

  it('swaps registrations and provides on success with the replaced payload', async () => {
    const h = harness()
    const received: number[] = []
    h.definitions.set('p', fixture('p', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 1 })
          env.on('lifecycle/emit', (payload: { readonly n: number }) => received.push(payload.n))
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      provides: ['svc', 'extra'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 2 })
          env.provide('extra', { on: true })
          env.on('lifecycle/emit', (payload: { readonly n: number }) => received.push(payload.n * 10))
        },
      },
    }))
    await h.engine.replace('p', source('p2'))
    h.ctx.emit('lifecycle/emit', { n: 1 })
    expect(received).toEqual([10])
    const replaced = h.events.find(event => event.name === 'plugin/replaced')
    expect(replaced?.payload.providesPath).toBe('added')
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('rejects a provides-drop with dependents (dependent-exists)', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', { provides: ['svc'] }))
    h.definitions.set('consumer', fixture('consumer', { requires: ['svc'] }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    h.definitions.set('provider2', fixture('provider', { version: '2.0.0' }))
    await expect(h.engine.replace('provider', source('provider2'))).rejects.toMatchObject({ code: 'dependent-exists' })
    expect(h.events.filter(event => event.name === 'plugin/replace-failed')).toHaveLength(0)
  })

  it('trims in-memory history to historyKeep', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    for (let i = 2; i <= 4; i += 1) {
      h.definitions.set(`p${i}`, fixture('p', { version: `${i}.0.0` }))
      await h.engine.replace('p', source(`p${i}`))
    }
    const handle = h.engine.plugins()[0] as PluginHandleInfo
    expect(handle.version).toBe('4.0.0')
    expect(handle.generation).toBe(4)
  })

  it('hands state across a stateful replace via capture/restore', async () => {
    const h = harness()
    const restored: unknown[] = []
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        captureState: () => ({ count: 1 }),
        restoreState: (state: unknown, previous: unknown) => {
          restored.push([state, previous])
        },
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: {
        restoreState: (state: unknown, previous: unknown) => {
          restored.push([state, previous])
        },
        activate: () => {},
      },
    }))
    await h.engine.replace('p', source('p2'))
    expect(restored).toEqual([
      [undefined, null],
      [{ count: 1 }, { generation: 1, version: '1.0.0' }],
    ])
  })

  it('skips capture when the incumbent has no captureState hook', async () => {
    const h = harness()
    let restored = 0
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        restoreState: () => { restored += 1 },
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: {
        restoreState: () => { restored += 1 },
        activate: () => {},
      },
    }))
    await h.engine.replace('p', source('p2'))
    expect(restored).toBe(2)
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('rejects unserializable or oversized captured state', async () => {
    const h = harness()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        captureState: () => circular,
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: { activate: () => {} },
    }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')

    const h2 = harness()
    h2.definitions.set('big', fixture('big', {
      stateful: true,
      hooks: {
        captureState: () => ({ blob: 'x'.repeat(10 * 1024 * 1024) }),
        activate: () => {},
      },
    }))
    await h2.engine.install(source('big'))
    h2.definitions.set('big2', fixture('big', {
      version: '2.0.0',
      stateful: true,
      hooks: { activate: () => {} },
    }))
    await expect(h2.engine.replace('big', source('big2'))).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('fails atomically when a scoped layer staging fails (cross-scope atomicity)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.scope('agent-1' as SessionId).on('lifecycle/emit', () => {})
        },
      },
    }))
    await h.engine.install(source('p'))
    let setupCalls = 0
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        async setup() {
          setupCalls += 1
          if (setupCalls === 2) throw new Error('scoped layer boom')
        },
        activate(env) {
          env.scope('agent-1' as SessionId).on('lifecycle/emit', () => {})
        },
      },
    }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(setupCalls).toBe(2)
  })

  it('registers scoped tools and provides through the staging env', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          const scoped = env.scope('agent-1' as SessionId)
          scoped.registerTool({
            name: 'scoped_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
          scoped.provide('scoped-svc', 1)
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(h.engine.plugins()[0]?.id).toBe('p')
  })

  it('runs with the engine defaults when optional options are omitted', async () => {
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    const definitions = new Map<string, PluginDefinition>()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig(),
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
    })
    definitions.set('p', fixture('p'))
    await engine.install(source('p'))
    expect(engine.plugins()[0]?.id).toBe('p')
  })

  it('handles a partial deployment config with explicit policy knobs', async () => {
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    const definitions = new Map<string, PluginDefinition>()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: {} as PluginManagerConfig,
      historyKeep: 2,
      swapTimeoutMs: 40,
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
    })
    definitions.set('p', fixture('p'))
    await engine.install(source('p'))
    expect(engine.plugins()[0]?.id).toBe('p')
  })

  it('restores the old generation when a replace persist fails', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { v: 1 })
          env.registerTool({
            name: 'restore_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      provides: ['svc', 'extra'],
      hooks: {
        activate(env) {
          env.provide('svc', { v: 2 })
          env.provide('extra', true)
          env.registerTool({
            name: 'restore_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
          env.registerTool({
            name: 'extra_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    h.store.fail('status')
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(h.engine.provideValue('svc')).toEqual({ v: 1 })
    expect(h.engine.provideValue('extra')).toBeUndefined()
    expect(h.events.filter(event => event.name === 'plugin/replaced')).toHaveLength(0)
    // The failed generation's extra tool left no residue.
    h.definitions.set('q', fixture('q', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'extra_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('q'))
  })

  it('reports providesPath dropped when a replace removes entries', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', { provides: ['svc'] }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await h.engine.replace('p', source('p2'))
    expect(h.events.find(event => event.name === 'plugin/replaced')?.payload.providesPath).toBe('dropped')
  })

  it('replaces a static entry through the runtime-api validation path', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.adoptStatic(fixture('p'), {})
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await h.engine.replace('p', source('p2'))
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })
})

describe('LifecycleEngine swapPolicy', () => {
  it('proceeds immediately with the default idle check', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', { swapPolicy: 'next-idle' }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'next-idle' }))
    await h.engine.replace('p', source('p2'))
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('waits on an empty affected set for a generation-less replace', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', { swapPolicy: 'drain' }))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'drain' }))
    await boot.engine.replace('p', source('p2'))
    expect(boot.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('times out next-idle with swap-timeout and leaves the current generation untouched (HP:139)', async () => {
    const h = harness({
      isTurnBusy: async () => true,
      swapTimeoutMs: 30,
    })
    h.definitions.set('p', fixture('p', { swapPolicy: 'next-idle' }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'next-idle' }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({
      code: 'swap-timeout',
      details: { policy: 'next-idle' },
    })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(h.events.filter(event => event.name === 'plugin/replace-failed')).toHaveLength(1)
  })

  it('waits for drain quiescence before swapping', async () => {
    const h = harness({ swapTimeoutMs: 1000 })
    const received: number[] = []
    h.definitions.set('p', fixture('p', {
      swapPolicy: 'drain',
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async (payload: { readonly n: number }) => {
            await sleep(30)
            received.push(payload.n)
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'drain' }))
    const replacement = h.engine.replace('p', source('p2'))
    await sleep(10)
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    await dispatch
    await replacement
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('times out drain quiescence with swap-timeout when events never settle (event-driven backstop)', async () => {
    const h = harness({ swapTimeoutMs: 60 })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      swapPolicy: 'drain',
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'drain' }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({
      code: 'swap-timeout',
      details: { policy: 'drain' },
    })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(h.events.filter(event => event.name === 'plugin/replace-failed')).toHaveLength(1)
    release()
    await dispatch
  })

  it('proceeds once next-idle becomes free', async () => {
    let busy = true
    const h = harness({
      isTurnBusy: () => busy,
      swapTimeoutMs: 500,
    })
    h.definitions.set('p', fixture('p', { swapPolicy: 'next-idle' }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0', swapPolicy: 'next-idle' }))
    const replacement = h.engine.replace('p', source('p2'))
    await sleep(15)
    busy = false
    await replacement
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('waits for in-flight dispatches before releasing the old generation (native ordering)', async () => {
    const h = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    const replacement = h.engine.replace('p', source('p2'))
    await sleep(10)
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(0)
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    release()
    await dispatch
    await replacement
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(1)
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('force-releases the old generation when events never settle (deferred-dispose bound, R2)', async () => {
    const logs: string[] = []
    const h = harness({
      swapTimeoutMs: 60,
      logger: { error: m => logs.push(String(m)), info: () => {}, warn: m => logs.push(String(m)), debug: () => {} },
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    const started = Date.now()
    const replacement = h.engine.replace('p', source('p2'))
    await replacement
    const elapsed = Date.now() - started
    // 常驻事件流永不排空：swapTimeoutMs 后强制释放旧代，replace 不无限等待。
    expect(elapsed).toBeGreaterThanOrEqual(50)
    expect(elapsed).toBeLessThan(2000)
    expect(h.engine.plugins()[0]?.version).toBe('2.0.0')
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(1)
    expect(logs.some(line => line.includes('deferred-dispose-abandoned'))).toBe(true)
    release()
    await dispatch
  })

  it('releases only after every in-flight event settles', async () => {
    const h = harness()
    let releaseParallel!: () => void
    let releaseWaterfall!: () => void
    const parallelGate = new Promise<void>((resolve) => { releaseParallel = resolve })
    const waterfallGate = new Promise<void>((resolve) => { releaseWaterfall = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await parallelGate
          })
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/waterfall', async (_payload, next) => {
            await waterfallGate
            return next()
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await parallelGate
          })
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/waterfall', async (_payload, next) => {
            await waterfallGate
            return next()
          })
        },
      },
    }))
    const parallel = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    const waterfall = h.ctx.waterfall('lifecycle/waterfall', { n: 1 }, () => 1)
    await sleep(5)
    const replacement = h.engine.replace('p', source('p2'))
    await sleep(10)
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(0)
    releaseParallel()
    await parallel
    await sleep(10)
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(0)
    releaseWaterfall()
    await waterfall
    await replacement
    expect(h.events.filter(event => event.name === 'plugin/deactivated')).toHaveLength(1)
  })

  it('dispose releases generations even with dispatches in flight', async () => {
    const h = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    h.engine.dispose()
    expect(h.engine.plugins()).toEqual([])
    release()
    await dispatch
  })

  it('uninstall releases a generation immediately even with dispatches in flight', async () => {
    const h = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          // oxlint-disable-next-line typescript/no-misused-promises -- async listeners are awaited by the dispatch container.
          env.on('lifecycle/parallel', async () => {
            await gate
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    const dispatch = h.ctx.parallel('lifecycle/parallel', { n: 1 })
    await sleep(5)
    await h.engine.uninstall('p')
    expect(h.engine.plugins()).toEqual([])
    release()
    await dispatch
  })
})

describe('LifecycleEngine provides/tools', () => {
  it('publishes manager-held tools through the registry bridge once and keeps the view live across replace', async () => {
    const registry = new FakeToolRegistry()
    const h = harness({ toolRegistry: registry })
    h.definitions.set('p', toolFixture('p', 'bridge_tool', 'v1', 'first'))
    await h.engine.install(source('p'))
    expect(registry.registrations.has('bridge_tool')).toBe(true)
    expect(registry.disposed).toEqual([])

    h.definitions.set('p2', toolFixture('p', 'bridge_tool', 'v2', 'second'))
    await h.engine.replace('p', source('p2'))
    // One indirection for the tool's whole lifetime: replace mutates the
    // manager-held table, the registry sees no re-registration (F1).
    expect(registry.registrations.size).toBe(1)
    expect(registry.disposed).toEqual([])
    const view = registry.get('bridge_tool') as ToolView
    expect(view.name).toBe('bridge_tool')
    expect(view.description).toBe('second')
    expect(view.parameters).toEqual({ type: 'object' })
    expect(view.output.schema).toEqual({ type: 'string' })
    expect(view.output.render({}, 'hello')).toEqual([{ type: 'text', text: 'hello' }])
    expect(view.output.render({}, { answer: 42 })).toEqual([{ type: 'text', text: '{"answer":42}' }])
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('v2')
  })

  it('drops and disposes the registry indirection when a generation stops registering the tool', async () => {
    const registry = new FakeToolRegistry()
    const h = harness({ toolRegistry: registry })
    h.definitions.set('p', toolFixture('p', 'bridge_tool', 'v1'))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      hooks: { activate: () => {} },
    }))
    await h.engine.replace('p', source('p2'))
    expect(registry.registrations.has('bridge_tool')).toBe(false)
    expect(registry.disposed).toEqual(['bridge_tool'])
  })

  it('uninstalls and engine dispose both dispose registry indirections; a stale view fails loudly', async () => {
    const registry = new FakeToolRegistry()
    const h = harness({ toolRegistry: registry })
    h.definitions.set('p', toolFixture('p', 'bridge_tool', 'v1'))
    await h.engine.install(source('p'))
    const stale = registry.get('bridge_tool') as ToolView
    await h.engine.uninstall('p')
    expect(registry.disposed).toEqual(['bridge_tool'])
    expect(() => stale.execute({}, { signal: new AbortController().signal }))
      .toThrow(/not live/)

    h.definitions.set('q', toolFixture('q', 'other_tool', 'v1'))
    await h.engine.install(source('q'))
    h.engine.dispose()
    expect(registry.disposed).toEqual(['bridge_tool', 'other_tool'])
  })

  it('compensates registry publications when the status persist fails', async () => {
    const registry = new FakeToolRegistry()
    const h = harness({ toolRegistry: registry })
    h.definitions.set('p', toolFixture('p', 'bridge_tool', 'v1'))
    h.store.fail('status')
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(registry.registrations.size).toBe(0)
    expect(registry.disposed).toEqual(['bridge_tool'])
  })

  it('rejects tool collisions with raw registrations loudly: claims, shadow, and plain duplicate', async () => {
    const registry = new FakeToolRegistry()
    registry.seed('held_tool')
    const h = harness({
      toolRegistry: registry,
      config: resolvePluginManagerConfig({ grants: { claimant: { claims: true } } }),
    })

    h.definitions.set('claimant', fixture('claimant', {
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: ['tool:held_tool'] },
      hooks: {
        activate(env) {
          env.registerTool({ name: 'held_tool', description: '', input: {}, output: { type: 'string' }, execute: async () => 'x' })
        },
      },
    }))
    await expect(h.engine.install(source('claimant')))
      .rejects.toMatchObject({ code: 'claims-unmanaged-incumbent', details: { slot: 'tool:held_tool' } })

    h.definitions.set('shadower', fixture('shadower', {
      hooks: {
        activate(env) {
          env.scope('agent-1' as SessionId).registerTool({
            name: 'held_tool', description: '', input: {}, output: { type: 'string' }, execute: async () => 'x',
          })
        },
      },
    }))
    await expect(h.engine.install(source('shadower')))
      .rejects.toMatchObject({ code: 'shadow-undeclared', details: { tool: 'held_tool' } })

    h.definitions.set('plain', fixture('plain', {
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', () => {})
          env.registerTool({ name: 'held_tool', description: '', input: {}, output: { type: 'string' }, execute: async () => 'x' })
        },
      },
    }))
    await expect(h.engine.install(source('plain')))
      .rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('publishes manager-held prompt sections once and keeps a live view across replace (Proposal B)', async () => {
    const prompt = new FakePromptService()
    const h = harness({ promptService: prompt })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'p:narrate', order: 60, text: 'first' })
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(prompt.sections.has('p:narrate')).toBe(true)
    expect(prompt.disposed).toEqual([])

    h.definitions.set('p2', fixture('p', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'p:narrate', order: 70, text: () => 'second' })
        },
      },
    }))
    await h.engine.replace('p', source('p2'))
    expect(prompt.sections.size).toBe(1)
    expect(prompt.disposed).toEqual([])
    const view = prompt.sections.get('p:narrate') as {
      readonly name: string
      readonly order: number
      readonly text: unknown
    }
    expect(view.name).toBe('p:narrate')
    expect(view.order).toBe(70)
    expect(typeof view.text).toBe('function')
  })

  it('drops, uninstalls, and disposes prompt-section publications; a stale view fails loudly', async () => {
    const prompt = new FakePromptService()
    const h = harness({ promptService: prompt })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'p:one', order: 1, text: 'one' })
        },
      },
    }))
    await h.engine.install(source('p'))
    const stale = prompt.sections.get('p:one') as { get text(): unknown }
    h.definitions.set('p2', fixture('p', {
      hooks: { activate: () => {} },
    }))
    await h.engine.replace('p', source('p2'))
    expect(prompt.sections.has('p:one')).toBe(false)
    expect(prompt.disposed).toEqual(['p:one'])
    expect(() => stale.text).toThrow(/not live/)

    h.definitions.set('q', fixture('q', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'q:two', order: 2, text: 'two' })
        },
      },
    }))
    await h.engine.install(source('q'))
    await h.engine.uninstall('q')
    expect(prompt.disposed).toEqual(['p:one', 'q:two'])

    h.definitions.set('r', fixture('r', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'r:three', order: 3, text: 'three' })
        },
      },
    }))
    await h.engine.install(source('r'))
    h.engine.dispose()
    expect(prompt.disposed).toEqual(['p:one', 'q:two', 'r:three'])
  })

  it('supports scoped prompt sections and compensates publications on persist failures both ways', async () => {
    const prompt = new FakePromptService()
    const h = harness({ promptService: prompt })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          const disposer = env.scope('agent-1' as SessionId).registerPromptSection({ name: 'p:scoped', order: 3, text: 'scoped' })
          disposer()
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(prompt.sections.has('p:scoped')).toBe(true)

    // Install persist failure: the staged section is published then compensated away.
    h.definitions.set('lost', fixture('lost', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'lost:section', order: 4, text: 'lost' })
        },
      },
    }))
    h.store.fail('status')
    await expect(h.engine.install(source('lost'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(prompt.disposed).toEqual(['lost:section'])

    // Replace persist failure: the previous generation's section is restored.
    h.definitions.set('p2', fixture('p', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'p:next', order: 5, text: 'next' })
        },
      },
    }))
    h.store.fail('status')
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(prompt.sections.has('p:scoped')).toBe(true)
    expect(prompt.sections.has('p:next')).toBe(false)
    // The go-live swap transiently disposes the replaced section, then
    // compensation republishes it and disposes the failed generation's one.
    expect(prompt.disposed).toEqual(['lost:section', 'p:scoped', 'p:next'])
  })

  it('releases only the uninstalled plugin prompt sections when peers hold other sections', async () => {
    const prompt = new FakePromptService()
    const h = harness({ promptService: prompt })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'p:one', order: 1, text: 'one' })
        },
      },
    }))
    h.definitions.set('q', fixture('q', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'q:two', order: 2, text: 'two' })
        },
      },
    }))
    await h.engine.install(source('p'))
    await h.engine.install(source('q'))
    await h.engine.uninstall('q')
    expect(prompt.sections.has('p:one')).toBe(true)
    expect(prompt.sections.has('q:two')).toBe(false)
    expect(prompt.disposed).toEqual(['q:two'])
  })

  it('rejects malformed prompt sections at staging and counts them against the contribution quota', async () => {
    const prompt = new FakePromptService()
    const h = harness({ promptService: prompt })
    h.definitions.set('bad', fixture('bad', {
      hooks: {
        activate(env) {
          env.registerPromptSection({ name: 'bad', order: Number.NaN, text: 'x' })
        },
      },
    }))
    await expect(h.engine.install(source('bad'))).rejects.toMatchObject({ code: 'staging-failed' })

    h.definitions.set('setup-bad', fixture('setup-bad', {
      hooks: {
        async setup(env) {
          env.registerPromptSection({ name: 'setup', order: 1, text: 'x' })
        },
      },
    }))
    await expect(h.engine.install(source('setup-bad'))).rejects.toMatchObject({ code: 'staging-failed' })

    h.definitions.set('quota', fixture('quota', {
      hooks: {
        activate(env) {
          for (let index = 0; index < 50; index += 1) {
            env.registerTool({ name: `tool_${index}`, description: '', input: {}, output: { type: 'string' }, execute: async () => 'x' })
          }
          env.registerPromptSection({ name: 'quota:section', order: 1, text: 'x' })
        },
      },
    }))
    await expect(h.engine.install(source('quota'))).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('resolves sessionPersistence as a write-enabled projection (Proposal B)', async () => {
    const sessionPersistence = new FakeSessionPersistence()
    const h = harness({ sessionPersistence })
    let resolved: unknown
    h.definitions.set('reader', fixture('reader', {
      requires: ['sessionPersistence'],
      hooks: {
        activate(env) {
          resolved = env.get('sessionPersistence')
        },
      },
    }))
    await h.engine.install(source('reader'))
    const projection = resolved as SessionPersistenceProjection
    await expect(projection.listSnapshots()).resolves.toEqual([{ header: { id: 'session-1' }, revision: 1 }])
    await expect(projection.list()).resolves.toEqual([])
    expect(projection.locate({})).toBeUndefined()
    await expect(projection.inspect('session-1')).rejects.toThrow(/unavailable/)
    await expect(projection.load('session-1')).rejects.toThrow(/unavailable/)
    await expect(projection.readFrom('session-1', 0)).resolves.toEqual([])
    await expect(projection.prepare('session-1')).resolves.toBeUndefined()
    await expect(projection.create({ id: 'session-2' })).resolves.toBeUndefined()
    await expect(projection.append('session-2', [])).resolves.toBeUndefined()

    let undeclared: unknown = 'unset'
    h.definitions.set('quiet', fixture('quiet', {
      hooks: {
        activate(env) {
          undeclared = env.get('sessionPersistence')
        },
      },
    }))
    await h.engine.install(source('quiet'))
    expect(undeclared).toBeDefined()

    // No host seam: resolution returns undefined, not an error.
    let absent: unknown = 'unset'
    const noSeam = harness()
    noSeam.definitions.set('no-seam', fixture('no-seam', {
      requires: ['sessionPersistence'],
      hooks: {
        activate(env) {
          absent = env.get('sessionPersistence')
        },
      },
    }))
    await noSeam.engine.install(source('no-seam'))
    expect(absent).toBeUndefined()
  })

  it('falls back to empty/denied projections when the host service lacks read methods', async () => {
    const h = harness({ sessionPersistence: {} })
    let resolved: unknown
    h.definitions.set('sparse', fixture('sparse', {
      requires: ['sessionPersistence'],
      hooks: {
        activate(env) {
          resolved = env.get('sessionPersistence')
        },
      },
    }))
    await h.engine.install(source('sparse'))
    const projection = resolved as SessionPersistenceProjection
    await expect(projection.listSnapshots()).resolves.toEqual([])
    await expect(projection.list()).resolves.toEqual([])
    expect(projection.locate({})).toBeUndefined()
    await expect(projection.inspect('s')).rejects.toThrow(/unavailable/)
    await expect(projection.load('s')).rejects.toThrow(/unavailable/)
    await expect(projection.readFrom('s', 0)).resolves.toEqual([])
    await expect(projection.prepare('s')).resolves.toBeUndefined()
  })

  it('keeps provide identity across an unchanged provides entry and updates values', async () => {
    const h = harness()
    let sawValue: unknown
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 1 })
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      requires: ['svc'],
      hooks: {
        activate(env) {
          sawValue = env.get('svc')
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(sawValue).toEqual({ version: 1 })
    h.definitions.set('provider2', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { version: 2 })
        },
      },
    }))
    await h.engine.replace('provider', source('provider2'))
    expect(h.engine.plugins().find(handle => handle.id === 'consumer')?.status).toBe('enabled')
  })

  it('keeps another provider’s capability when a replaced plugin drops it', async () => {
    const h = harness()
    let bValue: unknown
    h.definitions.set('a', fixture('a', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { from: 'a' })
        },
      },
    }))
    h.definitions.set('b', fixture('b', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', { from: 'b' })
        },
      },
    }))
    h.definitions.set('c', fixture('c', {
      requires: ['svc'],
      hooks: {
        activate(env) {
          bValue = env.get('svc')
        },
      },
    }))
    await h.engine.install(source('a'))
    await h.engine.install(source('b'))
    h.definitions.set('a2', fixture('a', { version: '2.0.0' }))
    await h.engine.replace('a', source('a2'))
    await h.engine.install(source('c'))
    expect(bValue).toEqual({ from: 'b' })
  })

  it('rejects invalid tool output schemas at staging and duplicate names across plugins', async () => {
    const h = harness()
    h.definitions.set('bad', fixture('bad', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'bad_tool',
            description: '',
            input: {},
            output: 'not-an-object' as unknown as Record<string, unknown>,
            execute: async () => undefined,
          })
        },
      },
    }))
    await expect(h.engine.install(source('bad'))).rejects.toMatchObject({ code: 'staging-failed' })

    h.definitions.set('one', fixture('one', {
      hooks: {
        activate(env) {
          env.registerTool({ name: 'shared_tool', description: '', input: {}, output: {}, execute: async () => undefined })
        },
      },
    }))
    h.definitions.set('two', fixture('two', {
      hooks: {
        activate(env) {
          env.registerTool({ name: 'shared_tool', description: '', input: {}, output: {}, execute: async () => undefined })
        },
      },
    }))
    await h.engine.install(source('one'))
    await expect(h.engine.install(source('two'))).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('never emits tools/change during a tool swap and releases the dropped name (HP:137)', async () => {
    const h = harness()
    const toolChanges: number[] = []
    h.ctx.on('tools/change', () => { toolChanges.push(toolChanges.length + 1) })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'swap_tool_a',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'swap_tool_b',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.replace('p', source('p2'))
    expect(toolChanges).toEqual([])
    // The replaced-away name is released at go-live; the new name stays held.
    h.definitions.set('q', fixture('q', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'swap_tool_a',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('q'))
    h.definitions.set('r', fixture('r', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'swap_tool_b',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await expect(h.engine.install(source('r'))).rejects.toMatchObject({ code: 'staging-failed' })
  })
})

describe('LifecycleEngine updateConfig, adoptStatic, dispose', () => {
  it('defaults to callable no-op logger methods', () => {
    const h = harness()
    expect(() => {
      h.engine.logger.error('error')
      h.engine.logger.info('info')
      h.engine.logger.warn('warn')
      h.engine.logger.debug('debug')
    }).not.toThrow()
  })

  it('updateConfig reuses the replace path and changes the resolved config', async () => {
    const h = harness()
    let sawConfig: unknown
    h.definitions.set('p', fixture('p', {
      config: z.object({ step: z.number() }),
      hooks: {
        async setup(_env, config) {
          sawConfig = config
        },
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'))
    expect(sawConfig).toEqual({})
    await h.engine.updateConfig('p', { step: 2 })
    expect(sawConfig).toEqual({ step: 2 })
    expect(h.events.filter(event => event.name === 'plugin/replaced')).toHaveLength(1)
  })

  it('updateConfig with a deep-equal patch is a no-op (no replace, no generation bump)', async () => {
    const h = harness()
    let sawConfig: unknown
    h.definitions.set('p', fixture('p', {
      config: z.object({ step: z.number() }),
      hooks: {
        async setup(_env, config) {
          sawConfig = config
        },
        activate: () => {},
      },
    }))
    await h.engine.install(source('p'), { config: { step: 1 } })
    const generation = h.engine.plugins()[0]?.generation
    const replacedBefore = h.events.filter(event => event.name === 'plugin/replaced').length
    await h.engine.updateConfig('p', { step: 1 })
    expect(sawConfig).toEqual({ step: 1 })
    expect(h.engine.plugins()[0]?.generation).toBe(generation)
    expect(h.events.filter(event => event.name === 'plugin/replaced').length).toBe(replacedBefore)
  })

  it('configRevisionOf：首次为 0，config 实际变化 +1，no-op 不推进', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      config: z.object({ step: z.number() }),
    }))
    await h.engine.install(source('p'), { config: { step: 1 } })
    expect(h.engine.configRevisionOf('p')).toBe(0)
    await h.engine.updateConfig('p', { step: 2 })
    expect(h.engine.configRevisionOf('p')).toBe(1)
    await h.engine.updateConfig('p', { step: 2 })
    expect(h.engine.configRevisionOf('p')).toBe(1)
  })

  it('updateConfig 携带过期 expectedRevision 时拒绝，且不覆盖已落地写入', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      config: z.object({ step: z.number() }),
    }))
    await h.engine.install(source('p'), { config: { step: 1 } })
    await h.engine.updateConfig('p', { step: 2 })
    await expect(h.engine.updateConfig('p', { step: 3 }, 0)).rejects.toMatchObject({
      code: 'config-revision-conflict',
      details: { id: 'p', expected: 0, actual: 1 },
    })
    expect(h.engine.configOf('p')).toEqual({ step: 2 })
    await h.engine.updateConfig('p', { step: 3 }, 1)
    expect(h.engine.configOf('p')).toEqual({ step: 3 })
    expect(h.engine.configRevisionOf('p')).toBe(2)
  })

  it('adopts static entries and shadows a dynamic install of the same id (T2-4)', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.adoptStatic(fixture('p'), {})
    expect(h.engine.plugins()[0]?.origin).toBe('static')
    const handle = await h.engine.install(source('p'))
    expect(handle.status).toBe('shadowed')
    expect(handle.reason).toBe('shadowed')
    expect(h.engine.plugins().find(plugin => plugin.origin === 'static')?.status).toBe('enabled')
  })

  it('adopting a static entry over a live dynamic one shadows it', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', 1)
          env.registerTool({
            name: 'adopt_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    h.definitions.set('p-static', fixture('p', {
      provides: ['static-svc'],
      hooks: {
        activate(env) {
          env.provide('static-svc', 2)
          env.registerTool({
            name: 'static_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    await h.engine.adoptStatic(h.definitions.get('p-static')!, {})
    expect(h.engine.plugins().find(plugin => plugin.id === 'p')?.origin).toBe('static')
    expect(h.engine.provideValue('static-svc')).toBe(2)
    expect(h.engine.provideValue('svc')).toBeUndefined()
    // The dynamic record's tool was released: a new plugin may take the name.
    h.definitions.set('q', fixture('q', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'adopt_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('q'))
    // The static generation's own tool survived the swap.
    h.definitions.set('r', fixture('r', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'static_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await expect(h.engine.install(source('r'))).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('fails a shadowed dynamic install when persistence fails', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.adoptStatic(fixture('p'), {})
    h.store.fail('status')
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'persist-failed' })
  })

  it('rejects an invalid updateConfig patch with manifest-invalid', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', { config: z.object({ step: z.number() }) }))
    await h.engine.install(source('p'))
    await expect(h.engine.updateConfig('p', { step: 'bad' })).rejects.toMatchObject({ code: 'manifest-invalid' })
  })

  it('re-adopting a static row with a changed config hot-replaces the generation', async () => {
    const h = harness()
    let sawConfig: unknown
    const raw = {
      name: 'static-config',
      Config: z.object({ marker: z.string().required(false) }),
      apply(_ctx: unknown, entry: unknown) {
        sawConfig = entry
      },
    }
    await h.engine.adoptRaw(raw, { marker: 'v1' }, 'static-config')
    expect(h.engine.configOf('static-config')).toEqual({ marker: 'v1' })
    // Same version, changed config: the idempotency guard must not
    // short-circuit — the row re-adoption is a hot-config replace.
    await h.engine.adoptRaw(raw, { marker: 'v2' }, 'static-config')
    expect(h.engine.configOf('static-config')).toEqual({ marker: 'v2' })
    expect(sawConfig).toEqual({ marker: 'v2' })
    // Same version and same config: idempotent, no extra replace.
    const before = h.events.filter(event => event.name === 'plugin/replaced').length
    await h.engine.adoptRaw(raw, { marker: 'v2' }, 'static-config')
    expect(h.events.filter(event => event.name === 'plugin/replaced').length).toBe(before)
  })

  it('disposes every registration and table entry', async () => {
    const h = harness()
    const received: number[] = []
    h.definitions.set('p', fixture('p', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', 1)
          env.on('lifecycle/emit', (payload: { readonly n: number }) => received.push(payload.n))
          env.registerTool({
            name: 'dispose_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('p'))
    h.engine.dispose()
    expect(h.engine.plugins()).toEqual([])
    h.ctx.emit('lifecycle/emit', { n: 1 })
    expect(received).toEqual([])
  })
})

describe('LifecycleEngine concurrency and cache return', () => {
  it('rejects overlapping operations on one id with concurrent-operation', async () => {
    const h = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate: async () => {
          await gate
        },
      },
    }))
    const installing = h.engine.install(source('p'))
    await sleep(5)
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'concurrent-operation' })
    release()
    await installing
  })

  it('rejects a cached-generation return when a companion now conflicts (HP:138)', async () => {
    const h = harness()
    h.definitions.set('a', fixture('a', {
      permissions: { ...fixture('a').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    h.definitions.set('a2', fixture('a', {
      version: '2.0.0',
    }))
    h.definitions.set('b', fixture('b', {
      permissions: { ...fixture('b').permissions, transform: [{ event: 'lifecycle/waterfall', writes: ['n'] }] },
    }))
    await h.engine.install(source('a'))
    await h.engine.replace('a', source('a2'))
    await h.engine.install(source('b'))
    await expect(h.engine.replaceToGeneration('a', 1)).rejects.toMatchObject({
      code: 'companion-conflict',
      details: { companion: 'b' },
    })
  })

  it('rejects returning to an untracked generation and allows a clean cached return', async () => {
    const h = harness()
    h.definitions.set('a', fixture('a'))
    h.definitions.set('a2', fixture('a', { version: '2.0.0' }))
    await h.engine.install(source('a'))
    await h.engine.replace('a', source('a2'))
    await expect(h.engine.replaceToGeneration('a', 99)).rejects.toMatchObject({ code: 'staging-failed' })
    await h.engine.replaceToGeneration('a', 1)
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
  })

  it('rethrows a staging failure from a cached-generation return', async () => {
    const h = harness()
    h.definitions.set('a', fixture('a', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'cache_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    h.definitions.set('a2', fixture('a', {
      version: '2.0.0',
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'cache_other_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    h.definitions.set('b', fixture('b', {
      hooks: {
        activate(env) {
          env.registerTool({
            name: 'cache_tool',
            description: '',
            input: {},
            output: {},
            execute: async () => undefined,
          })
        },
      },
    }))
    await h.engine.install(source('a'))
    await h.engine.replace('a', source('a2'))
    await h.engine.install(source('b'))
    await expect(h.engine.replaceToGeneration('a', 1)).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('maps an ordering-cycle cached return to companion-conflict', async () => {
    const h = harness()
    h.definitions.set('a', fixture('a', {
      permissions: {
        ...fixture('a').permissions,
        transform: [
          { event: 'lifecycle/waterfall', writes: ['x'] },
          { event: 'lifecycle/waterfall', reads: ['y'] },
        ],
      },
    }))
    h.definitions.set('a2', fixture('a', { version: '2.0.0' }))
    h.definitions.set('b', fixture('b', {
      permissions: {
        ...fixture('b').permissions,
        transform: [
          { event: 'lifecycle/waterfall', reads: ['x'] },
          { event: 'lifecycle/waterfall', writes: ['y'] },
        ],
      },
    }))
    await h.engine.install(source('a'))
    await h.engine.replace('a', source('a2'))
    await h.engine.install(source('b'))
    await expect(h.engine.replaceToGeneration('a', 1)).rejects.toMatchObject({ code: 'companion-conflict' })
  })
})

describe('LifecycleEngine boot recovery (T4)', () => {
  it('restores an enabled row and GCs an orphan generation row', async () => {
    const h = harness()
    const received: number[] = []
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', (payload: { readonly n: number }) => received.push(payload.n))
        },
      },
    }))
    await h.engine.install(source('p'))
    await h.store.writeGeneration('orphan', 99, {
      v: 1,
      source: { type: 'inline', code: 'orphan' },
      manifest: fixture('orphan'),
      resolvedConfig: {},
    })
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.restored).toBe(1)
    expect(report.gc.orphanGenerations).toBe(1)
    boot.ctx.emit('lifecycle/emit', { n: 7 })
    expect(received).toEqual([7])
  })

  it('shadows dynamic rows under static ids and quarantines damaged records', async () => {
    const h = harness()
    h.definitions.set('static-p', fixture('static-p'))
    await h.engine.install(source('static-p'))
    await h.store.writeStatus('broken', {
      v: 1,
      currentGen: 1,
      previousGen: null,
      status: 'enabled',
      provenance: { origin: 'runtime-api', mountedAt: 1 },
    })
    const boot = freshHarness(h.store, h.definitions, { staticIds: ['static-p'] })
    const report = await boot.engine.recover()
    expect(report.shadowed).toBe(1)
    expect(report.quarantined).toBe(1)
    expect(report.rows.find(row => row.id === 'broken')?.reason).toBe('damaged-record')
  })

  it('quarantines rows that fail full revalidation with the original code', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    h.definitions.set('bad', fixture('bad', {
      permissions: { ...fixture('bad').permissions, observe: ['internal/listener'] },
    }))
    await h.store.writeGeneration('bad', 1, {
      v: 1,
      source: { type: 'inline', code: 'bad' },
      manifest: fixture('bad', {
        permissions: { ...fixture('bad').permissions, observe: ['internal/listener'] },
      }),
      resolvedConfig: {},
    })
    await h.store.writeStatus('bad', {
      v: 1,
      currentGen: 1,
      previousGen: null,
      status: 'enabled',
      provenance: { origin: 'runtime-api', mountedAt: 1 },
    })
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.rows.find(row => row.id === 'bad')?.errorCode).toBe('event-not-mountable')
  })

  it('quarantines rows whose npm source cannot resolve at boot', async () => {
    const h = harness()
    await h.store.writeGeneration('pkg', 1, {
      v: 1,
      source: { type: 'npm', package: 'missing-pkg' },
      manifest: fixture('pkg'),
      resolvedConfig: {},
    })
    await h.store.writeStatus('pkg', {
      v: 1,
      currentGen: 1,
      previousGen: null,
      status: 'enabled',
      provenance: { origin: 'runtime-api', mountedAt: 1 },
    })
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.rows.find(row => row.id === 'pkg')?.reason).toBe('package-not-resolvable')
  })

  it('quarantines rows with an unknown record version', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.store.writeGeneration('odd', 1, {
      v: 2,
      source: { type: 'inline', code: 'odd' },
      manifest: fixture('odd'),
      resolvedConfig: {},
    } as unknown as Parameters<InMemoryRegistryStore['writeGeneration']>[2])
    await h.store.writeStatus('odd', {
      v: 1,
      currentGen: 1,
      previousGen: null,
      status: 'enabled',
      provenance: { origin: 'runtime-api', mountedAt: 1 },
    })
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.rows.find(row => row.id === 'odd')?.reason).toBe('damaged-record')
  })

  it('recovers a disabled row without mounting it', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p', 'manual')
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.restored).toBe(1)
    expect(boot.engine.plugins()[0]?.status).toBe('disabled')
  })

  it('allows enable and uninstall of a recovered disabled row', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    expect(boot.engine.plugins()[0]?.status).toBe('disabled')
    await boot.engine.enable('p')
    expect(boot.engine.plugins()[0]?.status).toBe('enabled')
    await boot.engine.uninstall('p')
    expect(boot.engine.plugins()).toEqual([])
  })

  it('replaces a recovered disabled record from its restaged manifest', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await boot.engine.replace('p', source('p2'))
    expect(boot.engine.plugins()[0]?.version).toBe('2.0.0')
  })

  it('compensates a failed replace of a recovered disabled record', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    h.store.fail('status')
    await expect(boot.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
    expect(boot.engine.plugins()[0]?.version).toBe('1.0.0')
  })

  it('updateConfig on a recovered disabled record reuses the replace path', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.engine.disable('p')
    const boot = freshHarness(h.store, h.definitions)
    await boot.engine.recover()
    await boot.engine.updateConfig('p', {})
    expect(boot.engine.plugins()[0]?.version).toBe('1.0.0')
    expect(boot.engine.plugins()[0]?.status).toBe('enabled')
  })

  it('restores an already-quarantined row without mounting it', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    await h.store.writeStatus('p', {
      v: 1,
      currentGen: 1,
      previousGen: null,
      status: 'quarantined',
      reason: 'validation-failed',
      provenance: { origin: 'runtime-api', mountedAt: 1 },
    })
    const boot = freshHarness(h.store, h.definitions)
    const report = await boot.engine.recover()
    expect(report.rows.find(row => row.id === 'p')?.status).toBe('quarantined')
  })
})

describe('LifecycleEngine PluginEnv capabilities (#16)', () => {
  it('passes env.fs reads through to the host io seam', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          void env.fs.read('/etc/passwd').catch(() => {})
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(h.engine.plugins()).toHaveLength(1)
  })

  it('passes env.fetch through to the host fetch implementation', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          void env.fetch('https://evil.dev').catch(() => {})
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(h.engine.plugins()).toHaveLength(1)
  })

  it('rejects the 101st listener registration with quota-effects-exceeded at the call point', async () => {
    const h = harness()
    h.definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          for (let index = 0; index <= 100; index += 1) {
            env.on('lifecycle/emit', () => {})
          }
        },
      },
    }))
    await expect(h.engine.install(source('p'))).rejects.toMatchObject({ code: 'staging-failed' })
  })

  it('forwards an allowed env.fetch to the host fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok'))
    const h = harness({
      fetchImpl,
      config: resolvePluginManagerConfig({
        grants: { p: { networkAccess: { allow: ['https://ok.dev'] } } },
      }),
    })
    let seen = ''
    h.definitions.set('p', fixture('p', {
      networkAccess: { allow: ['https://ok.dev'] },
      hooks: {
        async activate(env) {
          seen = await (await env.fetch('https://ok.dev/x')).text()
        },
      },
    }))
    await h.engine.install(source('p'))
    expect(seen).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledWith('https://ok.dev/x', undefined)
  })

  it('uses the global fetch default when no fetch implementation is provided', async () => {
    const spy = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', spy)
    try {
      const h = harness({
        config: resolvePluginManagerConfig({
          grants: { p: { networkAccess: { allow: ['https://ok.dev'] } } },
        }),
      })
      h.definitions.set('p', fixture('p', {
        networkAccess: { allow: ['https://ok.dev'] },
        hooks: {
          async activate(env) {
            await env.fetch('https://ok.dev/x')
          },
        },
      }))
      await h.engine.install(source('p'))
      expect(spy).toHaveBeenCalledWith('https://ok.dev/x', undefined)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('accepts an injected io seam', async () => {
    const io: PluginIo = {
      read: async () => new Uint8Array(),
      write: async () => {},
      append: async () => {},
      readdir: async () => [],
      stat: async () => ({ kind: 'file' as const, size: 0, mtimeMs: 0 }),
      realpath: async path => path,
    }
    const h = harness({ io })
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    expect(h.engine.plugins()[0]?.id).toBe('p')
  })

  it('warns state-rejected when a capture is not JSON-serializable (16.4)', async () => {
    const warns: string[] = []
    const h = harness({
      logger: {
        error: () => {},
        info: () => {},
        warn: (message) => { warns.push(String(message)) },
        debug: () => {},
      },
    })
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        captureState: () => {
          const state: Record<string, unknown> = {}
          state.self = state
          return state
        },
      },
    }))
    await h.engine.install(source('p'))
    h.definitions.set('p2', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: {
        captureState: () => ({}),
      },
    }))
    await expect(h.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(warns.some(line => line.includes('state-rejected'))).toBe(true)
  })
})

describe('LifecycleEngine crash semantics (T3)', () => {
  it('boot recovers the new generation when a replace crashes after step 5', async () => {
    const seen: string[] = []
    const definitions = new Map<string, PluginDefinition>()
    const store = new InMemoryRegistryStore()
    const first = freshHarness(store, definitions)
    definitions.set('p', fixture('p', {
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', () => seen.push('v1'))
        },
      },
    }))
    await first.engine.install(source('p'))
    first.ctx.emit('lifecycle/emit', { n: 1 })
    expect(seen).toEqual(['v1'])

    let crashed = false
    definitions.set('p2', fixture('p', {
      version: '2.0.0',
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', () => seen.push('v2'))
        },
      },
    }))
    const crashing = freshHarness(store, definitions, {
      crashAfterPersist: () => {
        crashed = true
        throw new Error('process died after step 5')
      },
    })
    await crashing.engine.install(source('p'))
    await expect(crashing.engine.replace('p', source('p2'))).rejects.toThrow(/process died after step 5/)
    expect(crashed).toBe(true)
    expect(crashing.events.filter(event => event.name === 'plugin/replaced')).toHaveLength(0)

    // Process death: only the store's durable bytes survive.
    const second = freshHarness(store, definitions)
    const report = await second.engine.recover()
    expect(report.restored).toBe(1)
    expect(second.engine.plugins()[0]?.version).toBe('2.0.0')
    second.ctx.emit('lifecycle/emit', { n: 2 })
    expect(seen).toEqual(['v1', 'v2'])
  })

  it('boot GC removes an orphan generation row left by a crash before the status pointer', async () => {
    const store = new InMemoryRegistryStore()
    const definitions = new Map<string, PluginDefinition>()
    const first = freshHarness(store, definitions)
    definitions.set('p', fixture('p'))
    await first.engine.install(source('p'))
    await store.writeGeneration('p', 99, {
      v: 1,
      source: { type: 'inline', code: 'p2' },
      manifest: fixture('p', { version: '99.0.0' }),
      resolvedConfig: {},
    })
    const boot = freshHarness(store, definitions)
    const report = await boot.engine.recover()
    expect(report.gc.historyTrimmed).toBe(1)
    const gens = await store.readGenerations('p')
    expect(gens.map(entry => entry.gen)).not.toContain(99)
  })

  it('resolves declared host services through env.get and keeps undeclared ones undefined', async () => {
    const store = new InMemoryRegistryStore()
    const definitions = new Map<string, PluginDefinition>()
    let seen: unknown = 'not-called'
    const pair = freshHarness(store, definitions, {
      hostService: capability => capability === 'hostSvc' ? { marker: 'host-ok' } : undefined,
    })
    definitions.set('host', fixture('host', {
      requires: ['hostSvc'],
      hooks: {
        activate(env) {
          const svc = env.get<{ marker: string }>('hostSvc')
          const undeclared = env.get('otherSvc')
          seen = { svc: svc?.marker, undeclared }
          expect(undeclared).toBeUndefined()
        },
      },
    }))
    await pair.engine.install(source('host'))
    expect(seen).toEqual({ svc: 'host-ok', undeclared: undefined })
  })

  it('forwards sessionPersistence writes without any grant', async () => {
    const append = vi.fn(async () => undefined)
    const hostPersistence = { create: vi.fn(async () => undefined), append }
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    const definitions = new Map<string, PluginDefinition>()
    let seenResult: unknown
    definitions.set('writer', fixture('writer', {
      requires: ['sessionPersistence'],
      hooks: {
        activate(env) {
          const projection = env.get<{ append(id: string, events: unknown[]): Promise<unknown> }>('sessionPersistence')
          if (projection === undefined) {
            seenResult = 'missing'
            return
          }
          seenResult = projection.append('session-1', [{}])
            .then(() => 'ok')
            .catch((error: unknown) => error)
        },
      },
    }))
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({}),
      sessionPersistence: hostPersistence,
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
    })
    await engine.install(source('writer'))
    expect(append).toHaveBeenCalledWith('session-1', [{}])
    expect(await seenResult).toBe('ok')
  })

  it('publishes managed commands into the host commands service and disposes them', async () => {
    const registrations = new Map<string, { readonly definition: unknown; disposer(): void }>()
    const commandService = {
      register(definition: unknown): () => void {
        const name = (definition as { name?: unknown }).name
        if (typeof name !== 'string') throw new Error('command view must carry a name')
        const record = { definition, disposer: () => { registrations.delete(name) } }
        registrations.set(name, record)
        return record.disposer
      },
    }
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('cmd', fixture('cmd', {
      hooks: {
        activate(env) {
          env.commands.register({
            name: 'side',
            description: 'Open a side session',
            handler: async () => ({ kind: 'success' as const, text: 'ok' }),
          })
        },
      },
    }))
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig(),
      commandService,
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
    })
    await engine.install(source('cmd'))
    expect(registrations.has('side')).toBe(true)
    const view = registrations.get('side')?.definition as { name: string; description: string }
    expect(view.name).toBe('side')
    expect(view.description).toBe('Open a side session')
    await engine.uninstall('cmd')
    expect(registrations.has('side')).toBe(false)
  })

  it('publishes granted provides into the host context and disposes them', async () => {
    const published = new Map<string, { value: unknown; disposer(): void }>()
    const hostProvide = (name: string, value: unknown): (() => void) => {
      const record = { value, disposer: () => { published.delete(name) } }
      published.set(name, record)
      return record.disposer
    }
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('provider', fixture('provider', {
      provides: ['bash'],
      hostPublishAccess: true,
      hooks: {
        activate(env) {
          env.provide('bash', { run: () => 'managed-bash' })
        },
      },
    }))
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({
        grants: { provider: { hostPublish: true } },
      }),
      hostProvide,
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
    })
    await engine.install(source('provider'))
    expect(published.has('bash')).toBe(true)
    expect((published.get('bash')?.value as { run(): string }).run()).toBe('managed-bash')
    await engine.uninstall('provider')
    expect(published.has('bash')).toBe(false)
  })

  it('invokes deactivate and dispose hooks on generation disposal', async () => {
    const h = harness()
    const calls: string[] = []
    h.definitions.set('lifecycle', fixture('lifecycle', {
      hooks: {
        deactivate: async () => { calls.push('deactivate') },
        dispose: () => { calls.push('dispose') },
      },
    }))
    await h.engine.install(source('lifecycle'))
    expect(calls).toEqual([])
    await h.engine.uninstall('lifecycle')
    expect(calls).toEqual(['deactivate', 'dispose'])
  })
})

describe('checkSupport', () => {
  it('accepts a valid raw plugin and rejects a broken entry shape', async () => {
    const { engine } = harness()
    await expect(engine.checkSupport({ name: 'ok', apply() {} })).resolves.toEqual({ ok: true })
    await expect(engine.checkSupport({} as never)).resolves.toMatchObject({ ok: false })
  })

  it('reports missing host services without mutating state', async () => {
    const { engine } = harness({
      hostService: (capability) => (capability === 'present' ? {} : undefined),
    })
    const raw = { name: 'needy', inject: ['present', 'absent'], apply() {} }
    await expect(engine.checkSupport(raw)).resolves.toEqual({
      ok: false,
      reason: '宿主缺少服务：absent',
    })
    await expect(engine.plugins()).toEqual([])
  })
})

describe('updateRaw', () => {
  it('swaps the raw plugin generation through the HMR replace protocol', async () => {
    const { engine } = harness()
    const raw = (marker: string) => ({
      name: 'raw-update',
      apply() { void marker },
    })
    await engine.adoptRaw(raw('v1'), {})
    expect(engine.plugins()[0]?.generation).toBe(1)
    await engine.updateRaw(raw('v2'), {}, 'raw-update')
    const handle = engine.plugins()[0]
    expect(handle?.id).toBe('raw-update')
    expect(handle?.generation).toBe(2)
    expect(engine.plugins()).toHaveLength(1)
  })
})

describe('settings namespace staging (raw-plugin facade)', () => {
  const settingsRaw = (_marker: string) => ({
    name: 'settings-raw',
    Config: z.object({ marker: z.string().required(false) }),
    apply(ctx: any, entry: any) {
      ctx.inject(['settings'], (sctx: any) => {
        sctx.settings.register(
          'settings-raw',
          z.object({ marker: z.string().required(false) }),
          { base: entry },
        )
      })
    },
  })

  it('hot-config replaces a settings-registering raw plugin without duplicate registration', async () => {
    const h = harness()
    const settings = new FakeSettingsService(h.ctx)
    await h.engine.adoptRaw(settingsRaw('v1'), { marker: 'v1' }, 'settings-raw')
    expect(settings.namespaces.size).toBe(1)
    expect(settings.get('settings-raw')).toMatchObject({ marker: 'v1' })

    await h.engine.updateConfig('settings-raw', { marker: 'v2' })
    expect(settings.namespaces.size).toBe(1)
    expect(settings.get('settings-raw')).toMatchObject({ marker: 'v2' })
  })

  it('disabling drops the namespace and enabling remounts it', async () => {
    const h = harness()
    const settings = new FakeSettingsService(h.ctx)
    await h.engine.adoptRaw(settingsRaw('v1'), {}, 'settings-raw')
    expect(settings.namespaces.size).toBe(1)

    await h.engine.disable('settings-raw')
    expect(settings.namespaces.size).toBe(0)

    await h.engine.enable('settings-raw')
    expect(settings.namespaces.size).toBe(1)
  })

  it('bounded dispose: a never-settling settings-owner disposal is abandoned after disposeTimeoutMs (B8/EB-D21)', async () => {
    const logs: string[] = []
    const h = harness({
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2, disposeTimeoutMs: 60 }),
      logger: { error: m => logs.push(String(m)), info: () => {}, warn: m => logs.push(String(m)), debug: () => {} },
    })
    const settings = new FakeSettingsService(h.ctx)
    await h.engine.adoptRaw(settingsRaw('v1'), { marker: 'v1' }, 'settings-raw')
    expect(settings.namespaces.size).toBe(1)
    // 注入永不结束的 settings owner fiber dispose（A2 等价面）。注意必须注入
    // settingsOwner 本身而不是 settingsOwnerDisposal：disposeGeneration 会从
    // settingsOwner.fiber.dispose() 构造 disposal，直接注入 promise 会被覆盖（假绿）。
    const record = (h.engine as unknown as {
      records: Map<string, { generations: { settingsOwner?: { fiber: { dispose(): Promise<void> } } }[] }>
    }).records.get('settings-raw')
    if (record === undefined || record.generations[0] === undefined) throw new Error('record missing')
    record.generations[0].settingsOwner = {
      fiber: { dispose: () => new Promise<void>(() => {}) },
    }

    const started = Date.now()
    await h.engine.updateConfig('settings-raw', { marker: 'v2' })
    const elapsed = Date.now() - started
    // 60ms 超时后放弃并继续 replace：耗时应贴近超时窗口而不是无限等待。
    expect(elapsed).toBeGreaterThanOrEqual(50)
    expect(elapsed).toBeLessThan(2000)
    expect(logs.some(line => line.includes('dispose-abandoned'))).toBe(true)
    expect(h.engine.plugins()[0]?.version).toBe('0.0.0-raw')
    expect(h.engine.plugins()[0]?.generation).toBe(2)
  })
})

describe('webserver upgrade-route staging (raw-plugin facade)', () => {
  const upgradeRaw = () => ({
    name: 'upgrade-raw',
    apply(ctx: any) {
      ctx.effect(
        () => ctx.httpServer.registerUpgrade({
          path: '/sidebar/ws/terminal',
          handler: () => {},
        }),
        'upgrade-raw: terminal WebSocket',
      )
    },
  })

  it('hot-config replaces an upgrade-route plugin without duplicate route', async () => {
    const h = harness()
    const server = new FakeHttpServerService(h.ctx)
    await h.engine.adoptRaw(upgradeRaw(), {}, 'upgrade-raw')
    expect(server.upgrades.size).toBe(1)

    await h.engine.updateConfig('upgrade-raw', {})
    expect(server.upgrades.size).toBe(1)
  })

  it('disabling drops the upgrade route and enabling remounts it', async () => {
    const h = harness()
    const server = new FakeHttpServerService(h.ctx)
    await h.engine.adoptRaw(upgradeRaw(), {}, 'upgrade-raw')
    expect(server.upgrades.size).toBe(1)

    await h.engine.disable('upgrade-raw')
    expect(server.upgrades.size).toBe(0)

    await h.engine.enable('upgrade-raw')
    expect(server.upgrades.size).toBe(1)
  })
})
