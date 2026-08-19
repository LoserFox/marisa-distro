/**
 * T46：init 产物通过 B1 schema 校验 + 模板对齐断言 + 可被 pack/restore；
 * 非法包名/非空目录的失败路径。
 * @module @r05en1cu/dsh-mygo-cli/tests/init
 */

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkTemplateAlignment, parsePackageManifest, resolveMygoPaths } from '@r05en1cu/dsh-mygo'
import { internals, invokeCli } from '../src/index.ts'
import { collector, mountCliComposition, seedStore } from './helpers.ts'
import { packCorpus, startOfflineRegistry, type PackedPackage } from '../../mygo/tests/e2e/harness.ts'
import type { CorpusPlugin } from '../../mygo/tests/e2e/corpus.ts'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME
const ORIGINAL_DSH_CORE_VERSION = process.env.DSH_CORE_VERSION

function capture(): { stdout: ReturnType<typeof collector>; stderr: ReturnType<typeof collector> } {
  const stdout = collector()
  const stderr = collector()
  internals.stdout = stdout
  internals.stderr = stderr
  return { stdout, stderr }
}

/** init 产物作为语料（入口指向 src，无需预构建 lib）。 */
function skeletonCorpus(dir: string, name: string, id: string): CorpusPlugin {
  return {
    category: 'F1',
    id,
    name,
    dir,
    entry: 'src/index.ts',
    trust: 'trusted',
    reviewNote: 'dsh mygo init 产物自检（T46）',
    packParts: [
      'package.json',
      'src',
      'tests',
      'scripts',
      'patches',
      'docs',
      'tsconfig.base.json',
      'tsconfig.json',
      'tsconfig.vitest.json',
      'tsdown.config.ts',
      'tsdown.prepare.config.ts',
      'vitest.config.ts',
      'cordis.patch.yml',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
    ],
    versionOverride: '0.0.1',
    manifestOverlay: {
      id,
      version: '0.0.1',
      entry: 'src/index.ts',
      core: '*',
      requires: {},
    },
  }
}

describe('init（T46）', () => {
  afterEach(() => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    if (ORIGINAL_DSH_CORE_VERSION === undefined) delete process.env.DSH_CORE_VERSION
    else process.env.DSH_CORE_VERSION = ORIGINAL_DSH_CORE_VERSION
  })

  it('生成骨架：B1 零问题 + 模板对齐 + 身份替换 + 可被 pack/restore', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-init-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
    const outDir = join(home, 'generated')
    const q = await mountCliComposition([], { profile: 'cli-init', home, registry: 'http://127.0.0.1:1' })
    let out = capture()
    const code = await invokeCli(q.ctx, ['init', '@scope/my-plugin', '--dir', outDir, '--json'])
      expect(code).toBe(0)
      const parsed = JSON.parse(out.stdout.text()) as {
        ok: boolean
        id: string
        dir: string
        manifest: { id: string; entry: string }
      }
      expect(parsed.ok).toBe(true)
      expect(parsed.id).toBe('my-plugin')
      expect(parsed.manifest.entry).toBe('lib/index.js')

      const pkg = JSON.parse(await readFile(join(outDir, 'package.json'), 'utf8')) as Record<string, unknown>
      const manifestCheck = parsePackageManifest(pkg)
      expect(manifestCheck.problems).toEqual([])
      expect(manifestCheck.value).toBeDefined()
      expect(manifestCheck.warnings).toEqual([])
      expect(checkTemplateAlignment(pkg).aligned).toBe(true)
      const mygo = (pkg.dsh as { mygo: Record<string, unknown> }).mygo
      expect(mygo.id).toBe('my-plugin')
      expect(mygo.entry).toBe('lib/index.js')
      expect(mygo.core).toBe('^0.0.1-rc.1')

      const patch = await readFile(join(outDir, 'cordis.patch.yml'), 'utf8')
      expect(patch).toContain('id: my-plugin')
      expect(patch).toContain("name: '@scope/my-plugin'")
      const skills = await readdir(join(outDir, '.agents', 'skills'))
      expect(skills.sort()).toEqual([
        'dsh-plugin-compose',
        'dsh-plugin-development',
        'dsh-plugin-implement',
        'dsh-plugin-plan',
        'dsh-plugin-release',
        'dsh-plugin-scaffold',
        'dsh-plugin-test',
      ])
      for (const required of ['pnpm-lock.yaml', 'scripts/prepare.mjs', 'scripts/verify-self-contained.mjs']) {
        await expect(readFile(join(outDir, required), 'utf8')).resolves.toBeTruthy()
      }

      // 可被 pack/restore：init 产物落盘进 Q 还原根 → pack → 还原到 R。
      const packed: PackedPackage[] = [await packCorpus(skeletonCorpus(outDir, '@scope/my-plugin', 'my-plugin'))]
    const registry = await startOfflineRegistry(packed)
    try {
      await seedStore(packed, registry.url, 'cli-init', home)
      out = capture()
      const packPath = join(home, 'init.mygo-pack')
      expect(await invokeCli(q.ctx, ['pack', '-o', packPath, '--json'])).toBe(0)
      out = capture()
      expect(await invokeCli(q.ctx, ['restore', packPath, '--profile', 'cli-init-r', '--json'])).toBe(0)
      const pathsR = resolveMygoPaths('cli-init-r', process.env)
      expect(await readdir(pathsR.packagesRoot)).toEqual(['my-plugin'])
    } finally {
      await registry.close()
    }
  })

  it('非法 npm 包名 → 用法错误（退出码 2）', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-init-bad-'))
    process.env.DSH_HOME = home
    const q = await mountCliComposition([], { profile: 'cli-init', home, registry: 'http://127.0.0.1:1' })
    capture()
    const code = await invokeCli(q.ctx, ['init', 'Bad Name', '--json'])
    expect(code).toBe(2)
    expect(q.exitCode.value).toBe(2)
  })

  it('目标目录已存在且非空 → 拒绝（退出码 1 + JSON 错误信封）', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-init-nonempty-'))
    process.env.DSH_HOME = home
    const outDir = join(home, 'occupied')
    await mkdir(outDir)
    await writeFile(join(outDir, 'x.txt'), 'x')
    const q = await mountCliComposition([], { profile: 'cli-init', home, registry: 'http://127.0.0.1:1' })
    const out = capture()
    const code = await invokeCli(q.ctx, ['init', 'my-plugin', '--dir', outDir, '--json'])
    expect(code).toBe(1)
    const parsed = JSON.parse(out.stdout.text()) as { ok: boolean; error: { code: string } }
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('init-failed')
    const leftover = await readdir(outDir)
    expect(leftover).toEqual(['x.txt'])
  })

  it('未知子命令 → 用法错误（退出码 2）', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mygo-cli-init-unknown-'))
    process.env.DSH_HOME = home
    const q = await mountCliComposition([], { profile: 'cli-init', home, registry: 'http://127.0.0.1:1' })
    const out = capture()
    const code = await invokeCli(q.ctx, ['explode'])
    expect(code).toBe(2)
    expect(out.stdout.text()).toBe('')
    expect(out.stderr.text()).toContain('未知子命令 "explode"')
  })
})
