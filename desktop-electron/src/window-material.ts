/**
 * Cross-platform window-material preferences and Windows capability gates —
 * port of anywhere dsh-plugin-desktop src/window-material.ts (MIT).
 *
 * Windows system backdrops require NT 22621+ (Win11 22H2). 'acrylic' is kept
 * as a readable legacy value that fails closed to 'off' (upstream removed it
 * because both Windows implementations can break native window behavior).
 * Marisa additionally offers acrylic as an explicit opt-in experimental
 * value (browser-killing caveat documented), resolved to 'acrylic' only when
 * the user explicitly selects it after the version warning.
 */

import { release as osRelease } from 'node:os'

export type MacosWindowMaterial = 'off' | 'transparent'
export type WindowsWindowMaterial = 'off' | 'mica' | 'acrylic'
export type DesktopWindowMaterial = MacosWindowMaterial | 'mica' | 'acrylic'

export const DEFAULT_MACOS_WINDOW_MATERIAL: MacosWindowMaterial = 'transparent'
export const DEFAULT_WINDOWS_WINDOW_MATERIAL: WindowsWindowMaterial = 'mica'
/** Win11 22H2 — first build with DWM_SYSTEMBACKDROP_TYPE. */
export const WINDOWS_MICA_MIN_BUILD = 22_621

/** Extract the NT build number from a Windows `os.release()` value (10.0.22631 → 22631). */
export function windowsBuildNumber(value: string = osRelease()): number | undefined {
  const match = /^(?:\d+\.){2}(\d+)(?:\.|$)/.exec(value)
  if (match === null) return undefined
  const build = Number(match[1])
  return Number.isSafeInteger(build) ? build : undefined
}

export function windowsSupportsSystemBackdrop(build: number | undefined): boolean {
  return build !== undefined && build >= WINDOWS_MICA_MIN_BUILD
}

export function parseMacosWindowMaterial(value: unknown): MacosWindowMaterial {
  if (value === undefined) return DEFAULT_MACOS_WINDOW_MATERIAL
  if (value === 'off' || value === 'transparent') return value
  throw new Error('marisa-desktop.macosMaterial 必须是 "off" 或 "transparent"')
}

export function parseWindowsWindowMaterial(value: unknown): WindowsWindowMaterial {
  if (value === undefined) return DEFAULT_WINDOWS_WINDOW_MATERIAL
  if (value === 'off' || value === 'mica' || value === 'acrylic') return value
  throw new Error('marisa-desktop.windowsMaterial 必须是 "off" | "mica" | "acrylic"')
}

/**
 * Resolve the material actually applied to the window generation:
 * Linux never gets materials; mica below 22621 fails closed to 'off'
 * (window-material.ts effectiveDesktopWindowMaterial semantics); acrylic is
 * the explicit marisa experimental opt-in and also requires 22621+.
 */
export function effectiveDesktopWindowMaterial(
  platform: NodeJS.Platform,
  macosMaterial: MacosWindowMaterial,
  windowsMaterial: WindowsWindowMaterial,
  windowsBuild: number | undefined,
): DesktopWindowMaterial {
  if (platform === 'linux') return 'off'
  if (platform === 'darwin') return macosMaterial
  if (windowsMaterial === 'off') return 'off'
  if (!windowsSupportsSystemBackdrop(windowsBuild)) return 'off'
  return windowsMaterial
}

/** Whether the resolved material leaves the window transparent (renderer must not paint an opaque body). */
export function materialIsTransparent(material: DesktopWindowMaterial): boolean {
  return material !== 'off'
}
