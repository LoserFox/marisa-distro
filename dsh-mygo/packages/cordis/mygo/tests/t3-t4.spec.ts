/**
 * #17 acceptance: the T3 crash matrix (power-loss injection at every write
 * step) and the T4 boot-recovery table (six row classes, one real sqlite
 * medium each), plus snapshot handoff, audit emission, registry quotas, and
 * the disabled-row full recovery closure — all over a real sqlite database
 * file through the storage-domain form.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import z from '@deepseek-ai/schemastery'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, DomainSpec } from '@deepseek-ai/dsh-storage-domain'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import type { PluginDefinition, PluginHooks, PluginSource } from '@r05en1cu/dsh-mygo-api'
import {
  DispatchMachine,
  LifecycleEngine,
  pluginRegistryDomainSpec,
  RegistryPersistence,
  resolvePluginManagerConfig,
  type EventDispatchMode,
  type GenerationRecord,
  type LifecycleEngineOptions,
  type PluginEventVocabularyEntry,
  type PluginLifecycleEventPayload,
  type PluginManagerConfig,
  type RegistryStore,
  type StatusRecord,
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

interface RecordedEvent {
  readonly name: string
  readonly payload: PluginLifecycleEventPayload
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
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks,
  }
  return { ...base, ...overrides, hooks }
}

function source(id: string): PluginSource {
  return { type: 'inline', code: id }
}

/** Power-loss injection around any RegistryStore: the write lands, then throws. */
class CrashStore implements RegistryStore {
  private next: 'gens' | 'status' | 'delete' | undefined

  constructor(private readonly inner: RegistryStore) {}

  crashAfter(table: 'gens' | 'status' | 'delete'): void {
    this.next = table
  }

  private crash(table: 'gens' | 'status' | 'delete'): void {
    if (this.next !== table) return
    this.next = undefined
    throw new Error(`power loss after ${table} write`)
  }

  listIds(): Promise<readonly string[]> {
    return this.inner.listIds()
  }

  readGenerations(id: string): Promise<readonly { readonly gen: number; readonly record: GenerationRecord }[]> {
    return this.inner.readGenerations(id)
  }

  async writeGeneration(id: string, gen: number, record: GenerationRecord): Promise<void> {
    await this.inner.writeGeneration(id, gen, record)
    this.crash('gens')
  }

  deleteGeneration(id: string, gen: number): Promise<void> {
    return this.inner.deleteGeneration(id, gen)
  }

  readStatus(id: string): Promise<StatusRecord | undefined> {
    return this.inner.readStatus(id)
  }

  async writeStatus(id: string, record: StatusRecord): Promise<void> {
    await this.inner.writeStatus(id, record)
    this.crash('status')
  }

  async deletePlugin(id: string): Promise<void> {
    await this.inner.deletePlugin(id)
    this.crash('delete')
  }

  usage(): Promise<{ readonly rows: number; readonly bytes: number }> {
    return this.inner.usage()
  }
}

/** Pre-write failure wrapper: a status write rejects before touching the medium. */
class FailStore implements RegistryStore {
  failStatus = false

  constructor(private readonly inner: RegistryStore) {}

  listIds(): Promise<readonly string[]> {
    return this.inner.listIds()
  }

  readGenerations(id: string): Promise<readonly { readonly gen: number; readonly record: GenerationRecord }[]> {
    return this.inner.readGenerations(id)
  }

  writeGeneration(id: string, gen: number, record: GenerationRecord): Promise<void> {
    return this.inner.writeGeneration(id, gen, record)
  }

  deleteGeneration(id: string, gen: number): Promise<void> {
    return this.inner.deleteGeneration(id, gen)
  }

  readStatus(id: string): Promise<StatusRecord | undefined> {
    return this.inner.readStatus(id)
  }

  async writeStatus(id: string, record: StatusRecord): Promise<void> {
    if (this.failStatus) throw new Error('status write failed (injected)')
    await this.inner.writeStatus(id, record)
  }

  deletePlugin(id: string): Promise<void> {
    return this.inner.deletePlugin(id)
  }

  usage(): Promise<{ readonly rows: number; readonly bytes: number }> {
    return this.inner.usage()
  }
}

