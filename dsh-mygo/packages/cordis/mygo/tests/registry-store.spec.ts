/**
 * Backend-agnostic registry store seam: `RegistryPersistence.open` prefers an
 * external `mygoRegistryStore` and runs its self-check; the rdb store shipped
 * by the mygo-rdb extension mirrors `SqliteRegistryStore` semantics on SQLite
 * (same key/value rows, damaged-row quarantine, generation history).
 */

import { describe, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import {
  InMemoryRegistryStore,
  RegistryPersistence,
} from '@r05en1cu/dsh-mygo'
import type { RegistryPersistenceOptions } from '@r05en1cu/dsh-mygo'

function persistenceOptions(root: string): RegistryPersistenceOptions {
  return {
    profile: 'web',
    stateRoot: join(root, 'state'),
    auditMaxBytes: 1_000_000,
    auditKeepFiles: 3,
  }
}

describe('registry store seam', () => {
  it('prefers an external registry store and runs its self-check', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-registry-seam-'))
    try {
      const external = new InMemoryRegistryStore()
      let checked = 0
      external.check = async () => { checked += 1 }
      const persistence = await RegistryPersistence.open({} as never, persistenceOptions(root), external)
      expect(persistence.store).toBe(external)
      expect(checked).toBe(1)
      await persistence.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails loudly when the external store self-check rejects', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-registry-seam-'))
    try {
      const external = new InMemoryRegistryStore()
      external.check = async () => { throw new Error('schema drift') }
      await expect(RegistryPersistence.open({} as never, persistenceOptions(root), external))
        .rejects.toThrow(/self-check failed: schema drift/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('migrates raw sqlite registry rows into an empty external store at open', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-registry-seam-'))
    const imported: string[] = []
    let marked = false
    const external = {
      async check() {},
      async migrationMarked() { return false },
      async listIds() { return [] },
      async importRawStatus(key: string) { imported.push(`status:${key}`) },
      async importRawGeneration(key: string) { imported.push(`gens:${key}`) },
      async markMigrated() { marked = true },
    }
    const facility = {
      async open() {
        return {
          table(name: string) {
            const rows = name === 'gens'
              ? new Map([['legacy/1', '"gen"']])
              : new Map([['legacy', '"status"']])
            return { entries() { return rows.entries() } }
          },
          async close() {},
        }
      },
    }
    try {
      await RegistryPersistence.open(facility as never, persistenceOptions(root), external as never)
      expect(imported).toEqual(['gens:legacy/1', 'status:legacy'])
      expect(marked).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips migration when the external store already has rows', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-registry-seam-'))
    const imported: string[] = []
    const external = {
      async check() {},
      async migrationMarked() { return false },
      async listIds() { return ['already'] },
      async importRawStatus(key: string) { imported.push(`status:${key}`) },
      async importRawGeneration(key: string) { imported.push(`gens:${key}`) },
      async markMigrated() {},
    }
    const facility = {
      async open() {
        return {
          table() { return { entries() { return new Map([['x/1', '"y"']]).entries() } } },
          async close() {},
        }
      },
    }
    try {
      await RegistryPersistence.open(facility as never, persistenceOptions(root), external as never)
      expect(imported).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('routes audit appends to the external store when it supports them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-registry-seam-'))
    const appended: unknown[] = []
    const external = {
      async check() {},
      async migrationMarked() { return true },
      async appendAudit(entry: unknown) { appended.push(entry) },
    }
    try {
      const persistence = await RegistryPersistence.open({} as never, persistenceOptions(root), external as never)
      await persistence.audit.append({
        v: 1,
        ts: 1,
        profile: 'web',
        class: 'mount',
        actor: 'system',
      } as never)
      expect(appended).toHaveLength(1)
      await persistence.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rdb(sqlite) store mirrors status/gens semantics and quarantines damaged rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mygo-rdb-store-'))
    try {
      // Copy into a temp module dir with a linked dsh-mygo so Node resolves it.
      const moduleDir = join(dir, 'module')
      mkdirSync(join(moduleDir, 'node_modules', '@deepseek-ai'), { recursive: true })
      copyFileSync(
        fileURLToPath(new URL('../../../../extension/mygo-rdb/lib/store.js', import.meta.url)),
        join(moduleDir, 'store.js'),
      )
      symlinkSync(
        fileURLToPath(new URL('..', import.meta.url)),
        join(moduleDir, 'node_modules', '@deepseek-ai', 'dsh-mygo'),
        'dir',
      )
      const mod = await import(pathToFileURL(join(moduleDir, 'store.js')).href + `?t=${Date.now()}`)
      const dbFile = join(dir, 'registry.sqlite')
      const store = mod.createRdbRegistryStore({ type: 'sqlite', path: dbFile })
      await store.check()
      const record = {
        v: 1,
        source: { type: 'static' },
        manifest: { id: 'p', version: '1.0.0' },
        resolvedConfig: {},
      }
      const status = {
        v: 1,
        currentGen: 1,
        previousGen: null,
        status: 'enabled',
        provenance: { origin: 'static', mountedAt: 1 },
      }
      await store.writeGeneration('p', 1, record)
      await store.writeStatus('p', status)
      expect(await store.listIds()).toEqual(['p'])
      expect(await store.readStatus('p')).toMatchObject({ currentGen: 1, status: 'enabled' })
      expect((await store.readGenerations('p')).map((entry: { readonly gen: number }) => entry.gen)).toEqual([1])
      await store.writeGeneration('p', 2, { ...record, resolvedConfig: { step: 2 } })
      await store.writeStatus('p', { ...status, currentGen: 2 })
      expect((await store.readGenerations('p')).map((entry: { readonly gen: number }) => entry.gen)).toEqual([2, 1])
      await store.deleteGeneration('p', 1)
      expect((await store.readGenerations('p')).map((entry: { readonly gen: number }) => entry.gen)).toEqual([2])
      const usage = await store.usage()
      expect(usage.rows).toBeGreaterThanOrEqual(2)
      await store.writeStatus('damaged', '{oops')
      await expect(store.readStatus('damaged')).rejects.toMatchObject({ name: 'RegistryRowError' })
      await store.appendAudit({
        v: 1,
        ts: 1786000000000,
        profile: 'web',
        class: 'mount',
        actor: 'system',
      })
      const audit = await store.readAudit()
      expect(audit[0]).toMatchObject({ class: 'mount' })
      await store.deletePlugin('p')
      expect(await store.listIds()).toEqual(['damaged'])
      await store.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
