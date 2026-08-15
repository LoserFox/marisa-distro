/**
 * Unit tests for the running-row activity-line derivation.
 */

import { describe, expect, it } from 'vitest'
import type { TranscriptRow } from '../src/client/sidechain-view'
import { lastActivity, readActivityRound, salientToolArg } from '../src/client/sidechain-activity'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('readActivityRound', () => {
  it('settles only after every child read finishes', async () => {
    const first = deferred<string | null>()
    const second = deferred<string | null>()
    const published: string[] = []
    let settled = false
    const round = readActivityRound(
      ['first', 'second'],
      row => row === 'first' ? first.promise : second.promise,
      (_row, line) => { published.push(line) },
    ).then(() => { settled = true })

    first.resolve('one')
    await first.promise
    await Promise.resolve()
    expect(settled).toBe(false)

    second.resolve('two')
    await round
    expect(settled).toBe(true)
    expect(published).toEqual(['one', 'two'])
  })

  it('contains one failed child read and still publishes successful siblings', async () => {
    const published: string[] = []
    await expect(readActivityRound(
      ['failed', 'ok'],
      row => row === 'failed' ? Promise.reject(new Error('offline')) : Promise.resolve('ready'),
      (row, line) => { published.push(`${row}:${line}`) },
    )).resolves.toBeUndefined()
    expect(published).toEqual(['ok:ready'])
  })
})

describe('salientToolArg', () => {
  it('picks the per-tool priority field', () => {
    expect(salientToolArg('bash', JSON.stringify({ command: 'ls -la', cwd: '/x' }))).toBe('ls -la')
    expect(salientToolArg('grep', JSON.stringify({ pattern: 'foo', path: 'src' }))).toBe('foo')
    expect(salientToolArg('read', JSON.stringify({ path: '/tmp/a.txt' }))).toBe('/tmp/a.txt')
    expect(salientToolArg('subagent', JSON.stringify({ description: '调研 FTS' }))).toBe('调研 FTS')
  })

  it('falls back to the first field for unknown tools', () => {
    expect(salientToolArg('mystery', JSON.stringify({ zeta: 'z', alpha: 'a' }))).toBe('z')
  })

  it('stringifies non-string values and raw non-JSON input', () => {
    expect(salientToolArg('mystery', JSON.stringify({ n: 42 }))).toBe('42')
    expect(salientToolArg('mystery', 'plain text')).toBe('plain text')
  })

  it('returns undefined when there are no arguments', () => {
    expect(salientToolArg('bash', undefined)).toBeUndefined()
    expect(salientToolArg('bash', '{}')).toBeUndefined()
  })

  it('collapses whitespace and caps the length', () => {
    const long = 'x'.repeat(200)
    expect(salientToolArg('bash', JSON.stringify({ command: `  a\n\tb  ${long}` }))).toBe(`a b ${long}`.slice(0, 60) + '…')
  })
})

describe('lastActivity', () => {
  const assistant = (text: string): TranscriptRow => ({ kind: 'assistant', seq: 1, text })
  const tool = (name: string, argumentsRaw?: string): TranscriptRow => ({
    kind: 'tool', seq: 1, name, failed: false,
    ...(argumentsRaw === undefined ? {} : { detail: { arguments: argumentsRaw } }),
  })

  it('prefers the latest assistant text', () => {
    const rows = [
      tool('bash', JSON.stringify({ command: 'ls' })),
      assistant('The answer is 42.'),
      tool('grep', JSON.stringify({ pattern: 'x' })),
    ]
    expect(lastActivity(rows)).toBe('The answer is 42.')
  })

  it('falls back to the last non-failed tool call', () => {
    expect(lastActivity([
      tool('grep', JSON.stringify({ pattern: 'needle' })),
    ])).toBe('🔧 grep · needle')
  })

  it('skips failed tool calls', () => {
    expect(lastActivity([
      { kind: 'tool', seq: 1, name: 'bash', failed: true, detail: { arguments: JSON.stringify({ command: 'rm -rf /' }) } },
      { kind: 'tool', seq: 2, name: 'read', failed: false, detail: { arguments: JSON.stringify({ path: '/tmp/a' }) } },
    ])).toBe('🔧 read · /tmp/a')
  })

  it('returns undefined for an empty window', () => {
    expect(lastActivity([])).toBeUndefined()
    expect(lastActivity([{ kind: 'tool', seq: 1, name: 'bash', failed: true }])).toBeUndefined()
  })

  it('collapses whitespace and caps assistant text', () => {
    const long = `line one
line two  ${'x'.repeat(300)}`
    expect(lastActivity([assistant(long)])).toBe(`line one line two ${'x'.repeat(300)}`.slice(0, 140) + '…')
  })
})
