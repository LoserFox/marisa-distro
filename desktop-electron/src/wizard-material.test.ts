import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  windowsBuildNumber,
  windowsSupportsSystemBackdrop,
  effectiveDesktopWindowMaterial,
  parseWindowsWindowMaterial,
} from '../src/window-material.ts'
import { readDesktopSettings, writeDesktopSettings, desktopSettingsPath, DEFAULT_DESKTOP_SETTINGS } from '../src/desktop-settings.ts'
import { parseSetupWizardAction } from '../src/setup-wizard-contract.ts'
import { filterToastIntent } from '../src/notifications.ts'
import { DEFAULT_NOTIFICATION_SETTINGS } from '../src/desktop-settings.ts'

describe('window-material (anywhere port)', () => {
  it('extracts NT build from os.release()', () => {
    expect(windowsBuildNumber('10.0.22631')).toBe(22631)
    expect(windowsBuildNumber('10.0.19045')).toBe(19045)
    expect(windowsBuildNumber('weird')).toBeUndefined()
  })
  it('gates system backdrops at 22621', () => {
    expect(windowsSupportsSystemBackdrop(22621)).toBe(true)
    expect(windowsSupportsSystemBackdrop(19045)).toBe(false)
    expect(windowsSupportsSystemBackdrop(undefined)).toBe(false)
  })
  it('fails closed: mica/acrylic below 22621 → off, linux always off', () => {
    expect(effectiveDesktopWindowMaterial('win32', 'transparent', 'mica', 19045)).toBe('off')
    expect(effectiveDesktopWindowMaterial('win32', 'transparent', 'acrylic', 19045)).toBe('off')
    expect(effectiveDesktopWindowMaterial('win32', 'transparent', 'mica', 22631)).toBe('mica')
    expect(effectiveDesktopWindowMaterial('win32', 'transparent', 'acrylic', 22631)).toBe('acrylic')
    expect(effectiveDesktopWindowMaterial('linux', 'transparent', 'mica', 99999)).toBe('off')
    expect(effectiveDesktopWindowMaterial('darwin', 'transparent', 'mica', 22631)).toBe('transparent')
  })
  it('parses strict material enums', () => {
    expect(parseWindowsWindowMaterial('mica')).toBe('mica')
    expect(parseWindowsWindowMaterial('acrylic')).toBe('acrylic')
    expect(parseWindowsWindowMaterial(undefined)).toBe('mica')
    expect(() => parseWindowsWindowMaterial('glass')).toThrow()
  })
})

describe('desktop-settings persistence', () => {
  it('missing file → defaults with setupComplete=false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marisa-set-'))
    try {
      const s = readDesktopSettings({ LOCALAPPDATA: dir })
      expect(s).toEqual({ ...DEFAULT_DESKTOP_SETTINGS, notifications: { ...DEFAULT_NOTIFICATION_SETTINGS } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('round-trips writes and corrupt files fail closed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'marisa-set2-'))
    try {
      process.env.LOCALAPPDATA = dir
      const s = readDesktopSettings({ LOCALAPPDATA: dir })
      writeDesktopSettings({ ...s, windowsMaterial: 'acrylic', setupComplete: true }, { LOCALAPPDATA: dir })
      const disk = JSON.parse(readFileSync(desktopSettingsPath({ LOCALAPPDATA: dir }), 'utf8'))
      expect(disk.windowsMaterial).toBe('acrylic')
      expect(disk.setupComplete).toBe(true)
      writeFileSync(desktopSettingsPath({ LOCALAPPDATA: dir }), '{broken json', 'utf8')
      const corrupt = readDesktopSettings({ LOCALAPPDATA: dir })
      expect(corrupt.windowsMaterial).toBe('mica') // default, not a crash
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('setup-wizard action contract (anywhere port)', () => {
  const base = {
    mode: 'advanced',
    macosMaterial: 'transparent',
    windowsMaterial: 'mica',
    enabled: 'true',
    notifyOnTurnCompletion: 'true',
    notifyOnTurnFailure: 'true',
    notifyOnJobCompletion: 'true',
    notifyOnJobFailure: 'true',
  }
  const qs = (params: Record<string, string>) => new URLSearchParams(params).toString()
  it('parses a complete action', () => {
    const r = parseSetupWizardAction(`marisa-setup://complete?${qs(base)}`)
    expect(r?.action).toBe('complete')
    if (r?.action === 'complete') {
      expect(r.selection.windowsMaterial).toBe('mica')
      expect(r.selection.notifications.enabled).toBe(true)
    }
  })
  it('parses skip', () => {
    expect(parseSetupWizardAction('marisa-setup://skip')).toEqual({ action: 'skip' })
  })
  it('rejects wrong scheme, extra keys, missing keys, bad enums', () => {
    expect(parseSetupWizardAction('https://complete?x=1')).toBeUndefined()
    expect(parseSetupWizardAction(`marisa-setup://complete?${qs(base)}&extra=1`)).toBeUndefined()
    const { mode, ...less } = base
    void mode
    expect(parseSetupWizardAction(`marisa-setup://complete?${qs(less)}`)).toBeUndefined()
    expect(parseSetupWizardAction(`marisa-setup://complete?${qs({ ...base, mode: 'godmode' })}`)).toBeUndefined()
    expect(parseSetupWizardAction('marisa-setup://complete')).toBeUndefined()
  })
})

describe('toast intent filter (notifications decision table port)', () => {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS }
  const outcomeOf = (intent: { title: string }): 'turn-completed' | 'turn-failed' | 'job-completed' | 'job-failed' | null =>
    intent.title.includes('turn') ? 'turn-completed' : intent.title.includes('jobfail') ? 'job-failed' : null
  it('passes non-outcome intents through regardless of switches', () => {
    const intent = { title: 'hello', body: 'x' }
    expect(filterToastIntent(intent, { ...settings, enabled: false }, outcomeOf)).toBeNull()
    const passthrough = { title: 'arbitrary', body: 'x' }
    expect(filterToastIntent(passthrough, { ...settings, enabled: true }, outcomeOf)).toEqual(passthrough)
  })
  it('respects the four switches', () => {
    const turn = { title: 'turn done', body: 'x' }
    expect(filterToastIntent(turn, { ...settings, notifyOnTurnCompletion: false }, outcomeOf)).toBeNull()
    expect(filterToastIntent(turn, settings, outcomeOf)).toEqual(turn)
    const jobFail = { title: 'jobfail', body: 'x' }
    expect(filterToastIntent(jobFail, { ...settings, notifyOnJobFailure: false }, outcomeOf)).toBeNull()
    expect(filterToastIntent(jobFail, settings, outcomeOf)).toEqual(jobFail)
  })
})
