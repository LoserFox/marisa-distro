/**
 * mygo CLI 用户面（design-r5）：dsh app 插件形态的 pack/restore/init。
 * 只把既有 buildPack/installPack/模板对齐翻译为命令面，零新增治理语义。
 *
 * 注册面（L0）：读取官方启动器提供的 `ctx.cmdlineArgs` / `ctx.appExit`
 * （@deepseek-ai/dsh-cmdline 契约，apps/cli/profile-boot 挂载前提供）。
 * 被动语义：内层参数首 token 非 `mygo` 时 MUST 完全无副作用返回。
 * @module @r05en1cu/dsh-mygo-cli
 */

import {
  MYGO_MANAGER_VERSION,
  PluginPackageManager,
  collectAuthRefs,
  listInstances,
  listRegistries,
  removeRegistry,
  resolveCoreVersion,
  resolveDshHome,
  resolveMygoPaths,
  resolveProfileEnv,
  upsertRegistry,
} from '@r05en1cu/dsh-mygo'
import type { CredentialsLike } from '@r05en1cu/dsh-mygo'
import { join, resolve } from 'node:path'
import { parseCliArgs, type CliCommand } from './args.ts'
import { InitError, generatePluginSkeleton } from './init.ts'
import { createProfileLoaderAdapter, type ProfileLoaderAdapter } from '@r05en1cu/dsh-mygo-loader-profile'
import {
  jsonOutput,
  renderAdoptSuccess,
  renderCloneSuccess,
  renderInitSuccess,
  renderInstallSuccess,
  renderInstances,
  renderPackSuccess,
  renderReportHuman,
  renderConfigShow,
  renderRestoreSuccess,
  renderSetEnabledSuccess,
  renderUsage,
  renderUsageError,
} from './render.ts'
import { adoptInstance, clonePlugin, registerPackMembers } from './install.ts'
import { runHubCommand } from './hub.ts'
import { readRowConfig, writeRowConfig } from './config.ts'

/** 治理面上带 loader 注册面的管理器最小结构（P5）。 */
interface LoaderRegistryHost {
  registerLoaderAdapter?(adapter: ProfileLoaderAdapter): () => void
  loaderAdapters?(): readonly { readonly id: string }[]
}

/** profile 执行面 adapter：优先治理面注册实例（发现走治理面），缺省现场构造。 */
function profileAdapterOf(ctx: CliHost): ProfileLoaderAdapter {
  const manager = ctx.get<LoaderRegistryHost>('pluginManager')
  const registered = manager?.loaderAdapters?.().find(adapter => adapter.id === 'profile')
  return (registered as ProfileLoaderAdapter | undefined) ?? createProfileLoaderAdapter()
}

/** Cordis 插件名（稳定；manifest id 同源）。 */
export const name = 'dsh-mygo-cli'

/** 官方 cmdlineArgs 服务的最小结构面。 */
export interface CmdlineArgsLike {
  get(): readonly string[]
}

/** 官方 appExit 服务的最小结构面。 */
export type AppExitLike = (code: number) => void

/** 本插件需要的宿主 ctx 结构面（不 import 宿主包，保持零运行时依赖）。 */
export interface CliHost {
  get<T = unknown>(key: string): T | undefined
}

/** 进程输出面（测试可替换；对齐 dsh-cmdline internals 惯例）。 */
export const internals: { stdout: { write(chunk: string): unknown }; stderr: { write(chunk: string): unknown } } = {
  stdout: process.stdout,
  stderr: process.stderr,
}

/**
 * Cordis apply：被动语义 + 派发。`mygo` 之后的参数交给 {@link invokeCli}。
 * P5：profile 执行面 adapter 在首个 mygo 命令时注册进治理面（已注册则
 * 跳过）——被动语义要求非 mygo 首 token 完全无副作用，故注册不在
 * apply 顶层发生。
 */
export async function apply(ctx: CliHost): Promise<void> {
  const args = ctx.get<CmdlineArgsLike>('cmdlineArgs')?.get() ?? []
  if (args[0] !== 'mygo') return
  ensureProfileAdapterRegistered(ctx)
  await invokeCli(ctx, args.slice(1))
}

/** profile adapter 注册（幂等；管理器缺注册面时跳过，命令面仍有现场构造兜底）。 */
function ensureProfileAdapterRegistered(ctx: CliHost): void {
  const manager = ctx.get<LoaderRegistryHost>('pluginManager')
  if (manager?.registerLoaderAdapter === undefined) return
  if (manager.loaderAdapters?.().some(adapter => adapter.id === 'profile') ?? false) return
  manager.registerLoaderAdapter(createProfileLoaderAdapter())
}

