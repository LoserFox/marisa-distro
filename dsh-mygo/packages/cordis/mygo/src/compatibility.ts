/**
 * Package-level compatibility (Fabric five-level vocabulary 对照): a pure
 * checker over `depends` / `recommends` / `suggests` / `conflicts` /
 * `breaks` against the enabled set, with a transitive hard closure over
 * `depends` edges and derived provider conflicts from composition facts.
 *
 * The manager validates only — it never selects, installs, or upgrades a
 * version (pnpm owns resolution). The `requires` alias normalizes into
 * `depends`; declaring the same key in both is a manifest error surfaced by
 * callers through {@link normalizeCompatibility}.
 * @module @r05en1cu/dsh-mygo/src/compatibility
 */

import type {
  CompatibilityEdge,
  CompatibilityReport,
  CompatibilityViolation,
  CompatibilityWarning,
  CompositionFactProvider,
  PluginCompatibility,
} from '@r05en1cu/dsh-mygo-api'
import { isValidRange, matchesVersionRange } from './semver-range.ts'

/** One plugin in an evaluated managed set. */
export interface CompatibilityPlugin {
  readonly id: string
  readonly version?: string
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
  readonly enabled?: boolean
}

/** The managed set an evaluation runs against. */
export interface CompatibilitySet {
  /** Enabled members; the activation universe hard edges are checked against. */
  readonly enabled: readonly CompatibilityPlugin[]
  /** Every installed member (enabled or disabled) for state attribution. */
  readonly installed: readonly CompatibilityPlugin[]
}

/** One plugin being evaluated. */
export interface CompatibilityInput {
  readonly id: string
  readonly version?: string
  readonly compatibility?: PluginCompatibility
  readonly provides?: readonly string[]
}

/** The five kind keys a manifest may declare. */
const HARD_KINDS = ['depends', 'breaks'] as const
const SOFT_KINDS = ['recommends', 'suggests', 'conflicts'] as const

/** Whether a dependency key names a capability alias rather than a plugin id. */
export function isCapabilityKey(target: string): boolean {
  return target.startsWith('service:') || target.startsWith('cap:')
}

/**
 * Normalize the v1 `requires` alias into `depends`. Returns the issue text
 * when the same key is declared in both; callers must surface it as
 * `manifest-invalid` (or a rejected plan) before evaluation.
 */
export function normalizeCompatibility(
  compatibility: PluginCompatibility | undefined,
): { readonly value?: PluginCompatibility; readonly issue?: string } {
  if (compatibility === undefined) return {}
  const requires = compatibility.requires
  if (requires === undefined || Object.keys(requires).length === 0) {
    const rest = { ...compatibility }
    delete rest.requires
    return { value: rest }
  }
  const depends = { ...(compatibility.depends ?? {}) }
  for (const [key, range] of Object.entries(requires)) {
    if (depends[key] !== undefined) {
      return { issue: `compatibility key ${key} 同时出现在 requires 与 depends` }
    }
    depends[key] = range
  }
  const merged = { ...compatibility }
  delete merged.requires
  merged.depends = depends
  return { value: merged }
}

/**
 * Evaluate one plugin against the managed set. The incoming plugin is always
 * treated as enabled; hard `depends` edges are walked transitively, soft
 * edges are checked once against the enabled set, and composition facts may
 * add derived provider warnings. Pure — no records, rows, or tables touched.
 */
