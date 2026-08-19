/**
 * Pure relationship-conflict evaluation (#13, §10-§12): the five rules
 * (write/intercept-branch/cycle/veto-position, plus the allowed fourth) and
 * the claims three branches (indirection self-replace, manager-held eviction
 * vs `claims-unmanaged-incumbent`, scoped shadowing vs `shadow-undeclared`).
 * Conflicts are a relational predicate over the whole managed set, evaluated
 * only where plugin scope sets intersect.
 * @module @r05en1cu/dsh-mygo/src/conflicts
 */

import { deriveOrders } from './order.ts'
import { compareCodePoints } from './semver-range.ts'
import type {
  ConflictIssue,
  PlanState,
  PluginDeclarationInput,
} from './types.ts'

/** Synthetic scope key for pairs that conflict in every scope (both unscoped). */
const GLOBAL_SCOPE = '*'

/** Synthetic holder label for shadowed names held outside the manager. */
const UNMANAGED_LAYER = 'unmanaged-layer'

/**
 * Evaluate every relationship conflict and claims verdict of the managed set.
 * Issues are sorted by code then details, so callers can preview the first
 * rejection deterministically.
 * @param input - the validated installed set plus deployment facts.
 * @returns all issues found, deterministic order.
 */
export function evaluateConflicts(input: PlanState): ConflictIssue[] {
  const issues: ConflictIssue[] = []
  const plugins = [...input.plugins].sort(byId)
  writeConflicts(plugins, issues)
  interceptBranchConflicts(plugins, issues)
  vetoPositionConflicts(plugins, issues)
  for (const cycle of deriveOrders(input).cycles) {
    issues.push({
      code: 'ordering-cycle',
      details: { cycle: [...cycle.cycle], scope: cycle.scope },
    })
  }
  claimsVerdicts(plugins, input.heldOutsideManager ?? [], issues)
  claimsPairConflicts(plugins, issues)
  shadowVerdicts(plugins, input.heldOutsideManager ?? [], issues)
  return issues.sort(byIssue)
}

/** Rule 1: two producers of one slot conflict when either writes it. */
function writeConflicts(plugins: readonly PluginDeclarationInput[], issues: ConflictIssue[]): void {
  const producers = new Map<string, { writers: string[]; appenders: string[] }>()
  for (const plugin of plugins) {
    for (const declaration of plugin.permissions.transform) {
      for (const name of declaration.writes ?? []) {
        addProducer(producers, `${declaration.event}.${name}`, plugin.id, 'write')
      }
      for (const name of declaration.appends ?? []) {
        addProducer(producers, `${declaration.event}.${name}`, plugin.id, 'append')
      }
    }
  }
  for (const [property, slot] of producers) {
    if (slot.writers.length === 0 || slot.writers.length + slot.appenders.length < 2) continue
    for (const pair of producerPairs([...slot.writers, ...slot.appenders])) {
      const scope = firstIntersectingScope(pair[0], pair[1], plugins)
      if (scope === undefined) continue
      issues.push({
        code: 'write-conflict',
        details: { a: pair[0], b: pair[1], property, scope },
      })
    }
  }
}

/** Rule 2: two interceptors where either may return a non-deny branch. */
function interceptBranchConflicts(plugins: readonly PluginDeclarationInput[], issues: ConflictIssue[]): void {
  const byEvent = new Map<string, { id: string; nonDeny: string[] }[]>()
  for (const plugin of plugins) {
    for (const declaration of plugin.permissions.intercept) {
      const entry = byEvent.get(declaration.event) ?? []
      entry.push({ id: plugin.id, nonDeny: declaration.returns.filter(branch => branch !== 'deny') })
      byEvent.set(declaration.event, entry)
    }
  }
  for (const [event, entries] of byEvent) {
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left] as { id: string; nonDeny: string[] }
        const b = entries[right] as { id: string; nonDeny: string[] }
        if (a.nonDeny.length === 0 && b.nonDeny.length === 0) continue
        const scope = firstIntersectingScope(a.id, b.id, plugins)
        if (scope === undefined) continue
        // The pair-level guard above guarantees at least one non-deny branch.
        const branch = [...a.nonDeny, ...b.nonDeny][0] as string
        issues.push({
          code: 'intercept-branch-conflict',
          details: { a: a.id, b: b.id, event, branch },
        })
      }
    }
  }
}

/** Rule 5: two plugins with the same end position both intercept one event. */
function vetoPositionConflicts(plugins: readonly PluginDeclarationInput[], issues: ConflictIssue[]): void {
  const byEvent = new Map<string, { id: string; position: 'outermost' | 'innermost' }[]>()
  for (const plugin of plugins) {
    const position = plugin.permissions.position
    if (position === 'derived') continue
    if (plugin.permissions.intercept.length === 0) continue
    for (const declaration of plugin.permissions.intercept) {
      const entry = byEvent.get(declaration.event) ?? []
      entry.push({ id: plugin.id, position })
      byEvent.set(declaration.event, entry)
    }
  }
  for (const [event, entries] of byEvent) {
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left] as { id: string; position: 'outermost' | 'innermost' }
        const b = entries[right] as { id: string; position: 'outermost' | 'innermost' }
        if (a.position !== b.position) continue
        const scope = firstIntersectingScope(a.id, b.id, plugins)
        if (scope === undefined) continue
        issues.push({
          code: 'veto-position-conflict',
          details: { a: a.id, b: b.id, event },
        })
      }
    }
  }
}

/**
 * §12/PO §Claims: two plugins claiming the same slot on intersecting scopes
 * conflict like any other pair (`claims-conflict`, 2026-08-08 writeback).
 * Service claims are manifest-visible; tool claims need runtime registration
 * knowledge and are not evaluated here.
 */