/**
 * 执行一条 mygo 命令并请求进程退出（返回码同时直接给出，便于测试）。
 */
export async function invokeCli(ctx: CliHost, argv: readonly string[]): Promise<number> {
  const exit = ctx.get<AppExitLike>('appExit')
  const parsed = parseCliArgs(argv)
  let code: number
  if (parsed.kind === 'usage-error') {
    internals.stderr.write(`dsh mygo: ${parsed.message}\n`)
    internals.stderr.write(renderUsageError())
    code = 2
  } else if (parsed.kind === 'help') {
    internals.stdout.write(renderUsage(parsed.topic))
    code = 0
  } else {
    code = await runCommand(ctx, parsed.command)
  }
  exit?.(code)
  return code
}

/**
 * rc8 registry auth：spawn 前把 profile .npmrc 受管块的 `${REF}` 占位经
 * host credentials 服务解析成子进程 env 增量（按操作解析不缓存）；
 * 服务缺席/未配置只 warn 不阻断。
 */
async function resolveSpawnEnv(
  ctx: CliHost,
  home: string,
  profile: string,
): Promise<Record<string, string> | undefined> {
  const credentials = ctx.get<CredentialsLike>('credentials')
  const { env, missing } = await resolveProfileEnv(home, profile, credentials)
  for (const ref of missing) {
    internals.stderr.write(
      `[warn] registry auth：引用 ${ref} ${credentials === undefined ? '的 credentials 服务缺席' : '未配置'}——若该源需要认证，pnpm 将以匿名请求（可能 401）\n`,
    )
  }
  return Object.keys(env).length === 0 ? undefined : { ...env }
}

/** 当前 profile：管理器推导值优先，行配置次之（bundle 形态 config 可不携带）。 */function profileOf(ctx: CliHost): { readonly ok: true; readonly profile: string } | { readonly ok: false; readonly reason: string } {
  const manager = ctx.get<{ readonly profile?: string; readonly config?: { readonly profile?: string } }>('pluginManager')
  const profile = manager?.profile ?? manager?.config?.profile
  if (profile === undefined || profile === '') {
    return {
      ok: false,
      reason: '需要 mygo 管理器（pluginManager 服务缺失或未配置 profile），无法确定当前 profile：'
        + '请确认 mygo 已安装并挂载（dsh-mygo 行）后重试',
    }
  }
  return { ok: true, profile }
}

function coreVersion(): string | undefined {
  return resolveCoreVersion(process.env)
}

function managerFor(profile: string): PluginPackageManager {
  const core = coreVersion()
  return new PluginPackageManager({
    paths: resolveMygoPaths(profile, process.env),
    profile,
    managerVersion: MYGO_MANAGER_VERSION,
    ...(core === undefined ? {} : { coreVersion: core }),
  })
}

/** 操作失败的通用信封（非结构化报告类错误，如 profile 缺失）。 */
function errorEnvelope(command: string, code: string, message: string, json: boolean): number {
  if (json) {
    internals.stdout.write(jsonOutput(command, { ok: false, error: { code, message } }))
  } else {
    internals.stderr.write(`✗ ${code}：${message}\n`)
  }
  return 1
}

async function runCommand(ctx: CliHost, command: CliCommand): Promise<number> {
  switch (command.kind) {
    case 'pack': return runPack(ctx, command)
    case 'restore': return runRestore(ctx, command)
    case 'init': return runInit(command)
    case 'install': return runInstall(ctx, command)
    case 'uninstall': return runUninstall(ctx, command)
    case 'enable':
    case 'disable': return runSetEnabled(ctx, command)
    case 'instances': return runInstances(command)
    case 'adopt': return runAdopt(command)
    case 'clone': return runClone(command)
    case 'hub': return runHub(ctx, command)
    case 'config': return runConfig(ctx, command)
    case 'registry': return runRegistry(ctx, command)
    case 'auth': return runAuth(ctx, command)
  }
}

/**
 * registry 命令（rc8）：profile .npmrc 受管块的映射管理（只携带 ${REF}
 * 占位；块外用户行不动）。
 */
