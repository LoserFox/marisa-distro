/**
 * `mygo hub` 命令面测试（P5）：args 解析 + search/info/collections（真实
 * hub 快照 fixture）+ install 本地快照端到端（file: 包装置，临时 HOME）
 * + repository-plugin 拒绝文案 + collection 原子安装。全程离线
 * （--snapshot 本地源；block-net 拦截远程）。
 * @module @r05en1cu/dsh-mygo-cli/tests/hub-face
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalJson } from '@r05en1cu/dsh-mygo-loader-hub'
import { parseCliArgs } from '../src/args.ts'
import { invokeCli, internals, type CliHost } from '../src/index.ts'
import { collector } from './helpers.ts'

const HUB_FIXTURE = fileURLToPath(new URL('../../../loaders/mygo-loader-hub/tests/fixtures/registry-v1.json', import.meta.url))
const ORIGINAL_DSH_HOME = process.env.DSH_HOME

function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

/** 带 profile 事实的管理器桩（profileOf 消费面）。 */
function ctxWithProfile(profile: string): CliHost {
  return { get: (key: string) => (key === 'pluginManager' ? { profile } : undefined) }
}

function buildSnapshot(entries: readonly Record<string, unknown>[], collections: readonly Record<string, unknown>[] = []): string {
  const payload = {
    schema: 'omdsh-registry/v1',
    revision: 1,
    generatedAt: '2026-08-13T00:00:00.000Z',
    origins: [],
    entries,
    collections,
  }
  return JSON.stringify({
    ...payload,
    snapshotId: `sha256:${createHash('sha256').update(Buffer.from(canonicalJson(payload))).digest('hex')}`,
    signature: null,
  })
}

function entryFixture(id: string, install: Record<string, unknown>): Record<string, unknown> {
  return {
    id,
    displayName: id,
    description: `${id} fixture`,
    kind: 'plugin',
    tags: [],
    author: { name: 'tester' },
    version: '1.0.0',
    license: 'MIT',
    risk: { level: 'low', facts: {} },
    listing: { state: 'reviewed' },
    maintenance: { state: 'active' },
    install,
    latestRelease: `${id}@1.0.0`,
    releases: [{
      id: `${id}@1.0.0`,
      version: '1.0.0',
      ref: '0'.repeat(40),
      updatedAt: '2026-08-13T00:00:00.000Z',
      channel: 'stable',
      install,
    }],
    links: {},
  }
}

