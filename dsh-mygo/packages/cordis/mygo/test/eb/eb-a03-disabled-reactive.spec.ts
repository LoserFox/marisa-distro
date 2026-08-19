/**
 * A3：disabled 是否阻止依赖恢复后自动激活。
 * 方法：B 依赖 A 的 svc；先 disabled 再让 A 上线/下线/上线，记录 B 状态序列；
 * 覆盖两个方向：依赖恢复不自动激活；enable 后反应式恢复。
 */

import { describe, expect, it } from 'vitest'
import { consumer, makeHarness, provider, settle } from './helpers.ts'

describe('EB-A3 disabled blocks reactive reactivation', () => {
  it('依赖恢复时 disabled 的 B 不自动激活；enable 后恢复反应式行为', async () => {
    const harness = await makeHarness()
    const counter = { active: 0, loads: 0 }
    harness.ctx.loader.builtins.a = provider('a', 'svc', {})
    harness.ctx.loader.builtins.b = consumer('b', ['svc'], counter)

    // 1) B 初始 disabled，A 不在场。
    const idB = await harness.ctx.loader.create({ name: 'cordis:b', disabled: true })
    expect(harness.find(idB)?.fiber).toBeUndefined()

    // 2) A 上线：disabled 的 B 不应自动激活。
    const idA = await harness.ctx.loader.create({ name: 'cordis:a' })
    await settle(() => harness.find(idA)?.fiber?.state === 2 /* ACTIVE */)
    await settle(() => harness.find(idB)?.fiber !== undefined)
    expect(harness.find(idB)?.fiber?.state).not.toBe(2 /* ACTIVE */)
    expect(counter.loads).toBe(0)

    // 3) enable B：A 在场 → 应激活。
    await harness.ctx.loader.update(idB, { disabled: false })
    await settle(() => harness.find(idB)?.fiber?.state === 2 /* ACTIVE */)
    expect(counter.loads).toBe(1)

    // 4) A 下线 → B 应因依赖缺失停用。
    await harness.ctx.loader.remove(idA)
    await settle(() => harness.find(idB)?.fiber?.state !== 2 /* ACTIVE */)
    expect(counter.active).toBe(0)

    // 5) A 重新上线 → enable 后的 B 恢复反应式自动激活。
    await harness.ctx.loader.create({ name: 'cordis:a' })
    await settle(() => harness.find(idB)?.fiber?.state === 2 /* ACTIVE */)
    expect(counter.loads).toBe(2)
    expect(counter.active).toBe(1)
  })
})
