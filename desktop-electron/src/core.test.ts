import { describe, expect, it } from 'vitest'
import { parseCommandLine, webCommandLine } from '../src/command.ts'
import { parseReadyLine } from '../src/backend-stdout.ts'
import { nextBackoff, MAX_RESTART_WAIT_MS, RESTART_BACKOFF_MS } from '../src/times.ts'
import { exitFailureClass } from '../src/backend-stdout.ts'

describe('webCommandLine', () => {
  it('falls back to dsh web --no-open --port with explicit no-open (#2410)', () => {
    expect(webCommandLine('0', {})).toBe('dsh web --no-open --port 0')
  })
  it('substitutes the {port} placeholder in overrides', () => {
    expect(webCommandLine('1234', { DSH_WEB_CMD: '"C:\\x\\launcher.cmd" --port {port}' })).toBe(
      '"C:\\x\\launcher.cmd" --port 1234',
    )
  })
  it('accepts the MARISA_WEB_CMD alias', () => {
    expect(webCommandLine('0', { MARISA_WEB_CMD: 'dsh web --port {port}' })).toBe('dsh web --port 0')
  })
})

describe('parseCommandLine (command.go port)', () => {
  it('splits on whitespace', () => {
    expect(parseCommandLine('dsh web --port 0')).toEqual(['dsh', 'web', '--port', '0'])
  })
  it('keeps quoted spaces and strips quotes', () => {
    expect(parseCommandLine('"C:\\Program Files\\x\\node.exe" bin.js --profile marisa')).toEqual([
      'C:\\Program Files\\x\\node.exe',
      'bin.js',
      '--profile',
      'marisa',
    ])
  })
})

describe('parseReadyLine', () => {
  it('parses the readiness line with a LAN note', () => {
    const url = parseReadyLine('dsh web: http://127.0.0.1:8317  (LAN: http://192.168.1.2:8317)')
    expect(url?.port).toBe('8317')
  })
  it('rejects lines without the prefix', () => {
    expect(parseReadyLine('loading profile...')).toBeUndefined()
  })
  it('rejects port-less URLs (split lines)', () => {
    expect(parseReadyLine('dsh web: http://127')).toBeUndefined()
  })
  it('rejects garbage after the prefix', () => {
    expect(parseReadyLine('dsh web: not-a-url')).toBeUndefined()
  })
})

describe('backoff', () => {
  it('doubles from 1s and caps at 30s', () => {
    let b = RESTART_BACKOFF_MS
    const seen: number[] = []
    for (let i = 0; i < 8; i++) {
      b = nextBackoff(b)
      seen.push(b)
    }
    expect(seen).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000])
    expect(MAX_RESTART_WAIT_MS).toBe(30000)
  })
})

describe('exitFailureClass (rescue_health.go port)', () => {
  it('clean exit resets', () => {
    expect(exitFailureClass(false, false, 100)).toEqual({ count: false, reset: true })
  })
  it('user restart resets even on abnormal exit', () => {
    expect(exitFailureClass(true, true, 100)).toEqual({ count: false, reset: true })
  })
  it('fast crash counts toward the streak', () => {
    expect(exitFailureClass(true, false, 5_000)).toEqual({ count: true, reset: false })
  })
  it('long-run crash resets (transient)', () => {
    expect(exitFailureClass(true, false, 121_000)).toEqual({ count: false, reset: true })
  })
})
