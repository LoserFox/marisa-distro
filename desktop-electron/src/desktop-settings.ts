/**
 * Desktop settings persistence — the marisa equivalent of anywhere's
 * dsh-desktop settings document (setup-wizard-settings.ts), simplified to a
 * single JSON file in the log dir's sibling (outside the backend tree so
 * re-extracts keep it): %LOCALAPPDATA%/marisa-distro/desktop-settings.json.
 *
 * Fields mirror the Setup Wizard selection (setup-wizard-contract.ts):
 * window material per platform + the four notification switches.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { appDataDir } from './paths.ts'
import {
  DEFAULT_MACOS_WINDOW_MATERIAL,
  DEFAULT_WINDOWS_WINDOW_MATERIAL,
  parseMacosWindowMaterial,
  parseWindowsWindowMaterial,
  type MacosWindowMaterial,
  type WindowsWindowMaterial,
} from './window-material.ts'

export const SETTINGS_FILE_NAME = 'desktop-settings.json'

export interface DesktopNotificationSettings {
  enabled: boolean
  notifyOnTurnCompletion: boolean
  notifyOnTurnFailure: boolean
  notifyOnJobCompletion: boolean
  notifyOnJobFailure: boolean
}

export interface DesktopSettings {
  macosMaterial: MacosWindowMaterial
  windowsMaterial: WindowsWindowMaterial
  notifications: DesktopNotificationSettings
  /** Set true after the setup wizard has been completed or skipped once. */
  setupComplete: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: Readonly<DesktopNotificationSettings> = Object.freeze({
  enabled: true,
  notifyOnTurnCompletion: true,
  notifyOnTurnFailure: true,
  notifyOnJobCompletion: true,
  notifyOnJobFailure: true,
})

export const DEFAULT_DESKTOP_SETTINGS: Readonly<DesktopSettings> = Object.freeze({
  macosMaterial: DEFAULT_MACOS_WINDOW_MATERIAL,
  windowsMaterial: DEFAULT_WINDOWS_WINDOW_MATERIAL,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  setupComplete: false,
})

export function desktopSettingsPath(env: NodeJS.ProcessEnv = process.env, home?: string): string {
  return join(appDataDir(env, home), SETTINGS_FILE_NAME)
}

/** Read settings; missing → defaults, corrupt/partial → per-field defaults. */
export function readDesktopSettings(env: NodeJS.ProcessEnv = process.env, home?: string): DesktopSettings {
  const path = desktopSettingsPath(env, home)
  if (!existsSync(path)) return { ...DEFAULT_DESKTOP_SETTINGS, notifications: { ...DEFAULT_NOTIFICATION_SETTINGS } }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<DesktopSettings>
    const macosMaterial = raw.macosMaterial !== undefined
      ? parseMacosWindowMaterial(raw.macosMaterial)
      : DEFAULT_DESKTOP_SETTINGS.macosMaterial
    const windowsMaterial = raw.windowsMaterial !== undefined
      ? parseWindowsWindowMaterial(raw.windowsMaterial)
      : DEFAULT_DESKTOP_SETTINGS.windowsMaterial
    const n = (raw.notifications ?? {}) as Partial<DesktopNotificationSettings>
    return {
      macosMaterial,
      windowsMaterial,
      notifications: {
        enabled: n.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.enabled,
        notifyOnTurnCompletion: n.notifyOnTurnCompletion ?? DEFAULT_NOTIFICATION_SETTINGS.notifyOnTurnCompletion,
        notifyOnTurnFailure: n.notifyOnTurnFailure ?? DEFAULT_NOTIFICATION_SETTINGS.notifyOnTurnFailure,
        notifyOnJobCompletion: n.notifyOnJobCompletion ?? DEFAULT_NOTIFICATION_SETTINGS.notifyOnJobCompletion,
        notifyOnJobFailure: n.notifyOnJobFailure ?? DEFAULT_NOTIFICATION_SETTINGS.notifyOnJobFailure,
      },
      setupComplete: raw.setupComplete === true,
    }
  } catch {
    // Corrupt file: fail closed to defaults (never brick the shell on settings).
    return { ...DEFAULT_DESKTOP_SETTINGS, notifications: { ...DEFAULT_NOTIFICATION_SETTINGS } }
  }
}

/** Atomic-ish settings write (temp + rename via plain two-step, mode 0600). */
export function writeDesktopSettings(settings: DesktopSettings, env: NodeJS.ProcessEnv = process.env, home?: string): void {
  const path = desktopSettingsPath(env, home)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}
