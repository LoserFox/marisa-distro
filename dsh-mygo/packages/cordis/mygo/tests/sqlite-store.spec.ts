/**
 * Sqlite registry store (#17, §22.1): CRUD over the real sqlite backend
 * through the domain form, damaged-row surfacing, usage estimates, and
 * restart persistence on one database file.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import type { PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import {
  openSqliteRegistryStore,
  pluginRegistryDomainSpec,
  RegistryRowError,
  SqliteRegistryStore,
} from '@r05en1cu/dsh-mygo'

function fixture(id: string, version = '1.0.0'): PluginDefinition {
  return {
    id,
    version,
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: { activate: () => {} },
  }
}

const source = (id: string): PluginSource => ({ type: 'inline', code: id })

async function openFacility(dbFile: string) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: dbFile, journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  return { ctx, backend, facility }
}

describe('SqliteRegistryStore', () => {
  it('round-trips generations and status rows and reports usage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const store = await openSqliteRegistryStore(facility, 'main')
      await store.writeGeneration('p', 1, { v: 1, source: source('p'), manifest: fixture('p'), resolvedConfig: {} })
      await store.writeStatus('p', {
        v: 1,
        currentGen: 1,
        previousGen: null,
        status: 'enabled',
        provenance: { origin: 'runtime-api', mountedAt: 1 },
      })
      expect(await store.listIds()).toEqual(['p'])
      expect((await store.readGenerations('p')).map(entry => entry.gen)).toEqual([1])
      expect((await store.readStatus('p'))?.status).toBe('enabled')
      const usage = await store.usage()
      expect(usage.rows).toBe(2)
      expect(usage.bytes).toBeGreaterThan(0)
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('persists across a backend restart on one database file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    const dbFile = join(dir, 'registry.db')
    try {
      const first = await openFacility(dbFile)
      const store = await openSqliteRegistryStore(first.facility, 'main')
      await store.writeGeneration('p', 1, { v: 1, source: source('p'), manifest: fixture('p'), resolvedConfig: {} })
      await store.writeStatus('p', {
        v: 1,
        currentGen: 1,
        previousGen: null,
        status: 'enabled',
        provenance: { origin: 'runtime-api', mountedAt: 1 },
      })
      await first.facility.closeAll()
      await first.backend.close()

      const second = await openFacility(dbFile)
      const reopened = await openSqliteRegistryStore(second.facility, 'main')
      expect(await reopened.listIds()).toEqual(['p'])
      expect((await reopened.readStatus('p'))?.currentGen).toBe(1)
      await second.facility.closeAll()
      await second.backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('surfaces an unparsable gens row as RegistryRowError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const domain = await facility.open(pluginRegistryDomainSpec('main'))
      await domain.table('gens').put('p/1', 'not-json')
      const store = new SqliteRegistryStore(domain)
      expect(() => store.readGenerations('p')).toThrow(RegistryRowError)
      expect(() => store.readGenerations('p')).toThrow(/p\/1.*damaged/)
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('surfaces an unparsable status row as RegistryRowError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const domain = await facility.open(pluginRegistryDomainSpec('main'))
      await domain.table('status').put('p', 'garbage')
      const store = new SqliteRegistryStore(domain)
      expect(() => store.readStatus('p')).toThrow(RegistryRowError)
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('deletes one generation and the whole plugin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const store = await openSqliteRegistryStore(facility, 'main')
      await store.writeGeneration('p', 1, { v: 1, source: source('p'), manifest: fixture('p'), resolvedConfig: {} })
      await store.writeGeneration('p', 2, { v: 1, source: source('p'), manifest: fixture('p', '2.0.0'), resolvedConfig: {} })
      await store.deleteGeneration('p', 1)
      expect((await store.readGenerations('p')).map(entry => entry.gen)).toEqual([2])
      await store.deletePlugin('p')
      expect(await store.listIds()).toEqual([])
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects parseable-but-shapeless gens and status rows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const domain = await facility.open(pluginRegistryDomainSpec('main'))
      await domain.table('gens').put('p/1', '42')
      await domain.table('status').put('p', '"not-an-object"')
      const store = new SqliteRegistryStore(domain)
      expect(() => store.readGenerations('p')).toThrow(RegistryRowError)
      expect(() => store.readStatus('p')).toThrow(RegistryRowError)
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('skips malformed gens keys and keys without a plugin prefix', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-reg-'))
    try {
      const { backend, facility } = await openFacility(join(dir, 'registry.db'))
      const domain = await facility.open(pluginRegistryDomainSpec('main'))
      await domain.table('gens').put('p/abc', JSON.stringify({ v: 1, source: source('p'), manifest: fixture('p'), resolvedConfig: {} }))
      await domain.table('gens').put('p', JSON.stringify({ v: 1, source: source('p'), manifest: fixture('p'), resolvedConfig: {} }))
      await domain.table('gens').put('/q', JSON.stringify({ v: 1, source: source('q'), manifest: fixture('q'), resolvedConfig: {} }))
      await domain.table('gens').put('q/1', JSON.stringify({ v: 1, source: source('q'), manifest: fixture('q'), resolvedConfig: {} }))
      const store = new SqliteRegistryStore(domain)
      expect((await store.readGenerations('p')).map(entry => entry.gen)).toEqual([])
      expect(await store.listIds()).toEqual(['p', 'q'])
      await facility.closeAll()
      await backend.close()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
