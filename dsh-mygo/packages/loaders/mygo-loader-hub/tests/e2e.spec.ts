/**
 * hub 本地快照端到端（P5）：临时生成的本地快照（file: spec，离线验证/
 * 内网镜像语义）→ loadHubRegistry 校验 → assess → translate → profile
 * 执行面实装到临时 $DSH_HOME profile（真 pnpm，离线 file: 包装置）。
 * @module @r05en1cu/dsh-mygo-loader-hub/tests/e2e
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProfileLoaderAdapter } from '@r05en1cu/dsh-mygo-loader-profile'
import { assessHubEntry } from '../src/assess.ts'
import { translateHubInstall } from '../src/intent.ts'
import { canonicalJson, loadHubRegistry, type HubRegistry } from '../src/registry.ts'

/** 生成一个带正确 snapshotId 的本地快照（canonical payload sha256）。 */
function buildSnapshot(entries: readonly Record<string, unknown>[]): Record<string, unknown> {
  const payload = {
    schema: 'omdsh-registry/v1',
    revision: 1,
    generatedAt: '2026-08-13T00:00:00.000Z',
    origins: [],
    entries,
    collections: [],
  }
  const snapshotId = `sha256:${createHash('sha256').update(Buffer.from(canonicalJson(payload))).digest('hex')}`
  return { ...payload, snapshotId, signature: null }
}

describe('hub 本地快照端到端（装到临时 HOME profile）', () => {
  let root: string
  let home: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-hub-e2e-'))
    home = join(root, 'home')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('profile-bundle 条目（本地快照 file: spec）经翻译 + profile 执行面安装成功', async () => {
    // 离线 fixture：带 dsh.bundle 声明的本地包目录
    const bundleDir = join(root, 'fixture-bundle')
    await mkdir(bundleDir, { recursive: true })
    await writeFile(join(bundleDir, 'package.json'), JSON.stringify({
      name: '@test/hub-bundle',
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2))
    await writeFile(join(bundleDir, 'cordis.patch.yml'), '- insert: []\n')
    const entry = {
      id: 'hub-bundle',
      displayName: 'Hub Bundle',
      description: '本地快照 e2e fixture',
      kind: 'plugin',
      tags: [],
      author: { name: 'tester' },
      version: '1.0.0',
      license: 'MIT',
      risk: { level: 'low', facts: {} },
      listing: { state: 'reviewed' },
      maintenance: { state: 'active' },
      install: {
        mode: 'profile-bundle',
        adapter: 'official-profile/v1',
        packageName: '@test/hub-bundle',
        spec: `file:${bundleDir}`,
      },
      latestRelease: 'hub-bundle@1.0.0',
      releases: [{
        id: 'hub-bundle@1.0.0',
        version: '1.0.0',
        ref: '0'.repeat(40),
        updatedAt: '2026-08-13T00:00:00.000Z',
        channel: 'stable',
        install: {
          mode: 'profile-bundle',
          adapter: 'official-profile/v1',
          packageName: '@test/hub-bundle',
          spec: `file:${bundleDir}`,
        },
      }],
      links: {},
    }
    const snapshotPath = join(root, 'snapshot.json')
    await writeFile(snapshotPath, JSON.stringify(buildSnapshot([entry])))

    // 加载 + 校验（本地快照源）
    const loaded = await loadHubRegistry({ snapshotPath })
    expect(loaded.source).toEqual({ kind: 'snapshot', path: snapshotPath })
    expect(loaded.verification.snapshotVerified).toBe(true)
    const registry: HubRegistry = loaded.registry
    const found = registry.entries.find(candidate => candidate.id === 'hub-bundle')
    expect(found).toBeDefined()
    if (found === undefined) return

    // 可安装判定 + 翻译（本地快照允许 file: spec）
    const assessment = assessHubEntry(found)
    expect(assessment.installable).toBe(true)
    const translated = await translateHubInstall(found.install, { allowFileSpec: true })
    expect(translated.kind).toBe('pnpm')

    // 经 profile 执行面实装
    const adapter = createProfileLoaderAdapter()
    const receipt = await adapter.install(
      { kind: 'pnpm', spec: translated.kind === 'pnpm' ? translated.spec : '' },
      { home, profile: 'web' },
    )
    expect(receipt.ok).toBe(true)
    expect(receipt.bundles).toContain('@test/hub-bundle')
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
    }
    expect(manifest.dsh?.profile?.bundles).toContain('@test/hub-bundle')
  }, 60_000)

  it('同一快照的 guided 条目：只展示（拒绝安装并说明）', async () => {
    const guided = {
      id: 'guided-x',
      displayName: 'Guided X',
      description: 'guided fixture',
      kind: 'skill',
      tags: [],
      author: { name: 'tester' },
      version: null,
      license: 'MIT',
      risk: { level: 'low', facts: {} },
      listing: { state: 'reviewed' },
      maintenance: { state: 'active' },
      install: { mode: 'guided', method: 'manual' },
      latestRelease: 'guided-x@abc123',
      releases: [{
        id: 'guided-x@abc123',
        version: null,
        ref: '0'.repeat(40),
        updatedAt: '2026-08-13T00:00:00.000Z',
        channel: 'beta',
        install: { mode: 'guided', method: 'manual' },
      }],
      links: { repository: 'https://example.com/repo' },
    }
    const snapshotPath = join(root, 'snapshot.json')
    await writeFile(snapshotPath, JSON.stringify(buildSnapshot([guided])))
    const loaded = await loadHubRegistry({ snapshotPath })
    const found = loaded.registry.entries[0]
    expect(found).toBeDefined()
    if (found === undefined) return
    const translated = await translateHubInstall(found.install)
    expect(translated.kind).toBe('display')
    if (translated.kind === 'display') expect(translated.reason).toContain('guided/manual')
  })
})
