/**
 * registry auth env 桥测试（rc8 P1）：mock credentials 服务断言 env 收集、
 * missing 名单、空值=不存在、服务缺席降级。全部临时目录。
 * @module @r05en1cu/dsh-mygo/tests/registry-auth
 */

import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upsertRegistry } from '../src/npmrc.ts'
import { resolveProfileEnv, type CredentialsLike } from '../src/registry-auth.ts'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'mygo-registry-auth-'))
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

/** mock credentials 服务：record 存值；空串按官方语义视为不存在。 */
function mockCredentials(record: Record<string, string>): CredentialsLike {
  return {
    resolve: (ref) => {
      const value = record[ref]
      return Promise.resolve(value === undefined || value === '' ? undefined : { value, source: 'file' })
    },
    describe: (ref) => {
      const value = record[ref]
      return Promise.resolve({
        configured: value !== undefined && value !== '',
        ...(value !== undefined && value !== '' ? { source: 'file' } : {}),
        writable: true,
      })
    },
    set: (ref, value) => {
      record[ref] = value
      return Promise.resolve()
    },
    unset: (ref) => {
      delete record[ref]
      return Promise.resolve()
    },
  }
}

describe('resolveProfileEnv（按操作解析进 spawn env）', () => {
  it('受管块 ${REF} 逐个解析为 env 增量；未配置进 missing', async () => {
    const dir = join(home, 'profiles', 'web')
    upsertRegistry(dir, '@a', 'https://a.example.com', 'A_TOKEN')
    upsertRegistry(dir, '@b', 'https://b.example.com', 'B_TOKEN')
    const { env, missing } = await resolveProfileEnv(home, 'web', mockCredentials({ A_TOKEN: 'secret-a' }))
    expect(env).toEqual({ A_TOKEN: 'secret-a' })
    expect(missing).toEqual(['B_TOKEN'])
  })

  it('空值 = 不存在（官方语义）；值变更下次解析即生效（不缓存）', async () => {
    const dir = join(home, 'profiles', 'web')
    upsertRegistry(dir, '@a', 'https://a.example.com', 'A_TOKEN')
    const record: Record<string, string> = { A_TOKEN: '' }
    const credentials = mockCredentials(record)
    const first = await resolveProfileEnv(home, 'web', credentials)
    expect(first.env).toEqual({})
    expect(first.missing).toEqual(['A_TOKEN'])
    record.A_TOKEN = 'rotated'
    const second = await resolveProfileEnv(home, 'web', credentials)
    expect(second.env).toEqual({ A_TOKEN: 'rotated' })
    expect(second.missing).toEqual([])
  })

  it('credentials 服务缺席：全部 missing、env 空（不阻断 spawn）', async () => {
    const dir = join(home, 'profiles', 'web')
    upsertRegistry(dir, '@a', 'https://a.example.com', 'A_TOKEN')
    const { env, missing } = await resolveProfileEnv(home, 'web', undefined)
    expect(env).toEqual({})
    expect(missing).toEqual(['A_TOKEN'])
  })

  it('无受管块/无引用：空结果', async () => {
    const result = await resolveProfileEnv(home, 'web', mockCredentials({}))
    expect(result).toEqual({ env: {}, missing: [] })
  })
})
