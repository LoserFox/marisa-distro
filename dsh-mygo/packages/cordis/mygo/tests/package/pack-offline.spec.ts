/**
 * P7-A4：mygo-pack 离线分发链路补强用例——pack 导出 → 共享缓存（P4 衔接）
 * → 目标实例导入（hardlink）→ installPluginPack 离线还原 → 还原根事实
 * 对账（readRestoredPackage 与 pack 清单逐条一致）→ 第二次导入缓存命中。
 * 全程离线（零 fetch）。
 * @module @r05en1cu/dsh-mygo/tests/package/pack-offline
 */

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cachePack, importCachedPack, packCacheDir } from '../../src/pack-cache.ts'
import { buildPluginPack, installPluginPack, type PackContext } from '../../src/package/pack.ts'
import { readRestoredPackage } from '../../src/package/package-restore.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'
import { sha256Text } from '../../src/package/hash.ts'

async function seedRestored(home: string, id: string, version: string): Promise<void> {
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

function packCtx(home: string): PackContext {
  const paths = resolveMygoPaths('web', { DSH_HOME: home })
  return { installRoot: paths.packagesRoot, tmpDir: paths.tmpDir, profile: 'web', managerVersion: '0.3.0' }
}

describe('pack 离线分发链路（pack → 共享缓存 → 还原 → 对账）', () => {
  let root: string
  let homeA: string
  let homeB: string
  let userDir: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-pack-offline-'))
    homeA = join(root, 'home-a')
    homeB = join(root, 'home-b')
    userDir = join(root, 'user-dir')
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeA }).tmpDir, { recursive: true })
    await mkdir(resolveMygoPaths('web', { DSH_HOME: homeB }).tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('git 安装的 pack 替代路径：导出 → 缓存 → 导入 → 离线还原 → 事实对账', async () => {
    await seedRestored(homeA, 'alpha', '1.0.0')
    await seedRestored(homeA, 'beta', '2.1.0')
    // 1. pack 导出（确定性；社区依赖收割关闭保持离线最小面）
    const packPath = join(root, 'dist.mygo-pack')
    const built = await buildPluginPack(packCtx(homeA), { output: packPath, includeCommunityDeps: false })
    if (!built.ok) throw new Error(built.report.summary)
    expect(built.manifest.plugins.map(plugin => plugin.id).sort()).toEqual(['alpha', 'beta'])
    // 2. 发布共享缓存（内容寻址）
    const cached = await cachePack(packPath, { root: userDir })
    expect(cached.cached).toBe(false)
    // 3. 导入 B 实例 tmp（hardlink）并离线还原
    const pathsB = resolveMygoPaths('web', { DSH_HOME: homeB })
    const imported = await importCachedPack(cached.sha512, pathsB.tmpDir, { root: userDir })
    expect(imported.via).toBe('hardlink')
    const installed = await installPluginPack(packCtx(homeB), imported.path)
    if (!installed.ok) throw new Error(installed.report.summary)
    expect(installed.restored).toEqual([
      { id: 'alpha', version: '1.0.0' },
      { id: 'beta', version: '2.1.0' },
    ])
    // 4. 对账：B 还原根事实文件与 pack 清单逐条一致
    for (const plugin of built.manifest.plugins) {
      const fact = await readRestoredPackage(join(pathsB.packagesRoot, plugin.id, plugin.version), plugin.id, plugin.version)
      expect(fact).toBeDefined()
      expect(fact?.manifest.id).toBe(plugin.id)
    }
    // 5. 第二次导入同一 pack（例如另一实例）→ 缓存命中零写盘
    const second = await cachePack(packPath, { root: userDir })
    expect(second.cached).toBe(true)
    expect(await readdir(packCacheDir(userDir))).toHaveLength(1)
  }, 60_000)
})
