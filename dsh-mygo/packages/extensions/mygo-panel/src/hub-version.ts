/**
 * Semver ordering for hub catalog update badges.
 *
 * Ported from `@omdsh-plugins/omdsh-plughub`'s `src/version.ts` (MIT). Kept
 * dependency-free so the panel's install surface does not grow a semver
 * package for one comparison. Anything that does not parse reports `unknown`
 * rather than guessing a direction.
 * @module @r05en1cu/dsh-mygo-ext-panel/hub-version
 */

/** Update verdict shown on a hub catalog card. */
export type HubUpdateState = 'available' | 'current' | 'unknown'

/** `major.minor.patch`, an optional prerelease, an optional build. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** A prerelease identifier that is a number, and so compares numerically. */
const NUMERIC = /^\d+$/

/** One parsed version. */
interface Version {
  /** `[major, minor, patch]`. */
  readonly core: readonly [number, number, number]
  /** Prerelease identifiers, empty for a release. */
  readonly pre: readonly string[]
}

/**
 * Parse a version string. A leading `v` is accepted because tags carry one
 * and manifests do not. Build metadata is dropped, per semver.
 * @param text - the candidate version.
 * @returns the parsed version, or undefined when it is not semver.
 */
export function parseVersion(text: string): Version | undefined {
  const trimmed = text.trim().replace(/^v/, '')
  const parsed = SEMVER.exec(trimmed)
  if (parsed === null) return undefined
  const [, major, minor, patch, pre] = parsed
  return {
    core: [Number(major), Number(minor), Number(patch)],
    pre: pre === undefined || pre === '' ? [] : pre.split('.'),
  }
}

/** Order two prerelease identifier lists, per semver rule 11. */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0) return right.length === 0 ? 0 : 1
  if (right.length === 0) return -1
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index] ?? ''
    const b = right[index] ?? ''
    if (a === b) continue
    const numericA = NUMERIC.test(a)
    const numericB = NUMERIC.test(b)
    if (numericA !== numericB) return numericA ? -1 : 1
    if (numericA) return Number(a) < Number(b) ? -1 : 1
    return a < b ? -1 : 1
  }
  if (left.length === right.length) return 0
  return left.length < right.length ? -1 : 1
}

/**
 * Order two version strings.
 * @param a - the first version.
 * @param b - the second version.
 * @returns -1, 0, or 1, or undefined when either string is not semver.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (left === undefined || right === undefined) return undefined
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return comparePrerelease(left.pre, right.pre)
}

/**
 * Where one installed plugin stands against the version the hub advertises.
 * @param offered - the version the catalog advertises.
 * @param installed - the version this profile has on disk.
 * @returns the verdict a card renders.
 */
export function hubUpdateStateOf(offered: string | undefined, installed: string | undefined): HubUpdateState {
  if (offered === undefined || installed === undefined) return 'unknown'
  const comparison = compareVersions(offered, installed)
  if (comparison === undefined) return 'unknown'
  return comparison > 0 ? 'available' : 'current'
}