function runRegistry(ctx: CliHost, command: Extract<CliCommand, { readonly kind: 'registry' }>): number {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('registry', 'no-profile', current.reason, command.json)
  const dir = join(resolveDshHome(process.env), 'profiles', current.profile)
  if (command.verb === 'list') {
    const registries = listRegistries(dir)
    if (command.json) {
      internals.stdout.write(jsonOutput('registry', { ok: true, profile: current.profile, registries }))
    } else if (registries.length === 0) {
      internals.stdout.write('（无自定义 registry；profile .npmrc 受管块为空）\n')
    } else {
      internals.stdout.write(registries.map(binding =>
        `${binding.scope} -> ${binding.registry}${binding.authRef === undefined ? '' : `（凭据引用 \${${binding.authRef}}）`}`,
      ).join('\n') + '\n')
    }
    return 0
  }
  if (command.verb === 'add') {
    const result = upsertRegistry(dir, command.scope ?? '', command.registry ?? '', command.authRef)
    if (!result.ok) return errorEnvelope('registry', 'registry-invalid', result.error ?? '写入失败', command.json)
    const message = `registry ${command.scope} 已写入 profile .npmrc 受管块`
    if (command.json) internals.stdout.write(jsonOutput('registry', { ok: true, profile: current.profile }))
    else internals.stdout.write(`✓ ${message}\n`)
    return 0
  }
  const result = removeRegistry(dir, command.scope ?? '')
  const message = result.removed ? `registry ${command.scope} 已移除` : `registry ${command.scope} 不存在（幂等）`
  if (command.json) internals.stdout.write(jsonOutput('registry', { ok: true, profile: current.profile, removed: result.removed }))
  else internals.stdout.write(`✓ ${message}\n`)
  return 0
}

/** 交互隐藏输入读凭据值（非 TTY 时拒绝并指引 --value-env）。 */
function readSecretInteractively(prompt: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const stdin = process.stdin
    if (stdin.isTTY !== true) {
      reject(new Error('非交互终端：请用 --value-env VAR 从环境变量读入'))
      return
    }
    internals.stderr.write(prompt)
    let value = ''
    const cleanup = (): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      internals.stderr.write('\n')
    }
    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\n' || ch === '\r') {
          cleanup()
          resolvePromise(value)
          return
        }
        if (ch === '\u0003') {
          cleanup()
          reject(new Error('已取消'))
          return
        }
        if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += ch
      }
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

/**
 * auth 命令（rc8）：凭据设/删/状态——全部经官方 credentials 服务
 * （.credentials.yaml；值不进命令行参数与任何输出）。status 只答
 * configured/source/writable（官方 describe 语义）。
 */
async function runAuth(ctx: CliHost, command: Extract<CliCommand, { readonly kind: 'auth' }>): Promise<number> {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('auth', 'no-profile', current.reason, command.json)
  const credentials = ctx.get<CredentialsLike>('credentials')
  if (credentials === undefined) {
    return errorEnvelope('auth', 'credentials-unavailable', '宿主 credentials 服务不可达（非 web 组合？）', command.json)
  }
  if (command.verb === 'status') {
    const dir = join(resolveDshHome(process.env), 'profiles', current.profile)
    const refs = command.ref === undefined ? collectAuthRefs(dir) : [command.ref]
    const entries = await Promise.all(refs.map(async ref => ({
      ref,
      ...(await credentials.describe(ref)),
    })))
    if (command.json) {
      internals.stdout.write(jsonOutput('auth', { ok: true, profile: current.profile, credentials: entries }))
    } else if (entries.length === 0) {
      internals.stdout.write('（.npmrc 受管块无凭据引用）\n')
    } else {
      internals.stdout.write(entries.map(entry =>
        `${entry.ref}：${entry.configured ? `已配置（${entry.source ?? 'store'}）` : '未配置'}${entry.writable ? '' : '；被环境遮蔽不可写'}`,
      ).join('\n') + '\n')
    }
    return 0
  }
  const ref = command.ref ?? ''
  // env 遮蔽时 set/unset 拒绝（官方语义）：先 describe 探 writable。
  const info = await credentials.describe(ref)
  if (!info.writable) {
    return errorEnvelope('auth', 'credential-shadowed', `引用 ${ref} 被更高优先级来源（如环境变量）遮蔽，写入无效`, command.json)
  }
  if (command.verb === 'unset') {
    await credentials.unset(ref)
    if (command.json) internals.stdout.write(jsonOutput('auth', { ok: true, ref }))
    else internals.stdout.write(`✓ 凭据 ${ref} 已删除\n`)
    return 0
  }
  let value: string
  if (command.valueEnv !== undefined) {
    value = process.env[command.valueEnv] ?? ''
    if (value === '') {
      return errorEnvelope('auth', 'credential-empty', `环境变量 ${command.valueEnv} 为空或不存在（空值等于不存在）`, command.json)
    }
  } else {
    try {
      value = await readSecretInteractively(`输入 ${ref} 的凭据值（不回显）：`)
    } catch (error) {
      return errorEnvelope('auth', 'credential-read-failed', error instanceof Error ? error.message : String(error), command.json)
    }
    if (value === '') {
      return errorEnvelope('auth', 'credential-empty', '空值等于不存在；删除请用 auth unset', command.json)
    }
  }
  await credentials.set(ref, value)
  if (command.json) internals.stdout.write(jsonOutput('auth', { ok: true, ref }))
  else internals.stdout.write(`✓ 凭据 ${ref} 已存入实例凭据存储（$DSH_HOME/.credentials.yaml）\n`)
  return 0
}

