/**
 * P4 BOM：生态依赖参考物（Plan B——导出 + 只读对账，无生命周期）。
 *
 * BOM 把统一依赖图序列化成 `dsh.bom/v1`：`intent` 段保存成员声明
 * （版本区间 + provides + compatibility，等价于把每个成员的 `dsh.mygo`
 * 汇总），`lock` 段保存解析后的精确版本（含 mygo 自身 commit）。`bom check`
 * 只读：把 lock 与当前 profile 集合对账（missing / extra / drift /
 * 约束违例链），零修改。生命周期（install/upgrade/apply/reconcile）明确不做，
 * 但格式按可被未来求解器消费的方式设计。
 * @module @r05en1cu/dsh-mygo/src/bom
 */

import type { PluginCompatibility, PluginHandleInfo } from '@r05en1cu/dsh-mygo-api'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  compatibilityViolationLines,
  compatibilityWarningLines,
  evaluateCompatibility,
  type CompatibilityInput,
  type CompatibilityPlugin,
  type CompatibilitySet,
} from './compatibility.ts'
import { MYGO_MANAGER_CAPABILITY, MYGO_MANAGER_ID, MYGO_MANAGER_VERSION } from './lifecycle.ts'
import { MYGO_SELF } from './self.ts'
import { parseVersion } from './semver-range.ts'

/** BOM 成员来源轨。 */
export type BomRail = 'self' | 'bridge' | 'bundle' | 'app'

/** `intent` 段的一个成员声明（版本区间 + 能力 + 自带约束）。 */
export interface BomMemberIntent {
  readonly id: string
  readonly rail: BomRail
  /** 兼容带（`^<精确版本>`，非 semver 版本回退 `*`）。 */
  readonly version: string
  readonly provides?: readonly string[]
  readonly entrypoints?: readonly string[]
  readonly compatibility?: PluginCompatibility
}

/** `lock` 段的一个成员锁定（精确版本 + 来源事实）。 */
export interface BomMemberLock {
  readonly id: string
  readonly rail: BomRail
  readonly version: string
  readonly commit?: string
  /** 序列化来源（v1：仅 self 填 commit；bridge 的 github ref 留面板侧）。 */
  readonly source?: Record<string, unknown>
}

/** 一份 `dsh.bom/v1` 文档。 */
export interface BomDocument {
  readonly format: 'dsh.bom/v1'
  readonly generated: {
    readonly by: 'dsh-mygo'
    readonly version: string
    readonly commit?: string
    readonly profile: string
    readonly at: string
  }
  readonly intent: {
    readonly members: readonly BomMemberIntent[]
    readonly suite?: {
      readonly breaks?: Readonly<Record<string, string>>
      readonly excludes?: readonly string[]
    }
  }
  readonly lock: {
    readonly members: readonly BomMemberLock[]
    readonly hostPackages?: Readonly<Record<string, string>>
  }
}

/** 导出输入：调用方（manager 运行时）从统一依赖图收集。 */
export interface BomExportInput {
  readonly profile: string
  /** 只传 enabled 的托管插件句柄。 */
  readonly bridgePlugins?: readonly PluginHandleInfo[]
  /** 只传 enabled 的 bundle 成员。 */
  readonly bundles?: readonly {
    readonly id: string
    readonly version?: string
    readonly provides?: readonly string[]
    readonly compatibility?: PluginCompatibility
  }[]
  /** v1 可选：外部应用只声明属于套件，不参与约束求解。 */
  readonly apps?: readonly { readonly id: string; readonly version?: string }[]
  readonly hostPackages?: Readonly<Record<string, string>>
  readonly now?: Date
}

/** 当前集合的一个成员（对账输入）。 */
export interface BomCurrentMember {
  readonly id: string
  readonly version: string
  readonly status: 'enabled' | 'disabled' | 'quarantined' | 'shadowed' | 'uninstalled'
  readonly provides?: readonly string[]
  readonly compatibility?: PluginCompatibility
}

/** 只读对账报告：零修改，只描述差异与违例。 */
export interface BomCheckReport {
  readonly ok: boolean
  /** 干净 = 无 missing / extra / drift / violations。 */
  readonly clean: boolean
  readonly missing: readonly string[]
  readonly extra: readonly string[]
  readonly drift: readonly { readonly id: string; readonly locked: string; readonly current: string }[]
  readonly violations: readonly string[]
  readonly warnings: readonly string[]
}

/** 一个待校验的新插件声明（`bom check --target` 的输入）。 */
export interface BomTarget {
  readonly id: string
  readonly version: string
  readonly provides?: readonly string[]
  readonly compatibility?: PluginCompatibility
}

