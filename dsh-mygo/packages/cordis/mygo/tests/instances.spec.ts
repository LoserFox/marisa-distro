/**
 * P4 多实例：用户级实例登记处（~/.dsh-mygo/instances.json）与 HOME 隔离闸
 * （assertInsideHome）单元测试。全部在临时 MYGO_USER_DIR / 临时 HOME 内
 * 进行，严禁碰真实用户级目录与真实实例。
 * @module @r05en1cu/dsh-mygo/tests/instances
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  INSTANCES_FORMAT,
  isInstanceRegistered,
  listInstances,
  registerInstance,
  unregisterInstance,
} from '../src/instances.ts'
import { assertInsideHome } from '../src/package/paths.ts'

describe('InstanceRegistry（用户级实例登记处）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-instances-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('register/list/unregister 往返：upsert by home，按 home 字典序', async () => {
    const homeB = join(root, 'home-b')
    const homeA = join(root, 'home-a')
    await mkdir(homeA, { recursive: true })
    await mkdir(homeB, { recursive: true })
    const first = registerInstance({ home: homeB, dshVersion: '0.1.0-rc.6' }, { root, now: () => new Date('2026-08-13T01:00:00.000Z') })
    expect(first).toEqual({ home: resolve(homeB), dshVersion: '0.1.0-rc.6', lastSeenAt: '2026-08-13T01:00:00.000Z' })
    registerInstance({ home: homeA }, { root, now: () => new Date('2026-08-13T01:01:00.000Z') })
    const listed = listInstances({ root })
    expect(listed.map(record => record.home)).toEqual([resolve(homeA), resolve(homeB)])
    // 每实例仅存三项，不存插件账
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual(['home', 'lastSeenAt'])
    expect(isInstanceRegistered(homeA, { root })).toBe(true)
    expect(unregisterInstance(homeA, { root })).toBe(true)
    expect(unregisterInstance(homeA, { root })).toBe(false)
    expect(listInstances({ root }).map(record => record.home)).toEqual([resolve(homeB)])
  })

  it('重复登记刷新 lastSeenAt；dshVersion 缺省保留既有值', () => {
    const home = join(root, 'home-a')
    registerInstance({ home, dshVersion: '0.1.0-rc.6' }, { root, now: () => new Date('2026-08-13T01:00:00.000Z') })
    const again = registerInstance({ home }, { root, now: () => new Date('2026-08-13T02:00:00.000Z') })
    expect(again.lastSeenAt).toBe('2026-08-13T02:00:00.000Z')
    expect(again.dshVersion).toBe('0.1.0-rc.6')
    expect(listInstances({ root })).toHaveLength(1)
    const updated = registerInstance({ home, dshVersion: '0.1.0-rc.7' }, { root, now: () => new Date('2026-08-13T03:00:00.000Z') })
    expect(updated.dshVersion).toBe('0.1.0-rc.7')
  })

  it('文件缺失/损坏/格式不符 → 空表（发现面不构成硬事实）', async () => {
    expect(listInstances({ root })).toEqual([])
    await writeFile(join(root, 'instances.json'), 'not json', 'utf8')
    expect(listInstances({ root })).toEqual([])
    await writeFile(join(root, 'instances.json'), JSON.stringify({ format: 'other/v9', instances: [] }), 'utf8')
    expect(listInstances({ root })).toEqual([])
  })

  it('写入产物为 dsh.mygo-instances/v1 且原子发布（无 staging 残留）', async () => {
    registerInstance({ home: join(root, 'home-a') }, { root })
    const raw = JSON.parse(await readFile(join(root, 'instances.json'), 'utf8')) as { format?: string }
    expect(raw.format).toBe(INSTANCES_FORMAT)
    const { readdir } = await import('node:fs/promises')
    expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('锁语义（P7-B10）：正常路径持锁落锁；残留锁超时 fail-open；陈旧锁接管', async () => {
    const { mkdir, utimes, readdir } = await import('node:fs/promises')
    const lockDir = join(root, '.instances.lock')
    // 正常路径：锁目录用后即释
    registerInstance({ home: join(root, 'home-a') }, { root })
    expect((await readdir(root)).filter(name => name.includes('.lock'))).toEqual([])
    // 残留新鲜锁：超时 fail-open，写入仍完成
    await mkdir(lockDir)
    registerInstance({ home: join(root, 'home-b') }, { root, lockWaitMs: 50 })
    expect(isInstanceRegistered(join(root, 'home-b'), { root })).toBe(true)
    // 陈旧锁（holder 崩溃残留）：立即接管
    await utimes(lockDir, new Date('2020-01-01'), new Date('2020-01-01'))
    registerInstance({ home: join(root, 'home-c') }, { root, lockStaleMs: 1000 })
    expect(isInstanceRegistered(join(root, 'home-c'), { root })).toBe(true)
    expect(listInstances({ root })).toHaveLength(3)
  })
})

describe('assertInsideHome（HOME 隔离闸）', () => {
  it('HOME 内目标放行并归一', () => {
    const home = join(tmpdir(), 'mygo-home-x')
    expect(assertInsideHome(home, join(home, 'mygo', 'packages'))).toBe(resolve(home, 'mygo', 'packages'))
    expect(assertInsideHome(home, home)).toBe(resolve(home))
  })

  it('跨 HOME 写被拒绝：相对逃逸与绝对他 HOME 一律抛出', () => {
    const homeA = join(tmpdir(), 'mygo-home-a')
    const homeB = join(tmpdir(), 'mygo-home-b')
    expect(() => assertInsideHome(homeA, join(homeB, 'mygo'))).toThrow('逃出实例 HOME')
    expect(() => assertInsideHome(homeA, join(homeA, '..', 'etc'))).toThrow('逃出实例 HOME')
    // 前缀近似目录（home-a2 不以 home-a/ 开头）同样拒绝
    expect(() => assertInsideHome(homeA, `${homeA}2/mygo`)).toThrow('逃出实例 HOME')
  })
})
