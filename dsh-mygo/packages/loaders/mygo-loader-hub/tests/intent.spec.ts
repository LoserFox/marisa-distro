/**
 * hub intent 翻译 / 可安装判定 / collections 原子安装 / adapter 测试（P5）。
 * 全部离线（探针与执行面均注入桩）。
 * @module @r05en1cu/dsh-mygo-loader-hub/tests/intent
 */

import { describe, expect, it } from 'vitest'
import type { InstallIntent, InstallTarget } from '@r05en1cu/dsh-mygo-api'
import { createHubLoaderAdapter } from '../src/adapter.ts'
import { assessHubEntry, pickHubRelease } from '../src/assess.ts'
import { installHubCollection } from '../src/collections.ts'
import {
  REPOSITORY_TRACK_REMOVED,
  createRepositoryBundleProbe,
  translateHubInstall,
} from '../src/intent.ts'
import type { HubEntry, HubFetch, HubRegistry } from '../src/registry.ts'

const GIT_SPEC = 'git+https://github.com/dsh-external/dsh-inspect.git#0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a'
const REPO_SPEC = 'github:owner/repo#1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b&path:/plugins/x/.dsh-plugin'

function entryFixture(overrides: Partial<HubEntry> = {}): HubEntry {
  return {
    id: 'demo',
    displayName: 'Demo',
    description: 'demo entry',
    kind: 'plugin',
    tags: ['demo'],
    author: { name: 'tester' },
    version: '1.0.0',
    license: 'MIT',
    risk: { level: 'low', facts: { vulnerabilityScan: 'passed' } },
    listing: { state: 'reviewed' },
    maintenance: { state: 'active' },
    install: { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '1.0.0' },
    latestRelease: 'demo@1.0.0',
    releases: [{
      id: 'demo@1.0.0',
      version: '1.0.0',
      ref: 'a'.repeat(40),
      updatedAt: '2026-08-09T00:00:00.000Z',
      channel: 'stable',
      install: { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '1.0.0' },
    }],
    ...overrides,
  } as HubEntry
}

function registryFixture(entries: readonly HubEntry[], collections: HubRegistry['collections'] = []): HubRegistry {
  return {
    schema: 'omdsh-registry/v1',
    revision: 1,
    generatedAt: '2026-08-09T00:00:00.000Z',
    origins: [],
    entries,
    collections,
    snapshotId: 'sha256:' + '0'.repeat(64),
    signature: null,
  }
}

describe('translateHubInstall', () => {
  it('profile-bundle：精确 semver 归一 name@version；钉 commit git 原样', async () => {
    const semver = await translateHubInstall({ mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '1.0.0' })
    expect(semver).toEqual({ kind: 'pnpm', spec: '@test/demo@1.0.0', packageName: '@test/demo', experimental: false })
    const git = await translateHubInstall({ mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: GIT_SPEC })
    expect(git).toEqual({ kind: 'pnpm', spec: GIT_SPEC, packageName: '@test/demo', experimental: false })
  })

  it('profile-bundle：区间 spec 拒绝；file: spec 仅本地快照放行', async () => {
    const range = await translateHubInstall({ mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '^1.0.0' })
    expect(range.kind).toBe('display')
    const file = await translateHubInstall({ mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: 'file:/tmp/demo.tgz' })
    expect(file.kind).toBe('display')
    const fileAllowed = await translateHubInstall(
      { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: 'file:/tmp/demo.tgz' },
      { allowFileSpec: true },
    )
    expect(fileAllowed).toEqual({ kind: 'pnpm', spec: 'file:/tmp/demo.tgz', packageName: '@test/demo', experimental: false })
  })

  it('guided/* → display（只展示，说明无安装意图）', async () => {
    const guided = await translateHubInstall({ mode: 'guided', method: 'manual' })
    expect(guided.kind).toBe('display')
    if (guided.kind === 'display') expect(guided.reason).toContain('guided/manual')
  })

  it('repository-plugin：默认拒绝（安装轨 0812 已删除）；探针命中 dsh.bundle → 实验性放行', async () => {
    const rejected = await translateHubInstall({ mode: 'repository-plugin', adapter: 'official-repository/v1', spec: REPO_SPEC })
    expect(rejected.kind).toBe('display')
    if (rejected.kind === 'display') expect(rejected.reason).toBe(REPOSITORY_TRACK_REMOVED)
    const probeFalse = await translateHubInstall(
      { mode: 'repository-plugin', adapter: 'official-repository/v1', spec: REPO_SPEC },
      { probeRepositoryBundle: () => Promise.resolve(false) },
    )
    expect(probeFalse.kind).toBe('display')
    const probeTrue = await translateHubInstall(
      { mode: 'repository-plugin', adapter: 'official-repository/v1', spec: REPO_SPEC },
      { probeRepositoryBundle: () => Promise.resolve(true) },
    )
    expect(probeTrue).toEqual({ kind: 'pnpm', spec: REPO_SPEC, packageName: '', experimental: true })
  })

  it('默认探针：raw 地址钉 commit 取 package.json，dsh.bundle 声明存在才放行', async () => {
    const seen: string[] = []
    const fetchImpl: HubFetch = (url) => {
      seen.push(url)
      const body = url.includes('/with-bundle/')
        ? JSON.stringify({ name: 'x', dsh: { bundle: { patch: './cordis.patch.yml' } } })
        : JSON.stringify({ name: 'x' })
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) })
    }
    const probe = createRepositoryBundleProbe(fetchImpl)
    const withBundle = 'github:owner/with-bundle#1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b&path:/plugins/x/.dsh-plugin'
    expect(await probe(withBundle)).toBe(true)
    expect(seen[0]).toBe('https://raw.githubusercontent.com/owner/with-bundle/1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b/plugins/x/.dsh-plugin/package.json')
    expect(await probe(REPO_SPEC)).toBe(false)
    const failing: HubFetch = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
    expect(await createRepositoryBundleProbe(failing)(REPO_SPEC)).toBe(false)
  })
})

