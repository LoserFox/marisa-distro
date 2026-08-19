/** state.json 缓存读写：缺失/损坏容错、原子写、缓存窗口判定。 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  EMPTY_UPDATE_CHECK_STATE, lastCheckMs, readState, withinCacheWindow, writeState,
  type UpdateCheckState,
} from '../src/state.ts'

const SAMPLE: UpdateCheckState = {
  lastCheckAt: '2026-08-19T00:00:00.000Z',
  latest: '0.1.7',
  dismissedVersion: null,
  changelog: 'fixes',
  assets: { msi: 'https://example.test/m.msi', standalone: null, releasePage: 'https://example.test/r' },
}

let dir: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dsh-update-check-state-')) })
afterEach(() => { writeFileSync(join(dir, 'cleanup'), '') })

describe('readState', () => {
  it('returns empty state for a missing file', async () => {
    expect(await readState(join(dir, 'missing.json'))).toEqual(EMPTY_UPDATE_CHECK_STATE)
  })

  it('returns empty state for corrupt JSON', async () => {
    const path = join(dir, 'corrupt.json')
    writeFileSync(path, '{ not json')
    expect(await readState(path)).toEqual(EMPTY_UPDATE_CHECK_STATE)
  })

  it('tolerates unknown fields and wrong-typed values', async () => {
    const path = join(dir, 'loose.json')
    writeFileSync(path, JSON.stringify({ lastCheckAt: 42, latest: '0.1.7', extra: true }))
    const state = await readState(path)
    expect(state).toEqual({ ...EMPTY_UPDATE_CHECK_STATE, latest: '0.1.7' })
  })
})

describe('writeState roundtrip', () => {
  it('persists and reloads all fields', async () => {
    const path = join(dir, 'state.json')
    await writeState(path, SAMPLE)
    expect(await readState(path)).toEqual(SAMPLE)
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(onDisk.latest).toBe('0.1.7')
    expect(onDisk.assets).toEqual(SAMPLE.assets)
  })

  it('writes into a not-yet-existing directory', async () => {
    const path = join(dir, 'nested', 'state.json')
    await writeState(path, SAMPLE)
    expect(await readState(path)).toEqual(SAMPLE)
  })
})

describe('cache window', () => {
  const now = Date.parse('2026-08-19T12:00:00.000Z')

  it('reports within-window when the last check is recent', () => {
    const state = { ...SAMPLE, lastCheckAt: new Date(now - 5_000).toISOString() }
    expect(withinCacheWindow(state, now, 30_000)).toBe(true)
  })

  it('reports outside-window when the last check is old', () => {
    const state = { ...SAMPLE, lastCheckAt: new Date(now - 60_000).toISOString() }
    expect(withinCacheWindow(state, now, 30_000)).toBe(false)
  })

  it('reports outside-window without any check record or with an unparsable date', () => {
    expect(withinCacheWindow(EMPTY_UPDATE_CHECK_STATE, now, 30_000)).toBe(false)
    expect(withinCacheWindow({ ...SAMPLE, lastCheckAt: 'not-a-date' }, now, 30_000)).toBe(false)
  })

  it('lastCheckMs returns null for absent or unparsable records', () => {
    expect(lastCheckMs(EMPTY_UPDATE_CHECK_STATE)).toBeNull()
    expect(lastCheckMs({ ...SAMPLE, lastCheckAt: 'x' })).toBeNull()
  })
})