/** 从插件目录的 package.json 读取待校验声明（`bom check --target`）。 */
export async function loadBomTarget(packageDir: string): Promise<BomTarget> {
  let raw: string
  try {
    raw = await readFile(join(packageDir, 'package.json'), 'utf8')
  } catch (error) {
    throw new Error(`无法读取 ${join(packageDir, 'package.json')}: ${String(error)}`)
  }
  const pkg = JSON.parse(raw) as {
    readonly name?: unknown
    readonly version?: unknown
    readonly dsh?: {
      readonly mygo?: {
        readonly compatibility?: unknown
        readonly provides?: unknown
      }
    }
  }
  if (typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new Error(`package.json 缺少 name: ${packageDir}`)
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`package.json 缺少 version: ${packageDir}`)
  }
  const compatibility = pkg.dsh?.mygo?.compatibility
  const provides = pkg.dsh?.mygo?.provides
  return {
    id: pkg.name,
    version: pkg.version,
    ...(compatibility === undefined || typeof compatibility !== 'object'
      ? {}
      : { compatibility: compatibility as PluginCompatibility }),
    ...(provides === undefined || !Array.isArray(provides)
      ? {}
      : { provides: provides as readonly string[] }),
  }
}

/** 精确版本 → 兼容带（caret 语义；非 semver 回退任意带）。 */
function caretBand(version: string): string {
  return parseVersion(version) === undefined ? '*' : `^${version}`
}

function memberSet(members: readonly BomMemberLock[], selfOverride?: string): CompatibilitySet {
  const plugins: CompatibilityPlugin[] = members.map(member => ({
    id: member.id,
    version: member.version,
    enabled: true,
    ...(member.rail === 'self' ? { provides: [MYGO_MANAGER_CAPABILITY] as readonly string[] } : {}),
  }))
  if (selfOverride !== undefined) {
    plugins.push({
      id: MYGO_MANAGER_ID,
      version: selfOverride,
      provides: [MYGO_MANAGER_CAPABILITY],
      enabled: true,
    })
  }
  return { enabled: plugins, installed: plugins }
}

/** 由统一依赖图构建 `dsh.bom/v1` 文档。 */
export function buildBom(input: BomExportInput): BomDocument {
  const now = input.now ?? new Date()
  const selfVersion = MYGO_MANAGER_VERSION
  const intents: BomMemberIntent[] = [
    {
      id: MYGO_MANAGER_ID,
      rail: 'self',
      version: caretBand(selfVersion),
      provides: [MYGO_MANAGER_CAPABILITY],
    },
  ]
  const locks: BomMemberLock[] = [
    {
      id: MYGO_MANAGER_ID,
      rail: 'self',
      version: selfVersion,
      ...(MYGO_SELF.commit === undefined ? {} : { commit: MYGO_SELF.commit }),
    },
  ]
  for (const handle of input.bridgePlugins ?? []) {
    intents.push({
      id: handle.id,
      rail: 'bridge',
      version: caretBand(handle.version),
      ...(handle.provides.length === 0 ? {} : { provides: handle.provides }),
      ...(handle.entrypoints === undefined || handle.entrypoints.length === 0
        ? {}
        : { entrypoints: handle.entrypoints }),
      ...(handle.compatibility === undefined ? {} : { compatibility: handle.compatibility }),
    })
    locks.push({
      id: handle.id,
      rail: 'bridge',
      version: handle.version,
    })
  }
  for (const bundle of input.bundles ?? []) {
    intents.push({
      id: bundle.id,
      rail: 'bundle',
      version: bundle.version === undefined ? '*' : caretBand(bundle.version),
      ...(bundle.provides === undefined || bundle.provides.length === 0
        ? {}
        : { provides: bundle.provides }),
      ...(bundle.compatibility === undefined ? {} : { compatibility: bundle.compatibility }),
    })
    locks.push({ id: bundle.id, rail: 'bundle', version: bundle.version ?? '*' })
  }
  for (const app of input.apps ?? []) {
    intents.push({
      id: app.id,
      rail: 'app',
      version: app.version === undefined ? '*' : caretBand(app.version),
    })
    locks.push({ id: app.id, rail: 'app', version: app.version ?? '*' })
  }
  return {
    format: 'dsh.bom/v1',
    generated: {
      by: 'dsh-mygo',
      version: selfVersion,
      ...(MYGO_SELF.commit === undefined ? {} : { commit: MYGO_SELF.commit }),
      profile: input.profile,
      at: now.toISOString(),
    },
    intent: { members: intents },
    lock: {
      members: locks,
      ...(input.hostPackages === undefined || Object.keys(input.hostPackages).length === 0
        ? {}
        : { hostPackages: input.hostPackages }),
    },
  }
}

