/**
 * State snapshot files (#17, §22.2): atomic temp-write + rename, hash-verified
 * reads, delete/deleteAll, and boot GC over orphan files.
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnapshotStore } from '@r05en1cu/dsh-mygo'

describe('SnapshotStore', () => {
  it('writes atomically, returns pointer metadata, and reads the state back', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      const meta = await store.write('p', 1, { n: 1 })
      expect(meta.path).toBe(join(root, 'p', '1.state.json'))
      expect(meta.bytes).toBeGreaterThan(0)
      expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/)
      await expect(store.read('p', 1, meta, vi.fn())).resolves.toEqual({ n: 1 })
      expect(await store.listKeys()).toEqual(['p/1'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats missing files as no snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      await expect(store.read('p', 1, undefined, vi.fn())).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('warns and yields undefined on hash or byte mismatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      const meta = await store.write('p', 1, { n: 1 })
      const warn = vi.fn()
      await expect(store.read('p', 1, { ...meta, sha256: '0'.repeat(64) }, warn)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('hash check'))
      await expect(store.read('p', 1, { ...meta, bytes: meta.bytes + 1 }, warn)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('warns and yields undefined on unparsable content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      await store.write('p', 1, { n: 1 })
      await writeFile(join(root, 'p', '1.state.json'), 'not json')
      const warn = vi.fn()
      await expect(store.read('p', 1, undefined, warn)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not valid JSON'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('deletes one generation and all generations of a plugin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      await store.write('p', 1, { n: 1 })
      await store.write('p', 2, { n: 2 })
      await store.write('q', 1, { n: 3 })
      await store.delete('p', 1)
      expect(await store.listKeys()).toEqual(['p/2', 'q/1'])
      await store.deleteAll('p')
      expect(await store.listKeys()).toEqual(['q/1'])
      await store.deleteAll('p')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('gc removes orphan files and keeps referenced ones', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      await store.write('p', 1, { n: 1 })
      await store.write('p', 2, { n: 2 })
      await store.write('q', 1, { n: 3 })
      expect(await store.gc(new Set(['p/2']))).toBe(2)
      expect(await store.listKeys()).toEqual(['p/2'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('gc ignores non-snapshot files and listKeys filters them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    try {
      const store = new SnapshotStore(root)
      await store.write('p', 1, { n: 1 })
      await writeFile(join(root, 'p', 'junk.txt'), 'junk')
      expect(await store.listKeys()).toEqual(['p/1'])
      expect(await store.gc(new Set())).toBe(1)
      expect(await store.listKeys()).toEqual([])
      await expect(readFile(join(root, 'p', 'junk.txt'), 'utf8')).resolves.toBe('junk')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('tolerates a missing or empty root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-snap-'))
    const empty = join(root, 'missing')
    try {
      const store = new SnapshotStore(empty)
      expect(await store.listKeys()).toEqual([])
      expect(await store.gc(new Set())).toBe(0)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
