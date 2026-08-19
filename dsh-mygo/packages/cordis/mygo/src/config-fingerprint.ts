/**
 * Config revision fingerprint：把 JSON 兼容的 config 值规范化为稳定字符串。
 * 对象键排序、数组保序、undefined 与缺失键区分。revision 层用它在每次
 * 读/写时判断 raw config 是否实际变化——解析值相同但文档说法不同（如
 * 显式覆盖等于默认值）在这里就是值本身，由各 config 所有者决定是否
 * 需要单独表达；mygo 的 bridge/bundle config 没有 base/user 分层，
 * 因此指纹只认值变化。
 * @module @r05en1cu/dsh-mygo/src/config-fingerprint
 */

/** Stable JSON-compatible projection. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = stable((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * Canonical fingerprint of one config value. `undefined` 表示值缺失。
 * @param value - config value.
 * @returns stable JSON string, or undefined.
 */
export function configFingerprint(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(stable(value))
}
