/**
 * 凭据写路由测试（rc8 P2）：服务缺席 503、env 遮蔽 409 + writable:false、
 * 空值拒绝、set/unset 响应不携带值。mock credentials 服务直测导出函数。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/credential-route
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { routeCredentialMutation as RouteCredentialMutation } from '../src/index.ts'
import type { CredentialsLike } from '@r05en1cu/dsh-mygo'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME
let home: string
let route: typeof RouteCredentialMutation

beforeAll(async () => {
  // 面板模块 HOME_ROOT 在 import 时定型——先设临时 DSH_HOME 再动态导入。
  home = await mkdtemp(join(tmpdir(), 'mygo-cred-route-'))
  process.env.DSH_HOME = home
  route = (await import('../src/index.ts')).routeCredentialMutation
})

afterAll(async () => {
  if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_DSH_HOME
  await rm(home, { recursive: true, force: true })
})

function mockCredentials(opts: { readonly writable?: boolean } = {}) {
  const store = new Map<string, string>()
  const calls: string[] = []
  const service: CredentialsLike = {
    resolve: (ref) => {
      const value = store.get(ref)
      return Promise.resolve(value === undefined ? undefined : { value, source: 'file' })
    },
    describe: (ref) => Promise.resolve({
      configured: store.has(ref),
      ...(store.has(ref) ? { source: 'file' } : {}),
      writable: opts.writable ?? true,
    }),
    set: (ref, value) => {
      calls.push(`set:${ref}`)
      store.set(ref, value)
      return Promise.resolve()
    },
    unset: (ref) => {
      calls.push(`unset:${ref}`)
      store.delete(ref)
      return Promise.resolve()
    },
  }
  return { service, store, calls }
}

describe('routeCredentialMutation（凭据设/删路由）', () => {
  it('set：值进 store；响应不携带值', async () => {
    const { service, store, calls } = mockCredentials()
    const result = await route(service, 'PUT', 'MY_TOKEN', 'super-secret-value')
    expect(result.status).toBe(200)
    expect(calls).toEqual(['set:MY_TOKEN'])
    expect(store.get('MY_TOKEN')).toBe('super-secret-value')
    expect(JSON.stringify(result.body)).not.toContain('super-secret-value')
  })

  it('unset：删除；空值 PUT 拒绝（空值等于不存在）', async () => {
    const { service, store } = mockCredentials()
    store.set('MY_TOKEN', 'x')
    const removed = await route(service, 'DELETE', 'MY_TOKEN')
    expect(removed.status).toBe(200)
    expect(store.has('MY_TOKEN')).toBe(false)
    const empty = await route(service, 'PUT', 'MY_TOKEN', '')
    expect(empty.status).toBe(400)
    expect(store.has('MY_TOKEN')).toBe(false)
  })

  it('env 遮蔽（writable:false）：409 且不动 store', async () => {
    const { service, store, calls } = mockCredentials({ writable: false })
    const result = await route(service, 'PUT', 'MY_TOKEN', 'value')
    expect(result.status).toBe(409)
    expect(result.body.writable).toBe(false)
    expect(result.body.error).toContain('遮蔽')
    expect(calls).toEqual([])
    expect(store.size).toBe(0)
  })

  it('服务缺席：503', async () => {
    const result = await route(undefined, 'PUT', 'MY_TOKEN', 'value')
    expect(result.status).toBe(503)
  })
})