export function evaluateCompatibility(
  input: CompatibilityInput,
  set: CompatibilitySet,
  action: CompatibilityReport['action'],
  composition?: CompositionFactProvider,
): CompatibilityReport {
  const normalized = normalizeCompatibility(input.compatibility)
  if (normalized.issue !== undefined) {
    const chain: readonly CompatibilityEdge[] = []
    const violation: CompatibilityViolation = {
      kind: 'depends',
      declarer: input.id,
      target: input.id,
      range: '',
      state: 'version-mismatch',
      rangeInvalid: true,
      chain,
    }
    return {
      plugin: input.id,
      action,
      violations: [violation],
      warnings: [],
    }
  }
  const compatibility = normalized.value

  const enabled = new Map<string, CompatibilityPlugin>()
  for (const plugin of set.enabled) enabled.set(plugin.id, plugin)
  const installed = new Map<string, CompatibilityPlugin>()
  for (const plugin of set.installed) installed.set(plugin.id, plugin)
  const incoming: CompatibilityPlugin = {
    id: input.id,
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(input.provides === undefined ? {} : { provides: input.provides }),
    enabled: true,
  }
  // The incoming plugin replaces an incumbent with the same id.
  enabled.set(input.id, incoming)
  installed.set(input.id, incoming)

  const violations: CompatibilityViolation[] = []
  const warnings: CompatibilityWarning[] = []
  const visited = new Set<string>()

  /** Version of an enabled plugin; undefined when absent. */
  const enabledVersion = (id: string): string | undefined => enabled.get(id)?.version

  /** Walk one `depends` edge and collect the violation, if any. */
  function checkEdge(
    declarer: string,
    target: string,
    range: string,
    path: readonly CompatibilityEdge[],
  ): void {
    const edge: CompatibilityEdge = { declarer, kind: 'depends', target, range }
    const chain = [...path, edge]
    if (!isValidRange(range)) {
      violations.push({
        kind: 'depends',
        declarer,
        target,
        range,
        state: 'version-mismatch',
        rangeInvalid: true,
        chain,
      })
      return
    }
    const version = enabledVersion(target)
    if (isCapabilityKey(target)) {
      const candidates = [...installed.values()].filter(candidate => candidate.provides?.includes(target))
      const satisfied = candidates.find(candidate =>
        enabled.has(candidate.id) && candidate.version !== undefined && matchesVersionRange(candidate.version, range))
      if (satisfied !== undefined) return
      const disabledCandidate = candidates.find(candidate =>
        !enabled.has(candidate.id) && candidate.version !== undefined && matchesVersionRange(candidate.version, range))
      if (disabledCandidate !== undefined) {
        violations.push({
          kind: 'depends',
          declarer,
          target,
          range,
          ...(disabledCandidate.version === undefined ? {} : { installed: disabledCandidate.version }),
          state: 'installed-disabled',
          chain,
        })
        return
      }
      const enabledCandidate = candidates.find(candidate => enabled.has(candidate.id))
      const anyCandidate = candidates[0]
      violations.push({
        kind: 'depends',
        declarer,
        target,
        range,
        ...(anyCandidate?.version === undefined ? {} : { installed: anyCandidate.version }),
        state: enabledCandidate !== undefined || anyCandidate?.version !== undefined
          ? 'version-mismatch'
          : 'missing',
        chain,
      })
      return
    }
    if (version === undefined) {
      const installedVersion = installed.get(target)?.version
      violations.push({
        kind: 'depends',
        declarer,
        target,
        range,
        ...(installedVersion === undefined ? {} : { installed: installedVersion }),
        state: installed.has(target) ? 'installed-disabled' : 'missing',
        chain,
      })
      return
    }
    if (!matchesVersionRange(version, range)) {
      violations.push({
        kind: 'depends',
        declarer,
        target,
        range,
        installed: version,
        state: 'version-mismatch',
        chain,
      })
    }
  }

  /** Transitive hard closure from one root over `depends` edges. */
  function walkClosure(root: string, path: readonly CompatibilityEdge[]): void {
    if (visited.has(root)) return
    visited.add(root)
    const plugin = enabled.get(root)
    const normalizedRoot = plugin === undefined ? undefined : normalizeCompatibility(plugin.compatibility).value
    for (const [target, range] of Object.entries(normalizedRoot?.depends ?? {})) {
      checkEdge(root, target, range, path)
      if (enabled.has(target) && !path.some(edge => edge.declarer === target)) {
        walkClosure(target, [...path, { declarer: root, kind: 'depends' as const, target, range }])
      }
    }
  }

  // 1) The incoming plugin's own hard closure (it is enabled).
  walkClosure(input.id, [])

  // 2) Bidirectional direct checks against survivors.
  // Disabled survivors impose no constraints: their edges are dormant until
  // the plugin is enabled again, so they neither require nor break anyone.
  for (const survivor of set.installed.filter(plugin => plugin.enabled !== false)) {
    if (survivor.id === input.id) continue
    const survivorCompat = normalizeCompatibility(survivor.compatibility).value
    if (survivorCompat === undefined) continue
    for (const [target, range] of Object.entries(survivorCompat.depends ?? {})) {
      if (target !== input.id) continue
      const version = input.version
      if (version === undefined) continue
      if (!isValidRange(range) || !matchesVersionRange(version, range)) {
        violations.push({
          kind: 'depends',
          declarer: survivor.id,
          target,
          range,
          installed: version,
          state: 'version-mismatch',
          rangeInvalid: !isValidRange(range),
          chain: [{ declarer: survivor.id, kind: 'depends', target, range }],
        })
      }
    }
    for (const [target, range] of Object.entries(survivorCompat.depends ?? {})) {
      if (target === input.id || !isCapabilityKey(target)) continue
      if (!(input.provides ?? []).includes(target)) continue
      const version = input.version
      if (version !== undefined && isValidRange(range) && matchesVersionRange(version, range)) continue
      violations.push({
        kind: 'depends',
        declarer: survivor.id,
        target,
        range,
        ...(version === undefined ? {} : { installed: version }),
        state: 'version-mismatch',
        rangeInvalid: version !== undefined && !isValidRange(range),
        chain: [{ declarer: survivor.id, kind: 'depends', target, range }],
      })
    }
    for (const [target, range] of Object.entries(survivorCompat.breaks ?? {})) {
      if (target !== input.id) continue
      const version = input.version
      if (version !== undefined && isValidRange(range) && matchesVersionRange(version, range)) {
        violations.push({
          kind: 'breaks',
          declarer: survivor.id,
          target,
          range,
          installed: version,
          state: 'version-mismatch',
          chain: [{ declarer: survivor.id, kind: 'breaks', target, range }],
        })
      }
    }
    for (const [target, range] of Object.entries(survivorCompat.conflicts ?? {})) {
      if (target !== input.id) continue
      const version = input.version
      if (version !== undefined && isValidRange(range) && matchesVersionRange(version, range)) {
        warnings.push({
          kind: 'conflicts',
          declarer: survivor.id,
          target,
          range,
          installed: version,
        })
      }
    }
    for (const kind of ['recommends', 'suggests'] as const) {
      for (const [target, range] of Object.entries(survivorCompat[kind] ?? {})) {
        if (target !== input.id) continue
        const version = input.version
        if (version !== undefined && isValidRange(range) && !matchesVersionRange(version, range)) {
          warnings.push({
            kind,
            declarer: survivor.id,
            target,
            range,
            installed: version,
          })
        }
      }
    }
  }

  // 3) The incoming plugin's own soft edges against the enabled set.
  if (compatibility !== undefined) {
    for (const kind of ['recommends', 'suggests'] as const) {
      for (const [target, range] of Object.entries(compatibility[kind] ?? {})) {
        if (!isValidRange(range)) {
          warnings.push({ kind, declarer: input.id, target, range, detail: '范围不可解析' })
          continue
        }
        const version = enabledVersion(target)
        if (version === undefined) {
          const installedVersion = installed.get(target)?.version
          warnings.push({
            kind,
            declarer: input.id,
            target,
            range,
            ...(installedVersion === undefined ? {} : { installed: installedVersion }),
            ...(installed.has(target) ? { detail: '已安装但停用' } : {}),
          })
        } else if (!matchesVersionRange(version, range)) {
          warnings.push({ kind, declarer: input.id, target, range, installed: version })
        }
      }
    }
    for (const [target, range] of Object.entries(compatibility.conflicts ?? {})) {
      if (!isValidRange(range)) continue
      const version = enabledVersion(target)
      if (version !== undefined && matchesVersionRange(version, range)) {
        warnings.push({ kind: 'conflicts', declarer: input.id, target, range, installed: version })
      }
    }
    for (const [target, range] of Object.entries(compatibility.breaks ?? {})) {
      if (!isValidRange(range)) continue
      const version = enabledVersion(target)
      if (version !== undefined && matchesVersionRange(version, range)) {
        violations.push({
          kind: 'breaks',
          declarer: input.id,
          target,
          range,
          installed: version,
          state: 'version-mismatch',
          chain: [{ declarer: input.id, kind: 'breaks', target, range }],
        })
      }
    }
  }

  // 4) Derived provider conflicts from composition facts.
  const serviceProviders = new Map<string, string[]>()
  for (const plugin of [...set.enabled.filter(plugin => plugin.id !== input.id), incoming]) {
    for (const service of plugin.provides ?? []) {
      const owners = serviceProviders.get(service) ?? []
      owners.push(plugin.id)
      serviceProviders.set(service, owners)
    }
  }
  for (const [service, owners] of serviceProviders) {
    const first = owners[0]
    for (const owner of owners.slice(1)) {
      warnings.push({
        kind: 'derived-conflict',
        declarer: owner,
        target: isCapabilityKey(service) ? service : `service:${service}`,
        detail: `与 ${first} 同时提供 service ${service}`,
      })
    }
  }
  if (composition !== undefined) {
    for (const fact of composition.patchedRows()) {
      warnings.push({
        kind: 'derived-conflict',
        declarer: fact.plugin,
        target: `row:${fact.rowId}`,
        detail: `patch 行 ${fact.rowId} 被多个插件改写（P3 启用完整事实源）`,
      })
    }
  }

  return { plugin: input.id, action, violations, warnings }
}

