/**
 * P8 引用式成员测试：引用式打包（本地 registry 桩固化 integrity/tarball）、
 * 混合 pack 端到端（embedded + reference 共存）、integrity 不符拒绝、离线
 * fail-loud 点名、旧 v1 pack（无 references 键）兼容、事实文件 origin
 * 记账。registry 交互全部走 127.0.0.1 桩（block-net 放行 localhost）。
 * @module @r05en1cu/dsh-mygo/tests/package/pack-reference
 */

import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildPluginPack,
  computePackManifestSha256,
  installPluginPack,
  parsePackManifest,
  listGzipTarMembers,
  type PackContext,
  type PackManifest,
} from '../../src/package/pack.ts'
import { readRestoredPackage } from '../../src/package/package-restore.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'
import { sha256Text } from '../../src/package/hash.ts'

const execFileAsync = promisify(execFile)

/** 造一个已还原插件目录（含事实文件；pack.spec 同款最小形态）。 */
async function seedRestored(home: string, id: string, version: string, packageName?: string): Promise<void> {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  const dir = join(paths.packagesRoot, id, version)
  const entryBytes = 'export const apply = () => {}\n'
  const manifest = {
    formatVersion: 1, id, version, entry: 'lib/index.js',
    requires: {}, core: '*',
    recommends: {}, provides: [], entrypoints: {}, bundles: [],
  }
  const factBase = { format: 'dsh.mygo-package/v1', id, version, entry: 'lib/index.js', manifest }
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'lib', 'index.js'), entryBytes)
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: packageName ?? `@test/${id}`, version, main: 'lib/index.js',
    dsh: { mygo: { formatVersion: 1, id, version, entry: 'lib/index.js', core: '*' } },
  }, null, 2))
  await writeFile(join(dir, '.mygo-package.json'), JSON.stringify({
    ...factBase,
    entrySha512: createHash('sha512').update(entryBytes).digest('hex'),
    manifestSha256: sha256Text(JSON.stringify(factBase)),
    installedAt: '2026-08-13T00:00:00.000Z',
  }, null, 2))
}

function packCtx(home: string): PackContext {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  return { installRoot: paths.packagesRoot, tmpDir: paths.tmpDir, profile: 'web', managerVersion: '0.3.0' }
}

/** 从还原目录确定性重打包一个独立 tarball（registry 桩供下载用）。 */
async function makeTarball(dir: string, out: string): Promise<Uint8Array> {
  const tarPath = `${out}.tar`
  await execFileAsync('tar', [
    '-cf', tarPath, '-C', dir,
    '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '--exclude=.mygo-package.json', '--transform=s,^\\./,package/,', '.',
  ])
  const bytes = gzipSync(await readFile(tarPath))
  await writeFile(out, bytes)
  return new Uint8Array(bytes)
}

/** 本地 registry 桩：/{name} 元数据 + /{name}.tgz 下载。 */
interface StubPackage {
  readonly name: string
  readonly version: string
  readonly tarballBytes: Uint8Array
  readonly integrity: string
  readonly manifestId: string
}

async function startStubRegistry(packages: readonly StubPackage[]): Promise<{ readonly url: string; readonly close: () => Promise<void>; readonly requests: string[] }> {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const url = req.url ?? ''
    requests.push(url)
    const download = packages.find(pkg => url === `/${encodeURIComponent(pkg.name)}.tgz`)
    if (download !== undefined) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      res.end(Buffer.from(download.tarballBytes))
      return
    }
    const meta = packages.find(pkg => url === `/${pkg.name.replace('/', '%2f')}`)
    if (meta !== undefined) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        name: meta.name,
        versions: {
          [meta.version]: {
            name: meta.name,
            version: meta.version,
            main: 'lib/index.js',
            dsh: { mygo: { formatVersion: 1, id: meta.manifestId, version: meta.version, entry: 'lib/index.js', core: '*' } },
            dist: {
              tarball: `${stubUrl}/${encodeURIComponent(meta.name)}.tgz`,
              integrity: meta.integrity,
            },
          },
        },
        'dist-tags': { latest: meta.version },
      }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const stubUrl = `http://127.0.0.1:${port}`
  return {
    url: stubUrl,
    requests,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

async function readPackManifest(packPath: string): Promise<PackManifest> {
  const bytes = new Uint8Array(await readFile(packPath))
  const unpacked = listGzipTarMembers(bytes)
  const member = unpacked.members?.find(item => item.name === 'mygo-pack.json')
  if (unpacked.tar === undefined || member === undefined) throw new Error('pack 无清单')
  const parsed = parsePackManifest(JSON.parse(
    Buffer.from(unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size)).toString('utf8'),
  ))
  if (parsed.value === undefined) throw new Error('清单无效')
  return parsed.value
}

