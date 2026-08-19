/**
 * T44/T45/T47/T49：CLI 级 E2E（design-r5 §8）。
 * 真实语料 → pack → 空 profile restore（RT1 口径经 CLI 复验）；
 * 篡改包经 CLI restore → 非零退出 + 指认文件 + 报告；自举（吃自己的狗粮）；
 * 被动语义。全程离线（本地 registry 桩 + fetch 拦截由全量回归统一覆盖）。
 * @module @r05en1cu/dsh-mygo-cli/tests/cli-e2e
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listGzipTarMembers,
  parsePackManifest,
  resolveMygoPaths,
  type PackManifest,
} from '@r05en1cu/dsh-mygo'
import { apply, internals, invokeCli } from '../src/index.ts'
import { collector, mountCliComposition, seedStore } from './helpers.ts'
import { packCorpus, startOfflineRegistry } from '../../mygo/tests/e2e/harness.ts'
import { CORPUS, type CorpusPlugin } from '../../mygo/tests/e2e/corpus.ts'

const execFileAsync = promisify(execFile)

const CLI_PKG_ROOT = fileURLToPath(new URL('../', import.meta.url))
const ORIGINAL_DSH_HOME = process.env.DSH_HOME
const ORIGINAL_DSH_CORE_VERSION = process.env.DSH_CORE_VERSION

function sha256File(path: string): Promise<string> {
  return readFile(path).then(bytes => createHash('sha256').update(bytes).digest('hex'))
}

async function readPackManifest(pack: string): Promise<PackManifest> {
  const bytes = new Uint8Array(await readFile(pack))
  const unpacked = listGzipTarMembers(bytes)
  const member = unpacked.members?.find(item => item.name === 'mygo-pack.json')
  if (unpacked.tar === undefined || member === undefined) throw new Error('pack 无清单')
  const parsed = parsePackManifest(JSON.parse(
    Buffer.from(unpacked.tar.subarray(member.dataOffset, member.dataOffset + member.size)).toString('utf8'),
  ))
  if (parsed.value === undefined) throw new Error(`pack 清单无效：${parsed.problems.map(p => p.message).join('；')}`)
  return parsed.value
}

/** 为一次调用重挂输出收集器（invokeCli 之间互不污染）。 */
function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

/** 确定性重新归档（test 侧复用打包器同款选项）。 */
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