describe('mygo hub 命令面', () => {
  let root: string
  let home: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-hub-face-'))
    home = join(root, 'home')
    process.env.DSH_HOME = home
  })

  afterEach(async () => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    await rm(root, { recursive: true, force: true })
  })

  it('args 解析：hub 四子命令 + --snapshot + --insecure-no-verify + 用法错误', () => {
    expect(parseCliArgs(['hub', 'search', 'inspect'])).toEqual({
      kind: 'command',
      command: { kind: 'hub', verb: 'search', arg: 'inspect', insecureNoVerify: false, json: false },
    })
    expect(parseCliArgs(['hub', 'install', 'dsh-inspect@0.2.0', '--snapshot', '/tmp/s.json', '--insecure-no-verify', '--json'])).toEqual({
      kind: 'command',
      command: {
        kind: 'hub', verb: 'install', arg: 'dsh-inspect@0.2.0',
        snapshot: '/tmp/s.json', insecureNoVerify: true, json: true,
      },
    })
    expect(parseCliArgs(['hub', 'collections'])).toMatchObject({ kind: 'command' })
    expect(parseCliArgs(['hub']).kind).toBe('usage-error')
    expect(parseCliArgs(['hub', 'bogus']).kind).toBe('usage-error')
    expect(parseCliArgs(['hub', 'info']).kind).toBe('usage-error')
    expect(parseCliArgs(['install', 'x', '--insecure-no-verify']).kind).toBe('usage-error')
  })

  it('hub search：真实快照本地筛选（--json 信封）', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'search', 'inspect', '--snapshot', HUB_FIXTURE, '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; count: number; entries: { id: string }[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.count).toBeGreaterThan(0)
    expect(parsed.entries.some(entry => entry.id === 'dsh-inspect')).toBe(true)
  })

  it('hub info：guided 条目给出治理提示与安装轨；blocked 判定进 assessment', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'info', 'airtable-cli', '--snapshot', HUB_FIXTURE])
    expect(code).toBe(0)
    const text = out.stdout.text()
    expect(text).toContain('airtable-cli')
    expect(text).toContain('安装轨 guided')
    expect(text).toContain('源码 https://github.com/dsh-external/official-plugins-port')
  })

  it('hub collections：真实快照两个集合列出', async () => {
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'collections', '--snapshot', HUB_FIXTURE, '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; collections: { id: string }[] }
    expect(parsed.collections.length).toBe(2)
  })

  it('hub install：本地快照 file: 包装到临时 HOME profile（端到端）', async () => {
    const bundleDir = join(root, 'fixture-bundle')
    await mkdir(bundleDir, { recursive: true })
    await writeFile(join(bundleDir, 'package.json'), JSON.stringify({
      name: '@test/hub-cli-bundle',
      version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2))
    await writeFile(join(bundleDir, 'cordis.patch.yml'), '- insert: []\n')
    const snapshot = join(root, 'snapshot.json')
    await writeFile(snapshot, buildSnapshot([entryFixture('hub-cli-bundle', {
      mode: 'profile-bundle',
      adapter: 'official-profile/v1',
      packageName: '@test/hub-cli-bundle',
      spec: `file:${bundleDir}`,
    })]))
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'install', 'hub-cli-bundle', '--snapshot', snapshot, '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; id: string; bundles: string[] }
    expect(parsed.ok).toBe(true)
    expect(parsed.bundles).toContain('@test/hub-cli-bundle')
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(manifest.dsh?.profile?.bundles).toContain('@test/hub-cli-bundle')
  }, 60_000)

  it('hub install：repository-plugin 默认拒绝（安装轨 0812 已删除）', async () => {
    const snapshot = join(root, 'snapshot.json')
    await writeFile(snapshot, buildSnapshot([entryFixture('repo-x', {
      mode: 'repository-plugin',
      adapter: 'official-repository/v1',
      spec: `github:owner/repo#${'1'.repeat(40)}&path:/plugins/x/.dsh-plugin`,
    })]))
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'install', 'repo-x', '--snapshot', snapshot])
    expect(code).toBe(1)
    expect(out.stderr.text()).toContain('安装轨在 0812 已删除')
  }, 60_000)

  it('hub install：guided 条目拒绝安装并说明；条目不存在明确报错', async () => {
    const snapshot = join(root, 'snapshot.json')
    await writeFile(snapshot, buildSnapshot([entryFixture('guided-x', { mode: 'guided', method: 'manual' })]))
    let out = capture()
    let code = await invokeCli(ctxWithProfile('web'), ['hub', 'install', 'guided-x', '--snapshot', snapshot])
    expect(code).toBe(1)
    expect(out.stderr.text()).toContain('guided/manual')
    out = capture()
    code = await invokeCli(ctxWithProfile('web'), ['hub', 'install', 'missing', '--snapshot', snapshot, '--json'])
    expect(code).toBe(1)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; error: { code: string } }
    expect(parsed.error.code).toBe('entry-not-found')
  })

  it('hub install：collection 原子安装（两项全装进 bundles）', async () => {
    const mk = async (name: string): Promise<string> => {
      const dir = join(root, name.replace('/', '_'))
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({
        name,
        version: '1.0.0',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      }, null, 2))
      await writeFile(join(dir, 'cordis.patch.yml'), '- insert: []\n')
      return dir
    }
    const dirA = await mk('@test/col-a')
    const dirB = await mk('@test/col-b')
    const snapshot = join(root, 'snapshot.json')
    await writeFile(snapshot, buildSnapshot([], [{
      id: 'col-x',
      title: 'X',
      summary: 'x',
      featured: false,
      items: [
        { projectId: 'a', releaseId: 'a@1.0.0', packageName: '@test/col-a', spec: `file:${dirA}` },
        { projectId: 'b', releaseId: 'b@1.0.0', packageName: '@test/col-b', spec: `file:${dirB}` },
      ],
    }]))
    const out = capture()
    const code = await invokeCli(ctxWithProfile('web'), ['hub', 'install', 'col-x', '--snapshot', snapshot, '--json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; collection: string; installed: string[] }
    expect(parsed.installed).toEqual(['@test/col-a', '@test/col-b'])
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(manifest.dsh?.profile?.bundles).toContain('@test/col-a')
    expect(manifest.dsh?.profile?.bundles).toContain('@test/col-b')
  }, 120_000)
})
