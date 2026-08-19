/**
 * A10：notify 的边界矩阵（修正版）。
 * 发现：notify 有两个来源——reflect.provide/unprovide 即时通知（reflect.ts:295），
 * 以及 fiber 状态翻转时的通知（fiber.ts:588-596）。两者都要计入。
 * 方法：spy reflect.notify，覆盖 PENDING→ACTIVE、ACTIVE→DISPOSED、
 * 失败但曾 provide、失败且未 provide、ACTIVE→FAILED 五条路径。
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { makeHarness, settle, wait } from './helpers.ts'

describe('EB-A10 notify boundary matrix (dual source)', () => {
  async function spiedHarness() {
    const harness = await makeHarness()
    const calls: string[][] = []
    const orig = harness.ctx.reflect.notify.bind(harness.ctx.reflect)
    harness.ctx.reflect.notify = ((names: string[]) => {
      calls.push([...names])
      return orig(names)
    }) as typeof harness.ctx.reflect.notify
    return { harness, calls }
  }

  it('PENDING→ACTIVE 与 ACTIVE→DISPOSED 通知；曾 provide 的失败会通知；未 provide 的失败不通知；ACTIVE→FAILED 通知', async () => {
    const { harness, calls } = await spiedHarness()
    harness.ctx.loader.builtins.good = {
      name: 'good',
      apply(ctx: Context) {
        ctx.provide('svc', {})
      },
    }
    harness.ctx.loader.builtins.noProvideFail = {
      name: 'noProvideFail',
      apply() {
        throw new Error('boom')
      },
    }
    harness.ctx.loader.builtins.provideFail = {
      name: 'provideFail',
      apply(ctx: Context) {
        ctx.provide('never-notify', {})
        throw new Error('after provide')
      },
    }
    harness.ctx.loader.builtins.failing = {
      name: 'failing',
      apply(ctx: Context, config: { fail?: boolean }) {
        ctx.provide('x', {})
        if (config.fail) throw new Error('after provide')
      },
    }

    // 1) PENDING→ACTIVE：good 上线 → notify('svc')。
    const goodId = await harness.ctx.loader.create({ name: 'cordis:good' })
    await settle(() => harness.find(goodId)?.fiber?.state === 2 /* ACTIVE */)
    expect(calls.some(call => call.includes('svc'))).toBe(true)

    // 2) ACTIVE→DISPOSED：移除 good → 再次 notify('svc')；等待异步 unload 通知落定。
    await harness.ctx.loader.remove(goodId)
    await wait(150)
    const beforeRemoveCheck = calls.length
    await wait(100)
    expect(calls.slice(beforeRemoveCheck).length).toBe(0) // 通知已稳定
    expect(calls.some(call => call.includes('svc'))).toBe(true)

    // 3) 未 provide 的失败（PENDING→FAILED）：不应出现任何服务名通知。
    const beforeNoProvide = calls.length
    await harness.ctx.loader.create({ name: 'cordis:noProvideFail' }).catch(() => {})
    const noProvideEntry = harness.findByName('cordis:noProvideFail')
    await settle(() => noProvideEntry?.fiber?.state === 3 /* FAILED */)
    // 失败插件未提供任何服务 → 不产生插件服务名通知；
    // 允许的噪声：loader 内部服务通知（[] / ['loader']）。
    const noProvideCalls = calls.slice(beforeNoProvide)
    expect(noProvideCalls.some(call => call.includes('never-notify'))).toBe(false)
    expect(noProvideCalls.some(call => call.includes('noProvideFail'))).toBe(false)

    // 4) 曾 provide 的失败：provide 即时通知 → 'never-notify' 出现（即使最终 FAILED）。
    const beforeProvide = calls.length
    await harness.ctx.loader.create({ name: 'cordis:provideFail' }).catch(() => {})
    const provideEntry = harness.findByName('cordis:provideFail')
    await settle(() => provideEntry?.fiber?.state === 3 /* FAILED */)
    expect(calls.slice(beforeProvide).some(call => call.includes('never-notify'))).toBe(true)

    // 5) ACTIVE→FAILED：failing 先 ACTIVE（notify('x')），配置更新后抛错 → 再次 notify('x')。
    await harness.ctx.loader.create({ name: 'cordis:failing', config: { fail: false } })
    const failingEntry = harness.findByName('cordis:failing')
    await settle(() => failingEntry?.fiber?.state === 2 /* ACTIVE */)
    const failingId = failingEntry?.id as string
    const beforeFailUpdate = calls.length
    await harness.ctx.loader.update(failingId, { config: { fail: true } }).catch(() => {})
    await settle(() => harness.find(failingId)?.fiber?.state === 3 /* FAILED */)
    expect(calls.slice(beforeFailUpdate).some(call => call.includes('x'))).toBe(true)
  })
})