/** 解包 → 翻转一个 vendored 文件字节（不更新清单哈希）→ 重新归档。 */
async function repackWithFileTamper(source: string, out: string, index: number): Promise<void> {
  const staging = await mkdtemp(join(tmpdir(), 'mygo-cli-tamper-'))
  try {
    await execFileAsync('tar', ['-xzf', source, '-C', staging])
    const target = join(staging, 'files', `${index}.tgz`)
    const bytes = Buffer.from(await readFile(target))
    bytes[0] = (bytes[0] ?? 0) ^ 0xff
    await writeFile(target, bytes)
    await deterministicPack(staging, out, ['mygo-pack.json', 'files'])
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/** CLI 插件自身作为自举语料。 */
function cliCorpus(): CorpusPlugin {
  return {
    category: 'F1',
    id: 'dsh-mygo-cli',
    name: '@r05en1cu/dsh-mygo-cli',
    dir: CLI_PKG_ROOT,
    entry: 'src/index.ts',
    trust: 'trusted',
    reviewNote: 'mygo CLI 插件自身（本仓库包），T47 自举语料',
    packParts: ['package.json', 'src'],
    versionOverride: '0.2.0-rc.0',
    // 仓库包清单依赖是 workspace:^（未发布）；打包期归一为 semver 占位，
    // 避免 communityDeps 区间校验把 pack 判无效（F1 同款处理）。
    packageJsonOverlay: {
      dependencies: { '@r05en1cu/dsh-mygo': '*', '@deepseek-ai/dsh-app-boot': '*' },
    },
    manifestOverlay: {
      id: 'dsh-mygo-cli',
      version: '0.2.0-rc.0',
      entry: 'src/index.ts',
      core: '*',
      requires: {},
    },
  }
}

describe('CLI E2E（T44/T45/T47/T49）', () => {
  afterEach(() => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    if (ORIGINAL_DSH_CORE_VERSION === undefined) delete process.env.DSH_CORE_VERSION
    else process.env.DSH_CORE_VERSION = ORIGINAL_DSH_CORE_VERSION
  })

  it('T44：真实语料 pack → 空 profile restore → lockfile 语义载荷逐字节一致', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-t44-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
    const picked = CORPUS.filter(item => item.id === 'dsh-tool-time' || item.id === 'zotero-wave-rag')
    expect(picked).toHaveLength(2)
    const packed = await Promise.all(picked.map(packCorpus))
    const registry = await startOfflineRegistry(packed)
    try {
      await seedStore(packed, registry.url, 'cli-q', home)
      const q = await mountCliComposition([], { profile: 'cli-q', home, registry: registry.url })
      const packPath = join(home, 'q.mygo-pack')
      let out = capture()
      const packCode = await invokeCli(q.ctx, ['pack', '-o', packPath, '--json'])
      expect(packCode).toBe(0)
      expect(q.exitCode.value).toBe(0)
      const packJson = JSON.parse(out.stdout.text()) as { ok: boolean; plugins: readonly { id: string }[] }
      expect(packJson.ok).toBe(true)
      expect(packJson.plugins.map(item => item.id).sort()).toEqual(['dsh-tool-time', 'zotero-wave-rag'])

      out = capture()
      const restoreCode = await invokeCli(q.ctx, ['restore', packPath, '--profile', 'cli-r', '--no-register', '--json'])
      expect(restoreCode).toBe(0)
      const restoreJson = JSON.parse(out.stdout.text()) as {
        ok: boolean
        command: string
        profile: string
        plugins: number
        warnings: readonly string[]
      }
      expect(restoreJson).toMatchObject({ ok: true, command: 'restore', profile: 'cli-r', plugins: 2 })
      expect(restoreJson.warnings.some(warning => warning.includes('社区依赖'))).toBe(true)

      const packManifest = await readPackManifest(packPath)
      // RT1 口径（2026-08-13 重塑）：无 lockfile——还原侧 (id, version) 集合
      // 与 pack 清单声明逐条一致。
      const pathsR = resolveMygoPaths('cli-r', process.env)
      const restored: string[] = []
      const { readdir } = await import('node:fs/promises')
      for (const id of await readdir(pathsR.packagesRoot)) {
        for (const version of await readdir(join(pathsR.packagesRoot, id))) {
          restored.push(`${id}@${version}`)
        }
      }
      const declared = packManifest.plugins.map(plugin => `${plugin.id}@${plugin.version}`).sort()
      expect(restored.sort()).toEqual(declared)
    } finally {
      await registry.close()
    }
  })

  it('T45：篡改 pack 经 CLI restore → 非零退出 + 指认文件 + 报告（human 与 --json）', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-t45-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
    const picked = CORPUS.filter(item => item.id === 'dsh-tool-time')
    const packed = await Promise.all(picked.map(packCorpus))
    const registry = await startOfflineRegistry(packed)
    try {
      await seedStore(packed, registry.url, 'cli-q', home)
      const q = await mountCliComposition([], { profile: 'cli-q', home, registry: registry.url })
      const packPath = join(home, 'q.mygo-pack')
      const tampered = join(home, 'tampered.mygo-pack')
      let out = capture()
      expect(await invokeCli(q.ctx, ['pack', '-o', packPath, '--json'])).toBe(0)
      await repackWithFileTamper(packPath, tampered, 0)

      out = capture()
      const jsonCode = await invokeCli(q.ctx, ['restore', tampered, '--profile', 'cli-r', '--no-register', '--json'])
      expect(jsonCode).toBe(1)
      expect(q.exitCode.value).toBe(1)
      const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; report: { code: string } }
      expect(parsed.ok).toBe(false)
      expect(parsed.report.code).toBe('pack-hash-mismatch')

      out = capture()
      const humanCode = await invokeCli(q.ctx, ['restore', tampered, '--profile', 'cli-r', '--no-register'])
      expect(humanCode).toBe(1)
      expect(out.stdout.text()).toContain('✗ pack-hash-mismatch：')
      expect(out.stdout.text()).toContain('  文件 files/0.tgz')
    } finally {
      await registry.close()
    }
  })

  it('T47：自举——含 CLI 插件自身的 pack 还原后 CLI 可调用（吃自己的狗粮）', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-t47-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
    const packed = [await packCorpus(cliCorpus())]
    const registry = await startOfflineRegistry(packed)
    try {
      await seedStore(packed, registry.url, 'cli-q', home)
      const q = await mountCliComposition([], { profile: 'cli-q', home, registry: registry.url })
      const packPath = join(home, 'q.mygo-pack')
      let out = capture()
      expect(await invokeCli(q.ctx, ['pack', '-o', packPath, '--json'])).toBe(0)
      const packManifest = await readPackManifest(packPath)
      expect(packManifest.plugins.map(item => item.id)).toContain('dsh-mygo-cli')

      out = capture()
      expect(await invokeCli(q.ctx, ['restore', packPath, '--profile', 'cli-r', '--no-register', '--json'])).toBe(0)

      // 还原后：CLI 插件在 R 的还原根中，入口文件与仓库源码逐字节一致。
      const pathsR = resolveMygoPaths('cli-r', process.env)
      const storeEntry = join(pathsR.packagesRoot, 'dsh-mygo-cli', '0.2.0-rc.0', 'src', 'index.ts')
      expect(await sha256File(storeEntry)).toBe(await sha256File(join(CLI_PKG_ROOT, 'src', 'index.ts')))
      const { readdir } = await import('node:fs/promises')
      expect(await readdir(pathsR.packagesRoot)).toEqual(['dsh-mygo-cli'])

      // R 启动（无 mygo 参数不阻塞）后，CLI 可再次 pack。
      const r = await mountCliComposition([], { profile: 'cli-r', home, registry: registry.url })
      expect(r.exitCode.value).toBeUndefined()
      out = capture()
      const code = await invokeCli(r.ctx, ['pack', '-o', join(home, 'r.mygo-pack'), '--json'])
      expect(code).toBe(0)
      const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; plugins: readonly { id: string }[] }
      expect(parsed.plugins.map(item => item.id)).toEqual(['dsh-mygo-cli'])
    } finally {
      await registry.close()
    }
  })

  it('T49：被动语义——非 mygo 首 token 时无输出、无退出、不阻塞 profile', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-t49-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
    const registryUrl = 'http://127.0.0.1:1'
    const q = await mountCliComposition(['--port', '8080'], { profile: 'cli-q', home, registry: registryUrl })
    expect(q.exitCode.value).toBeUndefined()
    const ret = await apply(q.ctx)
    expect(ret).toBeUndefined()
    expect(q.stdout.text()).toBe('')
    expect(q.stderr.text()).toBe('')
  })

  it('T49b：管理器缺失时报错文案明确「需要 mygo 管理器」且无裸 stack', async () => {
    const exit: { value?: number } = {}
    const ctx = {
      get: (key: string): unknown => {
        if (key === 'cmdlineArgs') return { get: () => ['pack'] }
        if (key === 'appExit') return (code: number): void => { exit.value = code }
        return undefined
      },
    }
    const out = capture()
    const code = await invokeCli(ctx, ['pack'])
    expect(code).toBe(1)
    expect(exit.value).toBe(1)
    expect(out.stdout.text()).toBe('')
    expect(out.stderr.text()).toContain('需要 mygo 管理器')
    expect(out.stderr.text()).toContain('请确认 mygo 已安装并挂载')
    expect(out.stderr.text()).not.toContain('\n    at ')
  })
})