describe('assessHubEntry（可安装判定 + 治理元数据提示）', () => {
  it('正常条目：installable，无 blocks', () => {
    const assessment = assessHubEntry(entryFixture())
    expect(assessment.installable).toBe(true)
    expect(assessment.blocks).toEqual([])
  })

  it('blocked 条目硬拒；release 缺失硬拒', () => {
    const blocked = assessHubEntry(entryFixture({ listing: { state: 'blocked' } }))
    expect(blocked.installable).toBe(false)
    expect(blocked.blocks[0]).toContain('blocked')
    const missing = assessHubEntry(entryFixture(), 'demo@9.9.9')
    expect(missing.installable).toBe(false)
    expect(missing.blocks[0]).toContain('release 不存在')
  })

  it('risk/maintenance/relations/capabilities 进建议式提示（不阻断）', () => {
    const assessment = assessHubEntry(entryFixture({
      risk: { level: 'high', facts: { vulnerabilityScan: 'findings', nativeCode: 'present', installScripts: 'present' } },
      maintenance: { state: 'deprecated', notice: '用后继者' },
      relations: { required: [{ projectId: 'base-x', releaseId: 'base-x@1.0.0' }] },
      releases: [{
        id: 'demo@1.0.0',
        version: '1.0.0',
        ref: 'a'.repeat(40),
        updatedAt: '2026-08-09T00:00:00.000Z',
        channel: 'stable',
        install: { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '1.0.0' },
        capabilities: { requiresFabric: true, restartRequired: true },
      }],
    }))
    expect(assessment.installable).toBe(true)
    const text = assessment.advisories.join('\n')
    expect(text).toContain('风险分级 high')
    expect(text).toContain('vulnerabilityScan = findings')
    expect(text).toContain('nativeCode = present')
    expect(text).toContain('维护状态 deprecated')
    expect(text).toContain('必需关系 base-x')
    expect(text).toContain('requiresFabric')
    expect(text).toContain('restartRequired')
  })
})

