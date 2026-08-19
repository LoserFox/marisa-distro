/**
 * hub registry 客户端测试（P5）：真实快照解析/摘要校验/Ed25519 验签/
 * 篡改检测/双 origin 故障转移/NDA 404 降级 vendored/insecure 规则。
 * fixture 为 dsh-hub 真实快照（tests/fixtures 豁免区，第三方语料不改）。
 * @module @r05en1cu/dsh-mygo-loader-hub/tests/registry
 */

import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HubRegistryError,
  canonicalJson,
  loadHubRegistry,
  loadVendoredHubSnapshot,
  parseHubRegistry,
  verifyHubRegistry,
  type HubFetch,
  type HubRegistry,
} from '../src/registry.ts'

const FIXTURE = fileURLToPath(new URL('../tests/fixtures/registry-v1.json', import.meta.url))

async function readFixture(): Promise<HubRegistry> {
  return parseHubRegistry(JSON.parse(await readFile(FIXTURE, 'utf8')))
}

function notFoundFetch(status: number): HubFetch {
  return () => Promise.resolve({ ok: false, status, text: () => Promise.resolve('') })
}

describe('hub registry 解析与校验', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-hub-registry-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('真实快照：schema/摘要校验通过（signature 为 null 属 git 产物常态）', async () => {
    const registry = await readFixture()
    expect(registry.schema).toBe('omdsh-registry/v1')
    expect(registry.entries.length).toBeGreaterThan(100)
    const verification = verifyHubRegistry(registry, { source: 'local' })
    expect(verification).toEqual({ snapshotVerified: true, signed: false })
    expect(registry.signature).toBeNull()
  })

  it('篡改检测：改一个字段 → snapshotId 失配', async () => {
    const raw = JSON.parse(await readFile(FIXTURE, 'utf8')) as { entries: { description: string }[] }
    raw.entries[0]!.description = 'tampered'
    const registry = parseHubRegistry(raw)
    expect(() => verifyHubRegistry(registry, { source: 'local' }))
      .toThrow('摘要校验失败')
  })

  it('Ed25519 验签：本地生成密钥对签名 → 注入公钥通过；错公钥/未知 keyId 拒绝', async () => {
    const raw = JSON.parse(await readFile(FIXTURE, 'utf8')) as Record<string, unknown>
    const keys = generateKeyPairSync('ed25519')
    const registry = parseHubRegistry(raw)
    const payload = Buffer.from(canonicalJson({
      schema: registry.schema,
      revision: registry.revision,
      generatedAt: registry.generatedAt,
      origins: registry.origins,
      entries: registry.entries,
      collections: registry.collections,
    }))
    raw.signature = {
      algorithm: 'Ed25519',
      keyId: 'test-key-1',
      value: sign(null, payload, keys.privateKey).toString('base64'),
    }
    const signed = parseHubRegistry(raw)
    const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const ok = verifyHubRegistry(signed, { source: 'remote', keys: [{ keyId: 'test-key-1', publicKey: publicKeyPem }] })
    expect(ok).toEqual({ snapshotVerified: true, signed: true, keyId: 'test-key-1' })
    // 未知 keyId
    expect(() => verifyHubRegistry(signed, { source: 'remote' })).toThrow('keyId 未知')
    // 错公钥
    const other = generateKeyPairSync('ed25519')
    expect(() => verifyHubRegistry(signed, {
      source: 'remote',
      keys: [{ keyId: 'test-key-1', publicKey: other.publicKey.export({ type: 'spki', format: 'pem' }).toString() }],
    })).toThrow('验签失败')
  })

  it('insecure-no-verify：本地快照跳过校验；远程使用直接报错', async () => {
    const raw = JSON.parse(await readFile(FIXTURE, 'utf8')) as { entries: { description: string }[] }
    raw.entries[0]!.description = 'tampered'
    const tamperedPath = join(root, 'tampered.json')
    await writeFile(tamperedPath, JSON.stringify(raw))
    const loaded = await loadHubRegistry({ snapshotPath: tamperedPath, insecureNoVerify: true })
    expect(loaded.source).toEqual({ kind: 'snapshot', path: tamperedPath })
    expect(loaded.verification.snapshotVerified).toBe(false)
    // 同一篡改文件不带 flag → 拒绝
    await expect(loadHubRegistry({ snapshotPath: tamperedPath })).rejects.toThrow('摘要校验失败')
    // 远程 + insecure → 报错
    const registry = await readFixture()
    expect(() => verifyHubRegistry(registry, { source: 'remote', insecureNoVerify: true }))
      .toThrow('只允许对本地快照生效')
  })

  it('双 origin 故障转移：首 origin 404 → 次 origin 命中', async () => {
    const text = await readFile(FIXTURE, 'utf8')
    const fetchImpl: HubFetch = (url) => url.includes('omdsh')
      ? Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
      : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) })
    const loaded = await loadHubRegistry({ fetchImpl })
    expect(loaded.source.kind).toBe('remote')
    expect(loaded.source.kind === 'remote' && loaded.source.origin.includes('0.org.cn')).toBe(true)
  })

  it('NDA 404 降级：双 origin 全 404 → vendored 快照 + 告警', async () => {
    const loaded = await loadHubRegistry({ fetchImpl: notFoundFetch(404) })
    expect(loaded.source).toEqual({ kind: 'vendored' })
    expect(loaded.warnings[0]).toContain('降级 vendored 快照')
    expect(loaded.warnings[0]).toContain('HTTP 404')
    expect(loaded.registry.entries.length).toBeGreaterThan(100)
  })

  it('vendored 快照同步加载与 fixture 同 revision', async () => {
    const vendored = loadVendoredHubSnapshot()
    const fixture = await readFixture()
    expect(vendored.revision).toBe(fixture.revision)
    expect(vendored.snapshotId).toBe(fixture.snapshotId)
  })

  it('显式快照不存在 / 结构非法 → HubRegistryError 或 I/O 错误', async () => {
    await expect(loadHubRegistry({ snapshotPath: join(root, 'nope.json') })).rejects.toThrow()
    const bad = join(root, 'bad.json')
    await writeFile(bad, JSON.stringify({ schema: 'other/v9' }))
    await expect(loadHubRegistry({ snapshotPath: bad })).rejects.toThrow(HubRegistryError)
  })
})