/** 只读对账：BOM lock vs 当前 profile 集合。 */
export function checkBom(bom: BomDocument, current: readonly BomCurrentMember[]): BomCheckReport {
  const locked = new Map(bom.lock.members.map(member => [member.id, member]))
  const currentEnabled = new Map(
    current.filter(member => member.status === 'enabled').map(member => [member.id, member]),
  )
  const missing: string[] = []
  const extra: string[] = []
  const drift: { readonly id: string; readonly locked: string; readonly current: string }[] = []
  for (const member of bom.lock.members) {
    const live = currentEnabled.get(member.id)
    if (live === undefined) missing.push(member.id)
    else if (live.version !== member.version) drift.push({ id: member.id, locked: member.version, current: live.version })
  }
  for (const [id, member] of currentEnabled) {
    if (!locked.has(id)) extra.push(id)
    void member
  }
  const currentSet: CompatibilitySet = {
    enabled: [
      ...current
        .filter(member => member.status === 'enabled')
        .map(member => ({
          id: member.id,
          version: member.version,
          ...(member.provides === undefined ? {} : { provides: member.provides }),
          ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
          enabled: true,
        })),
      ...(currentEnabled.has(MYGO_MANAGER_ID)
        ? []
        : [{ id: MYGO_MANAGER_ID, version: MYGO_MANAGER_VERSION, provides: [MYGO_MANAGER_CAPABILITY], enabled: true }]),
    ],
    installed: [
      ...current.map(member => ({
        id: member.id,
        version: member.version,
        ...(member.provides === undefined ? {} : { provides: member.provides }),
        ...(member.compatibility === undefined ? {} : { compatibility: member.compatibility }),
        enabled: member.status === 'enabled',
      })),
      ...(current.some(member => member.id === MYGO_MANAGER_ID)
        ? []
        : [{ id: MYGO_MANAGER_ID, version: MYGO_MANAGER_VERSION, provides: [MYGO_MANAGER_CAPABILITY], enabled: true }]),
    ],
  }
  const violations: string[] = []
  const warnings: string[] = []
  const intentById = new Map(bom.intent.members.map(member => [member.id, member]))
  for (const member of bom.lock.members) {
    const intent = intentById.get(member.id)
    const input: CompatibilityInput = {
      id: member.id,
      version: member.version,
      ...(intent?.provides === undefined ? {} : { provides: intent.provides }),
      ...(intent?.compatibility === undefined ? {} : { compatibility: intent.compatibility }),
    }
    const report = evaluateCompatibility(input, currentSet, 'install')
    violations.push(...compatibilityViolationLines(report))
    warnings.push(...compatibilityWarningLines(report))
  }
  const clean = missing.length === 0 && extra.length === 0 && drift.length === 0 && violations.length === 0
  return { ok: clean, clean, missing, extra, drift, violations, warnings }
}

/** 新插件声明 vs BOM 的只读校验（`bom check --target`）。 */
export function checkTarget(bom: BomDocument, target: BomTarget): BomCheckReport {
  const lockSet = memberSet(bom.lock.members)
  const report = evaluateCompatibility(
    {
      id: target.id,
      version: target.version,
      ...(target.provides === undefined ? {} : { provides: target.provides }),
      ...(target.compatibility === undefined ? {} : { compatibility: target.compatibility }),
    },
    lockSet,
    'install',
  )
  const violations = compatibilityViolationLines(report)
  const warnings = compatibilityWarningLines(report)
  return {
    ok: violations.length === 0,
    clean: violations.length === 0,
    missing: [],
    extra: [],
    drift: [],
    violations,
    warnings,
  }
}

/** 人类可读参考页（Markdown）：成员表 + 依赖边 + 冲突清单。 */
export function renderBomMarkdown(bom: BomDocument): string {
  const lines: string[] = []
  lines.push(`# dsh-mygo BOM（${bom.generated.profile}）`)
  lines.push('')
  lines.push(`- 生成：dsh-mygo ${bom.generated.version}${bom.generated.commit === undefined ? '' : ` @ ${bom.generated.commit.slice(0, 12)}`}`)
  lines.push(`- 时间：${bom.generated.at}`)
  lines.push(`- 格式：${bom.format}`)
  lines.push('')
  lines.push('## 成员')
  lines.push('')
  lines.push('| id | rail | intent | lock | provides |')
  lines.push('|---|---|---|---|---|')
  const locked = new Map(bom.lock.members.map(member => [member.id, member]))
  for (const member of bom.intent.members) {
    const lock = locked.get(member.id)
    lines.push(
      `| ${member.id} | ${member.rail} | ${member.version} | ${lock?.version ?? '—'} | ${(member.provides ?? []).join(', ') || '—'} |`,
    )
  }
  const edges: string[] = []
  const conflicts: string[] = []
  for (const member of bom.intent.members) {
    const compatibility = member.compatibility
    if (compatibility === undefined) continue
    for (const [kind, deps] of Object.entries(compatibility) as [string, Record<string, string>][]) {
      for (const [target, range] of Object.entries(deps)) {
        const line = `${member.id} ${kind} ${target} ${range}`
        if (kind === 'breaks' || kind === 'conflicts') conflicts.push(line)
        else edges.push(line)
      }
    }
  }
  if (edges.length > 0) {
    lines.push('', '## 依赖边', '', '```', ...edges, '```')
  }
  if (conflicts.length > 0) {
    lines.push('', '## 冲突清单', '', '```', ...conflicts, '```')
  }
  return `${lines.join('\n')}\n`
}
