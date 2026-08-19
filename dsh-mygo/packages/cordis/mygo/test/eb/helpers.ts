/**
 * 假设验证实验共享夹具（只读使用 vendored cordis/loader，不修改其源码）。
 * 运行时解析到 @deepseek-ai/cordis 的 lib 产物（vendor/cordis/lib），
 * 与生产 npm lib 模式一致。
 */

import { Context } from '@deepseek-ai/cordis'
// P3 自包含：经 node_modules 解析公开包的 lib 产物（lib 模式语义不变）。
import Loader from '@deepseek-ai/cordis-plugin-loader'

/** Entry 的结构化视图（避免依赖 loader 包的类型导出形态）。 */
export interface EntryLike {
  readonly id: string
  readonly options?: { readonly name?: string }
  readonly fiber?: {
    readonly uid?: number
    readonly state?: number
    readonly epoch?: unknown
    readonly inertia?: unknown
  }
}

export interface Harness {
  readonly ctx: Context
  readonly entries: () => EntryLike[]
  readonly find: (id: string) => EntryLike | undefined
  readonly findByName: (name: string) => EntryLike | undefined
}

export async function makeHarness(): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(Loader, {})
  const entries = () => [...ctx.loader.entries()] as unknown as EntryLike[]
  return {
    ctx,
    entries,
    find: (id: string) => entries().find(entry => entry.id === id),
    findByName: (name: string) => entries().find(entry => entry.options?.name === name),
  }
}

/** 等待一个条件成立（最多 300ms）。 */
export async function settle(check: () => boolean, stepMs = 20): Promise<boolean> {
  for (let index = 0; index < 15; index += 1) {
    if (check()) return true
    await new Promise(resolve => setTimeout(resolve, stepMs))
  }
  return check()
}

export function wait(ms = 20): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 一个简单的提供者插件。 */
export function provider(name: string, service: string, value: unknown) {
  return {
    name,
    apply(ctx: Context) {
      ctx.provide(service, value)
    },
  }
}

/** 一个带激活/停用计数的消费者插件。 */
export function consumer(name: string, inject: readonly string[], counter: { active: number; loads: number }) {
  return {
    name,
    inject,
    apply() {
      counter.loads += 1
      counter.active += 1
      return () => {
        counter.active -= 1
      }
    },
  }
}
