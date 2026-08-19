/**
 * design-r4 真实验证轮（T32-T43 / RT1-RT5）：
 * 真实语料（F1/F3/F4 + F2 样本）打包 → 离线还原 → 篡改/路径/社区/原子性。
 * 全部离线；pack 安装路径不触网（T37 计数断言 + 全量 NODE_OPTIONS 拦截）。
 * @module @r05en1cu/dsh-mygo/tests/e2e/pack-verification
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PluginPackageManager } from '../../src/package/package-manager.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'
import {
  computePackManifestSha256,
  listGzipTarMembers,
  parsePackManifest,
  type PackManifest,
} from '../../src/package/pack.ts'
import { CORPUS, corpusOf } from './corpus.ts'
import {
  installCorpusToStore,
  packCorpus,
  startOfflineRegistry,
  type PackedPackage,
} from './harness.ts'

const execFileAsync = promisify(execFile)

let root: string
let packed: PackedPackage[] = []
let registry: Awaited<ReturnType<typeof startOfflineRegistry>>
let packer: PluginPackageManager
let packerPaths: ReturnType<typeof resolveMygoPaths>
let packPath: string
let packPath2: string

/** 实测记录（写入 docs/plugin-pack-verification.md §4）。 */
export const PACK_PERF: Record<string, number> = {}
export const PACK_ARTIFACT: Record<string, string | number> = {}

function freshManager(home: string, profile = 'e2e'): PluginPackageManager {
  return new PluginPackageManager({
    paths: resolveMygoPaths(profile, { DSH_HOME: home }),
    profile,
    coreVersion: '0.0.1-rc.1',
    managerVersion: '0.3.0-e2e',
  })
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 枚举 installRoot 下已还原的 (id, version) 对（确定性序）。 */
async function restoredSet(home: string): Promise<readonly string[]> {
  const packagesRoot = join(home, 'mygo', 'packages')
  const out: string[] = []
  let ids: string[] = []
  try {
    ids = (await readdir(packagesRoot)).sort()
  } catch {
    return []
  }
  for (const id of ids) {
    const versions = (await readdir(join(packagesRoot, id))).sort()
    for (const version of versions) out.push(`${id}@${version}`)
  }
  return out
}

/** 从 pack 文件解析清单（测试辅助）。 */
async function readPackManifest(pack: string): Promise<PackManifest> {
  const unpacked = listGzipTarMembers(new Uint8Array(await readFile(pack)))
  const member = unpacked.members?.find(item => item.name === 'mygo-pack.json')
  if (unpacked.tar === undefined || member === undefined) throw new Error('pack 无清单')
  const parsed = parsePackManifest(JSON.parse(
    Buffer.from(unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size)).toString('utf8'),
  ))
  if (parsed.value === undefined) throw new Error(`pack 清单无效：${parsed.problems.map(p => p.message).join('；')}`)
  return parsed.value
}

/** 确定性重新归档（test 侧复用打包器同款选项；gzip -n）。 */
async function deterministicPack(staging: string, out: string, members: readonly string[]): Promise<void> {
  const tar = join(staging, 'archive.tar')
  await execFileAsync('tar', [
    '-cf', tar,
    '-C', staging,
    '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    ...members,
  ])
  const { stdout } = await execFileAsync('gzip', ['-n', '-c', tar], { encoding: 'buffer' })
  await writeFile(out, stdout)
}

