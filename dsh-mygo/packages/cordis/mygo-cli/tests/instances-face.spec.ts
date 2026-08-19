/**
 * P4 多实例接管命令面测试：instances / adopt / clone 全链路（args → index
 * → install-face → render）。全部在临时 $DSH_HOME × 2 + 临时
 * MYGO_USER_DIR 内进行（离线）；与 install-face.spec.ts 同风格。
 * @module @r05en1cu/dsh-mygo-cli/tests/instances-face
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listInstances,
  packCacheDir,
  resolveMygoPaths,
  sha256Text,
} from '@r05en1cu/dsh-mygo'
import { parseCliArgs } from '../src/args.ts'
import { invokeCli, internals, type CliHost } from '../src/index.ts'
import { adoptInstance, clonePlugin } from '../src/install.ts'
import { collector } from './helpers.ts'

const ORIGINAL_USER_DIR = process.env.MYGO_USER_DIR

/** 造一个已还原插件目录（含事实文件；与 mygo pack.spec 同款最小形态）。 */
async function seedRestored(home: string, id: string, version: string): Promise<void> {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  const dir = join(paths.packagesRoot, id, version)
  const entryBytes = 'export const apply = () => {}\n'
  const manifest = {
    formatVersion: 1, id, version, entry: 'lib/index.js',
    requires: {}, core: '*',
    recommends: {}, provides: [], entrypoints: {}, bundles: [],
  }
  const factBase = { format: 'dsh.mygo-package/v1', id, version, entry: 'lib/index.js', manifest }
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'lib', 'index.js'), entryBytes)
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: `@test/${id}`, version, main: 'lib/index.js',
    dsh: { mygo: { formatVersion: 1, id, version, entry: 'lib/index.js', core: '*' } },
  }, null, 2))
  await writeFile(join(dir, '.mygo-package.json'), JSON.stringify({
    ...factBase,
    entrySha512: createHash('sha512').update(entryBytes).digest('hex'),
    manifestSha256: sha256Text(JSON.stringify(factBase)),
    installedAt: '2026-08-13T00:00:00.000Z',
  }, null, 2))
}

async function treeOf(dir: string): Promise<readonly string[]> {
  const out: string[] = []
  const walk = async (current: string, prefix: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      out.push(rel)
      if (entry.isDirectory()) await walk(join(current, entry.name), rel)
    }
  }
  await walk(dir, '')
  return out.sort()
}

function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

const bareCtx: CliHost = { get: () => undefined }

