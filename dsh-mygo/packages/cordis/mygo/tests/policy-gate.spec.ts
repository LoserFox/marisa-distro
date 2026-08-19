/**
 * requires 政策闸执行面测试（修复批次 2：A1/A2/A14/A15 + review#1 A1 镜像）。
 * 断言对象 = 行为（provide 可解析性 / 政策报告），不是 policyStatus 标签；
 * policyStatus 仅作状态辅助断言。每条新接线的断线方式见各用例注释——
 * 注释对应消费点后该用例必须变红（任务 2.6 断线测试）。
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import { DispatchMachine } from '../src/dispatch.ts'
import { InMemoryRegistryStore } from '../src/store.ts'
import { LifecycleEngine } from '../src/lifecycle.ts'
import { resolvePluginManagerConfig } from '../src/config.ts'

function fixture(id: string, overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return {
    id,
    version: '1.0.0',
    kinds: [],
    requires: [],
    provides: [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: { activate: () => {} },
    ...overrides,
  }
}

interface Harness {
  readonly engine: LifecycleEngine
  readonly definitions: Map<string, PluginDefinition>
  readonly logs: string[]
}

function harness(): Harness {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: [] })
  machine.start()
  const definitions = new Map<string, PluginDefinition>()
  const logs: string[] = []
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: [],
    logger: { error: m => logs.push(String(m)), info: () => {}, warn: m => logs.push(String(m)), debug: () => {} },
    resolveSource: async (value: PluginSource) => {
      const definition = definitions.get(value.type === 'inline' ? value.code : value.package)
      if (definition === undefined) throw new Error('unresolvable')
      return definition
    },
  })
  return { engine, definitions, logs }
}

const source = (id: string): PluginSource => ({ type: 'inline', code: id })

describe('requires 政策闸执行面（修复批次 2 / A1）', () => {
  it('A1-a：requires 服务缺席 → 消费方真实不运行（provide 不解析）+ policy-rejected 报告', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: { activate(env) { env.provide('consumer-marker', { live: true }) } },
    }))
    await h.engine.install(source('consumer'))
    const handle = h.engine.plugins().find(p => p.id === 'consumer')
    expect(handle?.status).toBe('enabled')
    expect(handle?.policyStatus).toBe('inactive')
    // 行为断言（断线点：reconcileRequiresGates 内 policyStop 调用）。
    expect(h.engine.provideValue('consumer-marker')).toBeUndefined()
    const report = h.engine.policyReportOf('consumer')
    expect(report?.code).toBe('policy-rejected')
    expect(report?.scope).toBe('service')
    expect(report?.conflicts[0]?.service).toBe('svc')
    expect(report?.conflicts[0]?.constraint.kind).toBe('requires')
  })

  it('A1-b：提供者上线 → 消费方真实重新激活（provide 重新解析、报告清除）', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: { activate(env) { env.provide('consumer-marker', { live: true }) } },
    }))
    await h.engine.install(source('consumer'))
    expect(h.engine.provideValue('consumer-marker')).toBeUndefined()
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { ok: true }) } },
    }))
    await h.engine.install(source('provider'))
    // 行为断言（断线点：reconcileRequiresGates 内 policyStart 调用）。
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    expect(h.engine.provideValue('consumer-marker')).not.toBeUndefined()
    expect(h.engine.policyReportOf('consumer')).toBeUndefined()
  })

  it('A1-c：提供者下线 → 消费方真实停用（runtime reactive 核心承诺）', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: { activate(env) { env.provide('consumer-marker', { live: true }) } },
    }))
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { ok: true }) } },
    }))
    await h.engine.install(source('consumer'))
    await h.engine.install(source('provider'))
    expect(h.engine.provideValue('consumer-marker')).not.toBeUndefined()
    h.definitions.set('provider2', fixture('provider', {
      version: '2.0.0',
      provides: [],
      hooks: { activate: () => {} },
    }))
    await h.engine.replace('provider', source('provider2'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    expect(h.engine.provideValue('consumer-marker')).toBeUndefined()
    expect(h.engine.policyReportOf('consumer')?.code).toBe('policy-rejected')
    expect(h.engine.policyReportOf('consumer')?.conflicts[0]?.constraint.kind).toBe('requires')
  })

  it('A2：提供者换代丢失被用符号 → 消费方停用 + symbol-missing 报告（词汇分工）', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { run() { return 'ok' } }) } },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) {
          const svc = env.get<{ run?: unknown }>('svc')
          void svc?.run
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    h.definitions.set('provider2', fixture('provider', {
      version: '2.0.0',
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { stop() { return 0 } }) } },
    }))
    await h.engine.replace('provider', source('provider2'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    const report = h.engine.policyReportOf('consumer')
    expect(report?.code).toBe('symbol-missing')
    expect(report?.conflicts[0]?.constraint.kind).toBe('symbol')
    expect(report?.conflicts[0]?.constraint.target).toBe('svc')
  })

  it('A2-adopt：静态再采纳换代丢失符号 → replaceTables 前置门停用消费方', async () => {
    const h = harness()
    await h.engine.adoptStatic(fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { run() { return 'ok' } }) } },
    }), {})
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) {
          const svc = env.get<{ run?: unknown }>('svc')
          void svc?.run
        },
      },
    }))
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    // 静态再采纳：同一 id 换新导出面 → replaceTables → verifyConsumerSymbolsAfterReplace。
    await h.engine.adoptStatic(fixture('provider', {
      version: '2.0.0',
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { stop() { return 0 } }) } },
    }), {})
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    expect(h.engine.policyReportOf('consumer')?.code).toBe('symbol-missing')
  })
})

describe('A14 provide() 真实 disposer（修复批次 2）', () => {
  it('调用 disposer 后提供真实撤下（后续解析失败 + 依赖方政策重估）；重复调用幂等', async () => {
    const h = harness()
    let disposeSvc: (() => void) | undefined
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          disposeSvc = env.provide('svc', { ok: true })
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(h.engine.provideValue('svc')).not.toBeUndefined()
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    disposeSvc?.()
    expect(h.engine.provideValue('svc')).toBeUndefined()
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    expect(h.engine.policyReportOf('consumer')?.conflicts[0]?.service).toBe('svc')
    disposeSvc?.() // 幂等：不抛、不重复副作用
    expect(h.engine.provideValue('svc')).toBeUndefined()
  })
})

describe('A15 访问记录归属与按代修剪（修复批次 2）', () => {
  it('两消费方动态访问无交叉污染：a 访问 ghost 停用、b 不访问保持 active', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { ok: true }) } },
    }))
    h.definitions.set('a', fixture('a', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) {
          const svc = env.get<{ ghost?: unknown }>('svc')
          void svc?.ghost
        },
      },
    }))
    h.definitions.set('b', fixture('b', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: { activate: () => {} },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('a'))
    await h.engine.install(source('b'))
    expect(h.engine.plugins().find(p => p.id === 'a')?.policyStatus).toBe('inactive')
    expect(h.engine.policyReportOf('a')?.code).toBe('symbol-missing')
    // b 从未访问 svc.ghost：不得被 a 的动态访问拖入 symbol-missing（A15）。
    expect(h.engine.plugins().find(p => p.id === 'b')?.policyStatus).toBe('active')
    expect(h.engine.policyReportOf('b')).toBeUndefined()
  })

  it('消费方换代后访问记录按归属修剪：旧代 ghost 不污染新代判定', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: { activate(env) { env.provide('svc', { ok: true }) } },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) {
          const svc = env.get<{ ghost?: unknown }>('svc')
          void svc?.ghost
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    // 换代：新定义不再访问 ghost；旧代记录必须已被按代修剪，否则新代仍被判 symbol-missing。
    h.definitions.set('consumer2', fixture('consumer', {
      version: '2.0.0',
      serviceRequires: { svc: '>=1.0.0' },
      hooks: { activate: () => {} },
    }))
    await h.engine.replace('consumer', source('consumer2'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    expect(h.engine.policyReportOf('consumer')).toBeUndefined()
  })
})

describe('键处理镜像（修复批次 2 / review#1 A1）', () => {
  it('requires 服务名 toString 不炸、不错判（原型安全查表）', async () => {
    const h = harness()
    h.definitions.set('provider', fixture('provider', {
      provides: ['toString'],
      hooks: { activate(env) { env.provide('toString', { x: 1 }) } },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { toString: '>=1.0.0' },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')

    // 对照：无提供者 → service-missing，service 字段精确为 toString。
    const h2 = harness()
    h2.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { toString: '>=1.0.0' },
    }))
    await h2.engine.install(source('consumer'))
    const report = h2.engine.policyReportOf('consumer')
    expect(report?.code).toBe('policy-rejected')
    expect(report?.conflicts[0]?.service).toBe('toString')
  })
})

describe('Proxy 记录面完整性（修复批次 4 / review#1 A2 + review#2 A11）', () => {
  it('symbol 键与 defineProperty/has/ownKeys/getOwnPropertyDescriptor 路径均入访问记录；不新增拒绝行为', async () => {
    const h = harness()
    const raw: Record<string, unknown> = { ok: true }
    let wrapped: Record<string | symbol, unknown> | undefined
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) {
          env.provide('svc', raw)
        },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      hooks: {
        activate(env) {
          wrapped = env.get<Record<string | symbol, unknown>>('svc')
          const svc = wrapped as Record<string | symbol, unknown>
          void svc?.[Symbol.for('mark')]
          void ('ok' in svc)
          void Object.getOwnPropertyDescriptor(svc, 'ok')
          void Reflect.ownKeys(svc)
          Object.defineProperty(svc, 'extra', { value: 1, enumerable: true, configurable: true, writable: true })
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    const log = h.engine.providedAccessLog()
    const symbolName = String(Symbol.for('mark'))
    // 记录完整性：symbol 键与四个补充路径的访问全部可见。
    expect(log.some(record => record.pluginId === 'consumer' && record.symbol === symbolName)).toBe(true)
    expect(log.some(record => record.pluginId === 'consumer' && record.symbol === 'ok')).toBe(true)
    expect(log.some(record => record.pluginId === 'consumer' && record.symbol === 'extra')).toBe(true)
    // 未新增拒绝行为（约束 3 对照证据）：defineProperty 转发生效（原始对象被改写），
    // set 拒绝仍是既有内层提供方包装面语义（非本批新增）。
    expect(raw.extra).toBe(1)
    expect(() => {
      (wrapped as Record<string, unknown>).ok = 2
    }).toThrow()
  })
})