/** config 命令（P7-A2）：整行 config 读/浅合并写回（patch 不 deep-merge 的补救）。 */
function runConfig(ctx: CliHost, command: Extract<CliCommand, { readonly kind: 'config' }>): number {  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('config', 'no-profile', current.reason, command.json)
  const home = resolveDshHome(process.env)
  if (command.set === undefined) {
    const outcome = readRowConfig(home, current.profile, command.id)
    if (!outcome.ok) return errorEnvelope('config', 'config-read-failed', outcome.error ?? '读取失败', command.json)
    if (command.json) {
      internals.stdout.write(jsonOutput('config', { ok: true, profile: current.profile, id: command.id, config: outcome.config }))
    } else {
      internals.stdout.write(renderConfigShow(current.profile, command.id, outcome.config ?? {}))
    }
    return 0
  }
  const patch = JSON.parse(command.set) as Record<string, unknown>
  const outcome = writeRowConfig(home, current.profile, command.id, patch)
  if (!outcome.ok) return errorEnvelope('config', 'config-write-failed', outcome.error ?? '写入失败', command.json)
  if (command.json) {
    internals.stdout.write(jsonOutput('config', { ok: true, profile: current.profile, id: command.id, config: outcome.config }))
  } else {
    internals.stdout.write(renderConfigShow(current.profile, command.id, outcome.config ?? {}))
  }
  return 0
}

/** hub 命令面（P5）：检索/详情不依赖管理器；install 需要当前 profile。 */
async function runHub(ctx: CliHost, command: Extract<CliCommand, { readonly kind: 'hub' }>): Promise<number> {
  const io = { stdout: (chunk: string) => internals.stdout.write(chunk), stderr: (chunk: string) => internals.stderr.write(chunk) }
  if (command.verb !== 'install') {
    return runHubCommand(command, { home: resolveDshHome(process.env), profile: '' }, io)
  }
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('hub', 'no-profile', current.reason, command.json)
  return runHubCommand(command, { home: resolveDshHome(process.env), profile: current.profile }, io)
}

// ---------------------------------------------------------------------------
// P4 多实例接管命令面（实例 = $DSH_HOME；不依赖管理器挂载）
// ---------------------------------------------------------------------------

function runInstances(command: Extract<CliCommand, { readonly kind: 'instances' }>): number {
  const records = listInstances()
  const currentHome = resolve(resolveDshHome(process.env))
  if (command.json) {
    internals.stdout.write(jsonOutput('instances', { ok: true, currentHome, instances: records }))
  } else {
    internals.stdout.write(renderInstances(records, currentHome))
  }
  return 0
}

function runAdopt(command: Extract<CliCommand, { readonly kind: 'adopt' }>): number {
  const outcome = adoptInstance(command.home)
  if (!outcome.ok) return errorEnvelope('adopt', 'adopt-failed', outcome.error ?? '登记失败', command.json)
  if (command.json) {
    internals.stdout.write(jsonOutput('adopt', {
      ok: true,
      home: outcome.home,
      record: outcome.record,
      profiles: outcome.profiles ?? [],
      ...(outcome.mygoVersion === undefined ? {} : { mygoVersion: outcome.mygoVersion }),
    }))
  } else {
    internals.stdout.write(renderAdoptSuccess(
      outcome.home,
      outcome.profiles ?? [],
      outcome.mygoVersion,
      outcome.record?.dshVersion,
    ))
  }
  return 0
}

