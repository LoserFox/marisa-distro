/**
 * registry/auth 命令面测试（rc8 P3）：参数解析、.npmrc 受管块写入、
 * auth status/set/unset 经 mock credentials 服务（值不进输出）。
 * @module @r05en1cu/dsh-mygo-cli/tests/registry-auth
 */

import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseCliArgs } from '../src/args.ts'
import { internals, invokeCli } from '../src/index.ts'
import type { CliHost } from '../src/index.ts'
import type { CredentialsLike } from '@r05en1cu/dsh-mygo'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME
const originalStdout = internals.stdout
const originalStderr = internals.stderr
let home: string
let out: string[]
let err: string[]

function mockCredentials(writable = true): CredentialsLike & { readonly store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    resolve: (ref) => Promise.resolve(store.has(ref) ? { value: store.get(ref) ?? '', source: 'file' } : undefined),
    describe: (ref) => Promise.resolve({
      configured: store.has(ref),
      ...(store.has(ref) ? { source: 'file' } : {}),
      writable,
    }),
    set: (ref, value) => { store.set(ref, value); return Promise.resolve() },
    unset: (ref) => { store.delete(ref); return Promise.resolve() },
  }
}

function mockCtx(credentials?: CredentialsLike): CliHost {
  return {
    get<T = unknown>(key: string): T | undefined {
      if (key === 'pluginManager') return { profile: 'web' } as T
      if (key === 'credentials') return credentials as T
      return undefined
    },
  }
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'mygo-cli-registry-'))
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  process.env.DSH_HOME = home
  internals.stdout = { write: (chunk: string) => { out.push(chunk) } }
  internals.stderr = { write: (chunk: string) => { err.push(chunk) } }
})

afterAll(async () => {
  internals.stdout = originalStdout
  internals.stderr = originalStderr
  if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_DSH_HOME
  await rm(home, { recursive: true, force: true })
})

function resetOutput(): void {
  out = []
  err = []
}

describe('args 解析（registry/auth）', () => {
  it('registry add 带 --auth-ref；remove；list', () => {
    const added = parseCliArgs(['registry', 'add', '@my-scope', 'https://npm.example.com', '--auth-ref', 'MY_TOKEN'])
    expect(added).toEqual({
      kind: 'command',
      command: { kind: 'registry', verb: 'add', scope: '@my-scope', registry: 'https://npm.example.com', authRef: 'MY_TOKEN', json: false },
    })
    expect(parseCliArgs(['registry', 'remove', '@my-scope'])).toMatchObject({
      kind: 'command', command: { verb: 'remove', scope: '@my-scope' },
    })
    expect(parseCliArgs(['registry', 'list'])).toMatchObject({ kind: 'command', command: { verb: 'list' } })
    expect(parseCliArgs(['registry', 'add', '@my-scope']).kind).toBe('usage-error')
  })

  it('auth set --value-env / status / unset', () => {
    expect(parseCliArgs(['auth', 'set', 'MY_TOKEN', '--value-env', 'GIVEN_ENV'])).toEqual({
      kind: 'command',
      command: { kind: 'auth', verb: 'set', ref: 'MY_TOKEN', valueEnv: 'GIVEN_ENV', json: false },
    })
    expect(parseCliArgs(['auth', 'status'])).toMatchObject({ kind: 'command', command: { verb: 'status' } })
    expect(parseCliArgs(['auth', 'set']).kind).toBe('usage-error')
  })
})

describe('registry 命令（.npmrc 受管块）', () => {
  it('add → list → remove 全链；块删净后文件不留痕', async () => {
    resetOutput()
    expect(await invokeCli(mockCtx(), ['registry', 'add', '@my-scope', 'https://npm.example.com', '--auth-ref', 'MY_TOKEN'])).toBe(0)
    const text = await readFile(join(home, 'profiles', 'web', '.npmrc'), 'utf8')
    expect(text).toContain('@my-scope:registry=https://npm.example.com')
    expect(text).toContain('${MY_TOKEN}')
    expect(text).not.toContain('secret')
    resetOutput()
    expect(await invokeCli(mockCtx(), ['registry', 'list'])).toBe(0)
    expect(out.join('')).toContain('@my-scope -> https://npm.example.com')
    resetOutput()
    expect(await invokeCli(mockCtx(), ['registry', 'remove', '@my-scope'])).toBe(0)
    expect(await readFile(join(home, 'profiles', 'web', '.npmrc'), 'utf8').catch(() => '(deleted)')).toBe('(deleted)')
  })
})

describe('auth 命令（官方 credentials 语义）', () => {
  it('set --value-env → status 已配置 → unset；值不进任何输出', async () => {
    const credentials = mockCredentials()
    process.env.GIVEN_SECRET = 'ultra-secret-value'
    try {
      resetOutput()
      expect(await invokeCli(mockCtx(credentials), ['auth', 'set', 'MY_TOKEN', '--value-env', 'GIVEN_SECRET'])).toBe(0)
      expect(credentials.store.get('MY_TOKEN')).toBe('ultra-secret-value')
      expect(out.join('') + err.join('')).not.toContain('ultra-secret-value')
      resetOutput()
      expect(await invokeCli(mockCtx(credentials), ['auth', 'status', 'MY_TOKEN'])).toBe(0)
      expect(out.join('')).toContain('MY_TOKEN')
      expect(out.join('')).toContain('已配置')
      resetOutput()
      expect(await invokeCli(mockCtx(credentials), ['auth', 'unset', 'MY_TOKEN'])).toBe(0)
      expect(credentials.store.has('MY_TOKEN')).toBe(false)
    } finally {
      delete process.env.GIVEN_SECRET
    }
  })

  it('env 遮蔽（writable:false）拒绝 set；服务缺席报错', async () => {
    const shadowed = mockCredentials(false)
    resetOutput()
    process.env.GIVEN_SECRET = 'x'
    try {
      expect(await invokeCli(mockCtx(shadowed), ['auth', 'set', 'MY_TOKEN', '--value-env', 'GIVEN_SECRET'])).toBe(1)
      expect(shadowed.store.has('MY_TOKEN')).toBe(false)
      expect(err.join('')).toContain('遮蔽')
      resetOutput()
      expect(await invokeCli(mockCtx(undefined), ['auth', 'status'])).toBe(1)
      expect(err.join('')).toContain('不可达')
    } finally {
      delete process.env.GIVEN_SECRET
    }
  })
})