function claimsPairConflicts(plugins: readonly PluginDeclarationInput[], issues: ConflictIssue[]): void {
  const claimants = new Map<string, string[]>()
  for (const plugin of plugins) {
    for (const claim of plugin.permissions.claims) {
      if (!claim.startsWith('service:')) continue
      const list = claimants.get(claim) ?? []
      if (!list.includes(plugin.id)) list.push(plugin.id)
      claimants.set(claim, list)
    }
  }
  for (const [slot, ids] of claimants) {
    for (const pair of producerPairs(ids)) {
      const scope = firstIntersectingScope(pair[0], pair[1], plugins)
      if (scope === undefined) continue
      issues.push({
        code: 'claims-conflict',
        details: { a: pair[0], b: pair[1], slot, scope },
      })
    }
  }
}

/**
 * §12 claims three branches for unscoped plugins: self-provided slot =
 * indirection self-replace (allowed); another managed provider = eviction
 * target (allowed at plan level, protocol in #15); a slot held outside the
 * manager = `claims-unmanaged-incumbent`; otherwise no peer holds (allowed).
 * Tool claims need runtime registration knowledge and are not evaluated here.
 */
function claimsVerdicts(
  plugins: readonly PluginDeclarationInput[],
  heldOutsideManager: readonly string[],
  issues: ConflictIssue[],
): void {
  const heldBy = new Map<string, string[]>()
  for (const plugin of plugins) {
    for (const service of plugin.provides) {
      const holders = heldBy.get(service) ?? []
      holders.push(plugin.id)
      heldBy.set(service, holders)
    }
  }
  for (const plugin of plugins) {
    if (plugin.scopes !== undefined && plugin.scopes.length > 0) continue
    for (const claim of plugin.permissions.claims) {
      if (!claim.startsWith('service:')) continue
      const service = claim.slice('service:'.length)
      const holders = (heldBy.get(service) ?? []).filter(holder => holder !== plugin.id)
      if (holders.length > 0) continue
      if (!plugin.provides.includes(service) && heldOutsideManager.includes(service)) {
        issues.push({
          code: 'claims-unmanaged-incumbent',
          details: { slot: claim },
        })
      }
    }
  }
}

/**
 * §12 scoped shadowing: a scoped plugin's provided service that shadows a
 * global name (an unscoped managed provider or a slot held outside the
 * manager) must declare `claims: ['service:<id>']`; undeclared shadowing is
 * `shadow-undeclared`. Tool-name shadowing needs runtime registration
 * knowledge and is not evaluated here.
 */
function shadowVerdicts(
  plugins: readonly PluginDeclarationInput[],
  heldOutsideManager: readonly string[],
  issues: ConflictIssue[],
): void {
  const globalHolders = new Map<string, string[]>()
  for (const plugin of plugins) {
    if (plugin.scopes !== undefined && plugin.scopes.length > 0) continue
    for (const service of plugin.provides) {
      const holders = globalHolders.get(service) ?? []
      holders.push(plugin.id)
      globalHolders.set(service, holders)
    }
  }
  for (const plugin of plugins) {
    if (plugin.scopes === undefined || plugin.scopes.length === 0) continue
    for (const service of plugin.provides) {
      const managed = (globalHolders.get(service) ?? []).filter(holder => holder !== plugin.id)
      const heldOutside = heldOutsideManager.includes(service)
      if (managed.length === 0 && !heldOutside) continue
      const claim = `service:${service}`
      if (plugin.permissions.claims.includes(claim)) continue
      issues.push({
        code: 'shadow-undeclared',
        details: {
          tool: claim,
          holder: managed[0] ?? UNMANAGED_LAYER,
        },
      })
    }
  }
}

/** First scope key where two plugins both run, or undefined when disjoint. */
function firstIntersectingScope(
  left: string,
  right: string,
  plugins: readonly PluginDeclarationInput[],
): string | undefined {
  const a = plugins.find(plugin => plugin.id === left)
  const b = plugins.find(plugin => plugin.id === right)
  const aScopes = a?.scopes ?? []
  const bScopes = b?.scopes ?? []
  if (aScopes.length === 0 && bScopes.length === 0) return GLOBAL_SCOPE
  if (aScopes.length === 0) return bScopes[0]
  if (bScopes.length === 0) return aScopes[0]
  return aScopes.find(scope => bScopes.includes(scope))
}

/** All unordered plugin-id pairs of a producer list (ids may repeat once per slot). */
function producerPairs(ids: readonly string[]): [string, string][] {
  const unique = [...new Set(ids)].sort()
  const pairs: [string, string][] = []
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      pairs.push([unique[left] as string, unique[right] as string])
    }
  }
  return pairs
}

function addProducer(
  map: Map<string, { writers: string[]; appenders: string[] }>,
  property: string,
  id: string,
  kind: 'write' | 'append',
): void {
  const slot = map.get(property) ?? { writers: [], appenders: [] }
  const list = kind === 'write' ? slot.writers : slot.appenders
  if (!list.includes(id)) list.push(id)
  map.set(property, slot)
}

function byId(left: PluginDeclarationInput, right: PluginDeclarationInput): number {
  // 修复批次 4 / A11+A17：码点序（locale 无关确定性），替换 localeCompare。
  return compareCodePoints(left.id, right.id)
}

function byIssue(left: ConflictIssue, right: ConflictIssue): number {
  return compareCodePoints(left.code, right.code)
    || compareCodePoints(JSON.stringify(left.details), JSON.stringify(right.details))
}
