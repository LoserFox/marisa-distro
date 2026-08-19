/**
 * design-r4 单元测试（2026-08-13 范围重塑口径）：pack 清单/规范哈希/tar
 * 成员解析鲁棒性 + 还原路径加固。dsh.lock/v1 载荷与求解器已删除：清单只
 * 携带 (id, version) 钉死声明，还原为普通落盘（installRoot），成员级
 * sha512/fileSize 校验为 pack 自身完整性服务（保留）。
 * 字节级确定性断言与真实往返在 tests/e2e/pack-verification.spec.ts（T32+）。
 * @module @r05en1cu/dsh-mygo/tests/package/pack
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  computePackManifestSha256,
  canonicalPackPayload,
  installPluginPack,
  listTarMembers,
  listGzipTarMembers,
  MAX_GUNZIP_BYTES,
  MAX_TAR_MEMBERS,
  parsePackManifest,
  type PackContext,
  type PackManifest,
} from '../../src/package/pack.ts'
import { detectUndeclaredBundles } from '../../src/package/bundle-scan.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'

const execFileAsync = promisify(execFile)

function sampleManifest(overrides: Partial<PackManifest> = {}): PackManifest {
  return {
    format: 'mygo-pack/v1',
    formatVersion: 1,
    name: 'sample',
    version: '1.0.0',
    generated: { by: 'dsh-mygo', version: '0.3.0', profile: 'web', at: '<t>' },
    manifestSha256: '',
    plugins: [{ id: 'calc', version: '1.0.0', packageName: '@test/calc' }],
    files: [{
      path: 'files/0.tgz',
      pluginId: 'calc',
      version: '1.0.0',
      packageName: '@test/calc',
      sha512: 'c'.repeat(128),
      fileSize: 0,
    }],
    communityDeps: [],
    ...overrides,
  }
}

describe('pack manifest schema + 规范哈希', () => {
  it('canonical 载荷归一 generated.at，两次计算哈希一致', () => {
    const first = sampleManifest()
    const second = sampleManifest({
      generated: { by: 'dsh-mygo', version: '0.3.0', profile: 'web', at: '2026-08-12T01:00:00.000Z' },
    })
    expect(canonicalPackPayload(first).generated).toMatchObject({ at: '<t>' })
    expect(computePackManifestSha256(first)).toBe(computePackManifestSha256(second))
    expect(computePackManifestSha256(first)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('parsePackManifest 往返保持同一规范哈希', () => {
    const manifest = { ...sampleManifest(), manifestSha256: computePackManifestSha256(sampleManifest()) }
    const parsed = parsePackManifest(JSON.parse(JSON.stringify(manifest)))
    expect(parsed.problems).toEqual([])
    expect(parsed.value).toBeDefined()
    expect(computePackManifestSha256(parsed.value as PackManifest)).toBe(manifest.manifestSha256)
  })

  it('拒绝 formatVersion 不兼容（T38 基础）', () => {
    const parsed = parsePackManifest({ ...sampleManifest(), formatVersion: 2 })
    expect(parsed.value).toBeUndefined()
    expect(parsed.problems.some(problem => problem.path === 'formatVersion')).toBe(true)
  })

  it('拒绝 files[].path 逃逸（T41 基础）', () => {
    const manifest = sampleManifest({
      files: [{
        path: '../evil.tgz',
        pluginId: 'calc',
        version: '1.0.0',
        packageName: '@test/calc',
        sha512: 'c'.repeat(128),
        fileSize: 0,
      }],
    })
    const parsed = parsePackManifest(manifest)
    expect(parsed.value).toBeUndefined()
    expect(parsed.problems.some(problem => problem.path === 'files[0].path')).toBe(true)
  })

  it('拒绝非法 communityDeps 与缺 version 的 plugins 声明', () => {
    const badKind = parsePackManifest({
      ...sampleManifest(),
      communityDeps: [{ name: 'x', range: '*', kind: 'runtime', owner: 'calc' }],
    })
    expect(badKind.value).toBeUndefined()
    expect(badKind.problems.some(problem => problem.path === 'communityDeps[0].kind')).toBe(true)

    const noVersion = parsePackManifest({
      ...JSON.parse(JSON.stringify(sampleManifest())) as Record<string, unknown>,
      plugins: [{ id: 'calc', packageName: '@test/calc' }],
    })
    expect(noVersion.value).toBeUndefined()
    expect(noVersion.problems.some(problem => problem.path === 'plugins[0].version')).toBe(true)
  })
})

describe('tar 成员解析鲁棒性（design-r4 §3）', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-unit-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('换行文件名是一个成员而非两行（逐行白名单可被绕过的实证）', async () => {
    const src = join(root, 'src')
    await mkdir(src, { recursive: true })
    await writeFile(join(src, 'evil\nname.txt'), 'x')
    const tar = join(root, 'nl.tar')
    await execFileAsync('tar', ['-cf', tar, '-C', src, '.'])
    const parsed = listTarMembers(new Uint8Array(await readFile(tar)))
    expect(parsed.problems).toEqual([])
    const evil = parsed.members.filter(member => member.name.includes('\n'))
    expect(evil).toHaveLength(1)
    expect(evil[0]?.name).toBe('evil\nname.txt')
  })

  it('gzip 损坏 → problems 而非抛错', async () => {
    const parsed = listGzipTarMembers(new Uint8Array([1, 2, 3]))
    expect(parsed.members).toBeUndefined()
    expect(parsed.problems.length).toBeGreaterThan(0)
  })
})

describe('KF-1 分类修正（design-r4 §9 / B26）', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-kf1-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-cordis-fabric',
      peerDependencies: { '@deepseek-ai/dsh-tools': '*' },
    }))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function writeSource(content: string): Promise<void> {
    await writeFile(join(root, 'src', 'a.ts'), content)
  }

  it('无声明信息时整包扫描仍抓全部 @deepseek-ai import', async () => {
    await writeSource("import { defineTool } from '@deepseek-ai/dsh-tools'\n")
    const problems = await detectUndeclaredBundles(root, [])
    expect(problems.some(problem => problem.includes('dsh-tools'))).toBe(true)
  })

  it('npm 声明内 + 自身包名不误伤；未声明仍硬错', async () => {
    await writeSource([
      "import { defineTool } from '@deepseek-ai/dsh-tools'\n",
      "import type { Agent } from '@deepseek-ai/dsh-agent'\n",
      "import { api } from '@deepseek-ai/dsh-cordis-fabric/api'\n",
      "import { ghost } from '@deepseek-ai/ghost'\n",
    ].join(''))
    const declared = new Set(['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent'])
    const problems = await detectUndeclaredBundles(root, [], {
      declaredSpecifiers: declared,
      selfPackageName: '@deepseek-ai/dsh-cordis-fabric',
    })
    expect(problems.some(problem => problem.includes('dsh-tools'))).toBe(false)
    expect(problems.some(problem => problem.includes('dsh-agent'))).toBe(false)
    expect(problems.some(problem => problem.includes('dsh-cordis-fabric'))).toBe(false)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('@deepseek-ai/ghost')
  })

  it('子路径 import 按包名归一后命中声明', async () => {
    await writeSource("import type { Command } from '@deepseek-ai/dsh-tools/client'\n")
    const problems = await detectUndeclaredBundles(root, [], {
      declaredSpecifiers: new Set(['@deepseek-ai/dsh-tools']),
    })
    expect(problems).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// installPluginPack 还原路径加固（修复批次 1：A4 / A18 / A7 / A5-pack；
// 2026-08-13 重塑：落盘目录取代 store/lockfile 断言）
// 合成 fixture 全部在本测试自建目录内；不触碰真实第三方语料。
// ---------------------------------------------------------------------------

const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
const sha512Bytes = (bytes: Uint8Array): string => createHash('sha512').update(bytes).digest('hex')

interface CraftedPlugin {
  readonly id: string
  readonly version: string
  readonly tgz: Buffer
}

/** 造一个插件源目录并确定性打成 vendored tgz（package/ 根，gzip 无时间戳）。 */
async function craftPlugin(
  dir: string,
  id: string,
  version = '1.0.0',
  extraEvilMember = false,
): Promise<CraftedPlugin> {
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: `@test/${id}`, version, main: 'lib/index.js',
    dsh: { mygo: { formatVersion: 1, id, version, entry: 'lib/index.js', core: '*' } },
  }, null, 2))
  await writeFile(join(dir, 'lib', 'index.js'), 'export const apply = () => {}\n')
  const args = ['-cf', join(dir, 'inner.tar'), '-C', dir,
    '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '--transform=s,^\\./,package/,']
  if (extraEvilMember) {
    await writeFile(join(dir, 'evil.txt'), 'evil')
    args.push('--transform=s,^package/evil\\.txt,../evil.txt,')
  }
  args.push('.')
  await execFileAsync('tar', args)
  const tgz = gzipSync(await readFile(join(dir, 'inner.tar')))
  return { id, version, tgz }
}

