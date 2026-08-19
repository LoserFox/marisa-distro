/**
 * P8 restore 自动注册测试（mygo-cli）：restore 后 profile package.json
 * dependencies + dsh.profile.bundles 对账断言、幂等重跑、与 dsh plugin
 * add 混装不撞行、--no-register 纯还原。全部临时 $DSH_HOME（离线；
 * 内嵌成员经 file: tarball 安装）。
 * @module @r05en1cu/dsh-mygo-cli/tests/pack-register
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPluginPack, resolveMygoPaths, sha256Text } from '@r05en1cu/dsh-mygo'
import { profileInstall } from '@r05en1cu/dsh-mygo-loader-profile'
import { parseCliArgs } from '../src/args.ts'
import { invokeCli, internals, type CliHost } from '../src/index.ts'
import { collector } from './helpers.ts'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME

function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

function ctxWithProfile(profile: string): CliHost {
  return { get: (key: string) => (key === 'pluginManager' ? { profile } : undefined) }
}

/** 造 store 已还原插件（withBundle = 带 dsh.bundle 声明 + patch 文件）。 */
async function seedRestored(home: string, id: string, withBundle: boolean): Promise<void> {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  const dir = join(paths.packagesRoot, id, '1.0.0')
  const entryBytes = 'export const apply = () => {}\n'
  const manifest = {
    formatVersion: 1, id, version: '1.0.0', entry: 'lib/index.js',
    requires: {}, core: '*',
    recommends: {}, provides: [], entrypoints: {}, bundles: [],
  }
  const factBase = { format: 'dsh.mygo-package/v1', id, version: '1.0.0', entry: 'lib/index.js', manifest }
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'lib', 'index.js'), entryBytes)
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: `@test/${id}`, version: '1.0.0', main: 'lib/index.js',
    dsh: {
      mygo: { formatVersion: 1, id, version: '1.0.0', entry: 'lib/index.js', core: '*' },
      ...(withBundle ? { bundle: { patch: './cordis.patch.yml' } } : {}),
    },
  }, null, 2))
  if (withBundle) await writeFile(join(dir, 'cordis.patch.yml'), '- insert: []\n')
  await writeFile(join(dir, '.mygo-package.json'), JSON.stringify({
    ...factBase,
    entrySha512: createHash('sha512').update(entryBytes).digest('hex'),
    manifestSha256: sha256Text(JSON.stringify(factBase)),
    installedAt: '2026-08-13T00:00:00.000Z',
  }, null, 2))
}

async function readProfileManifest(home: string, profile: string): Promise<{
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly profile?: { readonly bundles?: string[] } }
}> {
  return JSON.parse(await readFile(join(home, 'profiles', profile, 'package.json'), 'utf8')) as never
}

describe('restore 自动注册（P8）', () => {
  let root: string
  let homeA: string
  let homeB: string
  let packPath: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-register-'))
    homeA = join(root, 'home-a')
    homeB = join(root, 'home-b')
    process.env.DSH_HOME = homeB
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeA }).tmpDir, { recursive: true })
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeB }).tmpDir, { recursive: true })
    await seedRestored(homeA, 'bundle-one', true)
    await seedRestored(homeA, 'plain-two', false)
    packPath = join(root, 'mix.mygo-pack')
    const built = await buildPluginPack({
      installRoot: resolveMygoPaths('web', { DSH_HOME: homeA }).packagesRoot,
      tmpDir: resolveMygoPaths('web', { DSH_HOME: homeA }).tmpDir,
      profile: 'web',
      managerVersion: '0.3.0',
    }, { output: packPath, includeCommunityDeps: false })
    if (!built.ok) throw new Error(built.report.summary)
  })

  afterEach(async () => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    await rm(root, { recursive: true, force: true })
  })

  it('args：--ref 多次/--ref=all/混用错误；--no-register 仅 restore', () => {
    expect(parseCliArgs(['pack', '--ref', 'a', '--ref', 'b'])).toMatchObject({ kind: 'command', command: { references: ['a', 'b'] } })
    expect(parseCliArgs(['pack', '--ref=all'])).toMatchObject({ kind: 'command', command: { references: 'all' } })
    expect(parseCliArgs(['pack', '--ref=all', '--ref', 'a']).kind).toBe('usage-error')
    expect(parseCliArgs(['restore', 'x.pack', '--no-register'])).toMatchObject({ kind: 'command', command: { register: false } })
    expect(parseCliArgs(['restore', 'x.pack'])).toMatchObject({ kind: 'command', command: { register: true } })
    expect(parseCliArgs(['pack', '--no-register']).kind).toBe('usage-error')
  })

  it('restore 后自动注册：bundle 包进 bundles 层，普通包仅进 dependencies（提示）', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['restore', packPath, '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as {
      ok: boolean
      registrations: readonly { packageName: string; bundled: boolean }[]
    }
    expect(parsed.ok).toBe(true)
    const byName = new Map(parsed.registrations.map(registration => [registration.packageName, registration.bundled]))
    expect(byName.get('@test/bundle-one')).toBe(true)
    expect(byName.get('@test/plain-two')).toBe(false)
    const manifest = await readProfileManifest(homeB, 'web')
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['@test/bundle-one', '@test/plain-two'])
    expect(manifest.dsh?.profile?.bundles).toContain('@test/bundle-one')
    expect(manifest.dsh?.profile?.bundles).not.toContain('@test/plain-two')
  }, 120_000)

  it('幂等 + 与 dsh plugin add 混装不撞行', async () => {
    // 先经 profile 执行面装一次（等价 dsh plugin add，从 store 目录 link 安装）
    const storeDir = join(resolveMygoPaths('web', { DSH_HOME: homeA }).packagesRoot, 'bundle-one', '1.0.0')
    expect(profileInstall(storeDir, { profile: 'web', home: homeB }).ok).toBe(true)
    // restore（注册面从 pack 内嵌 tarball 装同名包）→ 同包名不产生双行/双账
    const out = capture()
    expect(await invokeCli(ctxWithProfile('web'), ['restore', packPath, '--json'])).toBe(0)
    void out
    // 幂等重跑
    expect(await invokeCli(ctxWithProfile('web'), ['restore', packPath, '--json'])).toBe(0)
    const manifest = await readProfileManifest(homeB, 'web')
    const depNames = Object.keys(manifest.dependencies ?? {})
    expect(depNames.filter(name => name === '@test/bundle-one')).toHaveLength(1)
    expect(depNames.sort()).toEqual(['@test/bundle-one', '@test/plain-two'])
    expect((manifest.dsh?.profile?.bundles ?? []).filter(name => name === '@test/bundle-one')).toHaveLength(1)
  }, 180_000)

  it('--no-register：只还原进 store，profile 不动', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['restore', packPath, '--no-register', '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; registrations: readonly unknown[] }
    expect(parsed.registrations).toEqual([])
    // store 有还原产物
    const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
    expect((await readFile(join(pathsB.packagesRoot, 'bundle-one', '1.0.0', '.mygo-package.json'), 'utf8')).length).toBeGreaterThan(0)
    // profile 目录未创建（零注册副作用）
    await expect(readProfileManifest(homeB, 'web')).rejects.toThrow()
  }, 120_000)
})
