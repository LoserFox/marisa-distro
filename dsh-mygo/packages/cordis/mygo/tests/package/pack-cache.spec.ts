/**
 * P4 跨实例只读共享缓存（~/.dsh-mygo/cache/packs/）单元测试：内容寻址
 * （sha512 文件名）、staging → rename 原子发布、第二次写入命中、hardlink
 * 导入、非法 pack/非法寻址键拒绝。全部在临时 MYGO_USER_DIR 内进行。
 * @module @r05en1cu/dsh-mygo/tests/package/pack-cache
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePack, cachedPackPath, importCachedPack, packCacheDir } from '../../src/pack-cache.ts'
import { buildPluginPack, type PackContext } from '../../src/package/pack.ts'
import { sha256Text } from '../../src/package/hash.ts'

/** 造一个已还原插件目录（含事实文件；与 pack.spec.ts 同款最小形态）。 */
async function seedRestored(installRoot: string, id: string, version: string, entryBytes: string): Promise<void> {
  const dir = join(installRoot, id, version)
  const manifest = {
    formatVersion: 1, id, version, entry: 'lib/index.js',
    requires: {}, core: '*',
    recommends: {}, provides: [], entrypoints: {}, bundles: [],
  }
  const factBase = { format: 'dsh.mygo-package/v1', id, version, entry: 'lib/index.js', manifest }
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'lib', 'index.js'), entryBytes)
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: `@test/${id}`, version, main: 'lib/index.js',
    dsh: { mygo: { formatVersion: 1, id, version, entry: 'lib/index.js', core: '*' } },
  }, null, 2))
  await writeFile(join(dir, '.mygo-package.json'), JSON.stringify({
    ...factBase,
    entrySha512: createHash('sha512').update(entryBytes).digest('hex'),
    manifestSha256: sha256Text(JSON.stringify(factBase)),
    installedAt: '2026-08-13T00:00:00.000Z',
  }, null, 2))
}

describe('pack 共享缓存（内容寻址 + 原子发布 + hardlink 导入）', () => {
  let root: string
  let userDir: string
  let packPath: string
  let packSha512: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-cache-'))
    userDir = join(root, 'user-dir')
    const home = join(root, 'home-a')
    const installRoot = join(home, 'mygo', 'packages')
    await seedRestored(installRoot, 'calc', '1.0.0', 'export const apply = () => {}\n')
    const ctx: PackContext = {
      installRoot,
      tmpDir: join(home, 'mygo', 'tmp'),
      profile: 'web',
      managerVersion: '0.3.0',
    }
    await mkdir(ctx.tmpDir, { recursive: true })
    packPath = join(root, 'calc.mygo-pack')
    const built = await buildPluginPack(ctx, { output: packPath })
    if (!built.ok) throw new Error(`测试装置打包失败：${built.report.summary}`)
    packSha512 = createHash('sha512').update(await readFile(packPath)).digest('hex')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('发布：sha512 内容寻址 + 清单/成员校验通过 + 原子 rename（无 staging 残留）', async () => {
    const result = await cachePack(packPath, { root: userDir })
    expect(result.sha512).toBe(packSha512)
    expect(result.cached).toBe(false)
    expect(result.path).toBe(join(packCacheDir(userDir), `${packSha512}.mygo-pack`))
    // 内容寻址：缓存文件字节与原 pack 一致
    const cached = await readFile(result.path)
    expect(createHash('sha512').update(cached).digest('hex')).toBe(packSha512)
    const names = await readdir(packCacheDir(userDir))
    expect(names).toEqual([`${packSha512}.mygo-pack`])
  })

  it('第二次发布同内容 → 命中（cached: true，零新增文件）', async () => {
    const first = await cachePack(packPath, { root: userDir })
    const second = await cachePack(packPath, { root: userDir })
    expect(second.cached).toBe(true)
    expect(second.path).toBe(first.path)
    expect(await readdir(packCacheDir(userDir))).toHaveLength(1)
  })

  it('导入：hardlink 优先（同设备 inode 共享），目标已存在直接复用', async () => {
    const { sha512 } = await cachePack(packPath, { root: userDir })
    const destDir = join(root, 'home-b', 'mygo', 'tmp')
    const imported = await importCachedPack(sha512, destDir, { root: userDir })
    expect(imported.path).toBe(join(destDir, `${sha512}.mygo-pack`))
    expect(imported.via).toBe('hardlink')
    const { stat } = await import('node:fs/promises')
    const sourceStat = await stat(cachedPackPath(sha512, userDir))
    const destStat = await stat(imported.path)
    expect(destStat.ino).toBe(sourceStat.ino)
    // 再次导入：目标已存在，直接复用
    const again = await importCachedPack(sha512, destDir, { root: userDir })
    expect(again.path).toBe(imported.path)
  })

  it('拒绝入缓存：非 pack 字节 / 清单哈希失配 / vendored 成员失配', async () => {
    const garbage = join(root, 'garbage.mygo-pack')
    await writeFile(garbage, 'not a pack')
    await expect(cachePack(garbage, { root: userDir })).rejects.toThrow('拒绝入缓存')

    // 篡改 vendored 成员字节后重打包（清单哈希不更新）→ 清单自校验先拦
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    const staging = join(root, 'tamper')
    await mkdir(staging, { recursive: true })
    await execFileAsync('tar', ['-xzf', packPath, '-C', staging])
    const member = join(staging, 'files', '0.tgz')
    const bytes = Buffer.from(await readFile(member))
    bytes[0] = (bytes[0] ?? 0) ^ 0xff
    await writeFile(member, bytes)
    const tarPath = join(root, 'tampered.tar')
    await execFileAsync('tar', [
      '-cf', tarPath, '-C', staging,
      '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
      'mygo-pack.json', 'files',
    ])
    const { gzipSync } = await import('node:zlib')
    const tampered = join(root, 'tampered.mygo-pack')
    await writeFile(tampered, gzipSync(await readFile(tarPath)))
    await expect(cachePack(tampered, { root: userDir })).rejects.toThrow('拒绝入缓存')
    expect(await readdir(userDir).catch(() => [])).toEqual([])
  })

  it('非法寻址键拒绝（防路径逃逸）；缓存缺失指认 sha512', async () => {
    expect(() => cachedPackPath('not-hex', userDir)).toThrow('非法 pack 内容寻址 sha512')
    expect(() => cachedPackPath('../escape', userDir)).toThrow('非法 pack 内容寻址 sha512')
    const missing = 'a'.repeat(128)
    await expect(importCachedPack(missing, join(root, 'dest'), { root: userDir }))
      .rejects.toThrow('共享缓存中没有该 pack')
  })
})
