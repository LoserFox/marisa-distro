/**
 * Pure operation plan (#13, §15.3/PO:242；2026-08-13 范围重塑)：对当前受管
 * 集求值 install/uninstall/replace/enable/disable，不改状态。激活求解器
 * （depends 闭包连带启用 / breaks 最小停用消解）已随求解体系删除——plan
 * 只剩求值：兼容预检（evaluateCompatibility）、关系冲突（evaluateConflicts）、
 * requires 级 dependent 检查、displaced bystander 推导。被拒绝的 plan 预览
 * 操作将抛出的确切错误码。
 * @module @r05en1cu/dsh-mygo/src/plan
 */

import { formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type { PluginErrorCode } from '@r05en1cu/dsh-mygo-api'
import {
  compatibilityViolationLines,
  compatibilityWarningLines,
  evaluateCompatibility,
  transitiveUninstallViolations,
  type CompatibilityPlugin,
} from './compatibility.ts'
import { evaluateConflicts } from './conflicts.ts'
import {
  buildScopeGraph,
  deriveOrders,
  deriveScopeOrder,
  scopeMembers,
} from './order.ts'
import type { ScopeEdge } from './order.ts'
import type {
  ConflictIssue,
  PlanOperationInput,
  PlanState,
  PluginDeclarationInput,
  PluginOperationPlan,
} from './types.ts'

/** One displaced bystander with the edge that displaced it (§15.3). */
interface DisplacedBystander {
  readonly id: string
  readonly edge: { readonly from: string; readonly to: string; readonly property: string }
}

/**
 * Preview one operation against the current managed set. The verdict is a
 * pure function of the operation and the set; nothing reads process state.
 * @param operation - the operation with its validated candidate declaration.
 * @param state - the current managed set plus deployment facts.
 * @returns the plan: accepted/error/displaced/wouldShadow.
 */
export function planOperation(operation: PlanOperationInput, state: PlanState): PluginOperationPlan {
  assertUniqueIds(state.plugins)
  switch (operation.op) {
    case 'install':
      return planInstall(operation.plugin, state)
    case 'uninstall':
      return planUninstall(operation.id, state)
    case 'replace':
      return planReplace(operation.id, operation.plugin, operation.force === true, state)
    case 'enable':
    case 'disable':
      return planStatusChange(operation.op, operation.id, state, operation.force === true)
  }
}

/** Install: reject existing dynamic ids, shadow static incumbents, else evaluate. */
function planInstall(candidate: PluginDeclarationInput, state: PlanState): PluginOperationPlan {
  const existing = state.plugins.find(plugin => plugin.id === candidate.id)
  if (existing !== undefined) {
    if (existing.origin === 'static') {
      // T2-4: the static entry wins; the dynamic row would be retained as shadowed.
      return { accepted: true, displaced: [], wouldShadow: true }
    }
    // HP:150: overlapping operations on one id reject; no replace-on-install alias exists.
    return rejected('concurrent-operation', { id: candidate.id, operation: 'install' })
  }
  const next: PlanState = { ...state, plugins: [...state.plugins, candidate] }
  const compat = evaluateCandidate(candidate, next)
  if (compat !== undefined) return compat
  const issues = evaluateConflicts(next)
  if (issues.length > 0) return rejectedFromIssue(issues[0] as ConflictIssue)
  return {
    accepted: true,
    displaced: displacedBystanders(state, next, candidate),
    wouldShadow: false,
    ...(compatWarnings(candidate, next).length === 0 ? {} : { warnings: compatWarnings(candidate, next) }),
  }
}

/** Uninstall: idempotent for unknown ids (§15.4), rejects dependents, reorders the rest. */
function planUninstall(id: string, state: PlanState): PluginOperationPlan {
  const removed = state.plugins.find(plugin => plugin.id === id)
  if (removed === undefined) return { accepted: true, displaced: [] }
  const dependents = requiringPlugins(state.plugins.filter(plugin => plugin.id !== id), removed.provides)
  if (dependents.length > 0) return rejected('dependent-exists', { dependents })
  const blocked = transitiveUninstallViolations(state.plugins, {
    id,
    ...(removed.version === undefined ? {} : { version: removed.version }),
    provides: removed.provides,
  })
  if (blocked.length > 0) return rejected('compatibility-conflict', { plugin: id, violations: blocked })
  const next: PlanState = { ...state, plugins: state.plugins.filter(plugin => plugin.id !== id) }
  return { accepted: true, displaced: displacedBystanders(state, next, removed) }
}

/** Replace: same-id generation swap; force skips group-3 conflicts, never group 1/2. */
function planReplace(id: string, candidate: PluginDeclarationInput, force: boolean, state: PlanState): PluginOperationPlan {
  if (candidate.id !== id) {
    throw new Error(`replace target mismatch: operation id ${id}, candidate id ${candidate.id}`)
  }
  const incumbent = state.plugins.find(plugin => plugin.id === id)
  if (incumbent === undefined) {
    // Caller bug (2026-08-08 ruling #1): the target must exist to be replaced.
    return rejected('plugin-not-found', { id, operation: 'replace' })
  }
  const next: PlanState = {
    ...state,
    plugins: state.plugins.map(plugin => plugin.id === id ? candidate : plugin),
  }
  if (!force) {
    const compat = evaluateCandidate(candidate, next)
    if (compat !== undefined) return compat
    const issues = evaluateConflicts(next)
    if (issues.length > 0) return rejectedFromIssue(issues[0] as ConflictIssue)
  }
  const lost = incumbent.provides.filter(service => !candidate.provides.includes(service))
  const dependents = requiringPlugins(state.plugins.filter(plugin => plugin.id !== id), lost)
  if (dependents.length > 0) return rejected('dependent-exists', { dependents })
  return {
    accepted: true,
    displaced: displacedBystanders(state, next, candidate),
    ...(compatWarnings(candidate, next).length === 0 ? {} : { warnings: compatWarnings(candidate, next) }),
  }
}

/**
 * Enable/disable: flip the participation flag and reorder; no-op when already
 * in that state.disable 无 force 且存在 requires 级下游 → dependent-exists
 * （求解器级联停用已删除：下游只能由调用方显式处理）。
 */
function planStatusChange(
  op: 'enable' | 'disable',
  id: string,
  state: PlanState,
  force: boolean,
): PluginOperationPlan {
  const target = state.plugins.find(plugin => plugin.id === id)
  if (target === undefined) {
    // Caller bug (2026-08-08 ruling #1): the target must exist to change status.
    return rejected('plugin-not-found', { id, operation: op })
  }
  const already = op === 'enable' ? target.enabled !== false : target.enabled === false
  if (already) return { accepted: true, displaced: [] }
  if (op === 'disable' && !force) {
    const dependents = requiringPlugins(
      state.plugins.filter(plugin => plugin.id !== id && plugin.enabled !== false),
      target.provides,
    )
    if (dependents.length > 0) return rejected('dependent-exists', { dependents })
  }
  const next: PlanState = {
    ...state,
    plugins: state.plugins.map(plugin => plugin.id === id ? { ...plugin, enabled: op === 'enable' } : plugin),
  }
  if (op === 'enable') {
    const compat = evaluateCandidate({ ...target, enabled: true }, next)
    if (compat !== undefined) return compat
  }
  return { accepted: true, displaced: displacedBystanders(state, next, target) }
}

/** 兼容预检（求值，非求解）：候选在目标集合中的违例 → compatibility-conflict。 */
function evaluateCandidate(
  candidate: PluginDeclarationInput,
  state: PlanState,
): PluginOperationPlan | undefined {
  const set = compatibilitySet(state)
  const report = evaluateCompatibility(compatPluginOf(candidate), set, 'reconcile')
  const violations = compatibilityViolationLines(report)
  if (violations.length === 0) return undefined
  return rejected('compatibility-conflict', { plugin: candidate.id, violations })
}

/** 兼容预检软告警（只警告不阻断）。 */
function compatWarnings(candidate: PluginDeclarationInput, state: PlanState): readonly string[] {
  const report = evaluateCompatibility(compatPluginOf(candidate), compatibilitySet(state), 'reconcile')
  return compatibilityWarningLines(report)
}

function compatPluginOf(plugin: PluginDeclarationInput): CompatibilityPlugin {
  return {
    id: plugin.id,
    ...(plugin.version === undefined ? {} : { version: plugin.version }),
    ...(plugin.compatibility === undefined ? {} : { compatibility: plugin.compatibility }),
    provides: plugin.provides,
  }
}

function compatibilitySet(state: PlanState): { readonly enabled: readonly CompatibilityPlugin[]; readonly installed: readonly CompatibilityPlugin[] } {
  const installed = state.plugins.map(compatPluginOf)
  return {
    enabled: state.plugins.filter(plugin => plugin.enabled !== false).map(compatPluginOf),
    installed,
  }
}

/** Rejected plan with optional compatibility warnings attached. */
function rejected(
  code: PluginErrorCode,
  details: Record<string, unknown>,
  warnings: readonly string[] = [],
): PluginOperationPlan {
  return {
    accepted: false,
    error: { code, message: formatPluginError(code, details) },
    displaced: [],
    ...(warnings.length === 0 ? {} : { warnings }),
  }
}

/**
 * Bystanders whose relative order changed between two states (§15.3/PO:242):
 * plugins present in both states' derived orders, sharing no declared slot
 * with the operated plugin, whose relative rank among survivors moved. The
 * reported edge is the first introduced/removed edge whose removal (or
 * re-addition) restores the bystander's old rank.
 */
function displacedBystanders(
  oldState: PlanState,
  newState: PlanState,
  operated: PluginDeclarationInput,
): readonly DisplacedBystander[] {
  const oldDerived = deriveOrders(oldState)
  const newDerived = deriveOrders(newState)
  const oldGraph = buildScopeGraph(oldState)
  const newGraph = buildScopeGraph(newState)
  const scopes = [...new Set([...oldDerived.orders.keys(), ...newDerived.orders.keys()])].sort()
  const operatedSlots = declaredSlots(operated)
  const entries = new Map<string, DisplacedBystander>()
  for (const scope of scopes) {
    const oldArr = oldDerived.orders.get(scope) ?? []
    const newArr = newDerived.orders.get(scope) ?? []
    const survivors = oldArr.filter(id => id !== operated.id && newArr.includes(id))
    if (survivors.length < 2) continue
    const members = scopeMembers(newState, scope)
    for (const bystander of members) {
      if (bystander.id === operated.id || !survivors.includes(bystander.id)) continue
      if (intersects(declaredSlots(bystander), operatedSlots)) continue
      if (!relativeOrderChanged(bystander.id, survivors, oldArr, newArr)) continue
      const edge = restoringEdge(
        bystander.id,
        members,
        oldArr,
        newArr,
        // Two survivors in this scope imply both graphs carry the scope key.
        oldGraph.edges.get(scope) as readonly ScopeEdge[],
        newGraph.edges.get(scope) as readonly ScopeEdge[],
      )
      if (!entries.has(bystander.id)) entries.set(bystander.id, { id: bystander.id, edge })
    }
  }
  return [...entries.values()].sort((left, right) => left.id.localeCompare(right.id))
}

/** True when a survivor's relative order vs another survivor differs between the two states. */
function relativeOrderChanged(
  id: string,
  survivors: readonly string[],
  oldArr: readonly string[],
  newArr: readonly string[],
): boolean {
  for (const other of survivors) {
    if (other === id) continue
    const before = oldArr.indexOf(id) < oldArr.indexOf(other)
    const after = newArr.indexOf(id) < newArr.indexOf(other)
    if (before !== after) return true
  }
  return false
}

/**
 * Find the edge that displaced a bystander: the first new edge whose removal
 * restores the bystander's old relative rank, else the first new edge, else
 * the first removed (old) edge — the operation that removed/added it is the
 * only causal difference between the two states.
 */
function restoringEdge(
  bystander: string,
  members: readonly PluginDeclarationInput[],
  oldArr: readonly string[],
  newArr: readonly string[],
  oldEdges: readonly ScopeEdge[],
  newEdges: readonly ScopeEdge[],
): ScopeEdge {
  const survivors = oldArr.filter(id => id !== bystander && newArr.includes(id)).sort()
  const oldRank = rankBefore(bystander, survivors, oldArr)
  for (const candidate of newEdges) {
    const modified = newEdges.filter(edge => !sameEdge(edge, candidate))
    // The new scope is acyclic (the plan was accepted), and removing edges
    // cannot create a cycle, so the modified order is always defined.
    const order = deriveScopeOrder(members, modified) as readonly string[]
    if (rankBefore(bystander, survivors, order) === oldRank) return candidate
  }
  if (newEdges.length > 0) return newEdges[0] as ScopeEdge
  return oldEdges[0] as ScopeEdge
}

/** How many survivors precede `id` in `order` (`id` is guaranteed present). */
function rankBefore(id: string, survivors: readonly string[], order: readonly string[]): number {
  let rank = 0
  for (const entry of order) {
    if (entry === id) break
    rank += Number(survivors.includes(entry))
  }
  return rank
}

/** All `'event.property'` slots a plugin's transform declarations touch. */
function declaredSlots(plugin: PluginDeclarationInput): Set<string> {
  const slots = new Set<string>()
  for (const declaration of plugin.permissions.transform) {
    for (const name of [...(declaration.reads ?? []), ...(declaration.writes ?? []), ...(declaration.appends ?? [])]) {
      slots.add(`${declaration.event}.${name}`)
    }
  }
  return slots
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const slot of left) {
    if (right.has(slot)) return true
  }
  return false
}

function sameEdge(left: ScopeEdge, right: ScopeEdge): boolean {
  return left.from === right.from && left.to === right.to && left.property === right.property
}

/** Sorted unique plugin ids whose requires touch any of the given services. */
function requiringPlugins(plugins: readonly PluginDeclarationInput[], services: readonly string[]): string[] {
  const dependents = new Set<string>()
  for (const plugin of plugins) {
    if (plugin.requires.some(service => services.includes(service))) dependents.add(plugin.id)
  }
  return [...dependents].sort()
}

function assertUniqueIds(plugins: readonly PluginDeclarationInput[]): void {
  const ids = new Set<string>()
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) throw new Error(`plan input has duplicate plugin id ${plugin.id}`)
    ids.add(plugin.id)
  }
}

function rejectedFromIssue(issue: { readonly code: PluginErrorCode; readonly details: Record<string, unknown> }): PluginOperationPlan {
  return {
    accepted: false,
    error: { code: issue.code, message: formatPluginError(issue.code, issue.details) },
    displaced: [],
  }
}
