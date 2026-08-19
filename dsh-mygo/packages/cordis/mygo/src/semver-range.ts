/**
 * Minimal semver-range matcher for the mygo compatibility surface. Deliberately
 * small and dependency-free: the manager validates versions pnpm already
 * installed, so this is a check-only vocabulary (`*`, exact, `=`, `>`, `>=`,
 * `<`, `<=`, `^`, `~`, space-separated AND, `||` OR). It never resolves,
 * selects, or fetches a version.
 * @module @r05en1cu/dsh-mygo/src/semver-range
 */

/** One parsed semver triple plus prerelease/build label. */
interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly string[]
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
const PRERELEASE_RE = /^[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*$/

/** Parse one concrete version; returns `undefined` when not semver-shaped. */
export function parseVersion(version: string): ParsedVersion | undefined {
  const match = VERSION_RE.exec(version.trim())
  if (match === null) return undefined
  const prereleaseRaw = match[4]
  const prerelease = prereleaseRaw === undefined ? [] : prereleaseRaw.split('.')
  if (prereleaseRaw !== undefined && !PRERELEASE_RE.test(prereleaseRaw)) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  }
}

/**
 * Whether one installed version satisfies one semver range. An unparsable
 * version or range returns `false` (the caller distinguishes the two via
 * {@link isValidRange} when the report needs to name the invalid side).
 */
export function matchesVersionRange(version: string, range: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined) return false
  const alternatives = range.split('||')
  return alternatives.some(alternative => {
    // npm semver 规则：预发布版本只有在该区间对同一 major.minor.patch 三元组
    // 显式带预发布比较符时才可匹配（`^0.0.1-rc.1` 可匹配 rc.2；
    // `>=1.0.0` 不匹配 `1.0.1-rc.1`）。
    if (parsed.prerelease.length > 0 && !alternativeAllowsPrerelease(alternative, parsed)) {
      return false
    }
    return matchesComparatorSet(parsed, alternative)
  })
}

/**
 * Whether one range alternative explicitly references a prerelease comparator
 * on the same major.minor.patch tuple as the candidate version.
 */
function alternativeAllowsPrerelease(alternative: string, version: ParsedVersion): boolean {
  const comparators = alternative.trim().split(/\s+/)
  return comparators.some(raw => {
    if (raw === '*' || raw === 'x' || raw === 'X') return false
    const comparator = parseComparator(raw)
    if (comparator === undefined) return false
    const bound = comparator.version
    return bound.prerelease.length > 0
      && bound.major === version.major
      && bound.minor === version.minor
      && bound.patch === version.patch
  })
}

/** Whether a range parses into at least one non-empty comparator set. */
export function isValidRange(range: string): boolean {
  if (range.trim() === '') return false
  return range.split('||').some(alternative => {
    const comparators = alternative.trim().split(/\s+/)
    return comparators.length > 0 && comparators.every(comparator => parseComparator(comparator) !== undefined)
  })
}

/** Compare two parsed versions; negative when `left < right`. */
export function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch
  return comparePrerelease(left.prerelease, right.prerelease)
}

/**
 * 码点序字符串比较（修复批次 4 / review#1 A11 + review#2 A17）：
 * 与 locale 无关的确定性比较，替换 localeCompare（ICU 默认 locale 会让
 * 预发布标识符排序跨环境漂移，如 'i' vs 'I' 在 tr/en 下顺序相反）。
 * semver 标识符为 [0-9A-Za-z-]（BMP 内），逐码点比较即可。
 */
export function compareCodePoints(left: string, right: string): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left.charCodeAt(index)
    const b = right.charCodeAt(index)
    if (a !== b) return a - b
  }
  return left.length - right.length
}

/** Semver prerelease ordering: absent > present; numeric identifiers sort before alphanumeric. */
function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff
    } else if (aNumeric) {
      return -1
    } else if (bNumeric) {
      return 1
    } else {
      const diff = compareCodePoints(a, b)
      if (diff !== 0) return diff
    }
  }
  return 0
}

/** One parsed comparator: an operator plus a concrete version. */
type ParsedComparator = {
  readonly operator: '=' | '>' | '>=' | '<' | '<=' | '^' | '~'
  readonly version: ParsedVersion
  /** Whether the minor component was written (or wildcard-expanded). */
  readonly minorSpecified: boolean
  /** Whether the patch component was written (or wildcard-expanded). */
  readonly patchSpecified: boolean
}