describe('多实例接管（instances / adopt / clone）', () => {
  let root: string
  let userDir: string
  let homeA: string
  let homeB: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-instances-face-'))
    userDir = join(root, 'user-dir')
    process.env.MYGO_USER_DIR = userDir
    homeA = join(root, 'home-a')
    homeB = join(root, 'home-b')
    await mkdir(join(homeA, 'profiles', 'web'), { recursive: true })
    await mkdir(join(homeB, 'profiles', 'web'), { recursive: true })
  })

  afterEach(async () => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_USER_DIR === undefined) delete process.env.MYGO_USER_DIR
    else process.env.MYGO_USER_DIR = ORIGINAL_USER_DIR
    await rm(root, { recursive: true, force: true })
  })

  it('args 解析：instances / adopt --home / clone --from --to <id> + 用法错误', () => {
    expect(parseCliArgs(['instances', '--json'])).toEqual({ kind: 'command', command: { kind: 'instances', json: true } })
    expect(parseCliArgs(['adopt', '--home', '/tmp/x'])).toEqual({ kind: 'command', command: { kind: 'adopt', home: '/tmp/x', json: false } })
    expect(parseCliArgs(['clone', '--from', '/a', '--to=/b', 'calc'])).toEqual({
      kind: 'command',
      command: { kind: 'clone', from: '/a', to: '/b', plugin: 'calc', json: false },
    })
    expect(parseCliArgs(['adopt']).kind).toBe('usage-error')
    expect(parseCliArgs(['clone', '--from', '/a', 'calc']).kind).toBe('usage-error')
    expect(parseCliArgs(['clone', '--from', '/a', '--to', '/b', 'Calc']).kind).toBe('usage-error')
    expect(parseCliArgs(['instances', 'extra']).kind).toBe('usage-error')
  })

  it('adopt：登记 + 首次对账（profiles / mygo 版本），对端零写入', async () => {
    await writeFile(join(homeA, 'mygo-self.json'), JSON.stringify({ version: '0.2.0-rc.0' }), 'utf8')
    const before = await treeOf(homeA)
    const outcome = adoptInstance(homeA, { root: userDir })
    expect(outcome.ok).toBe(true)
    expect(outcome.profiles).toEqual(['web'])
    expect(outcome.mygoVersion).toBe('0.2.0-rc.0')
    expect(outcome.record?.home).toBe(resolve(homeA))
    expect(listInstances({ root: userDir })).toHaveLength(1)
    // 不写对端插件状态：对端目录树逐条一致
    expect(await treeOf(homeA)).toEqual(before)
  })

  it('clone 全链路：A 导出 → 共享缓存 → B 还原；第二次导入缓存命中', async () => {
    await seedRestored(homeA, 'calc', '1.0.0')
    adoptInstance(homeA, { root: userDir })
    adoptInstance(homeB, { root: userDir })
    // A 装插件 B 不可见（隔离前提）：B 的还原根为空
    const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
    await expect(readdir(pathsB.packagesRoot)).rejects.toThrow()

    const first = await clonePlugin(homeA, homeB, 'calc', { root: userDir })
    expect(first).toMatchObject({ ok: true, id: 'calc', version: '1.0.0', cacheHit: false, via: 'hardlink' })
    const restored = await readdir(join(pathsB.packagesRoot, 'calc'))
    expect(restored).toEqual(['1.0.0'])
    const fact = JSON.parse(await readFile(join(pathsB.packagesRoot, 'calc', '1.0.0', '.mygo-package.json'), 'utf8')) as { id: string }
    expect(fact.id).toBe('calc')
    // 共享缓存内容寻址落盘
    expect(await readdir(packCacheDir(userDir))).toEqual([`${first.sha512 ?? ''}.mygo-pack`])

    const second = await clonePlugin(homeA, homeB, 'calc', { root: userDir })
    expect(second.ok).toBe(true)
    expect(second.cacheHit).toBe(true)
    expect(second.sha512).toBe(first.sha512)
    expect(await readdir(packCacheDir(userDir))).toHaveLength(1)
  }, 60_000)

  it('clone 拒绝面：未登记 / 同一 HOME / 插件不存在 / HOME 不存在', async () => {
    await seedRestored(homeA, 'calc', '1.0.0')
    adoptInstance(homeA, { root: userDir })
    const unregistered = await clonePlugin(homeA, homeB, 'calc', { root: userDir })
    expect(unregistered.ok).toBe(false)
    expect(unregistered.error).toContain('目标实例未登记')
    adoptInstance(homeB, { root: userDir })
    const same = await clonePlugin(homeA, homeA, 'calc', { root: userDir })
    expect(same.ok).toBe(false)
    expect(same.error).toContain('同一实例')
    const missing = await clonePlugin(homeA, homeB, 'ghost', { root: userDir })
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain('没有已还原的插件 ghost')
    expect(adoptInstance(join(root, 'nowhere'), { root: userDir }).ok).toBe(false)
  })

  it('invokeCli 全链路：instances / adopt / clone --json 信封（无管理器依赖）', async () => {
    await seedRestored(homeA, 'calc', '1.0.0')
    process.env.DSH_HOME = homeB
    try {
      let out = capture()
      expect(await invokeCli(bareCtx, ['adopt', '--home', homeA, '--json'])).toBe(0)
      const adopted = JSON.parse(out.stdout.text()) as { ok: boolean; command: string; profiles: string[] }
      expect(adopted).toMatchObject({ ok: true, command: 'adopt', profiles: ['web'] })

      out = capture()
      expect(await invokeCli(bareCtx, ['adopt', '--home', homeB, '--json'])).toBe(0)

      out = capture()
      expect(await invokeCli(bareCtx, ['instances', '--json'])).toBe(0)
      const listed = JSON.parse(out.stdout.text()) as {
        ok: boolean
        currentHome: string
        instances: readonly { home: string }[]
      }
      expect(listed.ok).toBe(true)
      expect(listed.currentHome).toBe(resolve(homeB))
      expect(listed.instances.map(record => record.home)).toEqual([resolve(homeA), resolve(homeB)])

      out = capture()
      expect(await invokeCli(bareCtx, ['clone', '--from', homeA, '--to', homeB, 'calc', '--json'])).toBe(0)
      const cloned = JSON.parse(out.stdout.text()) as { ok: boolean; id: string; version: string; cacheHit: boolean }
      expect(cloned).toMatchObject({ ok: true, id: 'calc', version: '1.0.0', cacheHit: false })

      // human 渲染面
      out = capture()
      expect(await invokeCli(bareCtx, ['instances'])).toBe(0)
      expect(out.stdout.text()).toContain('已登记实例 2 个')
      expect(out.stdout.text()).toContain(`* ${resolve(homeB)}`)
    } finally {
      delete process.env.DSH_HOME
    }
  }, 60_000)
})
