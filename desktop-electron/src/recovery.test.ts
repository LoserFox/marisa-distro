import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { routeDesktopStartupFailure } from '../src/startup-failure-routing.ts'
import { beginDesktopRun } from '../src/crash-evidence.ts'
import { RecoveryController, RecoveryControllerError } from '../src/recovery-controller.ts'

describe('routeDesktopStartupFailure (startup-failure-routing port)', () => {
  it('routes stderr-only before app ready', () => {
    expect(routeDesktopStartupFailure({ appReady: false, stage: 'backend-boot' })).toBe('stderr-only')
  })
  it('routes to the recovery window once ready, regardless of stage', () => {
    for (const stage of ['electron-ready', 'backend-extract', 'backend-boot', 'backend-ready'] as const) {
      expect(routeDesktopStartupFailure({ appReady: true, stage })).toBe('startup-recovery')
    }
  })
})

describe('beginDesktopRun (crash-evidence port)', () => {
  it('reports no previous run on a clean first launch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marisa-run-'))
    try {
      const run = beginDesktopRun(join(dir, 'run.json'), { startedAt: 't1', pid: 1, version: 'v' })
      expect(run.previousRun).toBeUndefined()
      run.markClean()
      expect(existsSync(join(dir, 'run.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('detects an unclean previous exit and never steals its marker', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marisa-run2-'))
    try {
      const first = beginDesktopRun(join(dir, 'run.json'), { startedAt: 't1', pid: 111, version: 'v' })
      // Second process starts while the first marker is present (no markClean).
      const second = beginDesktopRun(join(dir, 'run.json'), { startedAt: 't2', pid: 222, version: 'v' })
      expect(second.previousRun).toEqual({ startedAt: 't1', pid: 111, version: 'v' })
      // First process tries markClean too late: its ownerId no longer matches.
      first.markClean()
      expect(existsSync(join(dir, 'run.json'))).toBe(true) // second's marker survives
      second.markClean()
      expect(existsSync(join(dir, 'run.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function makeBackend(base: string): string {
  const backendDir = join(base, 'backend')
  const profile = join(backendDir, '.dsh', 'profiles', 'marisa')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@dsh-external/a', '@dsh-external/b', 'evil/../c'] } },
  }))
  return backendDir
}

function makeController(base: string): RecoveryController {
  return new RecoveryController({
    backendDir: makeBackend(base),
    log: () => {},
    reinstallAvailable: () => true,
    reinstallBackend: async () => {},
  })
}

describe('RecoveryController (startup-recovery-controller port)', () => {
  it('snapshot lists bundles with disabled status', () => {
    const base = mkdtempSync(join(tmpdir(), 'marisa-rc-'))
    try {
      const c = makeController(base)
      const snap = c.snapshot()
      expect(snap.bundles.map(b => b.name)).toEqual(['@dsh-external/a', '@dsh-external/b', 'evil/../c'])
      expect(snap.bundles[2]!.action).toBeNull() // path-traversal name not actionable
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
  it('two-phase disable: preview → execute rewrites the composition', () => {
    const base = mkdtempSync(join(tmpdir(), 'marisa-rc2-'))
    try {
      const c = makeController(base)
      const preview = c.preview('disable-bundle', '@dsh-external/a')
      expect(preview.previewId).toMatch(/^prev_[A-Za-z0-9_-]{43}$/)
      c.execute(preview.previewId)
      const manifest = JSON.parse(
        readFileSync(join(base, 'backend', '.dsh', 'profiles', 'marisa', 'package.json'), 'utf8'),
      )
      expect(manifest.dsh.profile.bundles).toEqual(['@dsh-external/b', 'evil/../c'])
      const disabled = JSON.parse(
        readFileSync(join(base, 'backend', '.dsh', 'profiles', 'marisa', '.disabled-bundles.json'), 'utf8'),
      )
      expect(disabled).toContain('@dsh-external/a')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
  it('preview ids are single-use', () => {
    const base = mkdtempSync(join(tmpdir(), 'marisa-rc3-'))
    try {
      const c = makeController(base)
      const preview = c.preview('disable-bundle', '@dsh-external/a')
      c.execute(preview.previewId)
      expect(() => c.execute(preview.previewId)).toThrowError(RecoveryControllerError)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
  it('rejects invalid bundle names at preview time', () => {
    const base = mkdtempSync(join(tmpdir(), 'marisa-rc4-'))
    try {
      const c = makeController(base)
      expect(() => c.preview('disable-bundle', '../../etc')).toThrowError(RecoveryControllerError)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