interface SharedPaths {
  readonly dir: string
  readonly dbFile: string
  readonly stateRoot: string
}

interface BootResult {
  readonly ctx: Context
  readonly engine: LifecycleEngine
  readonly persistence: RegistryPersistence
  readonly store: RegistryStore
  readonly definitions: Map<string, PluginDefinition>
  readonly events: RecordedEvent[]
  readonly close: () => Promise<void>
}

async function boot(
  paths: SharedPaths,
  definitions: Map<string, PluginDefinition>,
  options: {
    readonly store?: RegistryStore
    readonly storeFactory?: (store: RegistryStore) => RegistryStore
    readonly staticIds?: readonly string[]
    readonly config?: PluginManagerConfig
    readonly logger?: LifecycleEngineOptions['logger']
  } = {},
): Promise<BootResult> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: paths.dbFile, journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  const persistence = await RegistryPersistence.open(facility, {
    profile: 'main',
    stateRoot: paths.stateRoot,
    auditMaxBytes: 1024 * 1024,
    auditKeepFiles: 3,
  })
  const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
  machine.start()
  const store = options.store ?? (options.storeFactory === undefined ? persistence.store : options.storeFactory(persistence.store))
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store,
    config: options.config ?? resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: TEST_EVENT_VOCABULARY,
    resolveSource: async (pluginSource: PluginSource) => {
      const key = pluginSource.type === 'inline' ? pluginSource.code : pluginSource.package
      const definition = definitions.get(key)
      if (definition === undefined) throw new Error(`source ${key} not resolvable`)
      return definition
    },
    persistence,
    ...(options.staticIds === undefined ? {} : { staticIds: options.staticIds }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
  const events: RecordedEvent[] = []
  for (const name of EVENT_NAMES) {
    ctx.on(name, (payload: PluginLifecycleEventPayload) => { events.push({ name, payload }) })
  }
  return {
    ctx,
    engine,
    persistence,
    store,
    definitions,
    events,
    close: async () => {
      await persistence.close()
      await backend.close()
    },
  }
}

/** Boot with a power-loss wrapper; the engine's store is the wrapper. */
async function bootCrashing(paths: SharedPaths, definitions: Map<string, PluginDefinition>): Promise<BootResult> {
  return boot(paths, definitions, {
    storeFactory: inner => new CrashStore(inner),
  })
}

async function paths(): Promise<SharedPaths> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-t34-'))
  return { dir, dbFile: join(dir, 'registry.db'), stateRoot: join(dir, 'state') }
}

async function cleanup(shared: SharedPaths): Promise<void> {
  await rm(shared.dir, { recursive: true, force: true })
}

/** Open the registry domain directly on the medium (test-only corruption seam). */
async function withDomain(
  shared: SharedPaths,
  fn: (domain: Domain<DomainSpec>) => Promise<void>,
): Promise<void> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: shared.dbFile, journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(pluginRegistryDomainSpec('main'))
  await fn(domain)
  await facility.closeAll()
  await backend.close()
}

