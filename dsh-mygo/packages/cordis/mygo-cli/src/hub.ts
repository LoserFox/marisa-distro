/**
 * `mygo hub` 命令面（P5）：dsh-hub 市场的 search / info / install /
 * collections。registry 经 loader-hub 加载（显式本地快照优先；否则双
 * origin 拉取 + vendored 降级）；安装经 intent 翻译后交 profile 执行面；
 * collections 原子安装（任一项失败整组回滚）。
 * @module @r05en1cu/dsh-mygo-cli/hub
 */

import {
  assessHubEntry,
  createRepositoryBundleProbe,
  installHubCollection,
  loadHubRegistry,
  pickHubRelease,
  translateHubInstall,
  type HubLoadResult,
  type HubRegistry,
} from '@r05en1cu/dsh-mygo-loader-hub'
import { createProfileLoaderAdapter } from '@r05en1cu/dsh-mygo-loader-profile'
import type { CliCommand } from './args.ts'

type HubCommand = Extract<CliCommand, { readonly kind: 'hub' }>

/** 命令 I/O 面（index.ts 注入 internals，测试可替换）。 */
export interface HubIo {
  stdout(chunk: string): void
  stderr(chunk: string): void
}

export interface HubRunOptions {
  readonly home: string
  readonly profile: string
}

/** id[@release] 解析：release 精确命中或按 `${id}@${rest}` 构造匹配。 */
function splitEntryRef(arg: string): { readonly id: string; readonly release?: string } {
  const at = arg.indexOf('@')
  if (at <= 0) return { id: arg }
  return { id: arg.slice(0, at), release: arg.slice(at + 1) }
}

async function loadFor(command: HubCommand): Promise<HubLoadResult> {
  return loadHubRegistry({
    ...(command.snapshot === undefined ? {} : { snapshotPath: command.snapshot }),
    ...(command.insecureNoVerify ? { insecureNoVerify: true } : {}),
  })
}

function emitWarnings(io: HubIo, command: HubCommand, warnings: readonly string[]): void {
  for (const warning of warnings) {
    if (command.json) continue
    io.stdout(`  [warn] ${warning}\n`)
  }
}

/** 执行 `mygo hub ...`；返回退出码（0/1/2 语义同其他命令）。 */
export async function runHubCommand(command: HubCommand, options: HubRunOptions, io: HubIo): Promise<number> {
  let loaded: HubLoadResult
  try {
    loaded = await loadFor(command)
  } catch (error) {
    return fail(io, command, 'registry-load-failed', error instanceof Error ? error.message : String(error))
  }
  const { registry } = loaded
  switch (command.verb) {
    case 'search': return runSearch(command, registry, io, loaded)
    case 'info': return runInfo(command, registry, io)
    case 'collections': return runCollections(command, registry, io)
    case 'install': return runInstall(command, registry, options, io, loaded)
  }
}

function fail(io: HubIo, command: HubCommand, code: string, message: string): number {
  if (command.json) {
    io.stdout(JSON.stringify({ ok: false, command: 'hub', verb: command.verb, error: { code, message } }) + '\n')
  } else {
    io.stderr(`✗ ${code}：${message}\n`)
  }
  return 1
}

function runSearch(command: HubCommand, registry: HubRegistry, io: HubIo, loaded: HubLoadResult): number {
  const needle = (command.arg ?? '').toLowerCase()
  const matched = registry.entries.filter(entry => needle === ''
    || entry.id.includes(needle)
    || entry.displayName.toLowerCase().includes(needle)
    || entry.description.toLowerCase().includes(needle)
    || entry.tags.some(tag => tag.includes(needle)))
  if (command.json) {
    io.stdout(JSON.stringify({
      ok: true,
      command: 'hub',
      verb: 'search',
      source: loaded.source,
      count: matched.length,
      entries: matched.map(entry => ({
        id: entry.id,
        version: entry.version,
        kind: entry.kind,
        install: entry.install.mode,
        description: entry.description,
      })),
    }) + '\n')
    return 0
  }
  emitWarnings(io, command, loaded.warnings)
  const lines = [`命中 ${matched.length} 个条目（共 ${registry.entries.length} 个）：`]
  for (const entry of matched) {
    lines.push(`  ${entry.id}${entry.version === null ? '' : `@${entry.version}`}  [${entry.install.mode}]  ${entry.description}`)
  }
  io.stdout(lines.join('\n') + '\n')
  return 0
}

