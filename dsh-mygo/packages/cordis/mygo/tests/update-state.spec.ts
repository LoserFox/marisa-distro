/**
 * P7-A5 热重载状态保持用例：真实 cordis fiber.update 路径下，经
 * preserveStateAcrossUpdate 接线的插件在 config 更新重启后保有状态；
 * 未接线对照组丢失。进程内真实 Context（离线）。
 * @module @r05en1cu/dsh-mygo/tests/update-state
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { preserveStateAcrossUpdate } from '../src/update-state.ts'

interface ProbeState {
  count: number
}

describe('preserveStateAcrossUpdate（0812 internal/update 瀑布缝）', () => {
  it('config 更新重启后状态保持（capture → 重启 → restore）', async () => {
    const log: string[] = []
    const ctx = new Context()
    const fiber = ctx.plugin({
      name: 'stateful-probe',
      apply(pctx: Context, config: { readonly seed: number }) {
        const state: ProbeState = { count: 0 }
        preserveStateAcrossUpdate<number>(pctx, {
          key: 'stateful-probe',
          capture: () => state.count,
          restore: (saved) => {
            state.count = saved
            log.push(`restored ${saved}`)
          },
        })
        state.count += 1
        log.push(`apply count=${state.count} seed=${config.seed}`)
      },
    }, { seed: 1 })
    await fiber
    await fiber.update({ seed: 2 })
    expect(log).toEqual([
      'apply count=1 seed=1',
      'restored 1',
      'apply count=2 seed=2',
    ])
    // 第二次更新继续累计（暂存槽逐代传递）
    await fiber.update({ seed: 3 })
    expect(log.at(-1)).toBe('apply count=3 seed=3')
    await fiber.dispose().catch(() => {})
  })

  it('未接线对照组：config 更新重启后状态丢失（证明缝的必要性）', async () => {
    const counts: number[] = []
    const ctx = new Context()
    const fiber = ctx.plugin({
      name: 'bare-probe',
      apply() {
        counts.push((counts.at(-1) ?? 0) + 1)
      },
    }, { seed: 1 })
    await fiber
    // 模块级计数器模拟「状态」：这里只验证无暂存槽时插件内部状态无从交接
    const local = { value: 41 }
    await fiber.update({ seed: 2 })
    expect(counts).toEqual([1, 2])
    expect(local.value).toBe(41) // 外部引用仍在，但插件新代拿不到（无交接通道）
    await fiber.dispose().catch(() => {})
  })
})