async function withStaging<T>(fn: (staging: string) => Promise<T>): Promise<T> {
  const staging = await mkdtemp(join(tmpdir(), 'mygo-pack-e2e-'))
  try {
    return await fn(staging)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/** 解包 → 改清单并重算哈希 → 重新归档。 */
async function repackWithManifestMutation(
  source: string,
  out: string,
  mutate: (manifest: PackManifest) => void,
  recomputeHash = true,
): Promise<void> {
  await withStaging(async staging => {
    await execFileAsync('tar', ['-xzf', source, '-C', staging])
    const manifest = await readPackManifest(source)
    mutate(manifest)
    const next = {
      ...manifest,
      ...(recomputeHash ? { manifestSha256: computePackManifestSha256(manifest) } : {}),
    }
    await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(next, null, 2) + '\n')
    await deterministicPack(staging, out, ['mygo-pack.json', 'files'])
  })
}

/** 解包 → 翻转一个 vendored 文件字节（不更新清单哈希）→ 重新归档。 */
async function repackWithFileTamper(source: string, out: string, index: number): Promise<void> {
  await withStaging(async staging => {
    await execFileAsync('tar', ['-xzf', source, '-C', staging])
    const target = join(staging, 'files', `${index}.tgz`)
    const bytes = Buffer.from(await readFile(target))
    bytes[0] = (bytes[0] ?? 0) ^ 0xff
    await writeFile(target, bytes)
    await deterministicPack(staging, out, ['mygo-pack.json', 'files'])
  })
}

function minimalManifest(): PackManifest {
  return {
    format: 'mygo-pack/v1',
    formatVersion: 1,
    name: 'minimal',
    version: '1.0.0',
    generated: { by: 'dsh-mygo', version: '0.3.0-e2e', profile: 'e2e', at: '<t>' },
    manifestSha256: '',
    plugins: [],
    files: [],
    communityDeps: [],
  }
}

async function writePackFromStaging(out: string, fn: (staging: string) => Promise<void>): Promise<string> {
  await withStaging(async staging => {
    await fn(staging)
    await deterministicPack(staging, out, ['mygo-pack.json', 'files'])
  })
  return out
}

async function expectStoreEmpty(home: string): Promise<void> {
  const packagesRoot = join(home, 'mygo', 'packages')
  let entries: string[] = []
  try {
    entries = await readdir(packagesRoot)
  } catch {
    entries = []
  }
  expect(entries).toEqual([])
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mygo-pack-e2e-root-'))
  const installable = CORPUS.filter(plugin => plugin.entry !== '' && ['F1', 'F3', 'F4'].includes(plugin.category))
    .concat(corpusOf('F2').filter(plugin => plugin.id === 'dsh-tool-time'))
  packed = await Promise.all(installable.map(packCorpus))
  registry = await startOfflineRegistry(packed)
  const installed = await installCorpusToStore(packed, registry.url, 'e2e')
  packer = installed.manager
  packerPaths = installed.paths
  packPath = join(root, 'first.mygo-pack')
  packPath2 = join(root, 'second.mygo-pack')
  const firstStart = performance.now()
  const built = await packer.buildPack({ output: packPath })
  PACK_PERF['buildPack-first'] = performance.now() - firstStart
  if (!built.ok) throw new Error(`buildPack 失败：${built.report.summary}`)
  const secondStart = performance.now()
  const built2 = await packer.buildPack({ output: packPath2 })
  PACK_PERF['buildPack-deterministic'] = performance.now() - secondStart
  if (!built2.ok) throw new Error(`buildPack 第二次失败：${built2.report.summary}`)
  const firstBytes = new Uint8Array(await readFile(packPath))
  PACK_ARTIFACT['packBytes'] = firstBytes.length
  PACK_ARTIFACT['packSha256'] = sha256Hex(firstBytes)
}, 120_000)

afterAll(async () => {
  console.log(`[pack-perf] ${JSON.stringify({ perf: PACK_PERF, artifact: PACK_ARTIFACT })}`)
  await registry?.close()
  await rm(root, { recursive: true, force: true })
})

describe('T32 打包确定性', () => {
  it('同一 store 两次 buildPack 产物逐字节一致', async () => {
    const first = new Uint8Array(await readFile(packPath))
    const second = new Uint8Array(await readFile(packPath2))
    expect(sha256Hex(first)).toBe(sha256Hex(second))
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0)
  })
})

describe('T33 RT1 打包→还原往返', () => {
  it('全新空 installRoot 还原后 (id, version) 集合与打包方一致', async () => {
    const home = join(root, 'rt1-home')
    const receiver = freshManager(home)
    const start = performance.now()
    const outcome = await receiver.installPack(packPath)
    PACK_PERF['installPack-fresh'] = performance.now() - start
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const packerHome = dirname(packerPaths.base)
    const expected = await restoredSet(packerHome)
    expect(expected.length).toBeGreaterThan(0)
    expect(outcome.restored.map(entry => `${entry.id}@${entry.version}`)).toEqual(expected)
    expect(await restoredSet(home)).toEqual(expected)
  }, 60_000)
})

