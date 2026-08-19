/**
 * live rail 核心面测试（r7 P1）：受管块写入/剥除、`[]` 回落、id 撞车
 * 离线预检拒绝与降级、removePatchRows 的 live 块兜底、verifyEntryState
 * 轮询语义。全部 mkdtemp 临时 $DSH_HOME；离线组合预检的 host 组合函数
 * 经 profiles/node_modules 软链供给（同 host healProfilesModuleFallback
 * 形态，软链目标 = 仓内 loader-profile 依赖的 dsh-app-boot 安装副本）。
 * @module @r05en1cu/dsh-mygo/tests/live-rail
 */

import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hasLiveBlock,
  liveBlockPackages,
  liveInstall,
  liveUninstall,
  loaderEntrySnapshot,
  precheckLiveInstall,
  reconcileLiveRailOverlap,
  removePatchRows,
  verifyEntryState,
  writeLiveBlock,
} from '../src/index.ts'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'mygo-live-rail-'))
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

const patchPath = (): string => join(home, 'profiles', 'web', 'cordis.patch.yml')
const readPatch = (): Promise<string> => readFile(patchPath(), 'utf8')

/** 写 bundle 包装置（dsh.bundle.patch 声明 + patch 文件），返回包目录。 */
async function writeBundleFixture(name: string, patchText: string, root?: string): Promise<string> {
  const dir = join(root ?? home, `fixture-${name.replaceAll('/', '_')}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(join(dir, 'cordis.patch.yml'), patchText)
  return dir
}

/** 供给 host 组合函数：profiles/node_modules 软链 dsh-app-boot（heal 形态）。 */
async function healAppBoot(): Promise<void> {
  const anchor = new URL('../../loaders/mygo-loader-profile/package.json', import.meta.url)
  const appBootDir = dirname(createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot/package.json'))
  const scopeDir = join(home, 'profiles', 'node_modules', '@deepseek-ai')
  await mkdir(scopeDir, { recursive: true })
  await symlink(appBootDir, join(scopeDir, 'dsh-app-boot'), 'dir')
}

/** 在 profile node_modules 落一个已安装 bundle（loadProfile 可解析）。 */
async function installBundleFixture(name: string, patchText: string): Promise<void> {
  const dir = join(home, 'profiles', 'web', 'node_modules', ...name.split('/'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(join(dir, 'cordis.patch.yml'), patchText)
}

/** 写 profile manifest（dsh.profile.bundles）。 */
async function writeProfileManifest(bundles: readonly string[]): Promise<void> {
  await writeFile(join(home, 'profiles', 'web', 'package.json'), JSON.stringify({
    name: 'web',
    dependencies: {},
    dsh: { profile: { bundles: [...bundles] } },
  }, null, 2))
}

describe('writeLiveBlock / liveUninstall（受管块写入与剥除）', () => {
  const ROWS = "- insert:\n    - id: live-row\n      name: '@test/live-pkg'\n      config: {note: a}\n"

  it('写入受管块：标记包裹 bundle patch 原文，顶层是合法 YAML 数组', async () => {
    const dir = await writeBundleFixture('@test/live-pkg', ROWS)
    const written = writeLiveBlock(home, 'web', '@test/live-pkg', dir)
    expect(written).toEqual({ ok: true, rowIds: ['live-row'] })
    const text = await readPatch()
    expect(text).toContain('# >>> mygo live block: @test/live-pkg')
    expect(text).toContain('# <<< mygo live block: @test/live-pkg')
    expect(text).toContain('- id: live-row')
    expect(Array.isArray(yaml.load(text))).toBe(true)
    expect(hasLiveBlock(home, 'web', '@test/live-pkg')).toBe(true)
    expect(hasLiveBlock(home, 'web', '@test/other')).toBe(false)
  })

  it('幂等：同包重复写整体替换，不翻倍', async () => {
    const dir = await writeBundleFixture('@test/live-pkg', ROWS)
    writeLiveBlock(home, 'web', '@test/live-pkg', dir)
    writeLiveBlock(home, 'web', '@test/live-pkg', dir)
    const text = await readPatch()
    expect(text.match(/# >>> mygo live block: @test\/live-pkg/g)).toHaveLength(1)
  })

  it('`[]` 占位文档先摘除再追加（不产生 `[]` 后追加的非法形态）', async () => {
    await writeFile(patchPath(), '[]\n')
    const dir = await writeBundleFixture('@test/live-pkg', ROWS)
    writeLiveBlock(home, 'web', '@test/live-pkg', dir)
    const text = await readPatch()
    expect(text.trim().startsWith('[]')).toBe(false)
    expect(Array.isArray(yaml.load(text))).toBe(true)
  })

  it('剥除受管块：无残留回落 `[]`（boot 要求顶层数组）', async () => {
    const dir = await writeBundleFixture('@test/live-pkg', ROWS)
    writeLiveBlock(home, 'web', '@test/live-pkg', dir)
    const removal = liveUninstall(home, 'web', '@test/live-pkg')
    expect(removal).toEqual({ ok: true, rowIds: ['live-row'] })
    expect((await readPatch()).trim()).toBe('[]')
    expect(hasLiveBlock(home, 'web', '@test/live-pkg')).toBe(false)
  })

  it('剥除保留用户行与其他包的 live 块；无块幂等不改写', async () => {
    const liveA = await writeBundleFixture('@test/live-a', ROWS)
    const liveB = await writeBundleFixture('@test/live-b', "- insert:\n    - id: live-b-row\n      name: '@test/live-b'\n")
    writeLiveBlock(home, 'web', '@test/live-a', liveA)
    writeLiveBlock(home, 'web', '@test/live-b', liveB)
    await writeFile(patchPath(), `- id: user-row\n  config:\n    keep: true\n\n${await readPatch()}`)
    const before = await readPatch()
    const removal = liveUninstall(home, 'web', '@test/live-a')
    expect(removal.ok).toBe(true)
    const text = await readPatch()
    expect(text).toContain('- id: user-row')
    expect(text).toContain('# >>> mygo live block: @test/live-b')
    expect(text).not.toContain('@test/live-a')
    // 幂等：再剥一次不改写文件
    const noop = liveUninstall(home, 'web', '@test/live-a')
    expect(noop).toEqual({ ok: true, rowIds: [] })
    expect(await readPatch()).toBe(text)
    expect(before).not.toBe(text)
  })

  it('liveBlockPackages 按出现序列举块包名', async () => {
    const liveA = await writeBundleFixture('@test/live-a', ROWS)
    const liveB = await writeBundleFixture('live-c', "- insert:\n    - id: live-c-row\n      name: 'live-c'\n")
    writeLiveBlock(home, 'web', '@test/live-a', liveA)
    writeLiveBlock(home, 'web', 'live-c', liveB)
    expect(liveBlockPackages(await readPatch())).toEqual(['@test/live-a', 'live-c'])
  })
})

describe('precheckLiveInstall（离线组合预检）', () => {
  it('id 撞车拒绝：新 insert 行 id 与 bundle 层既有行重复', async () => {
    await healAppBoot()
    await installBundleFixture('@test/base-bundle', "- insert:\n    - id: dup-row\n      name: '@test/base-plugin'\n")
    await writeProfileManifest(['@test/base-bundle'])
    const challenger = await writeBundleFixture('@test/challenger', "- insert:\n    - id: dup-row\n      name: '@test/challenger'\n")
    const pre = await precheckLiveInstall(home, 'web', challenger)
    expect(pre.ok).toBe(false)
    expect(pre.error).toContain('dup-row')
    // 不撞车的 id 放行
    const clean = await writeBundleFixture('@test/clean', "- insert:\n    - id: clean-row\n      name: '@test/clean'\n")
    const passed = await precheckLiveInstall(home, 'web', clean)
    expect(passed.ok).toBe(true)
    expect(passed.rowIds).toEqual(['clean-row'])
  })

  it('host 组合不可组合时降级跳过（ok + warn），不阻断安装', async () => {
    await healAppBoot()
    // bundles 引用不可解析的包：loadProfile fail-loud → 预检降级
    await writeProfileManifest(['@test/missing-bundle'])
    const dir = await writeBundleFixture('@test/any', "- insert:\n    - id: any-row\n      name: '@test/any'\n")
    const pre = await precheckLiveInstall(home, 'web', dir)
    expect(pre.ok).toBe(true)
    expect(pre.warnings.length).toBeGreaterThan(0)
  })

  it('liveInstall 组合面：预检通过 → 写块；撞车 → 不写块', async () => {
    await healAppBoot()
    await installBundleFixture('@test/base-bundle', "- insert:\n    - id: dup-row\n      name: '@test/base-plugin'\n")
    await writeProfileManifest(['@test/base-bundle'])
    const challenger = await writeBundleFixture('@test/challenger', "- insert:\n    - id: dup-row\n      name: '@test/challenger'\n")
    const rejected = await liveInstall(home, 'web', '@test/challenger', challenger)
    expect(rejected.ok).toBe(false)
    expect(hasLiveBlock(home, 'web', '@test/challenger')).toBe(false)
    const clean = await writeBundleFixture('@test/clean', "- insert:\n    - id: clean-row\n      name: '@test/clean'\n")
    const installed = await liveInstall(home, 'web', '@test/clean', clean)
    expect(installed.ok).toBe(true)
    expect(installed.rowIds).toEqual(['clean-row'])
    expect(hasLiveBlock(home, 'web', '@test/clean')).toBe(true)
  })
})

describe('removePatchRows 的 live 块兜底', () => {
  it('按 id/scope 末段匹配整块剥除，其余 live 块与用户行不动', async () => {
    const liveA = await writeBundleFixture('@test/live-a', "- insert:\n    - id: live-a-row\n      name: '@test/live-a'\n")
    const liveB = await writeBundleFixture('@test/live-b', "- insert:\n    - id: live-b-row\n      name: '@test/live-b'\n")
    writeLiveBlock(home, 'web', '@test/live-a', liveA)
    writeLiveBlock(home, 'web', '@test/live-b', liveB)
    await writeFile(patchPath(), `- id: user-row\n  config:\n    keep: true\n\n${await readPatch()}`)
    const result = removePatchRows(home, 'web', ['live-a'])
    expect(result).toEqual({ ok: true, removed: ['live-a'] })
    const text = await readPatch()
    expect(text).not.toContain('live-a')
    expect(text).toContain('# >>> mygo live block: @test/live-b')
    expect(text).toContain('- id: user-row')
    expect(Array.isArray(yaml.load(text))).toBe(true)
  })
})

describe('verifyEntryState（写后验证轮询）', () => {
  /** 可变 loader 桩：entries 反映当前 fiber 态。 */
  function fakeLoader(initial: readonly { id: string; active: boolean }[]) {
    let state = [...initial]
    return {
      loader: {
        *entries() {
          for (const entry of state) yield { id: entry.id, ...(entry.active ? { fiber: {} } : {}) }
        },
      },
      setState(next: readonly { id: string; active: boolean }[]): void {
        state = [...next]
      },
    }
  }

  it('active：行出现且 fiber 存活即通过（层级 id 末段匹配）', async () => {
    const fake = fakeLoader([])
    const get = (name: string): unknown => (name === 'loader' ? fake.loader : undefined)
    const pending = verifyEntryState(get, ['live-row'], 'active', 2_000, 20)
    fake.setState([{ id: 'include:live-row', active: true }])
    await expect(pending).resolves.toBe(true)
  })

  it('inactive：fiber dispose（条目残留）与条目移除同口径通过', async () => {
    const fake = fakeLoader([{ id: 'include:live-row', active: true }])
    const get = (name: string): unknown => (name === 'loader' ? fake.loader : undefined)
    const pending = verifyEntryState(get, ['live-row'], 'inactive', 2_000, 20)
    fake.setState([{ id: 'include:live-row', active: false }])
    await expect(pending).resolves.toBe(true)
    // 条目整行移除也通过
    const fake2 = fakeLoader([{ id: 'include:live-row', active: true }])
    const get2 = (name: string): unknown => (name === 'loader' ? fake2.loader : undefined)
    const pending2 = verifyEntryState(get2, ['live-row'], 'inactive', 2_000, 20)
    fake2.setState([])
    await expect(pending2).resolves.toBe(true)
  })

  it('超时返回 false；loader 不可达立即 false', async () => {
    const fake = fakeLoader([])
    const get = (name: string): unknown => (name === 'loader' ? fake.loader : undefined)
    await expect(verifyEntryState(get, ['never-row'], 'active', 60, 20)).resolves.toBe(false)
    await expect(verifyEntryState(() => undefined, ['row'], 'active', 2_000, 20)).resolves.toBe(false)
    expect(loaderEntrySnapshot(() => undefined)).toBeUndefined()
  })
})

describe('reconcileLiveRailOverlap（r7 P5 boot/运行期对账）', () => {
  const ROWS = "- insert:\n    - id: live-row\n      name: '@test/live-pkg'\n"

  it('bundles 与 live 块重叠：剥 live 块（bundle 赢），不重叠的块不动', async () => {
    const liveA = await writeBundleFixture('@test/live-a', ROWS)
    const liveB = await writeBundleFixture('@test/live-b', "- insert:\n    - id: live-b-row\n      name: '@test/live-b'\n")
    writeLiveBlock(home, 'web', '@test/live-a', liveA)
    writeLiveBlock(home, 'web', '@test/live-b', liveB)
    // 官方 CLI 旁路：@test/live-a 被加进 bundles（live 块还在 → 下次 boot 撞车）
    await writeProfileManifest(['@test/live-a'])
    const stripped = reconcileLiveRailOverlap(home, 'web')
    expect(stripped).toEqual(['@test/live-a'])
    expect(hasLiveBlock(home, 'web', '@test/live-a')).toBe(false)
    expect(hasLiveBlock(home, 'web', '@test/live-b')).toBe(true)
    // patch 层仍合法 YAML 数组
    expect(Array.isArray(yaml.load(await readPatch()))).toBe(true)
    // 幂等：再对账无动作
    expect(reconcileLiveRailOverlap(home, 'web')).toEqual([])
  })

  it('无重叠 / manifest 缺失：空结果不改写文件', async () => {
    const liveA = await writeBundleFixture('@test/live-a', ROWS)
    writeLiveBlock(home, 'web', '@test/live-a', liveA)
    await writeProfileManifest([])
    const before = await readPatch()
    expect(reconcileLiveRailOverlap(home, 'web')).toEqual([])
    expect(await readPatch()).toBe(before)
    // manifest 缺失（profile 未初始化形态）
    await rm(join(home, 'profiles', 'web', 'package.json'), { force: true })
    expect(reconcileLiveRailOverlap(home, 'web')).toEqual([])
    expect(await readPatch()).toBe(before)
  })
})
