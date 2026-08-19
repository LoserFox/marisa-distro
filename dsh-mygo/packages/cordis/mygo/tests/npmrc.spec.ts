/**
 * npmrc 受管写入器测试（rc8 P1）：upsert/remove 幂等、块外用户行逐字节
 * 保留、删净后块与文件不留痕、${REF} 收集。全部临时目录。
 * @module @r05en1cu/dsh-mygo/tests/npmrc
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NPMRC_BLOCK_BEGIN,
  NPMRC_BLOCK_END,
  collectAuthRefs,
  listRegistries,
  readNpmrc,
  removeRegistry,
  upsertRegistry,
} from '../src/npmrc.ts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mygo-npmrc-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('upsertRegistry / listRegistries', () => {
  it('写入受管块（registry 行 + ${REF} auth 行），幂等覆盖同 scope', async () => {
    expect(upsertRegistry(dir, '@my-scope', 'https://npm.example.com', 'MY_SCOPE_TOKEN').ok).toBe(true)
    const text = await readFile(join(dir, '.npmrc'), 'utf8')
    expect(text).toContain(NPMRC_BLOCK_BEGIN)
    expect(text).toContain('@my-scope:registry=https://npm.example.com')
    expect(text).toContain('//npm.example.com/:_authToken=${MY_SCOPE_TOKEN}')
    expect(text).toContain(NPMRC_BLOCK_END)
    expect(listRegistries(dir)).toEqual([
      { scope: '@my-scope', registry: 'https://npm.example.com', authRef: 'MY_SCOPE_TOKEN' },
    ])
    // 幂等覆盖（换 URL/换 ref）：块不翻倍
    expect(upsertRegistry(dir, '@my-scope', 'https://npm2.example.com', 'OTHER_TOKEN').ok).toBe(true)
    const next = await readFile(join(dir, '.npmrc'), 'utf8')
    expect(next.match(/mygo registry auth/g)).toHaveLength(2) // begin+end 各一次
    expect(listRegistries(dir)).toEqual([
      { scope: '@my-scope', registry: 'https://npm2.example.com', authRef: 'OTHER_TOKEN' },
    ])
  })

  it('无 authRef 的绑定只写 registry 行；非法输入拒绝且不写盘', async () => {
    expect(upsertRegistry(dir, '@plain', 'https://npm.example.com').ok).toBe(true)
    expect(listRegistries(dir)).toEqual([{ scope: '@plain', registry: 'https://npm.example.com' }])
    expect(readNpmrc(dir)).not.toContain('_authToken')
    expect(upsertRegistry(dir, 'no-at', 'https://npm.example.com').ok).toBe(false)
    expect(upsertRegistry(dir, '@ok', 'not-a-url').ok).toBe(false)
    expect(upsertRegistry(dir, '@ok', 'https://npm.example.com', 'bad-ref').ok).toBe(false)
    expect(listRegistries(dir)).toHaveLength(1)
  })

  it('块外用户行逐字节保留（含其他 ini 键）', async () => {
    await writeFile(join(dir, '.npmrc'), 'save-exact=true\n# 用户注释\n')
    upsertRegistry(dir, '@my-scope', 'https://npm.example.com', 'MY_TOKEN')
    const text = readNpmrc(dir)
    expect(text).toContain('save-exact=true')
    expect(text).toContain('# 用户注释')
    removeRegistry(dir, '@my-scope')
    const after = readNpmrc(dir)
    expect(after).toContain('save-exact=true')
    expect(after).toContain('# 用户注释')
    expect(after).not.toContain('mygo registry auth')
  })
})

describe('removeRegistry / collectAuthRefs', () => {
  it('最后一个绑定移除后删块；文件无残留内容则删文件', async () => {
    upsertRegistry(dir, '@only', 'https://npm.example.com', 'ONLY_TOKEN')
    expect(existsSync(join(dir, '.npmrc'))).toBe(true)
    expect(removeRegistry(dir, '@only')).toEqual({ ok: true, removed: true })
    expect(existsSync(join(dir, '.npmrc'))).toBe(false)
    // 幂等
    expect(removeRegistry(dir, '@only')).toEqual({ ok: true, removed: false })
  })

  it('collectAuthRefs 只扫受管块内 ${REF}（块外同名不算）', async () => {
    await writeFile(join(dir, '.npmrc'), '//elsewhere/:_authToken=${OUTSIDE_REF}\n')
    upsertRegistry(dir, '@a', 'https://a.example.com', 'A_TOKEN')
    upsertRegistry(dir, '@b', 'https://b.example.com', 'B_TOKEN')
    expect(collectAuthRefs(dir)).toEqual(['A_TOKEN', 'B_TOKEN'])
  })
})
