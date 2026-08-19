/**
 * A2：ctx.effect 的异步迭代器 guard 与过渡内部分回滚。
 * 方法：effect 体为永不结束的 async generator，中途调用 disposer，
 * 断言已累积逆按 LIFO 恢复（不等待生成器完成）。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { wait } from './helpers.ts'

describe('EB-A2 effect async-iterator guard and partial rollback', () => {
  it('dispose 后 guard 在步边界中断：在飞步产出被恢复，后续步骤不执行', async () => {
    const ctx = new Context()
    const order: string[] = []
    const disposer = ctx.fiber.effect(async function* () {
      order.push('s1')
      yield () => order.push('d1')
      order.push('s2')
      yield () => order.push('d2')
      await new Promise(resolve => setTimeout(resolve, 50)) // 在飞步
      order.push('s3')
      yield () => order.push('d3')
      order.push('s4')
      yield () => order.push('d4')
    })
    await wait(30)
    expect(order).toEqual(['s1', 's2'])
    const pending = disposer()
    await wait(80)
    expect(order).toEqual(['s1', 's2', 's3', 'd3', 'd2', 'd1'])
    await pending
    // 幂等：第二次 dispose 无效果。
    await disposer()
    expect(order).toEqual(['s1', 's2', 's3', 'd3', 'd2', 'd1'])
  })
})