/** Human-readable lines for every hard violation (ResultAnalyzer-style). */
export function compatibilityViolationLines(report: CompatibilityReport): string[] {
  return report.violations.map(renderViolation)
}

/** Human-readable lines for every soft / derived note. */
export function compatibilityWarningLines(report: CompatibilityReport): string[] {
  return report.warnings.map(renderWarning)
}

function renderViolation(violation: CompatibilityViolation): string {
  const edge = violation.chain[violation.chain.length - 1] ?? {
    declarer: violation.declarer,
    kind: violation.kind,
    target: violation.target,
    range: violation.range,
  }
  const state = violation.rangeInvalid === true
    ? '范围不可解析'
    : violation.state === 'installed-disabled'
      ? `已安装但停用（${violation.installed ?? '未知版本'}）`
      : violation.state === 'version-mismatch'
        ? `已装 ${violation.installed ?? '未知版本'}`
        : '未安装'
  const chain = violation.chain.length > 1
    ? ` 约束链 ${violation.chain.map(edge => `${edge.declarer} ${edge.kind} ${edge.target} "${edge.range}"`).join(' → ')}；`
    : ''
  return `${chain}${edge.kind} ${edge.target} "${edge.range}": ${state}（由 ${edge.declarer} 声明）`
}

function renderWarning(warning: CompatibilityWarning): string {
  const detail = warning.detail === undefined ? '' : `；${warning.detail}`
  const installed = warning.installed === undefined ? '' : `，已装 ${warning.installed}`
  const range = warning.range === undefined ? '' : ` "${warning.range}"`
  return `${warning.kind} ${warning.target}${range}: ${warning.declarer}${detail}${installed}`
}

