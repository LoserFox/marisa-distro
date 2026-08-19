/**
 * live rail 页内帧处理测试（rc8 client 半）：mock loader/modules/loadBundle/
 * removeStyles，断言 mount/unmount 动词序、幂等、串行队列与失败兜底。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/client-live-rail
 */

import { describe, expect, it } from 'vitest'
import { createLiveRailHandler, type LiveRailFrame } from '../src/client/live-rail.ts'

interface MockEntry {
  readonly id: string
  readonly options: { readonly name: string }
  fiber?: { readonly runtime: { readonly callback: unknown } | null } | undefined
  readonly registryDeletes: unknown[]
  readonly ctx: { readonly registry: { delete(key: unknown): unknown } }
}

function makeEntry(name: string, withFiber: boolean): MockEntry {
  const registryDeletes: unknown[] = []
  const entry: MockEntry = {
    id: `gen-${name}`,
    options: { name },
    registryDeletes,
    ctx: { registry: { delete(key: unknown) { registryDeletes.push(key) } } },
  }
  if (withFiber) entry.fiber = { runtime: { callback: `cb:${name}` } }
  return entry
}

function makeDeps(opts: { readonly prefetchFails?: boolean; readonly loadBundleFails?: boolean } = {}) {
  const calls: string[] = []
  const entries = new Map<string, MockEntry>()
  const loader = {
    *entries() {
      for (const entry of entries.values()) yield entry
    },
    create: ({ name }: { readonly name: string }) => {
      calls.push(`create:${name}`)
      entries.set(name, makeEntry(name, true))
      return Promise.resolve(`gen-${name}`)
    },
    remove: (id: string) => {
      calls.push(`remove:${id}`)
      for (const [name, entry] of entries) if (entry.id === id) entries.delete(name)
      return Promise.resolve()
    },
  }
  const modules = {
    invalidate: (id: string) => { calls.push(`invalidate:${id}`) },
    prefetch: (id: string) => {
      calls.push(`prefetch:${id}`)
      return opts.prefetchFails === true ? Promise.reject(new Error('not a graph entry')) : Promise.resolve()
    },
  }
  const loadBundle = (url: string) => {
    calls.push(`loadBundle:${url}`)
    return opts.loadBundleFails === true ? Promise.reject(new Error('network')) : Promise.resolve()
  }
  const removeStyles = (id: string) => { calls.push(`removeStyles:${id}`) }
  const warnings: string[] = []
  const handler = createLiveRailHandler({
    loader, modules, loadBundle, removeStyles,
    warn: message => { warnings.push(message) },
  })
  return { calls, entries, handler, warnings }
}

const frame = (op: 'mount' | 'unmount', id: string, url?: string): LiveRailFrame => ({
  type: 'live-rail', op, id, ...(url === undefined ? {} : { url }),
})

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

describe('live rail 页内帧处理', () => {
  it('mount 新行（不在 boot 图表）：invalidate → prefetch 失败回落 loadBundle → create', async () => {
    const deps = makeDeps({ prefetchFails: true })
    deps.handler(frame('mount', '@test/new-pkg'))
    await settle()
    expect(deps.calls).toEqual([
      'invalidate:@test/new-pkg',
      'prefetch:@test/new-pkg',
      'loadBundle:/plugins/@test/new-pkg/client.js',
      'create:@test/new-pkg',
    ])
    expect(deps.entries.has('@test/new-pkg')).toBe(true)
  })

  it('mount 图内行：prefetch 直达（不走 loadBundle）；帧带 url 时用于回落', async () => {
    const deps = makeDeps()
    deps.handler(frame('mount', '@test/graph-pkg'))
    await settle()
    expect(deps.calls).toEqual(['invalidate:@test/graph-pkg', 'prefetch:@test/graph-pkg', 'create:@test/graph-pkg'])
    const withUrl = makeDeps({ prefetchFails: true })
    withUrl.handler(frame('mount', '@test/url-pkg', '/plugins/@test/url-pkg/client.js?rev=r9'))
    await settle()
    expect(withUrl.calls).toContain('loadBundle:/plugins/@test/url-pkg/client.js?rev=r9')
  })

  it('mount 已挂载行幂等 no-op', async () => {
    const deps = makeDeps()
    deps.entries.set('@test/mounted', makeEntry('@test/mounted', true))
    deps.handler(frame('mount', '@test/mounted'))
    await settle()
    expect(deps.calls).toEqual([])
  })

  it('unmount：registry-first 删 callback → 撤样式 → remove；条目从树消失', async () => {
    const deps = makeDeps()
    const entry = makeEntry('@test/doomed', true)
    deps.entries.set('@test/doomed', entry)
    deps.handler(frame('unmount', '@test/doomed'))
    await settle()
    expect(deps.calls).toEqual(['removeStyles:@test/doomed', 'remove:gen-@test/doomed'])
    expect(entry.registryDeletes).toEqual(['cb:@test/doomed'])
    expect(entry.fiber).toBeUndefined()
    expect(deps.entries.has('@test/doomed')).toBe(false)
  })

  it('unmount 未挂载行幂等 no-op；非 live-rail 帧忽略', async () => {
    const deps = makeDeps()
    deps.handler(frame('unmount', '@test/ghost'))
    deps.handler({ type: 'other' } as unknown as LiveRailFrame)
    await settle()
    expect(deps.calls).toEqual([])
  })

  it('失败兜底：warn 提示刷新页面，串行队列不被毒化（后续帧照常处理）', async () => {
    const deps = makeDeps({ prefetchFails: true, loadBundleFails: true })
    deps.handler(frame('mount', '@test/broken'))
    deps.handler(frame('mount', '@test/after'))
    await settle()
    // 第一帧失败：create 未执行
    expect(deps.calls.filter(call => call === 'create:@test/broken')).toEqual([])
    // 第二帧仍被处理（fallback 同样失败但尝试了）
    expect(deps.calls).toContain('loadBundle:/plugins/@test/after/client.js')
    expect(deps.warnings.length).toBe(2)
    expect(deps.warnings[0]).toContain('刷新页面')
  })
})