async function runClone(command: Extract<CliCommand, { readonly kind: 'clone' }>): Promise<number> {
  const outcome = await clonePlugin(command.from, command.to, command.plugin)
  if (!outcome.ok) return errorEnvelope('clone', 'clone-failed', outcome.error ?? '克隆失败', command.json)
  if (command.json) {
    internals.stdout.write(jsonOutput('clone', {
      ok: true,
      id: outcome.id,
      version: outcome.version,
      sha512: outcome.sha512,
      cacheHit: outcome.cacheHit,
      via: outcome.via,
    }))
  } else {
    internals.stdout.write(renderCloneSuccess(
      outcome.id,
      outcome.version ?? '',
      resolve(command.to),
      outcome.sha512 ?? '',
      outcome.cacheHit ?? false,
      outcome.via ?? 'copy',
    ))
  }
  return 0
}

/** 安装执行面（P5 adapter 形态）：spec 经 profile adapter 解析为 pnpm intent 后执行。 */
async function runInstall(
  ctx: CliHost,
  command: Extract<CliCommand, { readonly kind: 'install' }>,
): Promise<number> {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('install', 'no-profile', current.reason, command.json)
  const adapter = profileAdapterOf(ctx)
  const intent = adapter.resolve(command.spec)
  if (intent === null) {
    return errorEnvelope('install', 'install-failed', `无法识别的安装 spec：${command.spec}`, command.json)
  }
  const home = resolveDshHome(process.env)
  const spawnEnv = await resolveSpawnEnv(ctx, home, current.profile)
  const receipt = await adapter.install(intent, {
    home,
    profile: current.profile,
    ...(spawnEnv === undefined ? {} : { env: spawnEnv }),
  })
  if (!receipt.ok) return errorEnvelope('install', 'install-failed', receipt.error?.message ?? 'pnpm 失败', command.json)
  if ((receipt.allowedBuilds?.length ?? 0) > 0 && !command.json) {
    internals.stdout.write(`  已放行构建脚本（写入 profile pnpm-workspace.yaml 白名单）：${(receipt.allowedBuilds ?? []).join(', ')}\n`)
  }
  if (command.json) {
    internals.stdout.write(jsonOutput('install', {
      ok: true,
      profile: receipt.profile,
      bundles: receipt.bundles,
      activated: receipt.activated ?? 'pending-restart',
      ...(receipt.allowedBuilds === undefined ? {} : { allowedBuilds: receipt.allowedBuilds }),
    }))
  } else {
    internals.stdout.write(renderInstallSuccess('install', receipt.profile ?? current.profile, receipt.bundles ?? [], {
      ...(receipt.live === undefined ? {} : { live: receipt.live }),
    }))
  }
  return 0
}

async function runUninstall(
  ctx: CliHost,
  command: Extract<CliCommand, { readonly kind: 'uninstall' }>,
): Promise<number> {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('uninstall', 'no-profile', current.reason, command.json)
  const home = resolveDshHome(process.env)
  const spawnEnv = await resolveSpawnEnv(ctx, home, current.profile)
  const outcome = profileAdapterOf(ctx).uninstall(command.name, {
    home,
    profile: current.profile,
    ...(spawnEnv === undefined ? {} : { env: spawnEnv }),
  })
  if (!outcome.ok) return errorEnvelope('uninstall', 'uninstall-failed', outcome.error ?? 'pnpm 失败', command.json)
  if (command.json) {
    internals.stdout.write(jsonOutput('uninstall', {
      ok: true,
      profile: outcome.profile,
      bundles: outcome.bundles,
      ...(outcome.liveStripped === true ? { liveStripped: true } : {}),
    }))
  } else {
    internals.stdout.write(renderInstallSuccess('uninstall', outcome.profile, outcome.bundles ?? [], {
      ...(outcome.liveStripped === true ? { liveStripped: true } : {}),
    }))
  }
  return 0
}

function runSetEnabled(
  ctx: CliHost,
  command: Extract<CliCommand, { readonly kind: 'enable' | 'disable' }>,
): number {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope(command.kind, 'no-profile', current.reason, command.json)
  const outcome = profileAdapterOf(ctx).setEnabled(command.id, command.kind === 'enable', { home: resolveDshHome(process.env), profile: current.profile })
  if (!outcome.ok) return errorEnvelope(command.kind, `${command.kind}-failed`, outcome.error ?? '写入失败', command.json)
  if (command.json) {
    internals.stdout.write(jsonOutput(command.kind, { ok: true, profile: outcome.profile, id: command.id }))
  } else {
    internals.stdout.write(renderSetEnabledSuccess(command.kind, command.id, outcome.profile))
  }
  return 0
}

