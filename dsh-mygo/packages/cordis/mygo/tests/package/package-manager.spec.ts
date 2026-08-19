/**
 * 端到端包管理测试（2026-08-13 范围重塑口径）：
 * 干净目录 + 本地假 registry，覆盖 安装→落盘→加载运行、确定性版本选择
 * （区间过滤，registry 有更新版本也不漂移）、还原产物独立于 dsh 本体目录、
 * 失败报告格式。dsh.lock/v1 环节已删除（pnpm 安装状态为唯一真相源）。
 */

import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginPackageManager } from '../../src/package/package-manager.ts'
import { extractPlugin, loadPluginEntry } from '../../src/package/entry-loader.ts'
import { readRestoredPackage } from '../../src/package/package-restore.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'

const execFileAsync = promisify(execFile)

interface FakeVersion {
  readonly version: string
  /** 额外写入 dsh.mygo 的原始键（用于构造非法 manifest 候选）。 */
  readonly extraManifestKeys?: Record<string, unknown>
  readonly entrySource?: string
}

describe('plugin package manager (fake registry e2e)', () => {
  let root: string
  let registryRoot: string
  let paths: ReturnType<typeof resolveMygoPaths>
  let server: Server
  let port = 0
  const versions: FakeVersion[] = []
  let tarballs: Array<{ readonly tgz: string; readonly integrity: string }> = []

  async function makeTarball(entry: FakeVersion): Promise<{ readonly tgz: string; readonly integrity: string }> {
    const pkg = join(registryRoot, `pkg-${entry.version}`)
    await mkdir(join(pkg, 'package', 'lib'), { recursive: true })
    await writeFile(join(pkg, 'package', 'package.json'), JSON.stringify({
      name: '@test/calc',
      version: entry.version,
      main: 'lib/index.js',
      dsh: {
        mygo: {
          entry: 'lib/index.js',
          core: '>=0.0.1-rc.1',
          ...(entry.extraManifestKeys ?? {}),
        },
      },
    }))
    await writeFile(
      join(pkg, 'package', 'lib', 'index.js'),
      entry.entrySource ?? `export const id = 'calc'\nexport function apply() { return { version: '${entry.version}' } }\n`,
    )
    const tgz = join(registryRoot, `calc-${entry.version}.tgz`)
    await execFileAsync('tar', ['-czf', tgz, '-C', pkg, 'package'])
    const bytes = await import('node:fs/promises').then(fs => fs.readFile(tgz))
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    return { tgz, integrity }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-e2e-'))
    registryRoot = join(root, 'registry')
    await mkdir(registryRoot, { recursive: true })
    paths = resolveMygoPaths('web', { DSH_HOME: join(root, 'home') })
    versions.length = 0
    versions.push({ version: '1.0.0' })
    versions.push({ version: '2.0.0' })
    tarballs = await Promise.all(versions.map(makeTarball))
    server = createServer(async (request, response) => {
      const url = request.url ?? ''
      const tgzMatch = /^\/-\/calc-([\d.]+)\.tgz$/.exec(url)
      if (tgzMatch !== null) {
        const file = join(registryRoot, `calc-${tgzMatch[1]}.tgz`)
        const bytes = await import('node:fs/promises').then(fs => fs.readFile(file).catch(() => undefined))
        if (bytes === undefined) {
          response.writeHead(404)
          response.end()
          return
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        response.end(bytes)
        return
      }
      if (url === '/@test%2fcalc') {
        const versionsJson: Record<string, unknown> = {}
        for (let index = 0; index < versions.length; index += 1) {
          const entry = versions[index] as FakeVersion
          const tarball = tarballs[index] as { tgz: string; integrity: string }
          versionsJson[entry.version] = {
            name: '@test/calc',
            version: entry.version,
            main: 'lib/index.js',
            dsh: {
              mygo: {
                entry: 'lib/index.js',
                core: '>=0.0.1-rc.1',
                ...(entry.extraManifestKeys ?? {}),
              },
            },
            dist: {
              tarball: `http://127.0.0.1:${port}/-/calc-${entry.version}.tgz`,
              integrity: tarball.integrity,
            },
          }
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ name: '@test/calc', 'dist-tags': { latest: '2.0.0' }, versions: versionsJson }))
        return
      }
      response.writeHead(404)
      response.end()
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address !== null && typeof address === 'object') port = address.port
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  function createManager(
    exportsProvider?: (specifier: string) => Promise<ReadonlySet<string> | undefined>,
  ): PluginPackageManager {
    return new PluginPackageManager({
      paths,
      profile: 'web',
      registry: `http://127.0.0.1:${port}`,
      coreVersion: '0.0.1-rc.1',
      ...(exportsProvider === undefined ? {} : { exportsProvider }),
      managerVersion: '0.3.0',
    })
  }

  async function refreshTarballs(): Promise<void> {
    tarballs = await Promise.all(versions.map(makeTarball))
  }

  it('full flow: install -> restore on disk -> load and run', async () => {
    const manager = createManager()
    const outcome = await manager.resolveInstall({ package: '@test/calc', range: '^1.0.0' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.installed.version).toBe('1.0.0')
    expect(outcome.installed.dir).toBe(join(paths.packagesRoot, 'calc', '1.0.0'))
    const module = await loadPluginEntry(outcome.installed.dir, outcome.installed.entry)
    const plugin = extractPlugin(module) as { apply(): unknown }
    expect(plugin.apply()).toEqual({ version: '1.0.0' })
  })

  it('deterministic selection: registry 2.0.0 never drifts a ^1.0.0 install; re-install is idempotent', async () => {
    const manager = createManager()
    const first = await manager.resolveInstall({ package: '@test/calc', range: '~1.0.0' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.installed.version).toBe('1.0.0')
    // 重复安装命中同一还原目录（事实文件复用），版本不漂移。
    const second = await manager.resolveInstall({ package: '@test/calc', range: '~1.0.0' })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.installed.version).toBe('1.0.0')
    expect(second.installed.dir).toBe(first.installed.dir)
    const restored = await readRestoredPackage(first.installed.dir, 'calc', '1.0.0')
    expect(restored?.version).toBe('1.0.0')
  })

  it('restored payload survives deletion of the dsh install dir', async () => {
    const manager = createManager()
    const outcome = await manager.resolveInstall({ package: '@test/calc', range: '^1.0.0' })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const dshInstall = join(root, 'home', 'dsh-install')
    await mkdir(dshInstall, { recursive: true })
    await rm(dshInstall, { recursive: true, force: true })
    const restored = await readRestoredPackage(outcome.installed.dir, 'calc', '1.0.0')
    expect(restored?.entry).toBe('lib/index.js')
  })

  it('reports candidates without a valid manifest with structured fields', async () => {
    versions.length = 0
    // 顶层 depends 已按 2026-08-13 裁决从 manifest v3 移除：存量声明 = 非法 manifest。
    versions.push({ version: '1.0.0', extraManifestKeys: { depends: { 'missing-base': '>=2.0.0' } } })
    await refreshTarballs()
    const manager = createManager()
    const outcome = await manager.resolveInstall({ package: '@test/calc', range: '^1.0.0' })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('resolve-failed')
    expect(outcome.report.conflicts[0]?.constraint).toMatchObject({ kind: 'entry', target: 'self' })
    expect(outcome.report.conflicts[0]?.chain).toContain('@test/calc')
    expect(outcome.report.conflicts[0]?.candidates[0]?.rejected.join()).toContain('dsh.mygo.depends')
    expect(outcome.report.conflicts[0]?.actions.join()).toContain('dsh.mygo')
  })

  it('hard-blocks on a symbol the loaded package version does not export', async () => {
    versions.length = 0
    versions.push({
      version: '3.0.0',
      entrySource: "import { ghost } from 'ext-pkg'\nexport const id = 'calc'\nexport function apply() {}\n",
    })
    await refreshTarballs()
    const manager = createManager(async () => new Set(['real']))
    const outcome = await manager.resolveInstall({ package: '@test/calc', range: '3.0.0' })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.report.code).toBe('symbol-missing')
    expect(outcome.report.conflicts[0]?.candidates[0]?.rejected.join()).toContain('ghost')
  })
})
