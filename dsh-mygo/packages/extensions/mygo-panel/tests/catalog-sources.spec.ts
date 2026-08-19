/**
 * catalog-sources 三源合并与配置读写测试（mygo 原生目录源语义）。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/catalog-sources
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HubEntry } from '@r05en1cu/dsh-mygo-loader-hub'
import {
  mergeEntries,
  normalizeCatalogSourceConfig,
  readCatalogSourceConfig,
  scanLocalRoot,
  writeCatalogSourceConfig,
} from '../src/catalog-sources.ts'

describe('目录源配置读写', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-catalog-src-'))
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('normalize 夹紧数值并清洗路径/URL；空输入带默认市场端点', async () => {
    const config = await normalizeCatalogSourceConfig({
      localSources: ['', '/tmp/a', '/tmp/a'],
      hubOrigins: ['https://hub.example/registry-v1.json', 'not-a-url'],
      marketMaxPages: 999,
      githubUpstream: ' owner ',
      maxRepos: 999,
      timeoutMs: 1,
      cacheTtlMs: -1,
    })
    expect(config.localSources).toEqual(['/tmp/a'])
    expect(config.hubOrigins).toEqual(['https://hub.example/registry-v1.json'])
    expect(config.githubUpstream).toBe('owner')
    expect(config.marketUrl).toBe('https://api.dshfind.com/v1/plugins')
    expect(config.marketMaxPages).toBe(100)
    expect(config.maxRepos).toBe(100)
    expect(config.timeoutMs).toBe(1_000)
    expect(config.cacheTtlMs).toBe(0)
  })

  it('写入后原子落盘；非法文件回落默认值', async () => {
    const config = await writeCatalogSourceConfig(home, { githubUpstream: 'acme', maxRepos: 7 })
    expect(readCatalogSourceConfig(home)).toMatchObject({ githubUpstream: 'acme', maxRepos: 7 })
    await writeFile(join(home, 'mygo-panel', 'catalog-sources.json'), 'not-json')
    expect(readCatalogSourceConfig(home).githubUpstream).toBe('')
  })
})

describe('scanLocalRoot（一层深）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-local-root-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('只收声明 dsh.bundle.patch 的目录；id 取 dsh.mygo.id 或包短名', async () => {
    await mkdir(join(root, 'alpha'), { recursive: true })
    await writeFile(join(root, 'alpha', 'package.json'), JSON.stringify({
      name: '@test/alpha',
      version: '1.2.3',
      description: 'alpha bundle',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    await mkdir(join(root, 'beta'), { recursive: true })
    await writeFile(join(root, 'beta', 'package.json'), JSON.stringify({
      name: '@test/beta',
      version: '2.0.0',
      dsh: { mygo: { id: 'beta-id' }, bundle: { patch: './cordis.patch.yml' } },
    }))
    await mkdir(join(root, 'plain'), { recursive: true })
    await writeFile(join(root, 'plain', 'package.json'), JSON.stringify({ name: '@test/plain' }))
    const entries = scanLocalRoot(root)
    expect(entries.map(entry => entry.id)).toEqual(['alpha', 'beta-id'])
    expect(entries[0]).toMatchObject({ version: '1.2.3', latestRelease: 'local' })
  })
})

describe('mergeEntries（local > hub > github）', () => {
  const hub = (): HubEntry => ({
    id: 'demo',
    displayName: 'Demo',
    description: 'hub',
    kind: 'plugin',
    tags: [],
    author: { name: 'hub' },
    version: '9.9.9',
    license: 'MIT',
    risk: { level: 'unknown', facts: {} },
    listing: { state: 'auto-listed' },
    maintenance: { state: 'active' },
    install: { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: '@test/demo', spec: '9.9.9' },
    latestRelease: 'hub-r1',
    releases: [],
  } as unknown as HubEntry)

  it('同 id 高优先级源胜出：local > market > hub > github；败者补 repository', () => {
    const local = hub()
    const market = hub()
    const github = hub()
    const merged = mergeEntries([
      { kind: 'hub', origin: 'hub', entries: [hub()] },
      { kind: 'github', origin: 'acme', entries: [{ ...github, links: { repository: 'https://github.com/acme/demo' } }] },
      { kind: 'market', origin: 'https://api.dshfind.com/v1/plugins', entries: [market] },
      { kind: 'local', origin: '/tmp/checkouts', entries: [local] },
    ])
    expect(merged.entries).toHaveLength(1)
    expect(merged.sourceById.get('demo')).toBe('local')
    expect(merged.entries[0]?.links?.repository).toBe('https://github.com/acme/demo')
  })

  it('无 local 时 market 高于 hub', () => {
    const merged = mergeEntries([
      { kind: 'hub', origin: 'hub', entries: [hub()] },
      { kind: 'market', origin: 'https://api.dshfind.com/v1/plugins', entries: [hub()] },
    ])
    expect(merged.sourceById.get('demo')).toBe('market')
  })
})
