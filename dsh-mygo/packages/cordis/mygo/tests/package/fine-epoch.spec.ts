/**
 * 细 epoch + 前置门测试（B13/T14/T15 支撑）：导出快照捕获、纯内存子集比较、
 * 符号别名解析、确定性指纹；成本预算按 A5（10k 符号亚毫秒）。
 */

import { describe, expect, it } from 'vitest'
import {
  captureExports,
  preGate,
  type ProviderSymbolSnapshot,
} from '../../src/package/fine-epoch.ts'
import { ProviderObservationRegistry } from '../../src/package/provider-observations.ts'

describe('fine epoch pre-gate', () => {
  it('captures own and prototype export symbols deterministically (B13)', () => {
    class VoiceService {
      greet(): string { return 'hi' }
      readonly name = 'voice'
    }
    const value = new VoiceService()
    const first = captureExports(value)
    const second = captureExports(value)
    expect(first).toEqual(second)
    expect(first).toContain('greet')
    expect(first).toContain('name')
    expect(captureExports(42)).toEqual([])
  })

  it('pre-gate is a pure in-memory subset check with alias resolution (EB-D19)', () => {
    const snapshot: ProviderSymbolSnapshot = {
      pluginId: 'provider',
      version: '1.0.0',
      exports: ['a', 'c'],
      aliases: { b: 'c' },
    }
    expect(preGate(['a', 'b'], snapshot)).toEqual({ ok: true, missing: [], aliased: ['b'] })
    expect(preGate(['a', 'x'], snapshot)).toEqual({ ok: false, missing: ['x'], aliased: [] })
    expect(preGate(['a'], undefined)).toEqual({ ok: false, missing: ['a'], aliased: [] })
  })
})

describe('provider observation registry (B19)', () => {
  it('records first/last seen, merges, filters candidates and clears with lifecycle', () => {
    const registry = new ProviderObservationRegistry()
    registry.observe('voice-chat', 'alpha', '1.0.0', 100)
    registry.observe('voice-chat', 'beta', '0.2.0', 200)
    registry.observe('voice-chat', 'alpha', '1.0.1', 300)
    registry.observe('other', 'alpha', '1.0.1', 350)

    const candidates = registry.candidates('voice-chat')
    expect(candidates.map(item => item.pluginId)).toEqual(['alpha', 'beta'])
    expect(candidates[0]).toMatchObject({ firstSeen: 100, lastSeen: 300, version: '1.0.1' })

    registry.updateState('voice-chat', 'beta', 'inactive', 400)
    expect(registry.candidates('voice-chat').find(item => item.pluginId === 'beta')?.state).toBe('inactive')

    expect(registry.remove('voice-chat', 'alpha')).toBe(true)
    expect(registry.candidates('voice-chat').map(item => item.pluginId)).toEqual(['beta'])

    registry.clear()
    expect(registry.entries()).toEqual([])
  })
})

describe('键处理镜像（修复批次 2 / review#1 A16）', () => {
  it('自有 constructor/__proto__ 导出收录；原型层过滤防污染', () => {
    const own = Object.defineProperty({ foo: 1 }, 'constructor', { value: 'x', enumerable: true })
    expect(captureExports(own)).toEqual(['constructor', 'foo'])
    const proto = Object.create({ evil: 1 }) as Record<string, unknown>
    proto.bar = 2
    expect(captureExports(proto)).toEqual(['bar', 'evil'])
    class A { m(): number { return 1 } }
    expect(captureExports(new A())).toEqual(['m'])
    expect(captureExports(Object.create(Object.prototype))).toEqual([])
  })
})
