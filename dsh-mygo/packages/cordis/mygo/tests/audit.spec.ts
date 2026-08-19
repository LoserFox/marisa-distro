/**
 * Audit JSONL (#17, T5): append-only entries, bounded rotation, tolerant
 * readers (since/by-plugin/tail), and truncated-tail tolerance.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuditLog } from '@r05en1cu/dsh-mygo'

async function freshLog(options: { maxBytes?: number; keepFiles?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-audit-'))
  const log = new AuditLog(dir, 'main', options.maxBytes ?? 1024 * 1024, options.keepFiles ?? 3)
  return { dir, log }
}

describe('AuditLog', () => {
  it('appends entries with filled version, timestamp, and profile', async () => {
    const { dir, log } = await freshLog()
    try {
      await log.append({ class: 'mount', actor: 'model', plugin: { id: 'p', version: '1.0.0', gen: 1 }, ts: 100 })
      const entries = await log.tail(10)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ v: 1, ts: 100, profile: 'main', class: 'mount', plugin: { id: 'p' } })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('filters by since, plugin, and tail order', async () => {
    const { dir, log } = await freshLog()
    try {
      await log.append({ class: 'mount', actor: 'model', plugin: { id: 'a', version: '1', gen: 1 }, ts: 1 })
      await log.append({ class: 'quarantine', actor: 'system', reason: 'damaged-record', ts: 2 })
      await log.append({ class: 'mount', actor: 'model', plugin: { id: 'b', version: '1', gen: 1 }, ts: 3 })
      expect((await log.since(2)).map(entry => entry.ts)).toEqual([2, 3])
      expect((await log.byPlugin('a')).map(entry => entry.plugin?.id)).toEqual(['a'])
      expect((await log.tail(2)).map(entry => entry.ts)).toEqual([2, 3])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rotates at maxBytes and retains keepFiles rotated files', async () => {
    const { dir, log } = await freshLog({ maxBytes: 200, keepFiles: 3 })
    try {
      for (let index = 0; index < 10; index += 1) {
        await log.append({ class: 'mount', actor: 'model', plugin: { id: 'p', version: '1', gen: index }, ts: index })
      }
      const all = await log.tail(100)
      expect(all.length).toBeGreaterThanOrEqual(3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('tolerates malformed lines and a truncated final line', async () => {
    const { dir, log } = await freshLog()
    try {
      await log.append({ class: 'mount', actor: 'model', plugin: { id: 'p', version: '1', gen: 1 }, ts: 1 })
      await writeFile(join(dir, 'audit.jsonl'), '{"v":1,"bad"\n', { flag: 'a' })
      expect((await log.tail(10)).map(entry => entry.ts)).toEqual([1])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
