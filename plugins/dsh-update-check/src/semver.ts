/** 版本号语义化比较：Release tag（v0.1.6）与 bundle VERSION（0.1.6）两侧归一化。 */

/** 去掉前导 v/V 与空白，得到纯 semver 串。 */
export function normalizeVersion(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed.slice(1) : trimmed
}

interface ParsedVersion {
  readonly parts: readonly number[]
  readonly pre: readonly string[]
}

const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)*(?:-[0-9A-Za-z.-]+)?$/

function parseVersion(value: string): ParsedVersion | null {
  const normalized = normalizeVersion(value)
  if (!VERSION_PATTERN.test(normalized)) return null
  const [main = '', prePart = ''] = normalized.split('-', 2)
  return {
    parts: main.split('.').map(part => Number(part)),
    pre: prePart === '' ? [] : prePart.split('.'),
  }
}

/**
 * 比较两个版本串：a < b 返回负数、相等 0、a > b 正数。
 * 主版本逐段数值比较，缺失段按 0；主版本相等时按 semver 规则比较
 * prerelease 后缀（无后缀 > 有后缀；数字标识 < 字母标识）。
 * 非 semver 输入按归一化后的字符串序降级比较，不抛错。
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (pa === null || pb === null) {
    const na = normalizeVersion(a)
    const nb = normalizeVersion(b)
    return na < nb ? -1 : na > nb ? 1 : 0
  }
  const len = Math.max(pa.parts.length, pb.parts.length)
  for (let i = 0; i < len; i++) {
    const x = pa.parts[i] ?? 0
    const y = pb.parts[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  const preLen = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < preLen; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      const xi = Number(x)
      const yi = Number(y)
      if (xi !== yi) return xi < yi ? -1 : 1
    } else if (xNumeric) {
      return -1
    } else if (yNumeric) {
      return 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** latest 比 current 新（v 前缀两侧归一化）。 */
export function hasUpdate(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0
}