describe('T34 RT2 篡改检测', () => {
  it('vendored 单字节翻转 → pack-hash-mismatch 并指认文件', async () => {
    const tampered = join(root, 'tampered-file.mygo-pack')
    await repackWithFileTamper(packPath, tampered, 0)
    const receiver = freshManager(join(root, 'tamper-home'))
    const outcome = await receiver.installPack(tampered)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-hash-mismatch')
    expect(outcome.report.scope).toBe('pack')
    expect(outcome.report.conflicts[0]?.constraint.target).toBe('files/0.tgz')
    expect(outcome.report.summary).toContain('1 个文件')
  }, 60_000)

  it('清单单字节翻转 → manifestSha256 失配拒绝', async () => {
    const tampered = join(root, 'tampered-manifest.mygo-pack')
    await repackWithManifestMutation(packPath, tampered, manifest => {
      manifest.name = 'tampered-name'
    }, false)
    const receiver = freshManager(join(root, 'tamper-m-home'))
    const outcome = await receiver.installPack(tampered)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('manifestSha256')
  }, 60_000)
})

describe('T35 RT3 路径穿越', () => {
  it('`..` 成员 → pack-invalid，无任何写盘', async () => {
    const evil = join(root, 'evil-dotdot.mygo-pack')
    await withStaging(async staging => {
      await mkdir(join(staging, 'files'), { recursive: true })
      const manifest = { ...minimalManifest(), manifestSha256: computePackManifestSha256(minimalManifest()) }
      await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
      await writeFile(join(staging, 'evil.txt'), 'evil')
      const tar = join(staging, 'a.tar')
      await execFileAsync('tar', [
        '-cf', tar, '-C', staging,
        '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
        '--transform=s,^evil.txt,../evil.txt,',
        'mygo-pack.json', 'files', 'evil.txt',
      ])
      const { stdout } = await execFileAsync('gzip', ['-n', '-c', tar], { encoding: 'buffer' })
      await writeFile(evil, stdout)
    })
    const home = join(root, 'evil-home')
    const receiver = freshManager(home)
    const outcome = await receiver.installPack(evil)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('未知/非法成员')
    await expectStoreEmpty(home)
  })

  it('绝对路径与符号链接子路径成员 → pack-invalid（不逃逸）', async () => {
    const evilAbs = join(root, 'evil-abs.mygo-pack')
    await withStaging(async staging => {
      await mkdir(join(staging, 'files'), { recursive: true })
      const manifest = { ...minimalManifest(), manifestSha256: computePackManifestSha256(minimalManifest()) }
      await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
      await writeFile(join(staging, 'evil.txt'), 'evil')
      const tar = join(staging, 'a.tar')
      await execFileAsync('tar', [
        '-cf', tar, '-C', staging,
        '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
        '--transform=s,^evil.txt,/tmp/evil.txt,',
        'mygo-pack.json', 'files', 'evil.txt',
      ])
      const { stdout } = await execFileAsync('gzip', ['-n', '-c', tar], { encoding: 'buffer' })
      await writeFile(evilAbs, stdout)
    })
    const home = join(root, 'evil-abs-home')
    const receiver = freshManager(home)
    expect((await receiver.installPack(evilAbs)).ok).toBe(false)

    const evilSym = join(root, 'evil-sym.mygo-pack')
    const outside = join(root, 'evil-outside')
    await mkdir(outside, { recursive: true })
    await withStaging(async staging => {
      await mkdir(join(staging, 'files'), { recursive: true })
      await mkdir(join(staging, 'real'), { recursive: true })
      const manifest = { ...minimalManifest(), manifestSha256: computePackManifestSha256(minimalManifest()) }
      await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
      await writeFile(join(staging, 'real', 'pwn.txt'), 'pwn')
      await execFileAsync('ln', ['-s', outside, join(staging, 'link')])
      const tar = join(staging, 'a.tar')
      await execFileAsync('tar', [
        '-cf', tar, '-C', staging,
        '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
        '--transform=s,^real/pwn.txt,link/pwn.txt,',
        'mygo-pack.json', 'files', 'link', 'real/pwn.txt',
      ])
      const { stdout } = await execFileAsync('gzip', ['-n', '-c', tar], { encoding: 'buffer' })
      await writeFile(evilSym, stdout)
    })
    const symReceiver = freshManager(home)
    expect((await symReceiver.installPack(evilSym)).ok).toBe(false)
    expect(await readdir(outside)).toEqual([])
  })
})