describe('collections 原子安装', () => {
  const target: InstallTarget = { home: '/tmp/none', profile: 'web' }
  const registry = registryFixture([entryFixture()], [{
    id: 'bundle-x',
    title: 'X',
    summary: 'x',
    items: [
      { projectId: 'a', releaseId: 'a@1.0.0', packageName: '@test/a', spec: '1.0.0' },
      { projectId: 'b', releaseId: 'b@1.0.0', packageName: '@test/b', spec: '2.0.0' },
    ],
  }])

  it('全部成功 → installed 全量', async () => {
    const seen: string[] = []
    const result = await installHubCollection(registry, 'bundle-x', {
      install: (intent: InstallIntent) => {
        seen.push(intent.kind === 'pnpm' ? intent.spec : '')
        return Promise.resolve({ ok: true })
      },
      uninstall: () => ({ ok: true }),
    }, target)
    expect(result.ok).toBe(true)
    expect(result.installed).toEqual(['@test/a', '@test/b'])
    expect(seen).toEqual(['@test/a@1.0.0', '@test/b@2.0.0'])
  })

  it('任一项失败 → 逆序回滚已装项，整组丢弃', async () => {
    const uninstalled: string[] = []
    const result = await installHubCollection(registry, 'bundle-x', {
      install: (intent: InstallIntent) => Promise.resolve(
        intent.kind === 'pnpm' && intent.spec.startsWith('@test/b')
          ? { ok: false, error: { code: 'package-not-resolvable' as const, message: 'boom' } }
          : { ok: true },
      ),
      uninstall: (name: string) => {
        uninstalled.push(name)
        return { ok: true }
      },
    }, target)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('整组已回滚')
    expect(uninstalled).toEqual(['@test/a'])
  })

  it('collection 不存在 → 明确错误', async () => {
    const result = await installHubCollection(registry, 'nope', {
      install: () => Promise.resolve({ ok: true }),
      uninstall: () => ({ ok: true }),
    }, target)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('collection 不存在')
  })
})

describe('HubLoaderAdapter', () => {
  const registry = registryFixture([
    entryFixture(),
    entryFixture({
      id: 'guided-x',
      install: { mode: 'guided', method: 'manual' },
      releases: [{
        id: 'guided-x@1.0.0',
        version: '1.0.0',
        ref: 'b'.repeat(40),
        updatedAt: '2026-08-09T00:00:00.000Z',
        channel: 'stable',
        install: { mode: 'guided', method: 'manual' },
      }],
      latestRelease: 'guided-x@1.0.0',
    }),
  ])

  it('resolve：hub: spec → pnpm/display；未知 id / 非 hub spec → null', () => {
    const adapter = createHubLoaderAdapter({ registry })
    expect(adapter.resolve('hub:demo')).toEqual({ kind: 'pnpm', spec: '@test/demo@1.0.0' })
    const guided = adapter.resolve('hub:guided-x')
    expect(guided?.kind).toBe('display')
    expect(adapter.resolve('hub:missing')).toBeNull()
    expect(adapter.resolve('lodash')).toBeNull()
    expect(adapter.resolve('hub:demo@nope')?.kind).toBe('display')
  })

  it('list：本地检索（id/名称/描述/标签）', async () => {
    const adapter = createHubLoaderAdapter({ registry })
    expect((await adapter.list()).length).toBe(2)
    const filtered = await adapter.list('guided')
    expect(filtered.map(entry => entry.name)).toEqual(['guided-x'])
  })

  it('install：未绑定执行面拒绝；绑定后委托 pnpm intent', async () => {
    const bare = createHubLoaderAdapter({ registry })
    const rejected = await bare.install({ kind: 'pnpm', spec: 'x' }, { home: '/tmp/none', profile: 'web' })
    expect(rejected.ok).toBe(false)
    expect(rejected.error?.message).toContain('未绑定执行面')
    const bound = createHubLoaderAdapter({
      registry,
      execute: (intent) => Promise.resolve({ ok: true, ...(intent.kind === 'pnpm' ? { id: intent.spec } : {}) }),
    })
    const receipt = await bound.install({ kind: 'pnpm', spec: '@test/demo@1.0.0' }, { home: '/tmp/none', profile: 'web' })
    expect(receipt.ok).toBe(true)
    const display = await bound.install({ kind: 'display', reason: '只展示' }, { home: '/tmp/none', profile: 'web' })
    expect(display.ok).toBe(false)
    expect(display.error?.message).toBe('只展示')
  })
})

describe('pickHubRelease', () => {
  it('缺省 latestRelease；指定 id 命中/缺失', () => {
    const entry = entryFixture()
    expect(pickHubRelease(entry)?.id).toBe('demo@1.0.0')
    expect(pickHubRelease(entry, 'demo@1.0.0')?.id).toBe('demo@1.0.0')
    expect(pickHubRelease(entry, 'demo@2.0.0')).toBeUndefined()
  })
})
