/**
 * Registry store seam (#15): record shapes, failure injection, and the
 * delete-generation primitive boot GC uses.
 */

import { describe, expect, it } from 'vitest'
import { InMemoryRegistryStore, type GenerationRecord, type StatusRecord } from '@r05en1cu/dsh-mygo'
import type { PluginDefinition } from '@r05en1cu/dsh-mygo-api'

function generation(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  return {
    v: 1,
    source: { type: 'inline', code: 'p' },
    manifest: { id: 'p' } as PluginDefinition,
    resolvedConfig: {},
    ...overrides,
  }
}

function status(overrides: Partial<StatusRecord> = {}): StatusRecord {
  return {
    v: 1,
    currentGen: 1,
    previousGen: null,
    status: 'enabled',
    provenance: { origin: 'runtime-api', mountedAt: 1 },
    ...overrides,
  }
}

describe('InMemoryRegistryStore', () => {
  it('round-trips generation and status rows and lists ids', async () => {
    const store = new InMemoryRegistryStore()
    await store.writeGeneration('a', 1, generation())
    await store.writeGeneration('a', 2, generation({ source: { type: 'npm', package: 'pkg' } }))
    await store.writeStatus('a', status({ currentGen: 2, previousGen: 1 }))
    expect(await store.listIds()).toEqual(['a'])
    expect((await store.readGenerations('a')).map(entry => entry.gen)).toEqual([2, 1])
    expect((await store.readStatus('a'))?.currentGen).toBe(2)
    expect(await store.readStatus('missing')).toBeUndefined()
  })

  it('deletes single generation rows and the whole plugin', async () => {
    const store = new InMemoryRegistryStore()
    await store.writeGeneration('a', 1, generation())
    await store.writeGeneration('a', 2, generation())
    await store.writeStatus('a', status())
    await store.deleteGeneration('a', 1)
    expect((await store.readGenerations('a')).map(entry => entry.gen)).toEqual([2])
    await store.deleteGeneration('a', 1)
    expect((await store.readGenerations('a')).map(entry => entry.gen)).toEqual([2])
    await store.deletePlugin('a')
    expect(await store.listIds()).toEqual([])

    await store.writeGeneration('solo', 1, generation())
    await store.deleteGeneration('solo', 1)
    expect(await store.readGenerations('solo')).toEqual([])
    expect(await store.listIds()).toEqual([])
    await store.deleteGeneration('missing', 1)
  })

  it('injects write failures for the given table and count', async () => {
    const store = new InMemoryRegistryStore()
    store.fail('gens', 2)
    await expect(store.writeGeneration('a', 1, generation())).rejects.toThrow(/gens write failed/)
    await expect(store.writeGeneration('a', 1, generation())).rejects.toThrow(/gens write failed/)
    await expect(store.writeGeneration('a', 1, generation())).resolves.toBeUndefined()
    store.fail('status')
    await expect(store.writeStatus('a', status())).rejects.toThrow(/status write failed/)
    await expect(store.writeStatus('a', status())).resolves.toBeUndefined()
  })

  it('snapshots a deep copy for crash simulation', async () => {
    const store = new InMemoryRegistryStore()
    await store.writeGeneration('a', 1, generation())
    await store.writeStatus('a', status())
    const snapshot = store.snapshot()
    await store.writeGeneration('a', 2, generation())
    expect(snapshot.generations.get('a')?.has(2)).toBe(false)
    snapshot.generations.get('a')?.set(9, generation())
    expect((await store.readGenerations('a')).some(entry => entry.gen === 9)).toBe(false)
  })

  it('crashes after a durable write (power-loss injection) and reports usage', async () => {
    const store = new InMemoryRegistryStore()
    store.crashAfter('gens', 2)
    await expect(store.writeGeneration('p', 1, generation())).rejects.toThrow(/power loss after gens write/)
    await expect(store.writeGeneration('p', 2, generation({ manifest: { id: 'p', version: '2.0.0' } as PluginDefinition }))).rejects.toThrow(/power loss after gens write/)
    // The writes landed despite the crash: recovery sees them.
    expect((await store.readGenerations('p')).map(entry => entry.gen)).toEqual([2, 1])
    store.crashAfter('status')
    await expect(store.writeStatus('p', status({ currentGen: 2 }))).rejects.toThrow(/power loss after status write/)
    store.crashAfter('delete')
    await expect(store.deletePlugin('p')).rejects.toThrow(/power loss after delete write/)
    expect(await store.listIds()).toEqual([])
    const usage = await store.usage()
    expect(usage).toEqual({ rows: 0, bytes: 0 })
  })

  it('estimates rows and bytes from the stored rows', async () => {
    const store = new InMemoryRegistryStore()
    await store.writeGeneration('p', 1, generation())
    await store.writeStatus('p', status())
    const usage = await store.usage()
    expect(usage.rows).toBe(2)
    expect(usage.bytes).toBeGreaterThan(0)
  })
})
