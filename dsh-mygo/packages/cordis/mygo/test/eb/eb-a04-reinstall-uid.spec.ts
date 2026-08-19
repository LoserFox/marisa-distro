/**
 * A4：重装必然产生新 fiber/新 uid。
 * 方法：loader 集成实验——remove+create（真实重装）与 config-only update 对照，
 * 断言 uid 变化；重复 3 次排除偶然。
 */

import { describe, expect, it } from 'vitest'
import { makeHarness, provider, settle } from './helpers.ts'

describe('EB-A4 reinstall produces a new fiber uid', () => {
  it('remove+create 重装每次产生新 uid（重复 3 次），config-only update 保持同一 fiber', async () => {
    const harness = await makeHarness()
    harness.ctx.loader.builtins.a = provider('a', 'svc', {})

    await harness.ctx.loader.create({ name: 'cordis:a' })
    let id = harness.findByName('cordis:a')?.id as string
    await settle(() => harness.find(id)?.fiber?.uid !== undefined)
    const uidAfterCreateById = harness.find(id)?.fiber?.uid
    expect(uidAfterCreateById).toBeTypeOf('number')

    // 边界：config-only update 复用同一 fiber（不是重装）。
    await harness.ctx.loader.update(id, { config: { n: 2 } })
    id = harness.findByName('cordis:a')?.id as string
    await settle(() => harness.find(id)?.fiber?.uid === uidAfterCreateById)
    const uidAfterConfigUpdate = harness.find(id)?.fiber?.uid
    expect(uidAfterConfigUpdate).toBe(uidAfterCreateById)

    // 真实重装：remove + create，连续 3 次 uid 均不同。
    const seen = new Set<number>()
    seen.add(uidAfterCreateById as number)
    for (let round = 0; round < 3; round += 1) {
      await harness.ctx.loader.remove(id)
      await harness.ctx.loader.create({ name: 'cordis:a' })
      const nextId = harness.findByName('cordis:a')?.id as string
      await settle(() => harness.find(nextId)?.fiber !== undefined)
      const uid = harness.find(nextId)?.fiber?.uid
      expect(uid).toBeTypeOf('number')
      expect(seen.has(uid as number)).toBe(false)
      seen.add(uid as number)
      id = nextId
    }
    expect(seen.size).toBe(4)
  })
})