async function runPack(
  ctx: CliHost,
  command: Extract<CliCommand, { readonly kind: 'pack' }>,
): Promise<number> {
  const current = profileOf(ctx)
  if (!current.ok) return errorEnvelope('pack', 'no-profile', current.reason, command.json)
  const output = resolve(process.cwd(), command.output === '' ? `${current.profile}-plugins.mygo-pack` : command.output)
  const outcome = await managerFor(current.profile).buildPack({
    output,
    includeCommunityDeps: command.includeCommunityDeps,
    ...(command.references === undefined ? {} : { references: command.references }),
  })
  if (outcome.ok) {
    if (command.json) {
      internals.stdout.write(jsonOutput('pack', {
        ok: true,
        packPath: output,
        sha256: outcome.sha256,
        plugins: outcome.manifest.plugins,
        references: outcome.manifest.references,
        communityDeps: outcome.manifest.communityDeps,
      }))
    } else {
      internals.stdout.write(renderPackSuccess(
        output,
        outcome.sha256,
        outcome.manifest.plugins.length,
        outcome.manifest.communityDeps.length,
        outcome.manifest.references.length,
      ))
    }
    return 0
  }
  if (command.json) {
    internals.stdout.write(jsonOutput('pack', { ok: false, report: outcome.report }))
  } else {
    internals.stdout.write(renderReportHuman(outcome.report))
  }
  return 1
}

async function runRestore(
  ctx: CliHost,
  command: Extract<CliCommand, { readonly kind: 'restore' }>,
): Promise<number> {
  const current = profileOf(ctx)
  const target = command.targetProfile ?? (current.ok ? current.profile : undefined)
  if (target === undefined) {
    const reason = current.ok ? '未知目标 profile' : current.reason
    return errorEnvelope('restore', 'no-profile', reason, command.json)
  }
  const packPath = resolve(process.cwd(), command.pack)
  const core = coreVersion()
  const outcome = await managerFor(target).installPack(packPath, core === undefined ? {} : { coreVersion: core })
  if (outcome.ok) {
    const pluginCount = outcome.restored.length
    // P8：restore 后自动注册进目标 profile（等价 dsh plugin add；--no-register 关闭）。
    let registrations: readonly import('./install.ts').PackMemberRegistration[] = []
    if (command.register && outcome.members.length > 0) {
      const registered = await registerPackMembers(packPath, outcome.members, {
        home: resolveDshHome(process.env),
        profile: target,
      })
      if (!registered.ok) {
        return errorEnvelope('restore', 'register-failed', `还原已完成但注册失败：${registered.error ?? ''}`, command.json)
      }
      registrations = registered.registrations
    }
    if (command.json) {
      internals.stdout.write(jsonOutput('restore', {
        ok: true,
        profile: target,
        plugins: pluginCount,
        warnings: outcome.warnings,
        registrations,
      }))
    } else {
      internals.stdout.write(renderRestoreSuccess(target, pluginCount, outcome.warnings, registrations))
    }
    return 0
  }
  if (command.json) {
    internals.stdout.write(jsonOutput('restore', { ok: false, report: outcome.report }))
  } else {
    internals.stdout.write(renderReportHuman(outcome.report))
  }
  return 1
}

async function runInit(command: Extract<CliCommand, { readonly kind: 'init' }>): Promise<number> {
  try {
    const result = await generatePluginSkeleton(command.name, {
      ...(command.id === undefined ? {} : { id: command.id }),
      ...(command.dir === undefined ? {} : { dir: command.dir }),
      cwd: process.cwd(),
    })
    if (command.json) {
      internals.stdout.write(jsonOutput('init', {
        ok: true,
        dir: result.dir,
        id: result.id,
        manifest: result.manifest,
      }))
    } else {
      internals.stdout.write(renderInitSuccess(result.dir, result.files.length, result.id))
    }
    return 0
  } catch (error) {
    const message = error instanceof InitError
      ? error.message
      : error instanceof Error ? error.message : String(error)
    return errorEnvelope('init', 'init-failed', message, command.json)
  }
}

/** 供包级 invariant 伴生与测试引用的稳定标识。 */
export const CLI_PACKAGE_NAME = '@r05en1cu/dsh-mygo-cli'
