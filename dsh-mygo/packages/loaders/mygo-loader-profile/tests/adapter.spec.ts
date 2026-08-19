/**
 * profile LoaderAdapter 测试（P5）：spec 分类 + adapter 经临时 $DSH_HOME
 * profile 的安装/卸载/启停（离线 file: 包装置；与 mygo-cli
 * install-face.spec 同风格，验证执行面收敛后行为不变）。
 * @module @r05en1cu/dsh-mygo-loader-profile/tests/adapter
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeLiveBlock, hasLiveBlock } from '@r05en1cu/dsh-mygo'
import { createProfileLoaderAdapter, resolveProfileSpec } from '../src/index.ts'

describe('resolveProfileSpec（四种 spec + 拒绝面）', () => {
  it('npm 包名（可带区间）', () => {
    expect(resolveProfileSpec('lodash')).toEqual({ kind: 'pnpm', spec: 'lodash' })
    expect(resolveProfileSpec('@scope/pkg@^1.0.0')).toEqual({ kind: 'pnpm', spec: '@scope/pkg@^1.0.0' })
    expect(resolveProfileSpec('@scope/pkg')).toEqual({ kind: 'pnpm', spec: '@scope/pkg' })
  })

  it('git spec / tarball / 本地目录', () => {
    expect(resolveProfileSpec('git+https://github.com/a/b.git#c'.padEnd(60, '0'))?.kind).toBe('pnpm')
    expect(resolveProfileSpec('github:owner/repo#abc')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('./pkg-1.0.0.tgz')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('file:/tmp/pkg-1.0.0.tar.gz')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('./local-dir')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('../up')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('/abs/dir')?.kind).toBe('pnpm')
    expect(resolveProfileSpec('file:./rel')?.kind).toBe('pnpm')
  })

  it('不识别返回 null（交给下一个适配器）', () => {
    expect(resolveProfileSpec('')).toBeNull()
    expect(resolveProfileSpec('hub:change-ledger')).toBeNull()
    expect(resolveProfileSpec(' spaced ')).toBeNull()
    expect(resolveProfileSpec('Bad Name')).toBeNull()
  })
})

describe('ProfileLoaderAdapter（执行面收敛后行为不变）', () => {
  let home: string
  let fixtureDir: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-loader-profile-'))
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

  it('install：pnpm intent 落 pnpm + dsh.bundle 对账进 bundles', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-a', true)
    const adapter = createProfileLoaderAdapter()
    const intent = adapter.resolve(bundleDir)
    expect(intent).toEqual({ kind: 'pnpm', spec: bundleDir })
    const receipt = await adapter.install(intent ?? { kind: 'display', reason: 'x' }, { home, profile: 'face' })
    expect(receipt.ok).toBe(true)
    expect(receipt.bundles).toContain('@test/bundle-a')
  }, 60_000)

  it('install：非 pnpm intent 拒绝（display/pack 不经本执行面）', async () => {
    const adapter = createProfileLoaderAdapter()
    const receipt = await adapter.install({ kind: 'display', reason: 'guided' }, { home, profile: 'face' })
    expect(receipt.ok).toBe(false)
    expect(receipt.error?.code).toBe('package-not-resolvable')
    expect(receipt.error?.message).toContain('只执行 pnpm intent')
  })

  it('install：live rail 受管块在管的包不进 bundles（r7 单轨排除）', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-live', true)
    // 预写 live 受管块（模拟 live rail 已接管该包的物化）
    await mkdir(join(home, 'profiles', 'face'), { recursive: true })
    expect(writeLiveBlock(home, 'face', '@test/bundle-live', bundleDir).ok).toBe(true)
    const adapter = createProfileLoaderAdapter()
    const receipt = await adapter.install({ kind: 'pnpm', spec: bundleDir }, { home, profile: 'face' })
    expect(receipt.ok).toBe(true)
    expect(receipt.bundles).not.toContain('@test/bundle-live')
    expect(receipt.live).toBe(true)
    // 依赖落盘但 bundles 无该包（live 块接管）
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'face', 'package.json'), 'utf8')) as {
      readonly dependencies?: Record<string, string>
      readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
    }
    expect(Object.keys(manifest.dependencies ?? {})).toContain('@test/bundle-live')
    expect(manifest.dsh?.profile?.bundles ?? []).not.toContain('@test/bundle-live')
    // 无 live 块的对照包照常进 bundles
    const plainDir = await writeBundleFixture('@test/bundle-plain', true)
    const plain = await adapter.install({ kind: 'pnpm', spec: plainDir }, { home, profile: 'face' })
    expect(plain.ok).toBe(true)
    expect(plain.bundles).toContain('@test/bundle-plain')
    expect(plain.live).toBe(false)
    expect(plain.activated).toBe('pending-restart')
  }, 60_000)

  it('uninstall：live rail 包先剥受管块再 pnpm remove（r7 对齐）', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-live-rm', true)
    // live 轨盘态：受管块先于安装写入（reconcile 单轨排除 → 不进 bundles）
    await mkdir(join(home, 'profiles', 'face'), { recursive: true })
    expect(writeLiveBlock(home, 'face', '@test/bundle-live-rm', bundleDir).ok).toBe(true)
    const adapter = createProfileLoaderAdapter()
    const target = { home, profile: 'face' }
    const receipt = await adapter.install({ kind: 'pnpm', spec: bundleDir }, target)
    expect(receipt.ok).toBe(true)
    expect(receipt.bundles).not.toContain('@test/bundle-live-rm')
    expect(receipt.live).toBe(true)
    expect(receipt.activated).toBe('live')
    const removed = adapter.uninstall('@test/bundle-live-rm', target)
    expect(removed.ok).toBe(true)
    expect(removed.liveStripped).toBe(true)
    expect(hasLiveBlock(home, 'face', '@test/bundle-live-rm')).toBe(false)
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'face', 'package.json'), 'utf8')) as {
      readonly dependencies?: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@test/bundle-live-rm')
  }, 60_000)

  it('uninstall / setEnabled：扩展面对账与 patch 块写入', async () => {
    const bundleDir = await writeBundleFixture('@test/bundle-a', true)
    const adapter = createProfileLoaderAdapter()
    const target = { home, profile: 'face' }
    const receipt = await adapter.install({ kind: 'pnpm', spec: bundleDir }, target)
    expect(receipt.ok).toBe(true)
    const removed = adapter.uninstall('@test/bundle-a', target)
    expect(removed.ok).toBe(true)
    expect(removed.bundles).toEqual(['@deepseek-ai/dsh-base'])
    const disabled = adapter.setEnabled('dsh-mygo-cli', false, target)
    expect(disabled.ok).toBe(true)
    const patch = await readFile(join(home, 'profiles', 'face', 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('- id: dsh-mygo-cli')
    expect(patch).toContain('disabled: true')
    expect(adapter.setEnabled('dsh-mygo-cli', true, target).ok).toBe(true)
    expect(await readFile(join(home, 'profiles', 'face', 'cordis.patch.yml'), 'utf8')).not.toContain('disabled: true')
  }, 60_000)
})
