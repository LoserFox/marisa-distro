/**
 * P3 bundle rail: manage official profile bundles (`dsh.bundle.patch`
 * packages) from mygo without touching the dsh checkout.
 *
 * - Install / uninstall forward the official `dsh plugin --profile <name>`
 *   CLI (pnpm + bundle-list reconciliation stay with the harness).
 * - Enable / disable stay config-level: the bundle remains in
 *   `dsh.profile.bundles` and a managed companion block in the profile user
 *   patch layer disables its inserted rows (`disabled: true`) and restores
 *   host rows it disabled (`disabled: false`) — both go through the host's
 *   normal patch HMR.
 * - Every manifest / patch write is atomic (temp + rename) with a snapshot
 *   kept next to the file for rollback.
 * @module @r05en1cu/dsh-mygo/src/bundle-rail
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import * as yaml from 'js-yaml'
import type { PluginCompatibility } from '@r05en1cu/dsh-mygo-api'
import { liveBlockPackages } from './live-rail.ts'
import type { PluginOperationPlan } from './types.ts'

/** One row-level fact extracted from a bundle's `cordis.patch.yml`. */
export interface BundlePatchFact {
  readonly rowId: string
  /** insert = the bundle adds the row; override = targets an existing row; disable = override with disabled: true. */
  readonly kind: 'insert' | 'override' | 'disable'
  /** Insert rows that ship `disabled: true` are opt-in (e.g. cordis-fabric). */
  readonly disabled?: boolean
}

/** One bundle-rail member in the unified activation graph. */
export interface BundleMember {
  readonly rail: 'bundle'
  readonly id: string
  readonly packageName: string
  readonly version?: string
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
  /** Active = listed in `dsh.profile.bundles` and not disabled by a companion block. */
  readonly enabled: boolean
  /**
   * r7 live rail 在管：该包的行由 profile patch 层 mygo live 受管块物化，
   * 不进 `dsh.profile.bundles`（单轨规则）；此时 enabled 反映受管块 +
   * companion 判定的真实激活态，而非恒 false。
   */
  readonly live?: boolean
  readonly patchFacts: readonly BundlePatchFact[]
  /** Human-readable host-row rewrites this bundle performs (needs double confirm). */
  readonly hostConflicts: readonly string[]
  /** Host rows this bundle replaces (disabled while the bundle is active). */
  readonly hostDisables: readonly string[]
}

/** Outcome of one verified bundle install. */
export interface BundleInstallResult {
  readonly member: BundleMember
  /** Pre-apply plan preview; rejected means the install was rolled back. */
  readonly plan: PluginOperationPlan
  /** r7 live rail：live = 运行期已激活；pending-restart = 下次 boot 物化。 */
  readonly activated?: 'live' | 'pending-restart'
}

export interface BundleRailOptions {
  readonly dshHome: string
  readonly profile: string
  /** dsh 可执行文件；缺省走 PATH 上的 `dsh`（npm/npx 布局）。 */
  readonly dshBin?: string
  /** dsh 安装目录（npm 布局 = @deepseek-ai/dsh 包目录）；in-box bundle 判定。 */
  readonly dshInstallDir?: string
  /** 源码 checkout（legacy）；in-box bundle 判定。 */
  readonly checkout?: string
}

const COMPANION_DISABLE_START = (id: string): string => `# >>> mygo bundle disable block: ${id}`
const COMPANION_DISABLE_END = (id: string): string => `# <<< mygo bundle disable block: ${id}`
const COMPANION_ENABLE_START = (id: string): string => `# >>> mygo bundle enable block: ${id}`
const COMPANION_ENABLE_END = (id: string): string => `# <<< mygo bundle enable block: ${id}`
const COMPANION_HOST_START = (id: string): string => `# >>> mygo bundle host block: ${id}`
const COMPANION_HOST_END = (id: string): string => `# <<< mygo bundle host block: ${id}`

/**
 * 成员 id 定向的 companion 块标记对（disable/enable/host 三种），供
 * row-config.removePatchRows 在卸载清理时整块剥除（同包单一事实源）。
 */
