/**
 * profile 版本钉定测试（2026-08-13 范围重塑）：跨插件求解器已删除，钉定
 * 语义由单插件确定性版本选择（version-select）承担——钉定 = 精确版本硬
 * 选择（不在候选集 → 失败），请求区间与钉定同时约束。
 */

import { describe, expect, it } from 'vitest'
import { selectVersion, type VersionCandidate } from '../../src/package/version-select.ts'

function candidate(version: string): VersionCandidate {
  return { version }
}

describe('profile pins（单插件版本选择）', () => {
  it('钉定精确版本胜出（候选内硬选择）', () => {
    const outcome = selectVersion({
      candidates: [candidate('1.0.0'), candidate('2.0.0'), candidate('1.5.0')],
      pin: '1.5.0',
      coreVersion: '0.0.1-rc.1',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.version).toBe('1.5.0')
  })

  it('无钉定时取区间过滤后的确定性最高版本', () => {
    const outcome = selectVersion({
      candidates: [candidate('1.0.0'), candidate('2.0.0'), candidate('1.5.0')],
      range: '^1.0.0',
      coreVersion: '0.0.1-rc.1',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.version).toBe('1.5.0')
  })

  it('pin 版本不在候选集 → 失败并点名钉定版本与候选集（不编造候选）', () => {
    const outcome = selectVersion({
      candidates: [candidate('1.0.0')],
      pin: '2.0.0',
      coreVersion: '0.0.1-rc.1',
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reasons.join('')).toContain('profile 钉定 2.0.0')
    expect(outcome.reasons.join('')).toContain('1.0.0')
  })

  it('pin 与请求区间冲突 → 失败（区间过滤先行）', () => {
    const outcome = selectVersion({
      candidates: [candidate('1.0.0'), candidate('2.0.0')],
      range: '^1.0.0',
      pin: '2.0.0',
      coreVersion: '0.0.1-rc.1',
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    // 区间过滤后 2.0.0 不在候选池：钉定落空并列出过滤后候选。
    expect(outcome.reasons.join('')).toContain('profile 钉定 2.0.0')
    expect(outcome.reasons.join('')).toContain('1.0.0')
  })

  it('空候选集 → 失败', () => {
    const outcome = selectVersion({ candidates: [] })
    expect(outcome.ok).toBe(false)
  })

  it('core 区间不满足只告警不阻断', () => {
    const outcome = selectVersion({
      candidates: [{
        version: '1.0.0',
        manifest: {
          formatVersion: 1,
          id: 'a',
          version: '1.0.0',
          entry: 'lib/index.js',
          requires: {},
          core: '>=2.0.0',
          recommends: {},
          provides: [],
          entrypoints: {},
          bundles: [],
        },
      }],
      coreVersion: '0.0.1-rc.1',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.version).toBe('1.0.0')
    expect(outcome.warnings.join('')).toContain('核心版本告警')
  })
})