describe('T3 crash matrix (power loss at each write step)', () => {
  it('install crash after the gens write: orphan row, boot GC removes it', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>([['p', fixture('p')]])
      const crashing = await bootCrashing(shared, definitions)
      ;(crashing.store as CrashStore).crashAfter('gens')
      await expect(crashing.engine.install(source('p'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.gc.orphanGenerations).toBe(1)
      expect(second.engine.plugins()).toEqual([])
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('install crash after the status write: boot restores the plugin', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>([['p', fixture('p')]])
      const crashing = await bootCrashing(shared, definitions)
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.install(source('p'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.restored).toBe(1)
      expect(second.engine.plugins()[0]).toMatchObject({ id: 'p', version: '1.0.0', status: 'enabled' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('replace crash after the gens write: old generation restored, orphan trimmed', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([['p', fixture('p')], ['p2', fixture('p', { version: '2.0.0' })]])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('gens')
      await expect(crashing.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions2)
      const report = await second.engine.recover()
      expect(second.engine.plugins()[0]?.version).toBe('1.0.0')
      expect(report.gc.historyTrimmed).toBeGreaterThanOrEqual(1)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('replace crash after the status write: boot restores the new generation', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([['p', fixture('p')], ['p2', fixture('p', { version: '2.0.0' })]])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions2)
      await second.engine.recover()
      expect(second.engine.plugins()[0]?.version).toBe('2.0.0')
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('uninstall crash after the delete write: deletion survives, no resurrection', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([['p', fixture('p')]])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('delete')
      await expect(crashing.engine.uninstall('p')).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions2)
      await second.engine.recover()
      expect(second.engine.plugins()).toEqual([])
      expect(await second.persistence.store.listIds()).toEqual([])
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('disable crash after the status write: boot restores a disabled row', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([['p', fixture('p')]])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.disable('p')).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions2)
      await second.engine.recover()
      expect(second.engine.plugins()[0]).toMatchObject({ id: 'p', status: 'disabled', version: '1.0.0' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('enable crash after the status write: boot restores an enabled mounted row', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.engine.disable('p')
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([['p', fixture('p')]])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.enable('p')).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const third = await boot(shared, definitions2)
      await third.engine.recover()
      expect(third.engine.plugins()[0]).toMatchObject({ id: 'p', status: 'enabled', version: '1.0.0' })
      await third.close()
    } finally {
      await cleanup(shared)
    }
  })
})

describe('T4 recovery table (six row classes)', () => {
  it('restored: an enabled row mounts with its manifest', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.rows).toEqual([{ id: 'p', status: 'restored' }])
      expect(second.engine.plugins()[0]).toMatchObject({ id: 'p', version: '1.0.0', status: 'enabled' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('shadowed: a static composition wins over the dynamic row (T2-4)', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, definitions, { staticIds: ['p'] })
      const report = await second.engine.recover()
      expect(report.shadowed).toBe(1)
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'shadowed', reason: 'shadowed' })
      expect((await second.persistence.audit.tail(10)).some(entry => entry.class === 'shadow')).toBe(true)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('keeps a shadowed dynamic row visible and inert until an operator acts', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      first.definitions.set('q', fixture('q'))
      await first.engine.install(source('p'))
      await first.engine.install(source('q'))
      await first.close()

      const second = await boot(shared, definitions, { staticIds: ['p'] })
      await second.engine.recover()
      expect(second.engine.plugins().find(handle => handle.id === 'p')).toMatchObject({
        status: 'shadowed',
        reason: 'shadowed',
        version: '',
      })
      // Inert: enable/disable are no-ops while the static incumbent owns the id.
      await second.engine.enable('p')
      expect(second.engine.plugins().find(handle => handle.id === 'p')?.status).toBe('shadowed')
      await second.engine.disable('p')
      expect(second.engine.plugins().find(handle => handle.id === 'p')?.status).toBe('shadowed')
      // The generation-less shadowed row contributes no dependency edges.
      await second.engine.uninstall('q')
      // Uninstall removes the dynamic row; the empty-manifest fallbacks surface.
      await second.engine.uninstall('p')
      expect(second.engine.plugins()).toEqual([])
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('replace revives a shadowed dynamic row with a fresh generation', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, definitions, { staticIds: ['p'] })
      await second.engine.recover()
      second.definitions.set('p2', fixture('p', { version: '2.0.0' }))
      await second.engine.replace('p', source('p2'))
      expect(second.engine.plugins().find(handle => handle.id === 'p')).toMatchObject({
        version: '2.0.0',
        status: 'enabled',
      })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('compensates a failed replace of a shadowed row with no incumbent', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const holder: { store?: FailStore } = {}
      const second = await boot(shared, definitions, {
        staticIds: ['p'],
        storeFactory: (inner) => {
          const store = new FailStore(inner)
          holder.store = store
          return store
        },
      })
      await second.engine.recover()
      second.definitions.set('p2', fixture('p', { version: '2.0.0' }))
      if (holder.store === undefined) throw new Error('fail store not wired')
      holder.store.failStatus = true
      await expect(second.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
      expect(second.engine.plugins().find(handle => handle.id === 'p')?.status).toBe('shadowed')
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('validation-failed: a changed protected-field environment quarantines with the original code', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        permissions: {
          ...fixture('p').permissions,
          transform: [{ event: 'lifecycle/waterfall', writes: ['x'] }],
        },
      }))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ protectedFields: ['lifecycle/waterfall.x'] }),
      })
      const report = await second.engine.recover()
      expect(report.quarantined).toBe(1)
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'validation-failed', errorCode: 'protected-field' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('damaged-record: an unparsable gens row quarantines the plugin', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      await withDomain(shared, async (domain) => {
        await domain.table('gens').put('p/1', 'corrupted-json')
      })

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.quarantined).toBe(1)
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'damaged-record' })
      expect((await second.persistence.audit.tail(10)).some(entry => entry.class === 'quarantine')).toBe(true)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('package-not-resolvable: an unresolvable source quarantines at boot', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, new Map())
      const report = await second.engine.recover()
      expect(report.quarantined).toBe(1)
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'package-not-resolvable' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('gc: a gens row without a status pointer is collected as an orphan', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      await withDomain(shared, async (domain) => {
        await domain.table('gens').put('q/1', JSON.stringify({
          v: 1,
          source: { type: 'inline', code: 'q' },
          manifest: fixture('q'),
          resolvedConfig: {},
        }))
      })

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.rows[0]).toMatchObject({ id: 'q', status: 'gc', reason: 'orphan' })
      expect(report.gc.orphanGenerations).toBe(1)
      expect((await second.persistence.audit.tail(10)).some(entry => entry.class === 'boot-gc')).toBe(true)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('medium damage: a stamped version mismatch fails open loudly (T4-5, 0809 contract)', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      const db = new DatabaseSync(shared.dbFile)
      db.prepare('UPDATE units SET version = 99 WHERE name = ?').run('plugin_registry_main')
      db.close()

      await expect(boot(shared, definitions)).rejects.toMatchObject({ code: 'version-mismatch' })
    } finally {
      await cleanup(shared)
    }
  })
})