export const COMPANION_BLOCK_MARKERS = (id: string): readonly (readonly [string, string])[] => [
  [COMPANION_DISABLE_START(id), COMPANION_DISABLE_END(id)],
  [COMPANION_ENABLE_START(id), COMPANION_ENABLE_END(id)],
  [COMPANION_HOST_START(id), COMPANION_HOST_END(id)],
]

/**
 * Known host-row replacements by inserted row id. A bundle whose patch
 * inserts one of these rows disables the listed host rows while active
 * (e.g. session-persistence-rdb replaces the built-in jsonl backend).
 */
export const HOST_REPLACEMENT_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  'session-persistence-rdb': ['session-persistence-jsonl'],
}

/** js-yaml schema tolerating the `!!js` expressions dsh patch files use. */
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (value: unknown) => value,
})
const PATCH_SCHEMA = yaml.JSON_SCHEMA.extend(JsExpr)

/** Parse patch file text into row-level facts (pure; live rail 复用同口径). */
export function patchFactsFromText(text: string): BundlePatchFact[] {
  let parsed: unknown
  try {
    parsed = yaml.load(text, { schema: PATCH_SCHEMA })
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const facts: BundlePatchFact[] = []
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (Array.isArray(record.insert)) {
      for (const row of record.insert) {
        if (row !== null && typeof row === 'object') {
          const rowRecord = row as { readonly id?: unknown; readonly disabled?: unknown }
          if (typeof rowRecord.id === 'string') {
            facts.push({
              rowId: rowRecord.id,
              kind: 'insert',
              ...(rowRecord.disabled === true ? { disabled: true } : {}),
            })
          }
        }
      }
      continue
    }
    if (typeof record.id !== 'string') continue
    facts.push({
      rowId: record.id,
      kind: record.disabled === true ? 'disable' : 'override',
    })
  }
  return facts
}

/**
 * The official bundle rail: profile manifest + `dsh plugin` forwarding +
 * companion patch blocks. All writes are atomic with snapshots.
 */
export class BundleRail {
  constructor(private readonly options: BundleRailOptions) {}

  profileDir(): string {
    return join(this.options.dshHome, 'profiles', this.options.profile)
  }

  /** 实例 HOME（r7 live rail 写盘锚点）。 */
  homeDir(): string {
    return this.options.dshHome
  }

  /** 目标 profile 名（r7 live rail 写盘锚点）。 */
  profileName(): string {
    return this.options.profile
  }

  manifestPath(): string {
    return join(this.profileDir(), 'package.json')
  }

  patchPath(): string {
    return join(this.profileDir(), 'cordis.patch.yml')
  }