function parseComparator(input: string): ParsedComparator | undefined {
  const text = input.trim()
  if (text === '' || text === '*' || text === 'x' || text === 'X') {
    return {
      operator: '=',
      version: { major: 0, minor: 0, patch: 0, prerelease: [] },
      minorSpecified: false,
      patchSpecified: false,
    }
  }
  const match = /^([=<>^~]{1,2})?([0-9xX*]+)(?:\.([0-9xX*]+))?(?:\.([0-9xX*]+))?(?:-([0-9A-Za-z.-]+))?$/.exec(text)
  if (match === null) return undefined
  const operator = (match[1] ?? '=') as ParsedComparator['operator']
  if (operator !== '=' && operator !== '>' && operator !== '>=' && operator !== '<' && operator !== '<=' && operator !== '^' && operator !== '~') {
    return undefined
  }
  const major = match[2]
  const minor = match[3]
  const patch = match[4]
  const prereleaseRaw = match[5]
  if (major === undefined || /[xX*]/.test(major)) {
    // `*` / `x` alone was handled above; bare `x` in major is invalid.
    return undefined
  }
  const majorNumber = Number(major)
  const minorSpecified = minor !== undefined && !/[xX*]/.test(minor)
  const patchSpecified = patch !== undefined && !/[xX*]/.test(patch)
  const minorNumber = minorSpecified ? Number(minor) : 0
  const patchNumber = patchSpecified ? Number(patch) : 0
  if (prereleaseRaw !== undefined && (!minorSpecified || !patchSpecified)) {
    return undefined
  }
  const version: ParsedVersion = {
    major: majorNumber,
    minor: minorNumber,
    patch: patchNumber,
    prerelease: prereleaseRaw === undefined ? [] : prereleaseRaw.split('.'),
  }
  return { operator, version, minorSpecified, patchSpecified }
}

function matchesComparatorSet(version: ParsedVersion, set: string): boolean {
  const comparators = set.trim().split(/\s+/)
  if (comparators.length === 0) return false
  return comparators.every(raw => {
    if (raw === '*' || raw === 'x' || raw === 'X') return true
    const comparator = parseComparator(raw)
    if (comparator === undefined) return false
    return matchesComparator(version, comparator)
  })
}

function matchesComparator(version: ParsedVersion, comparator: ParsedComparator): boolean {
  const { operator, version: bound, minorSpecified, patchSpecified } = comparator
  // Partial exact/wildcard forms are range shorthand, not exact pins:
  // `1` / `1.x` → 1.x, `1.2` / `1.2.x` → 1.2.x.
  if (operator === '=' && !patchSpecified) {
    return minorSpecified
      ? matchesMinorRange(version, bound)
      : matchesMajorRange(version, bound)
  }
  if (operator === '>' && !patchSpecified) {
    const floor = minorSpecified
      ? { ...bound, minor: bound.minor + 1, patch: 0, prerelease: [] }
      : { ...bound, major: bound.major + 1, minor: 0, patch: 0, prerelease: [] }
    return compareVersions(version, floor) >= 0
  }
  if (operator === '<=' && !patchSpecified) {
    const ceiling = minorSpecified
      ? { ...bound, minor: bound.minor + 1, patch: 0, prerelease: [] }
      : { ...bound, major: bound.major + 1, minor: 0, patch: 0, prerelease: [] }
    return compareVersions(version, ceiling) < 0
  }
  const comparison = compareVersions(version, bound)
  switch (operator) {
    case '=':
      return comparison === 0
    case '>':
      return comparison > 0
    case '>=':
      return comparison >= 0
    case '<':
      return comparison < 0
    case '<=':
      return comparison <= 0
    case '^':
      return matchesCaret(version, bound, minorSpecified, patchSpecified)
    case '~':
      return matchesTilde(version, bound, minorSpecified)
  }
}

/** `^1.2.3` → `>=1.2.3 <2.0.0`; `^0.2.3` → `>=0.2.3 <0.3.0`; `^0.0.3` → `>=0.0.3 <0.0.4`. */
function matchesCaret(
  version: ParsedVersion,
  bound: ParsedVersion,
  minorSpecified: boolean,
  patchSpecified: boolean,
): boolean {
  if (compareVersions(version, bound) < 0) return false
  if (bound.major > 0) return version.major === bound.major
  if (!minorSpecified) return version.major === 0
  if (bound.minor > 0) return version.major === 0 && version.minor === bound.minor
  if (!patchSpecified) return version.major === 0 && version.minor === 0
  return version.major === 0 && version.minor === 0 && version.patch === bound.patch
}

/** `~1.2.3` → `>=1.2.3 <1.3.0`; `~1.2` → `>=1.2.0 <1.3.0`; `~1` → `>=1.0.0 <2.0.0`. */
function matchesTilde(version: ParsedVersion, bound: ParsedVersion, minorSpecified: boolean): boolean {
  if (compareVersions(version, bound) < 0) return false
  if (!minorSpecified) return version.major === bound.major
  return version.major === bound.major && version.minor === bound.minor
}

/** `1.2.x` / `1.2` → `>=1.2.0 <1.3.0`. */
function matchesMinorRange(version: ParsedVersion, bound: ParsedVersion): boolean {
  return version.major === bound.major
    && version.minor === bound.minor
    && compareVersions(version, bound) >= 0
}

/** `1.x` / `1` → `>=1.0.0 <2.0.0`. */
function matchesMajorRange(version: ParsedVersion, bound: ParsedVersion): boolean {
  return version.major === bound.major && compareVersions(version, bound) >= 0
}
