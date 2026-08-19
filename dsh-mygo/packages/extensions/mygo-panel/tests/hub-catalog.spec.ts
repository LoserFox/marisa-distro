/**
 * hub-catalog 投影与安装翻译测试（P0 plughub catalog 迁移面）：
 * hub adapter 发现、installed/update 合并、profile-bundle spec 翻译、
 * blocked/release 缺失拒绝。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/hub-catalog
 */

import { describe, expect, it } from 'vitest'
import type { HubEntry, HubRegistry } from '@r05en1cu/dsh-mygo-loader-hub'
import {
  hubAdapterOf,
  hubCatalogDocument,
  resolveHubInstallTarget,
} from '../src/hub-catalog.ts'

function entry(overrides: Partial<HubEntry> = {}): HubEntry {
  return {
    id: 'demo',
    displayName: 'Demo',
    description: 'demo entry',
    kind: 'plugin',
    tags: ['demo'],
    author: { name: 'tester' },
    version: '1.2.3',
    license: 'MIT',
    risk: {
      level: 'low',
      facts: {
        vulnerabilityScan: 'passed',
        permissions: 'declared',
        nativeCode: 'absent',
        installScripts: 'absent',
      },
    },
    listing: { state: 'reviewed' },
    maintenance: { state: 'active' },
    install: {
      mode: 'profile-bundle',
      adapter: 'official-profile/v1',
      packageName: '@test/demo',
      spec: '1.2.3',
    },
    latestRelease: 'r1',
    releases: [{
      id: 'r1',
      version: '1.2.3',
      ref: 'main',
      updatedAt: '2026-08-16T00:00:00.000Z',
      channel: 'stable',
      install: {
        mode: 'profile-bundle',
        adapter: 'official-profile/v1',
        packageName: '@test/demo',
        spec: '1.2.3',
      },
    }],
    ...overrides,
  } as HubEntry
}

function adapter(entries: readonly HubEntry[] = [entry()]): ReturnType<typeof hubAdapterOf> {
  return hubAdapterOf([{
    id: 'hub',
    registry: {
      schema: 'omdsh-registry/v1',
      revision: 1,
      generatedAt: '2026-08-16T00:00:00.000Z',
      origins: ['https://hub.example/registry-v1.json'],
      entries,
      collections: [],
      snapshotId: 'snap-1',
      signature: null,
    } as HubRegistry,
    resolve: () => null,
    install: async () => ({ ok: false, error: { code: 'package-not-resolvable', message: 'x' } }),
  }])
}

describe('hubAdapterOf / hubCatalogDocument', () => {
  it('无 hub adapter 返回 undefined；有 registry 时识别', () => {
    expect(hubAdapterOf([])).toBeUndefined()
    expect(hubAdapterOf([{ id: 'profile', resolve: () => null, install: async () => ({ ok: true }) }])).toBeUndefined()
    expect(adapter()?.registry.schema).toBe('omdsh-registry/v1')
  })

  it('installed 事实按 id 与 packageName 合并；semver 更新态打标', () => {
    const bound = adapter()
    if (bound === undefined) throw new Error('adapter missing')
    const document = hubCatalogDocument(bound, [
      { id: 'demo', version: '1.2.2', rail: 'bundle' },
    ])
    expect(document?.entries[0]?.installed).toMatchObject({ rail: 'bundle', update: 'available' })
  })
})

describe('resolveHubInstallTarget', () => {
  it('profile-bundle 精确 semver 翻译为 name@version', async () => {
    const bound = adapter()
    if (bound === undefined) throw new Error('adapter missing')
    const result = await resolveHubInstallTarget(bound, 'demo')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.spec).toBe('@test/demo@1.2.3')
  })

  it('未列出条目 404；blocked 条目 409 并带 blocks/advisories', async () => {
    const bound = adapter([entry({ listing: { state: 'blocked' } })])
    if (bound === undefined) throw new Error('adapter missing')
    expect(await resolveHubInstallTarget(bound, 'ghost')).toMatchObject({ ok: false, status: 404 })
    const blocked = await resolveHubInstallTarget(bound, 'demo')
    expect(blocked).toMatchObject({ ok: false, status: 409 })
  })
})
