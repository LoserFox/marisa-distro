/**
 * P5 LoaderAdapterRegistry 单元测试：注册/重复拒绝/注销幂等/发现面确定性/
 * spec 逐适配器解析。纯内存，无 I/O。
 * @module @r05en1cu/dsh-mygo/tests/loader-adapters
 */

import { describe, expect, it } from 'vitest'
import type { InstallIntent, LoaderAdapter } from '@r05en1cu/dsh-mygo-api'
import { BUILTIN_LOADER_ADAPTERS, LoaderAdapterRegistry } from '../src/loader-adapters.ts'

function fakeAdapter(id: string, recognized?: RegExp): LoaderAdapter {
  return {
    id,
    resolve(spec: string): InstallIntent | null {
      if (recognized !== undefined && !recognized.test(spec)) return null
      return { kind: 'pnpm', spec }
    },
    install: () => Promise.resolve({ ok: true }),
  }
}

describe('LoaderAdapterRegistry（P5 loader 扩展体系）', () => {
  it('内置执行面 id 仅 profile', () => {
    expect(BUILTIN_LOADER_ADAPTERS).toEqual(['profile'])
  })

  it('register/list：按 id 字典序的确定性发现面', () => {
    const registry = new LoaderAdapterRegistry()
    registry.register(fakeAdapter('hub'))
    registry.register(fakeAdapter('profile'))
    expect(registry.list().map(adapter => adapter.id)).toEqual(['hub', 'profile'])
    expect(registry.get('hub')?.id).toBe('hub')
    expect(registry.get('nope')).toBeUndefined()
  })

  it('重复 id 与非法 id 拒绝', () => {
    const registry = new LoaderAdapterRegistry()
    registry.register(fakeAdapter('hub'))
    expect(() => registry.register(fakeAdapter('hub'))).toThrow('重复注册拒绝')
    expect(() => registry.register(fakeAdapter('Bad_Id'))).toThrow('非法 loader adapter id')
  })

  it('注销器幂等且只注销同一实例', () => {
    const registry = new LoaderAdapterRegistry()
    const first = fakeAdapter('hub')
    const dispose = registry.register(first)
    dispose()
    expect(registry.get('hub')).toBeUndefined()
    dispose() // 幂等
    // 注销后同 id 可重注册；旧注销器不再影响新实例
    const second = fakeAdapter('hub')
    registry.register(second)
    dispose()
    expect(registry.get('hub')).toBe(second)
  })

  it('resolve：逐适配器试解析，全不识别返回 undefined', () => {
    const registry = new LoaderAdapterRegistry()
    registry.register(fakeAdapter('profile', /^@?[\w/@.-]+$/))
    registry.register(fakeAdapter('hub', /^hub:/))
    expect(registry.resolve('hub:change-ledger')?.adapter.id).toBe('hub')
    expect(registry.resolve('@scope/pkg@1.0.0')?.adapter.id).toBe('profile')
    expect(registry.resolve('hub:change-ledger')?.intent).toEqual({ kind: 'pnpm', spec: 'hub:change-ledger' })
    expect(registry.resolve('\u0000garbage')).toBeUndefined()
  })
})