describe('P8 引用式成员（pack references）', () => {
  let root: string
  let homeA: string
  let homeB: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-ref-'))
    homeA = join(root, 'home-a')
    homeB = join(root, 'home-b')
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeA }).tmpDir, { recursive: true })
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeB }).tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  /** 装两个插件进 A store；calc 供内嵌，ref-one 供引用（registry 桩供元数据与下载）。 */
  async function seedBoth(): Promise<{ readonly stub: { url: string; close: () => Promise<void> }; readonly tarballBytes: Uint8Array }> {
    await seedRestored(homeA, 'calc', '1.0.0')
    await seedRestored(homeA, 'ref-one', '2.0.0')
    const tarballBytes = await makeTarball(join(resolveMygoPaths('web', { DSH_HOME: homeA }).packagesRoot, 'ref-one', '2.0.0'), join(root, 'ref-one.tgz'))
    const integrity = `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`
    const stub = await startStubRegistry([{
      name: '@test/ref-one',
      version: '2.0.0',
      tarballBytes,
      integrity,
      manifestId: 'ref-one',
    }])
    return { stub, tarballBytes }
  }

  it('引用式打包：清单固化 spec/integrity/tarball，两次打包字节一致', async () => {
    const { stub } = await seedBoth()
    try {
      const out1 = join(root, 'p1.mygo-pack')
      const out2 = join(root, 'p2.mygo-pack')
      const first = await buildPluginPack(packCtx(homeA), { output: out1, includeCommunityDeps: false, references: ['ref-one'], registry: stub.url })
      if (!first.ok) throw new Error(first.report.summary)
      const second = await buildPluginPack(packCtx(homeA), { output: out2, includeCommunityDeps: false, references: ['ref-one'], registry: stub.url })
      if (!second.ok) throw new Error(second.report.summary)
      expect(await readFile(out1)).toEqual(await readFile(out2))
      const manifest = first.manifest
      expect(manifest.plugins.map(plugin => plugin.id).sort()).toEqual(['calc', 'ref-one'])
      expect(manifest.files).toHaveLength(1)
      expect(manifest.files[0]?.pluginId).toBe('calc')
      expect(manifest.references).toHaveLength(1)
      const reference = manifest.references[0]
      expect(reference?.spec).toBe('@test/ref-one@2.0.0')
      expect(reference?.integrity.startsWith('sha512-')).toBe(true)
      expect(reference?.tarball).toContain('127.0.0.1')
      // 清单自校验
      expect(computePackManifestSha256(manifest)).toBe(manifest.manifestSha256)
      // 落盘清单经 parse 还原后哈希口径不变
      const onDisk = await readPackManifest(out1)
      expect(onDisk.references).toHaveLength(1)
      expect(computePackManifestSha256(onDisk)).toBe(onDisk.manifestSha256)
    } finally {
      await stub.close()
    }
  }, 60_000)

  it('引用固化失败面：registry 无该版本 → 打包失败并指认', async () => {
    await seedRestored(homeA, 'ghost', '9.9.9')
    const stub = await startStubRegistry([])
    try {
      const outcome = await buildPluginPack(packCtx(homeA), {
        output: join(root, 'x.mygo-pack'),
        includeCommunityDeps: false,
        references: ['ghost'],
        registry: stub.url,
      })
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.report.summary).toContain('无法打包')
    } finally {
      await stub.close()
    }
  }, 60_000)

  it('混合 pack 端到端：embedded 落盘 + reference 在线拉取，事实文件 origin 记账', async () => {
    const { stub } = await seedBoth()
    try {
      const packPath = join(root, 'mixed.mygo-pack')
      const built = await buildPluginPack(packCtx(homeA), { output: packPath, includeCommunityDeps: false, references: ['ref-one'], registry: stub.url })
      if (!built.ok) throw new Error(built.report.summary)
      const installed = await installPluginPack(packCtx(homeB), packPath)
      if (!installed.ok) throw new Error(installed.report.summary)
      expect(installed.restored).toEqual([
        { id: 'calc', version: '1.0.0' },
        { id: 'ref-one', version: '2.0.0' },
      ])
      expect(installed.members.map(member => `${member.id}:${member.origin}`).sort())
        .toEqual(['calc:embedded', 'ref-one:reference'])
      const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
      const embeddedFact = await readRestoredPackage(join(pathsB.packagesRoot, 'calc', '1.0.0'), 'calc', '1.0.0')
      const referenceFact = await readRestoredPackage(join(pathsB.packagesRoot, 'ref-one', '2.0.0'), 'ref-one', '2.0.0')
      expect(embeddedFact?.origin).toBe('pack-embedded')
      expect(referenceFact?.origin).toBe('pack-reference')
    } finally {
      await stub.close()
    }
  }, 60_000)

  it('integrity 不符 → 硬失败且零写盘', async () => {
    const { stub } = await seedBoth()
    try {
      // 打包正常固化 integrity；restore 拉取时返回与清单不符的字节。
      const packPath = join(root, 'tamper.mygo-pack')
      const built = await buildPluginPack(packCtx(homeA), { output: packPath, includeCommunityDeps: false, references: ['ref-one'], registry: stub.url })
      if (!built.ok) throw new Error(built.report.summary)
      const installed = await installPluginPack(packCtx(homeB), packPath, {
        fetchImpl: () => Promise.resolve({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer),
        }),
      })
      expect(installed.ok).toBe(false)
      if (!installed.ok) {
        expect(installed.report.summary).toContain('拉取失败')
      }
      const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
      await expect(readFile(join(pathsB.packagesRoot, 'calc', '1.0.0', '.mygo-package.json'))).rejects.toThrow()
    } finally {
      await stub.close()
    }
  }, 60_000)

  it('离线遇引用成员 → fail-loud 点名缺失，零写盘', async () => {
    const { stub } = await seedBoth()
    const packPath = join(root, 'offline.mygo-pack')
    const built = await buildPluginPack(packCtx(homeA), { output: packPath, includeCommunityDeps: false, references: ['ref-one'], registry: stub.url })
    if (!built.ok) throw new Error(built.report.summary)
    await stub.close() // 断网姿态
    const installed = await installPluginPack(packCtx(homeB), packPath, {
      fetchImpl: () => Promise.reject(new Error('network is unreachable')),
    })
    expect(installed.ok).toBe(false)
    if (!installed.ok) {
      expect(installed.report.summary).toContain('引用式成员拉取失败')
      expect(installed.report.summary).toContain('ref-one@2.0.0')
    }
    const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
    await expect(readFile(join(pathsB.packagesRoot, 'calc', '1.0.0', '.mygo-package.json'))).rejects.toThrow()
  }, 60_000)

  it('旧 v1 pack（无 references 键）照常还原（向后兼容）', async () => {
    await seedRestored(homeA, 'calc', '1.0.0')
    const packPath = join(root, 'legacy.mygo-pack')
    const built = await buildPluginPack(packCtx(homeA), { output: packPath, includeCommunityDeps: false })
    if (!built.ok) throw new Error(built.report.summary)
    // 落盘清单不含 references 键（旧形态逐字节口径）
    const packBytes = new Uint8Array(await readFile(packPath))
    const unpacked = listGzipTarMembers(packBytes)
    const member = unpacked.members?.find(item => item.name === 'mygo-pack.json')
    if (unpacked.tar === undefined || member === undefined) throw new Error('pack 无清单')
    const manifestText = Buffer.from(unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size)).toString('utf8')
    expect(manifestText).not.toContain('"references"')
    const installed = await installPluginPack(packCtx(homeB), packPath)
    expect(installed.ok).toBe(true)
    if (installed.ok) {
      expect(installed.members[0]?.origin).toBe('embedded')
    }
  }, 60_000)
})