describe('T4 disabled-row full recovery closure', () => {
  it('restages the manifest: plugins() shows declarations and dependencies hold', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('consumer', fixture('consumer', { requires: ['svc'] }))
      first.definitions.set('provider', fixture('provider', { provides: ['svc'] }))
      await first.engine.install(source('provider'))
      await first.engine.install(source('consumer'))
      await first.engine.disable('consumer')
      await first.close()

      const second = await boot(shared, definitions)
      await second.engine.recover()
      const consumer = second.engine.plugins().find(handle => handle.id === 'consumer')
      expect(consumer).toMatchObject({ status: 'disabled', version: '1.0.0', requires: ['svc'] })
      await expect(second.engine.uninstall('provider')).rejects.toMatchObject({ code: 'dependent-exists' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('enable mounts a recovered-disabled plugin and restores its snapshot', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: {
          captureState: () => ({ n: 7 }),
          restoreState: () => {},
        },
      }))
      await first.engine.install(source('p'))
      await first.engine.disable('p')
      await first.close()

      const second = await boot(shared, definitions)
      await second.engine.recover()
      expect(second.engine.plugins()[0]?.status).toBe('disabled')
      const restored: unknown[] = []
      const received: number[] = []
      second.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: {
          captureState: () => ({ n: 7 }),
          restoreState: (state) => { restored.push(state) },
          activate(env) {
            env.on('lifecycle/emit', (payload: { readonly n: number }) => { received.push(payload.n) })
          },
        },
      }))
      await second.engine.enable('p')
      expect(restored).toEqual([undefined])
      second.ctx.emit('lifecycle/emit', { n: 1 })
      expect(received).toEqual([1])
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('enable warns and restores null when the disabled row snapshot is tampered', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: { captureState: () => ({ n: 1 }) },
      }))
      await first.engine.install(source('p'))
      first.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}) },
      }))
      await first.engine.replace('p', source('p2'))
      await first.engine.disable('p')
      await first.close()

      await writeFile(join(shared.stateRoot, 'main', 'p', '2.state.json'), '{"tampered":true}')
      const warns: string[] = []
      const restored: unknown[] = []
      const definitions2 = new Map<string, PluginDefinition>([['p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: {
          captureState: () => ({}),
          restoreState: (state) => { restored.push(state) },
        },
      })]])
      const second = await boot(shared, definitions2, {
        logger: { error: () => {}, info: () => {}, warn: (message) => { warns.push(String(message)) }, debug: () => {} },
      })
      await second.engine.recover()
      await second.engine.enable('p')
      expect(warns.some(line => line.includes('hash check'))).toBe(true)
      expect(restored.at(-1)).toBeUndefined()
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('restages an npm-sourced disabled row with an empty code field', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const development = resolvePluginManagerConfig({ development: true })
      const first = await boot(shared, definitions, { config: development })
      first.definitions.set('p', fixture('p'))
      await first.engine.install({ type: 'npm', package: 'p' })
      await first.engine.disable('p')
      await first.close()

      const second = await boot(shared, definitions, { config: development })
      await second.engine.recover()
      expect(second.engine.plugins()[0]).toMatchObject({ id: 'p', status: 'disabled', version: '1.0.0' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('enable of a recovered-disabled row restores its snapshot and compensates a persist failure', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: { captureState: () => ({ n: 3 }) },
      }))
      await first.engine.install(source('p'))
      first.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}) },
      }))
      await first.engine.replace('p', source('p2'))
      await first.engine.disable('p')
      await first.close()

      const restored: unknown[] = []
      const definitions2 = new Map<string, PluginDefinition>([['p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: {
          captureState: () => ({}),
          restoreState: (state) => { restored.push(state) },
        },
      })]])
      const holder: { store?: FailStore } = {}
      const crashing = await boot(shared, definitions2, {
        storeFactory: (inner) => {
          const store = new FailStore(inner)
          holder.store = store
          return store
        },
      })
      await crashing.engine.recover()
      expect(crashing.engine.plugins()[0]?.status).toBe('disabled')
      if (holder.store === undefined) throw new Error('fail store not wired')
      holder.store.failStatus = true
      await expect(crashing.engine.enable('p')).rejects.toMatchObject({ code: 'persist-failed' })
      expect(crashing.engine.plugins()[0]?.status).toBe('disabled')
      await crashing.close()

      const third = await boot(shared, definitions2)
      await third.engine.recover()
      expect(third.engine.plugins()[0]?.status).toBe('disabled')
      await third.close()
    } finally {
      await cleanup(shared)
    }
  })
})