function runInfo(command: HubCommand, registry: HubRegistry, io: HubIo): number {
  const ref = splitEntryRef(command.arg ?? '')
  const entry = registry.entries.find(candidate => candidate.id === ref.id)
  if (entry === undefined) return fail(io, command, 'entry-not-found', `hub 条目不存在：${ref.id}`)
  const assessment = assessHubEntry(entry, ref.release)
  const release = pickHubRelease(entry, ref.release)
  if (command.json) {
    io.stdout(JSON.stringify({
      ok: true,
      command: 'hub',
      verb: 'info',
      entry,
      assessment,
    }) + '\n')
    return 0
  }
  const lines = [
    `${entry.displayName}（${entry.id}）${entry.version === null ? '' : `@${entry.version}`}`,
    `  ${entry.description}`,
    `  安装轨 ${entry.install.mode} · 风险 ${entry.risk.level} · listing ${entry.listing.state} · 维护 ${entry.maintenance.state}`,
    `  release ${release?.id ?? entry.latestRelease}（共 ${entry.releases.length} 个）`,
  ]
  if (entry.links?.repository !== undefined) lines.push(`  源码 ${entry.links.repository}`)
  for (const block of assessment.blocks) lines.push(`  [不可安装] ${block}`)
  for (const advisory of assessment.advisories) lines.push(`  [warn] ${advisory}`)
  io.stdout(lines.join('\n') + '\n')
  return 0
}

function runCollections(command: HubCommand, registry: HubRegistry, io: HubIo): number {
  if (command.json) {
    io.stdout(JSON.stringify({ ok: true, command: 'hub', verb: 'collections', collections: registry.collections }) + '\n')
    return 0
  }
  if (registry.collections.length === 0) {
    io.stdout('registry 不含 collections\n')
    return 0
  }
  const lines = [`collections ${registry.collections.length} 个：`]
  for (const collection of registry.collections) {
    lines.push(`  ${collection.id}（${collection.items.length} 项）${collection.featured === true ? ' [featured]' : ''}  ${collection.title} — ${collection.summary}`)
  }
  io.stdout(lines.join('\n') + '\n')
  return 0
}

async function runInstall(
  command: HubCommand,
  registry: HubRegistry,
  options: HubRunOptions,
  io: HubIo,
  loaded: HubLoadResult,
): Promise<number> {
  const arg = command.arg ?? ''
  const target = { home: options.home, profile: options.profile }
  const adapter = createProfileLoaderAdapter()
  const allowFileSpec = loaded.source.kind !== 'remote'
  emitWarnings(io, command, loaded.warnings)

  // collection 原子安装（id 命中 collection 优先）
  const collection = registry.collections.find(candidate => candidate.id === arg)
  if (collection !== undefined) {
    const result = await installHubCollection(registry, arg, adapter, target, { allowFileSpec })
    if (!result.ok) return fail(io, command, 'collection-install-failed', result.error ?? '未知错误')
    if (command.json) {
      io.stdout(JSON.stringify({ ok: true, command: 'hub', verb: 'install', collection: arg, installed: result.installed }) + '\n')
    } else {
      io.stdout(`✓ collection ${arg} 原子安装完成（${result.installed.length} 项）：${result.installed.join(', ')}\n`)
    }
    return 0
  }

  const ref = splitEntryRef(arg)
  const entry = registry.entries.find(candidate => candidate.id === ref.id)
  if (entry === undefined) return fail(io, command, 'entry-not-found', `hub 条目不存在：${ref.id}`)
  const assessment = assessHubEntry(entry, ref.release)
  if (!assessment.installable) {
    return fail(io, command, 'entry-not-installable', assessment.blocks.join('；'))
  }
  if (!command.json) {
    for (const advisory of assessment.advisories) io.stdout(`  [warn] ${advisory}\n`)
  }
  const release = pickHubRelease(entry, ref.release)
  if (release === undefined) return fail(io, command, 'entry-not-installable', `release 不存在：${ref.release ?? entry.latestRelease}`)
  const translated = await translateHubInstall(release.install, {
    ...(allowFileSpec ? { allowFileSpec: true } : {}),
    probeRepositoryBundle: createRepositoryBundleProbe(),
  })
  if (translated.kind === 'display') {
    return fail(io, command, 'install-intent-unavailable', translated.reason)
  }
  if (translated.experimental && !command.json) {
    io.stdout('  [warn] repository-plugin 启发式放行（目标含 dsh.bundle 声明；实验性）\n')
  }
  const receipt = await adapter.install({ kind: 'pnpm', spec: translated.spec }, target)
  if (!receipt.ok) {
    return fail(io, command, 'install-failed', receipt.error?.message ?? 'pnpm 失败')
  }
  if (command.json) {
    io.stdout(JSON.stringify({
      ok: true,
      command: 'hub',
      verb: 'install',
      id: entry.id,
      release: release.id,
      profile: receipt.profile,
      bundles: receipt.bundles,
      ...(translated.experimental ? { experimental: true } : {}),
      advisories: assessment.advisories,
    }) + '\n')
  } else {
    io.stdout(`✓ 已安装 ${release.id} → profile ${receipt.profile ?? options.profile}\n`)
  }
  return 0
}