describe('T36 RT4 社区混合 + T40 双存在', () => {
  it('communityDeps 告警可见、安装不阻断', async () => {
    const home = join(root, 'rt4-home')
    const receiver = freshManager(home)
    const outcome = await receiver.installPack(packPath)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.warnings.some(warning => warning.includes('社区依赖'))).toBe(true)
    expect(outcome.warnings.some(warning => warning.includes('dsh-tool-time'))).toBe(true)
  }, 60_000)

  it('pack 内双存在 → 告警不阻断', async () => {
    const withDual = join(root, 'dual.mygo-pack')
    await repackWithManifestMutation(packPath, withDual, manifest => {
      manifest.communityDeps = [
        ...manifest.communityDeps,
        { name: '@dsh-external/dsh-voice-chat', range: '*', kind: 'peerDependency', owner: 'dsh-vibe-mode' },
      ]
    })
    const receiver = freshManager(join(root, 'dual-home'))
    const outcome = await receiver.installPack(withDual)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.warnings.some(warning => warning.includes('双存在风险'))).toBe(true)
  }, 60_000)
})

describe('T37 RT5 离线分发', () => {
  it('fetch 拦截计数为零：pack 安装路径完全不触网', async () => {
    const originalFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      calls += 1
      return originalFetch(...args)
    }) as typeof fetch
    try {
      const receiver = freshManager(join(root, 'offline-home'))
      const outcome = await receiver.installPack(packPath)
      expect(outcome.ok).toBe(true)
      expect(calls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  }, 60_000)
})

describe('T38/T39/T41/T42 失败语义', () => {
  it('T38 formatVersion 不兼容 → pack-invalid', async () => {
    const bad = join(root, 'bad-format.mygo-pack')
    await writePackFromStaging(bad, async staging => {
      await mkdir(join(staging, 'files'), { recursive: true })
      const manifest = { ...minimalManifest(), formatVersion: 2 as never, manifestSha256: 'a'.repeat(64) }
      await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
    })
    const outcome = await freshManager(join(root, 'bad-format-home')).installPack(bad)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('formatVersion')
  })

  it('T41 files[].path 逃逸 → pack-invalid', async () => {
    const bad = join(root, 'bad-path.mygo-pack')
    await writePackFromStaging(bad, async staging => {
      await mkdir(join(staging, 'files'), { recursive: true })
      const manifest = minimalManifest()
      manifest.plugins = [{ id: 'calc', version: '1.0.0', packageName: '@test/calc' }]
      manifest.files = [{
        path: '../evil.tgz',
        pluginId: 'calc',
        version: '1.0.0',
        packageName: '@test/calc',
        sha512: 'c'.repeat(128),
        fileSize: 0,
      }]
      manifest.manifestSha256 = computePackManifestSha256(manifest)
      await writeFile(join(staging, 'mygo-pack.json'), JSON.stringify(manifest, null, 2) + '\n')
    })
    const outcome = await freshManager(join(root, 'bad-path-home')).installPack(bad)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-invalid')
    expect(outcome.report.summary).toContain('files[0].path')
  })

  it('T42 一坏多好 → 整体拒绝、store 零写入、全量冲突', async () => {
    const tampered = join(root, 'atomic.mygo-pack')
    await repackWithFileTamper(packPath, tampered, 1)
    const home = join(root, 'atomic-home')
    const outcome = await freshManager(home).installPack(tampered)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('pack-hash-mismatch')
    expect(outcome.report.conflicts).toHaveLength(1)
    await expectStoreEmpty(home)
  }, 60_000)
})

describe('T43 KF-1 回归（F1 src 全量打包）', () => {
  it('F1 含 src 的桥接安装不再误伤已声明/自引用 import', async () => {
    const f1 = packed.find(item => item.plugin.id === 'dsh-cordis-fabric')
    expect(f1).toBeDefined()
    const singleHome = join(root, 'kf1-home')
    const paths = resolveMygoPaths('e2e', { DSH_HOME: singleHome })
    const manager = new PluginPackageManager({
      paths,
      profile: 'e2e',
      registry: registry.url,
      coreVersion: '0.0.1-rc.1',
      managerVersion: '0.3.0-e2e',
    })
    const outcome = await manager.resolveInstall({ package: '@deepseek-ai/dsh-cordis-fabric' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.warnings.join('\n')).not.toContain('未声明 dsh 核心调用')
  }, 60_000)
})
