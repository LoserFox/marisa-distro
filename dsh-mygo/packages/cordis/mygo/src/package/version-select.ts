/**
 * 单插件确定性版本选择（范围重塑裁决 2026-08-13：替代已删除的跨插件约束
 * 求解器 resolver）。安装/还原不再做插件图求解：在「带有效 manifest 的候选
 * 版本」内按确定性全序取最高版本；profile 钉定（pins）为精确版本硬选择；
 * `core` 区间只作告警不阻断。同输入必同输出。
 * @module @r05en1cu/dsh-mygo/src/package/version-select
 */

import { compareVersions, matchesVersionRange, parseVersion } from '../semver-range.ts'
import type { PluginManifestV2 } from './manifest-v2.ts'

/** One candidate version of one plugin (registry 元数据中带有效 manifest 的版本）。 */
export interface VersionCandidate {
  readonly version: string
  readonly manifest?: PluginManifestV2 | undefined
}

/** Version selection input (single plugin; no cross-plugin graph). */
export interface VersionSelectInput {
  /** 候选版本（带有效 manifest；无序）。 */
  readonly candidates: readonly VersionCandidate[]
  /** 请求区间过滤（可选）。 */
  readonly range?: string
  /** profile 钉定的精确版本（硬选择；不在候选集 → 失败）。 */
  readonly pin?: string
  /** dsh 核心版本（仅告警；不阻断）。 */
  readonly coreVersion?: string
}

export type VersionSelectOutcome =
  | { readonly ok: true; readonly version: string; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reasons: readonly string[] }

/** 确定性降序：semver 降序 + 字符串字典序兜底（与旧 resolver 同口径）。 */
function compareVersionsDesc(left: string, right: string): number {
  const l = parseVersion(left)
  const r = parseVersion(right)
  if (l === undefined || r === undefined) return left < right ? 1 : left > right ? -1 : 0
  const base = compareVersions(r, l)
  return base !== 0 ? base : left < right ? -1 : left > right ? 1 : 0
}

/**
 * 选择版本：钉定优先（精确匹配 + 区间过滤均须满足），否则区间过滤后取
 * 确定性最高版本。`core` 区间不满足只告警（硬约束已删除）。
 */
export function selectVersion(input: VersionSelectInput): VersionSelectOutcome {
  const { candidates, range, pin, coreVersion } = input
  const warnings: string[] = []
  if (candidates.length === 0) {
    return { ok: false, reasons: ['没有任何带有效 manifest 的候选版本'] }
  }
  let pool = candidates
  if (range !== undefined) {
    pool = pool.filter(candidate => matchesVersionRange(candidate.version, range))
    if (pool.length === 0) {
      return {
        ok: false,
        reasons: [`没有候选版本满足区间 ${range}（候选：${candidates.map(candidate => candidate.version).join(', ') || '无'}）`],
      }
    }
  }
  const warnCore = (candidate: VersionCandidate): void => {
    const manifest = candidate.manifest
    if (manifest === undefined || coreVersion === undefined) return
    if (manifest.core !== '*' && !matchesVersionRange(coreVersion, manifest.core)) {
      warnings.push(`核心版本告警：当前 dsh 核心 ${coreVersion} 不满足 ${manifest.id} 声明的 ${manifest.core}（不阻断）`)
    }
  }
  if (pin !== undefined) {
    const pinned = pool.find(candidate => candidate.version === pin)
    if (pinned === undefined) {
      return {
        ok: false,
        reasons: [`profile 钉定 ${pin} 不在候选集内（候选：${pool.map(candidate => candidate.version).join(', ') || '无'}）`],
      }
    }
    warnCore(pinned)
    return { ok: true, version: pin, warnings }
  }
  const chosen = [...pool].sort((a, b) => compareVersionsDesc(a.version, b.version))[0] as VersionCandidate
  warnCore(chosen)
  return { ok: true, version: chosen.version, warnings }
}