/**
 * Transitive uninstall check: every survivor's hard closure must survive the
 * victim's removal. Returns rendered lines naming the survivor declarer and
 * the chain through the victim.
 */
export function transitiveUninstallViolations(
  survivors: readonly CompatibilityPlugin[],
  victim: { readonly id: string; readonly version?: string; readonly provides?: readonly string[] },
): string[] {
  const lines: string[] = []
  const remaining = survivors.filter(plugin => plugin.id !== victim.id)
  const set: CompatibilitySet = {
    enabled: remaining.filter(plugin => plugin.enabled !== false),
    installed: remaining,
  }
  for (const survivor of survivors) {
    if (survivor.id === victim.id) continue
    const report = evaluateCompatibility(
      {
        id: survivor.id,
        ...(survivor.version === undefined ? {} : { version: survivor.version }),
        ...(survivor.compatibility === undefined ? {} : { compatibility: survivor.compatibility }),
      },
      set,
      'uninstall',
    )
    for (const violation of report.violations) {
      if (violation.chain.some(edge => edge.target === victim.id || edge.declarer === victim.id)) {
        lines.push(renderViolation(violation))
      }
    }
    // Capability edges name the capability key, not the provider id, so a
    // removed provider never appears in the violation chain. Detect provider
    // edges directly: uninstalling the provider that satisfies a survivor's
    // `service:`/`cap:` depends breaks that survivor.
    const compat = normalizeCompatibility(survivor.compatibility).value
    for (const [target, range] of Object.entries(compat?.depends ?? {})) {
      if (!isCapabilityKey(target)) continue
      if (!(victim.provides ?? []).includes(target)) continue
      if (victim.version !== undefined
        && (!isValidRange(range) || !matchesVersionRange(victim.version, range))) {
        continue
      }
      lines.push(`depends ${target} "${range}": 提供者 ${victim.id} 将被卸载（由 ${survivor.id} 声明）`)
    }
  }
  return lines
}

export { HARD_KINDS, SOFT_KINDS }
