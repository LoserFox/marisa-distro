/**
 * 安装执行面测试（P3 原生形态）：pnpm add/remove + dsh.bundle 对账 +
 * cordis.patch.yml disabled 块写入/移除。全部在临时 $DSH_HOME 与本地
 * file: 包内进行（离线）。
 * @module @r05en1cu/dsh-mygo-cli/tests/install-face
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { profileInstall, profileSetEnabled, profileUninstall } from '../src/install.ts'

describe('安装执行面（profile pnpm + bundle 对账 + disabled 块）', () => {
  let home: string
  let fixtureDir: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-install-face-'))
    fixtureDir = join(home, 'fixture-pkgs')
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  async function writeBundleFixture(name: string, withPatch: boolean): Promise<string> {
    const dir = join(fixtureDir, name.replace('/', '_'))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      ...(withPatch ? { dsh: { bundle: { patch: './cordis.patch.yml' } } } : {}),
    }, null, 2))
    if (withPatch) await writeFile(join(dir, 'cordis.patch.yml'), '- insert: []\n')
    return dir
  }

  async function profileManifest(profile: string): Promise<{
    readonly dependencies?: Record<string, string>
    readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
  }> {
    return JSON.parse(await readFile(join(home, 'profiles', profile, 'package.json'), 'utf8')) as never
  }

  it('install：file: 包装入后 dsh.bundle 声明进入 dsh.profile.bundles', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-a', true)
    const plainDir = await writeBundleFixture('@test/plain-b', false)
    const install = profileInstall(bundleDir, { profile: 'face', home })
    expect(install.ok).toBe(true)
    expect(install.bundles).toContain('@test/bundle-a')
    const second = profileInstall(plainDir, { profile: 'face', home })
    expect(second.ok).toBe(true)
    // 模板 bundle（dsh-base）是 profile 自带层，不受依赖对账影响。
    expect(second.bundles).toEqual(['@deepseek-ai/dsh-base', '@test/bundle-a'])
    const manifest = await profileManifest('face')
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['@test/bundle-a', '@test/plain-b'])
  }, 60_000)

  it('uninstall：移除依赖并把 bundle 从层列表对账出去', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-a', true)
    expect(profileInstall(bundleDir, { profile: 'face', home }).ok).toBe(true)
    const outcome = profileUninstall('@test/bundle-a', { profile: 'face', home })
    expect(outcome.ok).toBe(true)
    expect(outcome.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(Object.keys(await profileManifest('face').dependencies ?? {})).toEqual([])
  }, 60_000)

  it('disable/enable：disabled 块写入与移除（幂等）', async () => {
    const disable = profileSetEnabled('dsh-mygo-cli', false, { profile: 'face', home })
    expect(disable.ok).toBe(true)
    const patchPath = join(home, 'profiles', 'face', 'cordis.patch.yml')
    const text = await readFile(patchPath, 'utf8')
    expect(text).toContain('- id: dsh-mygo-cli')
    expect(text).toContain('disabled: true')
    // 幂等：重复 disable 不叠加块
    expect(profileSetEnabled('dsh-mygo-cli', false, { profile: 'face', home }).ok).toBe(true)
    const again = await readFile(patchPath, 'utf8')
    expect(again.match(/disabled: true/g)).toHaveLength(1)
    // enable 移除块
    expect(profileSetEnabled('dsh-mygo-cli', true, { profile: 'face', home }).ok).toBe(true)
    const enabled = await readFile(patchPath, 'utf8')
    expect(enabled).not.toContain('disabled: true')
  })
})