interface CraftPackOptions {
  /** 替换 files[<index>] 的实际字节与清单值（sha512/fileSize 以清单为准，可制造失配）。 */
  readonly fileContent?: ReadonlyMap<number, { readonly bytes: Buffer; readonly sha512: string; readonly fileSize: number }>
  readonly overrides?: Partial<PackManifest>
}

/** 把插件列表打成合法 mygo-pack（清单哈希按规范键序计算）。 */
async function craftPack(
  root: string,
  plugins: readonly CraftedPlugin[],
  options: CraftPackOptions = {},
): Promise<string> {
  const staging = join(root, 'staging')
  await mkdir(join(staging, 'files'), { recursive: true })
  const files: PackManifest['files'] = []
  for (const [index, plugin] of plugins.entries()) {
    const override = options.fileContent?.get(index)
    const bytes = override?.bytes ?? plugin.tgz
    await writeFile(join(staging, 'files', `${index}.tgz`), bytes)
    files.push({
      path: `files/${index}.tgz`,
      pluginId: plugin.id,
      version: plugin.version,
      packageName: `@test/${plugin.id}`,
      sha512: override?.sha512 ?? sha512Bytes(new Uint8Array(plugin.tgz)),
      fileSize: override?.fileSize ?? plugin.tgz.length,
    })
  }
  const base: Omit<PackManifest, 'manifestSha256'> = {
    format: 'mygo-pack/v1',
    formatVersion: 1,
    name: 'test-pack',
    version: '1.0.0',
    generated: { by: 'dsh-mygo', version: '0.3.0', profile: 'web', at: '<t>' },
    plugins: plugins.map(plugin => ({ id: plugin.id, version: plugin.version, packageName: `@test/${plugin.id}` })),
    files,
    communityDeps: [],
    ...options.overrides,
  }
  const manifest = { ...base, manifestSha256: computePackManifestSha256(base) }
  await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
  const tarPath = join(root, 'pack.tar')
  await execFileAsync('tar', ['-cf', tarPath, '-C', staging, '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', 'mygo-pack.json', 'files'])
  const out = join(root, 'out.mygo-pack')
  await writeFile(out, gzipSync(await readFile(tarPath)))
  return out
}

