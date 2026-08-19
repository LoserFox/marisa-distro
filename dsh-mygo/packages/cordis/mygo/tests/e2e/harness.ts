/**
 * E2E harness（验证轮）：离线 registry 桩（真实语料打包 + 真实完整性）、
 * 包管理器安装、cordis 组合挂载。全部离线；不执行任何语料 install 脚本。
 * @module @r05en1cu/dsh-mygo/tests/e2e/harness
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import PluginManagerService from '@r05en1cu/dsh-mygo'
import { PluginPackageManager } from '../../src/package/package-manager.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'
import { expandBundlePatch } from '../../src/package/bundle-expand.ts'
import { mapLegacyPluginFile } from '../../src/package/legacy-mapping.ts'
import type { CorpusPlugin } from './corpus.ts'

const execFileAsync = promisify(execFile)

export interface PackedPackage {
  readonly plugin: CorpusPlugin
  readonly tgz: string
  readonly integrity: string
  /** 打包后 package.json（真实元数据 + mygo overlay）。 */
  readonly packageJson: Record<string, unknown>
}

/** 打包一个语料包为 npm tarball（真实内容；注入 mygo overlay，不改仓库）。 */
export async function packCorpus(plugin: CorpusPlugin): Promise<PackedPackage> {
  const work = await mkdtemp(join(tmpdir(), 'mygo-e2e-pack-'))
  // 每次调用独立暂存目录：多套件并行时避免对同一 tgz 路径的写写竞争。
  const packsDir = await mkdtemp(join(tmpdir(), 'mygo-e2e-packs-'))
  try {
    const pkgRoot = join(work, 'package')
    await mkdir(pkgRoot, { recursive: true })
    // 选择性复制：真实仓库动辄数十~上百 MB（node_modules/assets），
    // 只取 npm 包形态需要的面（package.json / src / lib / 清单文件）。
    const candidateParts = plugin.packParts ?? ['package.json', 'src', 'lib', 'cordis.patch.yml', 'dsh.plugin.json', 'index.mjs', 'scripts']
    for (const part of candidateParts) {
      const source = join(plugin.dir, part)
      const target = join(pkgRoot, part)
      try {
        await cp(source, target, {
          recursive: true,
          filter: sourcePath => {
            const name = sourcePath.split(/[\\/]/).at(-1) ?? ''
            return name !== '.git' && name !== 'node_modules' && !name.startsWith('.')
          },
        })
      } catch {
        // 该部件不存在：跳过。
      }
    }
    const real = JSON.parse(await readFile(join(plugin.dir, 'package.json'), 'utf8')) as Record<string, unknown>
    // 打包时以语料登记的 registry 身份为准（name = plugin.name）：真实仓库改名/漂移
    // 时保持 corpus 契约（lockfile.packageName 与内层 package.json 身份一致）。
    real.name = plugin.name
    if (plugin.versionOverride !== undefined) real.version = plugin.versionOverride
    if (plugin.packageJsonOverlay !== undefined) Object.assign(real, plugin.packageJsonOverlay)
    if (plugin.manifestOverlay !== undefined) {
      const dsh = (real.dsh as Record<string, unknown> | undefined)
        ? { ...(real.dsh as Record<string, unknown>) }
        : {}
      dsh.mygo = { formatVersion: 1, ...plugin.manifestOverlay }
      real.dsh = dsh
    }
    await writeFile(join(pkgRoot, 'package.json'), JSON.stringify(real, null, 2))
    const version = String(real.version ?? '0.0.0')
    const tgz = join(packsDir, `${plugin.id}-${version}.tgz`)
    await execFileAsync('tar', ['-czf', tgz, '-C', work, 'package'])
    const bytes = await readFile(tgz)
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    return { plugin, tgz, integrity, packageJson: real }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** 离线 registry 桩：真实语料 tarball + 真实完整性。 */
export interface OfflineRegistry {
  readonly url: string
  readonly requests: readonly string[]
  close(): Promise<void>
}

export async function startOfflineRegistry(packed: readonly PackedPackage[]): Promise<OfflineRegistry> {
  const requests: string[] = []
  const byName = new Map<string, PackedPackage[]>()
  for (const item of packed) {
    const list = byName.get(item.plugin.name) ?? []
    list.push(item)
    byName.set(item.plugin.name, list)
  }
  let origin = ''
  const server: Server = createServer(async (request, response) => {
    const url = request.url ?? ''
    requests.push(url)
    const tgzMatch = /^\/-\/([^/]+)-([\d.]+(?:-[0-9A-Za-z.-]+)?)\.tgz$/.exec(url)
    if (tgzMatch !== null) {
      const entry = [...byName.values()].flat().find(item =>
        item.plugin.id === tgzMatch[1] && item.packageJson.version === tgzMatch[2])
      if (entry === undefined) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'Not found' }))
        return
      }
      const bytes = await readFile(entry.tgz)
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(bytes)
      return
    }
    const name = decodeURIComponent(url.replace(/^\//, ''))
    const entries = byName.get(name)
    if (entries === undefined || entries.length === 0) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    const versions: Record<string, unknown> = {}
    for (const entry of entries) {
      const version = String(entry.packageJson.version)
      versions[version] = {
        ...entry.packageJson,
        dist: {
          tarball: `${origin}/-/${entry.plugin.id}-${version}.tgz`,
          integrity: entry.integrity,
        },
      }
    }
    const latest = entries.map(item => String(item.packageJson.version)).sort().at(-1) as string
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      name: entries[0]?.plugin.name,
      'dist-tags': { latest },
      versions,
    }))
  })
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address !== null && typeof address === 'object') {
        origin = `http://127.0.0.1:${(address as { port: number }).port}`
      }
      resolve()
    })
  })
  return {
    url: origin,
    requests,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

/** 安装语料到全新隔离还原根（真实 tarball → 普通落盘；2026-08-13 起无 lockfile）。 */
export async function installCorpusToStore(
  packed: readonly PackedPackage[],
  registryUrl: string,
  profile = 'e2e',
): Promise<{ readonly manager: PluginPackageManager; readonly paths: ReturnType<typeof resolveMygoPaths> }> {
  const root = await mkdtemp(join(tmpdir(), 'mygo-e2e-store-'))
  const paths = resolveMygoPaths(profile, { DSH_HOME: join(root, 'home') })
  const manager = new PluginPackageManager({
    paths,
    profile,
    registry: registryUrl,
    coreVersion: '0.0.1-rc.1',
    managerVersion: '0.3.0-e2e',
  })
  const seenNames = new Set<string>()
  for (const item of installOrder(packed)) {
    if (item.plugin.entry === '' || seenNames.has(item.plugin.name)) continue
    seenNames.add(item.plugin.name)
    const outcome = await manager.resolveInstall({ package: item.plugin.name })
    if (!outcome.ok) {
      throw new Error(`install ${item.plugin.name} 失败：${outcome.report.summary}`)
    }
  }
  return { manager, paths }
}

/** 按 manifest depends 拓扑排序（真实依赖先装；确定性 DFS）。 */
function installOrder(packed: readonly PackedPackage[]): readonly PackedPackage[] {
  const byId = new Map<string, PackedPackage>()
  for (const item of packed) {
    const manifest = item.packageJson.dsh?.mygo as Record<string, unknown> | undefined
    const id = typeof manifest?.id === 'string'
      ? manifest.id
      : item.plugin.name.replace(/^@[^/]+\//, '')
    byId.set(id, item)
  }
  const visited = new Set<string>()
  const out: PackedPackage[] = []
  const visit = (item: PackedPackage): void => {
    if (visited.has(item.plugin.id)) return
    visited.add(item.plugin.id)
    const manifest = item.packageJson.dsh?.mygo as Record<string, unknown> | undefined
    const depends = (manifest?.depends ?? {}) as Record<string, unknown>
    for (const target of Object.keys(depends).sort()) {
      const dep = byId.get(target)
      if (dep !== undefined) visit(dep)
    }
    out.push(item)
  }
  for (const item of [...packed].sort((a, b) => (a.plugin.id < b.plugin.id ? -1 : a.plugin.id > b.plugin.id ? 1 : 0))) visit(item)
  return out
}

/** 组合挂载：storage 栈 + mygo 服务 + 语料插件（真实入口模块）。 */
export interface MountedComposition {
  readonly ctx: Context
  readonly warns: readonly string[]
  readonly bootRoot: string
}

export async function mountComposition(
  plugins: readonly CorpusPlugin[],
  registryUrl: string,
  modules: ReadonlyMap<string, unknown>,
  profile = 'e2e-mount',
): Promise<MountedComposition> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'mygo-e2e-mount-'))
  const configPath = join(bootRoot, 'cordis.yml')
  const ctx = new Context()
  const warns: string[] = []
  ctx.logger.exporter({
    levels: { default: 3 },
    export: (message) => {
      if (message.type === 'warn') warns.push(message.args.join(' '))
    },
  })
  ctx.baseUrl = pathToFileURL(bootRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const allModules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-domain', storageDomain],
    ['@deepseek-ai/dsh-storage-json', storageJson],
    ['@deepseek-ai/dsh-storage-sqlite', storageSqlite],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRegistry],
    ['@r05en1cu/dsh-mygo', PluginManagerService],
    ...modules,
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!allModules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return allModules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const rows: string[] = [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(bootRoot, 'registry.db'))}`,
    '    journalMode: wal',
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: sqlite',
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    `    profile: ${JSON.stringify(profile)}`,
    `    registry: ${JSON.stringify(registryUrl)}`,
    `    stateRoot: ${JSON.stringify(join(bootRoot, 'state'))}`,
    '    cpuBudgetMs: 1',
    '',
  ]
  for (const plugin of plugins) {
    if (plugin.entry === '') continue
    rows.push(`- name: ${JSON.stringify(plugin.name)}`)
  }
  await writeFile(configPath, rows.join('\n'))
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, warns, bootRoot }
}

export { expandBundlePatch, mapLegacyPluginFile }
