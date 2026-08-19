/**
 * 挂载序测试：拓扑序、被依赖者优先、环拒绝。
 */

import { describe, expect, it } from 'vitest'
import { computeMountOrder } from '../../src/package/mount-order.ts'

describe('mount order', () => {
  it('mounts dependencies before dependents', () => {
    const result = computeMountOrder(['A', 'B', 'C', 'D'], [
      { from: 'A', to: 'B' },
      { from: 'A', to: 'C' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'D' },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = result.order
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('B'))
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('C'))
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('A'))
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('A'))
  })

  it('rejects cycles explicitly', () => {
    const result = computeMountOrder(['A', 'B'], [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.cycle.length).toBeGreaterThan(0)
  })
})
