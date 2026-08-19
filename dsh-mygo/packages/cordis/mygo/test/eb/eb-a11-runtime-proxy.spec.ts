/**
 * A11：运行时代理兜底动态访问的最小原型。
 * 方法：Proxy 包装服务引用，记录缺失符号访问；测量 get 开销；确认 core[name]()
 * 这类动态访问可被捕获；同时记录盲区（解构先取引用后代理）。
 */

import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'

describe('EB-A11 runtime proxy fallback for dynamic access', () => {
  it('Proxy 可记录动态缺失符号访问；get 开销可接受；盲区=先解构再代理', () => {
    const missing: string[] = []
    const service = { greet() { return 'hi' }, NAME: 'svc' }
    const proxied = new Proxy(service, {
      get(target, prop) {
        if (!(prop in target)) missing.push(String(prop))
        return Reflect.get(target, prop)
      },
    })

    const key = 'greet'
    const fn = (proxied as Record<string, unknown>)[key] as () => string
    expect(fn()).toBe('hi')
    const ghost = (proxied as Record<string, unknown>)['notExist']
    expect(ghost).toBeUndefined()
    expect(missing).toEqual(['notExist'])

    const start = performance.now()
    let sink = 0
    for (let index = 0; index < 1_000_000; index += 1) {
      sink += ((proxied as Record<string, unknown>).NAME as string).length
    }
    const elapsedMs = performance.now() - start
    expect(sink).toBeGreaterThan(0)
    expect(elapsedMs).toBeLessThan(500)
    console.log(`[EB-A11] 1e6 次代理 get 共 ${elapsedMs.toFixed(1)} ms`)

    // 盲区：解构发生在代理之前则代理不可见。
    const { greet } = service
    expect(greet()).toBe('hi')
  })
})