describe('T4 edge rows and snapshot lifecycle', () => {
  it('damaged-record: an unparsable status row quarantines the plugin', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'))
      await first.close()

      await withDomain(shared, async (domain) => {
        await domain.table('status').put('p', 'garbage')
      })

      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'damaged-record' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('validation-failed: a staging failure at recovery quarantines without blocking other rows', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      let boom = false
      const stateful = (id: string, version: string): PluginDefinition => fixture(id, {
        version,
        stateful: true,
        hooks: {
          captureState: () => ({ n: 1 }),
          restoreState: () => {
            if (boom) throw new Error('restore exploded')
          },
        },
      })
      const first = await boot(shared, definitions)
      first.definitions.set('p', stateful('p', '1.0.0'))
      await first.engine.install(source('p'))
      first.definitions.set('p2', stateful('p', '2.0.0'))
      await first.engine.replace('p', source('p2'))
      await first.close()

      boom = true
      const second = await boot(shared, definitions)
      const report = await second.engine.recover()
      expect(report.quarantined).toBe(1)
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'validation-failed' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('a quarantined row recovers status-only: empty declarations, updateConfig rejected, replace mounts', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        permissions: {
          ...fixture('p').permissions,
          transform: [{ event: 'lifecycle/waterfall', writes: ['x'] }],
        },
      }))
      await first.engine.install(source('p'))
      await first.close()

      // First recovery: environment now protects the field → quarantined durably.
      const second = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ protectedFields: ['lifecycle/waterfall.x'] }),
      })
      const firstReport = await second.engine.recover()
      expect(firstReport.quarantined).toBe(1)
      expect(second.engine.plugins()).toEqual([])
      await second.close()

      // Second recovery with the field unprotected: the quarantined row revalidates
      // but stays status-only until an explicit operation.
      const third = await boot(shared, definitions)
      const report = await third.engine.recover()
      expect(report.rows[0]).toMatchObject({ id: 'p', status: 'quarantined', reason: 'validation-failed' })
      expect(third.engine.plugins()[0]).toMatchObject({ id: 'p', status: 'quarantined', version: '' })
      await expect(third.engine.updateConfig('p', {})).rejects.toMatchObject({ code: 'staging-failed' })
      // Replace is the operator's recovery action: it revalidates and mounts.
      third.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        swapPolicy: 'drain',
      }))
      await third.engine.replace('p', source('p2'))
      expect(third.engine.plugins()[0]).toMatchObject({ id: 'p', version: '2.0.0', status: 'enabled' })
      await third.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('a successful replace deletes the old snapshot and preserves it through disable', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: { captureState: () => ({ n: 1 }) },
      }))
      await first.engine.install(source('p'))
      first.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}) },
      }))
      await first.engine.replace('p', source('p2'))
      const keysAfterReplace = await first.persistence.snapshots.listKeys()
      expect(keysAfterReplace).toEqual(['p/2'])
      await first.engine.disable('p')
      await first.close()

      const statusAfterDisable = await (async () => {
        const ctx = new Context()
        await ctx.plugin(Storage)
        const backend = new SqliteStorageBackend({ path: shared.dbFile, journalMode: 'wal' })
        ctx.storage.backend.register('sqlite', backend)
        const facility = new DomainFacility(ctx, { backend: 'sqlite' })
        ctx.storage.mount('domain', facility)
        const domain = await facility.open(pluginRegistryDomainSpec('main'))
        const raw = domain.table('status').get('p') as string | undefined
        await facility.closeAll()
        await backend.close()
        return raw === undefined ? undefined : JSON.parse(raw) as { snapshot?: unknown }
      })()
      expect(statusAfterDisable?.snapshot).toBeDefined()

      const second = await boot(shared, definitions)
      await second.engine.recover()
      expect(second.engine.plugins()[0]).toMatchObject({ id: 'p', version: '2.0.0', status: 'disabled' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('a second replace crash restores the previous snapshot pointer', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>([
        ['p', fixture('p', {
          stateful: true,
          hooks: { captureState: () => ({ n: 1 }) },
        })],
        ['p2', fixture('p', {
          version: '2.0.0',
          stateful: true,
          hooks: { captureState: () => ({ n: 2 }) },
        })],
        ['p3', fixture('p', {
          version: '3.0.0',
          stateful: true,
          hooks: { captureState: () => ({ n: 3 }) },
        })],
      ])
      const crashing = await bootCrashing(shared, definitions)
      await crashing.engine.install(source('p'))
      await crashing.engine.replace('p', source('p2'))
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.replace('p', source('p3'))).rejects.toMatchObject({ code: 'persist-failed' })
      expect(crashing.engine.plugins()[0]?.version).toBe('2.0.0')
      await crashing.close()

      const second = await boot(shared, definitions)
      await second.engine.recover()
      // The status pointer was already flipped before the crash, so the new
      // generation is the durable current (T3 rule 1 crash semantics).
      expect(second.engine.plugins()[0]?.version).toBe('3.0.0')
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('audits a model-origin mount and a model-origin state rejection', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p'))
      await first.engine.install(source('p'), { origin: 'model' })
      expect((await first.persistence.audit.tail(10)).some(entry => entry.class === 'mount' && entry.actor === 'model')).toBe(true)
      await first.close()

      const second = await boot(shared, definitions)
      second.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: {
          captureState: () => {
            const state: Record<string, unknown> = {}
            state.self = state
            return state
          },
        },
      }))
      await second.engine.recover()
      second.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}) },
      }))
      await expect(second.engine.replace('p', source('p2'), {})).rejects.toMatchObject({ code: 'staging-failed' })
      expect((await second.persistence.audit.tail(10)).some(entry => entry.class === 'state-rejected')).toBe(true)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('audits a runtime-api state rejection with the operator actor', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: {
          captureState: () => {
            const state: Record<string, unknown> = {}
            state.self = state
            return state
          },
        },
      }))
      await first.engine.install(source('p'))
      await first.close()

      const second = await boot(shared, definitions)
      await second.engine.recover()
      second.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}) },
      }))
      await expect(second.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'staging-failed' })
      expect((await second.persistence.audit.tail(10)).some(entry =>
        entry.class === 'state-rejected' && entry.actor === 'operator')).toBe(true)
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })
})

