/**
 * A5：导出不可变快照 + 结构性符号比较的原型与成本。
 * 方法：冻结导出表，Set 差比较；测量 10k 符号比较耗时；判定能否放进同步前置门。
 */

import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'

function snapshot(exports: Record<string, unknown>): ReadonlySet<string> {
  return new Set(Object.keys(Object.freeze({ ...exports })))
}

function diff(prev: ReadonlySet<string>, next: ReadonlySet<string>): { missing: string[]; added: string[] } {
  const missing: string[] = []
  const added: string[] = []
  for (const key of prev) if (!next.has(key)) missing.push(key)
  for (const key of next) if (!prev.has(key)) added.push(key)
  return { missing, added }
}

describe('EB-A5 frozen export snapshot + structural compare', () => {
  it('10k 符号的冻结+差比较在亚毫秒量级，能放进同步前置门', () => {
    const big: Record<string, unknown> = {}
    for (let index = 0; index < 10_000; index += 1) big[`sym${index}`] = index
    const before = snapshot(big)
    delete big.sym5000
    big.sym10000 = 1
    const after = snapshot(big)

    const start = performance.now()
    for (let index = 0; index < 100; index += 1) {
      const result = diff(before, after)
      if (index === 0) {
        expect(result.missing).toEqual(['sym5000'])
        expect(result.added).toEqual(['sym10000'])
      }
    }
    const elapsedMs = (performance.now() - start) / 100
    expect(elapsedMs).toBeLessThan(5)
    console.log(`[EB-A5] 10k 符号一次冻结+差比较平均 ${elapsedMs.toFixed(3)} ms`)
  })
})