  /** Read the profile manifest (tolerates a missing/invalid profile). */
  readManifest(): { readonly dependencies: Readonly<Record<string, string>>; readonly bundles: readonly string[] } {
    const path = this.manifestPath()
    if (!existsSync(path)) return { dependencies: {}, bundles: [] }
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        readonly dependencies?: Readonly<Record<string, string>>
        readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
      }
      return {
        dependencies: parsed.dependencies ?? {},
        bundles: parsed.dsh?.profile?.bundles ?? [],
      }
    } catch {
      return { dependencies: {}, bundles: [] }
    }
  }

  /** Atomic manifest write with a `.mygo-bundle-backup.json` snapshot. */
  writeManifest(next: {
    readonly dependencies: Readonly<Record<string, string>>
    readonly bundles: readonly string[]
  }): void {
    const path = this.manifestPath()
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '{}'
    writeFileSync(`${path}.mygo-bundle-backup.json`, current, 'utf8')
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(current) as Record<string, unknown>
    } catch {
      parsed = {}
    }
    const nextManifest = {
      ...parsed,
      dependencies: { ...next.dependencies },
      dsh: { ...(parsed.dsh as Record<string, unknown> | undefined), profile: { ...(parsed.dsh as { profile?: Record<string, unknown> } | undefined)?.profile, bundles: [...next.bundles] } },
    }
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(nextManifest, null, 2) + '\n', 'utf8')
    renameSync(tmp, path)
  }

  /**
   * Resolve one installed package to its directory. Only the profile anchor
   * counts: in-box bundles (dsh-base / dsh-web-app) resolve from the dsh
   * installation and are owned by the harness, never by mygo.
   */
  resolveBundleDir(packageName: string): string | undefined {
    try {
      const req = createRequire(join(this.profileDir(), 'noop.js'))
      return dirname(req.resolve(`${packageName}/package.json`))
    } catch {
      return undefined
    }
  }

  /** Parse one bundle's patch file into row-level facts. */
  patchFactsOf(bundleDir: string): BundlePatchFact[] {
    const pkg = this.readPackageJson(bundleDir)
    const patchRel = (pkg as { dsh?: { bundle?: { patch?: unknown } } })?.dsh?.bundle?.patch
    if (typeof patchRel !== 'string') return []
    const patchPath = join(bundleDir, patchRel)
    if (!existsSync(patchPath)) return []
    return patchFactsFromText(readFileSync(patchPath, 'utf8'))
  }

  /** Build one bundle member from disk state. */
  readMember(packageName: string, inBundles: boolean): BundleMember | undefined {
    const dir = this.resolveBundleDir(packageName)
    if (dir === undefined) return undefined
    // In-box bundles resolve through the profiles fallback into the dsh
    // installation; they are harness-owned and never mygo-managed.
    const inBoxRoots = [this.options.checkout, this.options.dshInstallDir].filter(
      (root): root is string => root !== undefined,
    )
    try {
      const real = realpathSync(dir)
      if (inBoxRoots.some(root => real.startsWith(realpathSync(root)))) return undefined
    } catch {
      return undefined
    }
    const pkg = this.readPackageJson(dir)
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') return undefined
    const id = pkg.name.startsWith('@')
      ? pkg.name.slice(pkg.name.indexOf('/') + 1)
      : pkg.name
    const mygo = (pkg as { dsh?: { mygo?: {
      compatibility?: PluginCompatibility
      provides?: readonly string[]
      hostDisables?: unknown
    } } })?.dsh?.mygo
    const bundle = (pkg as { dsh?: { bundle?: { requires?: Record<string, string>; breaks?: Record<string, string> } } })?.dsh?.bundle
    const compatibility: PluginCompatibility | undefined = mygo?.compatibility ?? (
      bundle?.requires === undefined && bundle?.breaks === undefined
        ? undefined
        : {
            ...(bundle.requires === undefined ? {} : { depends: bundle.requires }),
            ...(bundle.breaks === undefined ? {} : { breaks: bundle.breaks }),
          }
    )
    const patchFacts = this.patchFactsOf(dir)
    const hostConflicts = patchFacts
      .filter(fact => fact.kind !== 'insert')
      .map(fact => fact.kind === 'disable'
        ? `禁用宿主行 ${fact.rowId}`
        : `改写宿主行 ${fact.rowId}`)
    const declaredDisables = Array.isArray(mygo?.hostDisables)
      ? (mygo.hostDisables as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : []
    const hostDisables = [...new Set([
      ...declaredDisables,
      ...patchFacts
        .filter(fact => fact.kind === 'insert')
        .flatMap(fact => HOST_REPLACEMENT_DEFAULTS[fact.rowId] ?? []),
    ])]
    return {
      rail: 'bundle',
      id,
      packageName,
      version: pkg.version,
      ...(compatibility === undefined ? {} : { compatibility }),
      ...(mygo?.provides === undefined || mygo.provides.length === 0 ? {} : { provides: mygo.provides }),
      enabled: inBundles && !this.hasCompanion(id),
      patchFacts,
      hostConflicts: [...hostConflicts, ...hostDisables.map(row => `替换宿主行 ${row}`)],
      hostDisables,
    }
  }

  /** Every installable/active bundle member (dependencies that declare dsh.bundle or are listed). */
  members(): BundleMember[] {
    const { dependencies, bundles } = this.readManifest()
    const bundleSet = new Set(bundles)
    const liveSet = this.livePackageSet()
    const members: BundleMember[] = []
    const seen = new Set<string>()
    for (const packageName of [...bundleSet, ...Object.keys(dependencies)]) {
      if (seen.has(packageName)) continue
      seen.add(packageName)
      const member = this.readMember(packageName, bundleSet.has(packageName))
      if (member === undefined) continue
      // r7 单轨：live 块在管的包不进 bundles，enabled 以 companion 判定
      // （否则会被 inBundles=false 恒误计为 disabled）。
      members.push(liveSet.has(packageName)
        ? { ...member, live: true, enabled: !this.hasCompanion(member.id) }
        : member)
    }
    return members
  }

  /** live rail 受管块在管的包名集合（patch 层文本扫描；缺失/不可读按空集）。 */
  private livePackageSet(): ReadonlySet<string> {
    const path = this.patchPath()
    if (!existsSync(path)) return new Set()
    try {
      return new Set(liveBlockPackages(readFileSync(path, 'utf8')))
    } catch {
      return new Set()
    }
  }

  /** Forward one official `dsh plugin` invocation and return its output. */
  runDshPlugin(args: readonly string[], env?: Readonly<Record<string, string>>): string {
    const bin = this.options.dshBin
      ?? (this.options.checkout === undefined ? 'dsh' : join(this.options.checkout, 'bin', 'dsh'))
    const result = spawnSync(bin, ['plugin', '--profile', this.options.profile, ...args], {
      cwd: this.profileDir(),
      encoding: 'utf8',
      timeout: 120_000,
      // rc8 registry auth：调用方解析好的 ${REF} env 增量并入子进程环境。
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    })
    if (result.status !== 0) {
      const detail = (result.stderr ?? result.stdout ?? '').trim()
      throw new Error(`dsh plugin 失败（exit ${result.status ?? '?'}）：${detail.slice(0, 800)}`)
    }
    return result.stdout ?? ''
  }

  /** Install one bundle spec (npm name@range, git url, or path) via the official CLI. */
  install(spec: string, options?: { readonly env?: Readonly<Record<string, string>> }): BundleMember {
    const beforeDeps = new Set(Object.keys(this.readManifest().dependencies))
    this.runDshPlugin(['add', spec], options?.env)
    const { bundles } = this.readManifest()
    // The CLI reconciles bundle-declaring dependencies into the list; find the
    // newly installed member by matching the requested spec's package name.
    const installed = this.latestInstalledPackage(spec)
    const member = installed === undefined
      ? this.members().at(-1)
      : this.readMember(installed, bundles.includes(installed))
    if (member === undefined) {
      // rc8 P4 回滚小修：add 成功但成员解析失败（如包 exports 缺
      // ./package.json 子路径）时不能留 deps/bundles 残账——按依赖差集
      // 尽力 remove（spec 推导对 scoped 名不可靠）。
      for (const name of Object.keys(this.readManifest().dependencies)) {
        if (beforeDeps.has(name)) continue
        try {
          this.runDshPlugin(['remove', name], options?.env)
        } catch {
          // 回滚尽力而为；下面抛出的错误仍指认解析失败本身
        }
      }
      throw new Error(`安装后未能在 profile 中找到 bundle：${spec}`)
    }
    if (member.hostDisables.length > 0) this.writeHostBlock(member.id, member.hostDisables)
    // 0809 roster 读 `dshClient`，0810 读 `dsh.client`。官方 0810 格式的 bundle
    // 只声明 dsh.client；补一个 legacy 字段让 0809 的浏览器半部也能进 roster
    // （0810 会忽略 dshClient，双写无害）。卸载时按标记还原。
    this.injectLegacyClient(member.packageName)
    return member
  }

  /** Uninstall one bundle via the official CLI, then drop its companion block. */
  uninstall(id: string, options?: { readonly env?: Readonly<Record<string, string>> }): void {
    const member = this.members().find(candidate => candidate.id === id)
    if (member === undefined) throw new Error(`bundle ${id} 未安装`)
    this.removeDisableBlock(id)
    this.removeEnableBlock(id)
    this.removeHostBlock(id)
    this.runDshPlugin(['remove', member.packageName], options?.env)
    this.restoreLegacyClient(member.packageName)
  }

  /**
   * Enable a bundle: remove the disable block and ensure it is listed.
   * Opt-in rows (inserted with `disabled: true` by the bundle itself) get an
   * enable block overriding them to `disabled: false`.
   */
  enable(id: string): void {
    const { bundles } = this.readManifest()
    const member = this.members().find(candidate => candidate.id === id)
    if (member === undefined) throw new Error(`bundle ${id} 未安装`)
    this.removeDisableBlock(id)
    if (member.hostDisables.length > 0) this.writeHostBlock(id, member.hostDisables)
    else this.removeHostBlock(id)
    const optInRows = member.patchFacts.filter(fact => fact.kind === 'insert' && fact.disabled === true)
    if (optInRows.length > 0) this.writeEnableBlock(id, optInRows.map(fact => fact.rowId))
    else this.removeEnableBlock(id)
    if (!bundles.includes(member.packageName)) {
      this.writeManifest({
        ...this.readManifest(),
        bundles: [...bundles, member.packageName],
      })
    }
  }

  /** Disable a bundle at row level: write its companion block (no manifest change). */
  disable(id: string): void {
    const member = this.members().find(candidate => candidate.id === id)
    if (member === undefined) throw new Error(`bundle ${id} 未安装`)
    const canNeutralize = member.patchFacts.some(fact => fact.kind === 'insert' || fact.kind === 'disable')
    if (!canNeutralize) {
      // Pure config overrides cannot be row-level disabled without knowing the
      // original value; restrict those bundles (P3 limited support).
      throw new Error(`bundle ${id} 仅改写宿主行 config，暂不支持行级停用（受限支持）`)
    }
    this.removeEnableBlock(id)
    this.removeHostBlock(id)
    this.writeDisableBlock(id, member)
  }

  /** Whether the disable block exists for one bundle id (the bundle is off). */
  hasCompanion(id: string): boolean {
    const path = this.patchPath()
    if (!existsSync(path)) return false
    try {
      return readFileSync(path, 'utf8').includes(COMPANION_DISABLE_START(id))
    } catch {
      return false
    }
  }

  /** Write the disable block (row-level off + host-row restore) atomically. */
  writeDisableBlock(id: string, member: BundleMember): void {
    this.writeBlock(
      COMPANION_DISABLE_START(id),
      COMPANION_DISABLE_END(id),
      [
        ...member.patchFacts
          .filter(fact => fact.kind === 'insert')
          .map(fact => `- id: ${fact.rowId}\n  disabled: true`),
        ...member.patchFacts
          .filter(fact => fact.kind === 'disable')
          .map(fact => `- id: ${fact.rowId}\n  disabled: false`),
      ],
    )
  }

  /** Write the enable block (opt-in rows forced on) atomically. */
  writeEnableBlock(id: string, rowIds: readonly string[]): void {
    this.writeBlock(
      COMPANION_ENABLE_START(id),
      COMPANION_ENABLE_END(id),
      rowIds.map(rowId => `- id: ${rowId}\n  disabled: false`),
    )
  }

  /** Write the host-replacement block (host rows disabled while active). */
  writeHostBlock(id: string, rows: readonly string[]): void {
    this.writeBlock(
      COMPANION_HOST_START(id),
      COMPANION_HOST_END(id),
      rows.map(rowId => `- id: ${rowId}\n  disabled: true`),
    )
  }

  /** Write one companion block into the profile user patch layer (atomic). */
  private writeBlock(start: string, end: string, lines: readonly string[]): void {
    const path = this.patchPath()
    let text = existsSync(path) ? readFileSync(path, 'utf8') : ''
    // 顶层 `[]` 是空数组占位文档（rc.4 口径），追加块前必须摘除——否则
    // `[]` 后跟块内容构成非法 YAML（实机事故形态）。
    if (text.trim() === '[]') text = ''
    const block = [start, ...lines, end].join('\n')
    const next = text.includes(start)
      ? text.replace(
          new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          block,
        )
      : `${text.replace(/\s+$/, '')}\n${block}\n`
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, path)
  }

  private removeBlock(start: string, end: string): void {
    const path = this.patchPath()
    if (!existsSync(path)) return
    const text = readFileSync(path, 'utf8')
    if (!text.includes(start)) return
    const removed = text.replace(
      new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\\n`),
      '',
    )
    // 摘除后无 YAML 内容行时回落 `[]` 占位——host 要求顶层数组（仅注释
    // 会解析为 null）。
    const hasContent = removed.split('\n').some(line => {
      const trimmed = line.trim()
      return trimmed !== '' && !trimmed.startsWith('#')
    })
    const next = hasContent ? removed : `${removed.replace(/\s+$/, '')}\n[]\n`
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, path)
  }

  private removeDisableBlock(id: string): void {
    this.removeBlock(COMPANION_DISABLE_START(id), COMPANION_DISABLE_END(id))
  }

  private removeEnableBlock(id: string): void {
    this.removeBlock(COMPANION_ENABLE_START(id), COMPANION_ENABLE_END(id))
  }

  private removeHostBlock(id: string): void {
    this.removeBlock(COMPANION_HOST_START(id), COMPANION_HOST_END(id))
  }

  private readPackageJson(dir: string): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  /** Best-effort package-name extraction from an install spec. */
  private latestInstalledPackage(spec: string): string | undefined {
    const bare = spec
      .replace(/^git\+/, '')
      .replace(/^github:/, '')
      .split(/[#@&]/)[0] ?? ''
    const trimmed = bare.trim()
    if (trimmed === '') return undefined
    const name = trimmed.endsWith('.git')
      ? basename(trimmed, '.git')
      : trimmed.includes('/') && !trimmed.startsWith('@')
        ? basename(trimmed)
        : trimmed
    const { dependencies } = this.readManifest()
    return Object.keys(dependencies).find(pkg => pkg === name || pkg === `@${name}`)
      ?? (name.startsWith('@') ? name : Object.keys(dependencies).find(pkg => pkg === name))
  }

  /** Absolute package.json path of one installed bundle package. */
  private bundlePackageJson(packageName: string): string {
    return join(this.profileDir(), 'node_modules', ...packageName.split('/'), 'package.json')
  }

  /**
   * Inject the legacy `dshClient` declaration into an 0810-style bundle
   * package that only declares `dsh.client`, so the 0809 browser roster can
   * discover its client half. Records the injection under `dsh.mygo` so
   * {@link restoreLegacyClient} can undo it exactly.
   */
  private injectLegacyClient(packageName: string): void {
    const pkgPath = this.bundlePackageJson(packageName)
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    } catch {
      return
    }
    const dsh = pkg.dsh
    if (dsh === undefined || typeof dsh !== 'object' || Array.isArray(dsh)) return
    const dshObj = dsh as Record<string, unknown>
    const client = dshObj.client
    if (client === undefined || typeof client !== 'object' || client === null) return
    if (pkg.dshClient !== undefined) return
    const decl = client as Record<string, unknown>
    // 0809 的 ClientModuleHost 读 package.json 顶层 `dshClient`（0810 读
    // `dsh.client`）——必须放顶层，不能嵌进 `dsh`。
    pkg.dshClient = {
      platform: typeof decl.platform === 'string' ? decl.platform : 'web',
      ...(Array.isArray(decl.inject) ? { inject: decl.inject } : {}),
      ...(typeof decl.immediately === 'boolean' ? { immediately: decl.immediately } : {}),
    }
    const mygo = typeof dshObj.mygo === 'object' && dshObj.mygo !== null
      ? { ...dshObj.mygo as Record<string, unknown> }
      : {}
    dshObj.mygo = { ...mygo, legacyClientInjected: true }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  /** Undo {@link injectLegacyClient} when the bundle package still exists. */
  private restoreLegacyClient(packageName: string): void {
    const pkgPath = this.bundlePackageJson(packageName)
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    } catch {
      return
    }
    const dsh = pkg.dsh
    if (dsh === undefined || typeof dsh !== 'object' || Array.isArray(dsh)) return
    const dshObj = dsh as Record<string, unknown>
    const mygo = dshObj.mygo
    if (typeof mygo !== 'object' || mygo === null
      || (mygo as Record<string, unknown>).legacyClientInjected !== true) return
    delete pkg.dshClient
    delete dshObj.mygo
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}