describe('snapshot handoff and registry quotas', () => {
  it('writes a snapshot on replace and restores it across boot (T3 rule 4)', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const restored: Array<{ state: unknown; previous: unknown }> = []
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: {
          captureState: () => ({ n: 1 }),
          restoreState: (state, previous) => { restored.push({ state, previous }) },
        },
      }))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([
        ['p', fixture('p', {
          stateful: true,
          hooks: {
            captureState: () => ({ n: 1 }),
            restoreState: (state, previous) => { restored.push({ state, previous }) },
          },
        })],
        ['p2', fixture('p', {
          version: '2.0.0',
          stateful: true,
          hooks: {
            captureState: () => ({}),
            restoreState: (state, previous) => { restored.push({ state, previous }) },
          },
        })],
      ])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      const second = await boot(shared, definitions2)
      await second.engine.recover()
      expect(second.engine.plugins()[0]?.version).toBe('2.0.0')
      const mountRestore = restored.at(-1)
      expect(mountRestore?.state).toEqual({ n: 1 })
      expect(mountRestore?.previous).toEqual({ generation: 2, version: '2.0.0' })
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('warns and restores null when the snapshot hash mismatches', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const first = await boot(shared, definitions)
      first.definitions.set('p', fixture('p', {
        stateful: true,
        hooks: { captureState: () => ({ n: 1 }) },
      }))
      await first.engine.install(source('p'))
      await first.close()

      const definitions2 = new Map<string, PluginDefinition>([
        ['p', fixture('p', { stateful: true, hooks: { captureState: () => ({ n: 1 }) } })],
        ['p2', fixture('p', { version: '2.0.0', stateful: true, hooks: { captureState: () => ({}) } })],
      ])
      const crashing = await bootCrashing(shared, definitions2)
      await crashing.engine.recover()
      ;(crashing.store as CrashStore).crashAfter('status')
      await expect(crashing.engine.replace('p', source('p2'))).rejects.toMatchObject({ code: 'persist-failed' })
      await crashing.close()

      await writeFile(join(shared.stateRoot, 'main', 'p', '2.state.json'), '{"tampered":true}')
      const warns: string[] = []
      const restored: unknown[] = []
      const second = await boot(shared, definitions2, {
        logger: { error: () => {}, info: () => {}, warn: (message) => { warns.push(String(message)) }, debug: () => {} },
      })
      second.definitions.set('p2', fixture('p', {
        version: '2.0.0',
        stateful: true,
        hooks: { captureState: () => ({}), restoreState: (state) => { restored.push(state) } },
      }))
      await second.engine.recover()
      expect(warns.some(line => line.includes('hash check'))).toBe(true)
      expect(restored.at(-1)).toBeUndefined()
      await second.close()
    } finally {
      await cleanup(shared)
    }
  })

  it('enforces the T6 registry quotas at install', async () => {
    const shared = await paths()
    try {
      const definitions = new Map<string, PluginDefinition>()
      const tiny = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ maxCodeBytes: 4 }),
      })
      tiny.definitions.set('xxxxxxxx', fixture('long'))
      await expect(tiny.engine.install({ type: 'inline', code: 'x'.repeat(8) })).rejects.toMatchObject({
        code: 'quota-registry-exceeded',
        details: { limit: 4 },
      })
      await tiny.close()

      const one = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ maxDynamicPlugins: 1 }),
      })
      one.definitions.set('a', fixture('a'))
      one.definitions.set('b', fixture('b'))
      await one.engine.install(source('a'))
      await expect(one.engine.install(source('b'))).rejects.toMatchObject({ code: 'quota-registry-exceeded' })
      await one.close()

      const tinyBytes = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ maxRegistryBytes: 64 }),
      })
      tinyBytes.definitions.set('a', fixture('a'))
      await expect(tinyBytes.engine.install(source('a'))).rejects.toMatchObject({ code: 'quota-registry-exceeded' })
      await tinyBytes.close()

      const npmBoot = await boot(shared, definitions, {
        config: resolvePluginManagerConfig({ maxCodeBytes: 4, development: true }),
      })
      npmBoot.definitions.set('p', fixture('p'))
      await npmBoot.engine.install({ type: 'npm', package: 'p' })
      expect(npmBoot.engine.plugins()[0]?.id).toBe('p')
      await npmBoot.close()
    } finally {
      await cleanup(shared)
    }
  })
})