/** 造一个非空 installRoot：n 个无关插件的已还原目录（含事实文件）。 */
async function seedInstallRoot(home: string, ids: readonly string[]): Promise<void> {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  for (const id of ids) {
    const version = '1.0.0'
    const entryBytes = 'export const apply = () => {}\n'
    const dir = join(paths.packagesRoot, id, version)
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
      installedAt: '2026-08-12T00:00:00.000Z',
    }, null, 2))
  }
}

async function listRestoredIds(home: string): Promise<string[]> {
  try {
    return await readdir(join(home, 'mygo', 'packages'))
  } catch {
    return []
  }
}

function packCtx(home: string): PackContext {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  return { installRoot: paths.packagesRoot, tmpDir: paths.tmpDir, profile: 'web', managerVersion: '0.3.0' }
}

/** 最小 tar 头（合成成员 flood 用；解析器不校验 checksum）。 */
function tarHeader(name: string, typeflag = '0'): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0, 'utf8')
  header.write('0000644\0', 100, 'utf8')
  header.fill(0x20, 148, 156)
  header.write(typeflag, 156, 'utf8')
  let sum = 0
  for (const byte of header) sum += byte
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')
  return header
}

describe('installPluginPack 还原路径加固（修复批次 1：A4/A18/A7/A5-pack）', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-restore-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('A4-验收1：合法 pack 还原到已装 2 个无关插件的非空 installRoot → ok，仅新增 pack 插件', async () => {
    const home = join(root, 'home')
    await seedInstallRoot(home, ['x-one', 'x-two'])
    const calc = await craftPlugin(join(root, 'calc-src'), 'calc')
    const outcome = await installPluginPack(packCtx(home), await craftPack(root, [calc]))
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.restored).toEqual([{ id: 'calc', version: '1.0.0' }])
    expect(await listRestoredIds(home)).toEqual(['calc', 'x-one', 'x-two'])
  })

  it('A4-验收2（故障注入）：第 2 个 vendored 文件哈希不匹配 → pack-hash-mismatch，installRoot 零新增', async () => {
    const home = join(root, 'home')
    await seedInstallRoot(home, ['x-one'])
    const good = await craftPlugin(join(root, 'good-src'), 'a-good')
    const bad = await craftPlugin(join(root, 'bad-src'), 'z-bad')
    const tampered = Buffer.from(bad.tgz)
    tampered[0] = (tampered[0] ?? 0) ^ 0xff
    const packPath = await craftPack(root, [good, bad], {
      fileContent: new Map([[1, {
        bytes: tampered,
        sha512: sha512Bytes(new Uint8Array(bad.tgz)), // 清单哈希保持原值 → 失配
        fileSize: bad.tgz.length,
      }]]),
    })
    const outcome = await installPluginPack(packCtx(home), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-hash-mismatch')
    expect(outcome.report.conflicts[0]?.constraint.target).toBe('files/1.tgz')
    expect(await listRestoredIds(home)).toEqual(['x-one'])
  })

  it('A4-原子性：第 2 个插件提取失败（tar 拒收 .. 成员）→ 回滚第 1 个已还原插件，installRoot 零残留', async () => {
    const home = join(root, 'home')
    await seedInstallRoot(home, ['x-one'])
    const good = await craftPlugin(join(root, 'good-src'), 'a-good')
    const bad = await craftPlugin(join(root, 'bad-src'), 'z-bad', '1.0.0', true)
    const packPath = await craftPack(root, [good, bad])
    const outcome = await installPluginPack(packCtx(home), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('还原失败')
    expect(outcome.report.summary).toContain('z-bad')
    expect(await listRestoredIds(home)).toEqual(['x-one'])
  })

  it('A4-预检：plugins[] 含 files[] 缺失的 id → pack-invalid（最早时机）', async () => {
    const a = await craftPlugin(join(root, 'a-src'), 'a')
    const packPath = await craftPack(root, [a], {
      overrides: {
        plugins: [
          { id: 'a', version: '1.0.0', packageName: '@test/a' },
          { id: 'ghost', version: '1.0.0', packageName: '@test/ghost' },
        ],
      },
    })
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('不一一对应')
    expect(outcome.report.summary).toContain('ghost')
  })

  it('A4-预检：files[] 下标与 path 错位 → pack-invalid', async () => {
    const a = await craftPlugin(join(root, 'a-src'), 'a')
    const b = await craftPlugin(join(root, 'b-src'), 'b')
    // files[0] 声明 path=files/1.tgz、files[1] 声明 path=files/0.tgz：两个成员都存在
    // （不触发成员白名单），但下标与 path 错位 → 预检拒绝。
    const packPath = await craftPack(root, [a, b], {
      overrides: {
        files: [
          { path: 'files/1.tgz', pluginId: 'a', version: '1.0.0', packageName: '@test/a', sha512: 'c'.repeat(128), fileSize: 0 },
          { path: 'files/0.tgz', pluginId: 'b', version: '1.0.0', packageName: '@test/b', sha512: 'd'.repeat(128), fileSize: 0 },
        ],
      },
    })
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('files[0].path')
  })

  it('A18：空 pack 还原到空 installRoot → pack-invalid', async () => {
    const outcome = await installPluginPack(packCtx(join(root, 'home-empty')), await craftPack(root, []))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('不含任何插件')
  })

  it('A18：空 pack 还原到非空 installRoot → pack-invalid（installRoot 不变）', async () => {
    const home = join(root, 'home-nonempty')
    await seedInstallRoot(home, ['x-one'])
    const outcome = await installPluginPack(packCtx(home), await craftPack(root, []))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('不含任何插件')
    expect(await listRestoredIds(home)).toEqual(['x-one'])
  })

  it('A7：外层 pack gzip 解压超限 → pack-invalid（summary 含上限值）', async () => {
    const bomb = gzipSync(Buffer.alloc(MAX_GUNZIP_BYTES + 1024 * 1024))
    const packPath = join(root, 'bomb.mygo-pack')
    await writeFile(packPath, bomb)
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain(String(MAX_GUNZIP_BYTES))
  })

  it('A7：外层 pack 成员数超限 → pack-invalid（summary 含上限值）', async () => {
    const parts: Buffer[] = []
    for (let index = 0; index <= MAX_TAR_MEMBERS; index += 1) parts.push(tarHeader(`f/${index}.tgz`))
    parts.push(Buffer.alloc(1024))
    const packPath = join(root, 'flood.mygo-pack')
    await writeFile(packPath, gzipSync(Buffer.concat(parts)))
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain(String(MAX_TAR_MEMBERS))
  })

  it('A7：内层 vendored tgz 解压超限 → pack-invalid（预检路径同样受上限）', async () => {
    const a = await craftPlugin(join(root, 'a-src'), 'a')
    const bomb = gzipSync(Buffer.alloc(MAX_GUNZIP_BYTES + 1024 * 1024))
    const packPath = await craftPack(root, [a], {
      fileContent: new Map([[0, {
        bytes: bomb,
        sha512: sha512Bytes(new Uint8Array(bomb)),
        fileSize: bomb.length,
      }]]),
    })
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain(String(MAX_GUNZIP_BYTES))
  })

  it('A5-pack：畸形 JSON 清单 → pack-invalid 带文件指针（不抛异常）', async () => {
    const staging = join(root, 'staging')
    await mkdir(join(staging, 'files'), { recursive: true })
    await writeFile(join(staging, 'mygo-pack.json'), '{oops\n')
    const tarPath = join(root, 'bad.tar')
    await execFileAsync('tar', ['-cf', tarPath, '-C', staging, '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', 'mygo-pack.json', 'files'])
    const packPath = join(root, 'bad-json.mygo-pack')
    await writeFile(packPath, gzipSync(await readFile(tarPath)))
    const outcome = await installPluginPack(packCtx(join(root, 'home')), packPath)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('不是合法 JSON')
    expect(outcome.report.summary).toContain('mygo-pack.json')
  })
})
