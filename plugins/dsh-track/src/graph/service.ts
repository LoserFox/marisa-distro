/**
 * M1 — graph service: build/refresh per-session execution graphs and batch
 * build a workspace's history. Reads raw logs through the harness
 * session-query service (web profile) and persists into the TrackStore.
 * @module @fakechris/dsh-track/graph/service
 */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query'
import type { SessionGraph } from '../types.ts'
import { buildSessionGraph, GRAPH_VERSION } from './build.ts'
import { reposOfEvents, buildRepoTouchIndex } from './repos.ts'
import type { TrackStore } from '../store.ts'

/** What the graph service needs from the harness + store. */
export interface GraphServiceDeps {
  sessionQuery: Pick<SessionQueryEngine, 'readSession' | 'filterSessions'>
  store: TrackStore
}

/** Result of one workspace batch build. */
export interface BuildWorkspaceResult {
  total: number
  built: number
  skipped: number
  failed: number
}

/** Last event seq of a log (the header line has no seq). */
export function logSeqEnd(events: readonly { seq?: number }[]): number {
  return events.reduce((m, e) => (typeof e.seq === 'number' ? Math.max(m, e.seq) : m), 0)
}

/**
 * Build (or reuse) the execution graph of one session and persist it.
 * Idempotent: a stored graph that already covers the log's last seq is
 * returned as-is unless rebuild=true — the deterministic builder makes
 * rebuilds cheap and safe (same log → same nodes/edges).
 */
export async function ensureSessionGraph(
  deps: GraphServiceDeps,
  sessionId: string,
  rebuild = false,
  now = Date.now(),
): Promise<SessionGraph> {
  const snap = await deps.sessionQuery.readSession(sessionId as SessionId)
  if (!rebuild) {
    const existing = await deps.store.getGraph(sessionId)
    if (existing !== undefined && existing.seqEnd >= logSeqEnd(snap.events) && existing.version >= GRAPH_VERSION && Array.isArray(existing.header.repos)) return existing
  }
  const graph = buildSessionGraph(sessionId, snap.events, snap.session, now)
  graph.header.repos = reposOfEvents(snap.events)
  // Requirement-level attribution index: first repo touched at/after each seq.
  graph.header.repoTouch = buildRepoTouchIndex(snap.events)
    .map((x) => ({ seq: x.seq, url: x.repos[0]!.url }))
  await deps.store.upsertGraph(graph)
  await deps.store.markGraphBuilt(sessionId)
  return graph
}

/**
 * Batch build graphs for a workspace's sessions (newest-first, bounded).
 * Sessions whose stored graph already covers the log are skipped — a re-run
 * only folds sessions that grew since the last pass.
 */
export async function buildWorkspaceGraphs(
  deps: GraphServiceDeps,
  cwd: string,
  maxSessions = 200,
  now = Date.now(),
): Promise<BuildWorkspaceResult> {
  const records = await deps.sessionQuery.filterSessions([{ kind: 'cwd', values: [cwd] }])
  const list = records.slice(0, maxSessions)
  const result: BuildWorkspaceResult = { total: list.length, built: 0, skipped: 0, failed: 0 }
  for (const rec of list) {
    try {
      const snap = await deps.sessionQuery.readSession(rec.header.id)
      const existing = await deps.store.getGraph(rec.header.id)
      if (existing !== undefined && existing.seqEnd >= logSeqEnd(snap.events) && existing.version >= GRAPH_VERSION && Array.isArray(existing.header.repos)) {
        result.skipped += 1; continue
      }
      const graph = buildSessionGraph(rec.header.id, snap.events, snap.session, now)
      graph.header.repos = reposOfEvents(snap.events)
      graph.header.repoTouch = buildRepoTouchIndex(snap.events)
        .map((x) => ({ seq: x.seq, url: x.repos[0]!.url }))
      await deps.store.upsertGraph(graph)
      await deps.store.markGraphBuilt(rec.header.id)
      result.built += 1
    } catch {
      result.failed += 1
    }
  }
  return result
}
/**
 * Multi-session relations (M6 seed): for one session, resolve its parent
 * (forked from) and children (sessions whose graph header carries it as
 * parentSession) — the cross-session aggregation surface.
 */
export interface RelatedSession {
  sessionId: string
  title: string
  cwd?: string
}
export interface RelatedSessions {
  parent?: RelatedSession
  children: RelatedSession[]
}
export async function relatedSessions(store: TrackStore, sessionId: string): Promise<RelatedSessions> {
  const graphs = await store.listGraphs()
  const titleOf = (g: { sessionId: string; header: { cwd?: string }; nodes: Array<{ kind: string; title?: string }> }): string => {
    const root = g.nodes.find((n) => n.kind === 'session')
    return root?.title ?? g.sessionId
  }
  const self = graphs.find((g) => g.sessionId === sessionId)
  const children: RelatedSession[] = []
  for (const g of graphs) {
    if (g.header.parentSession === sessionId) children.push({ sessionId: g.sessionId, title: titleOf(g), cwd: g.header.cwd })
  }
  children.sort((a, b) => a.sessionId.localeCompare(b.sessionId))
  const parent = self?.header.parentSession
  let parentInfo: RelatedSession | undefined
  if (parent) {
    const p = graphs.find((g) => g.sessionId === parent)
    parentInfo = { sessionId: parent, title: p ? titleOf(p) : parent, cwd: p?.header.cwd }
  }
  return { parent: parentInfo, children }
}

/**
 * Project-level graph view (for the visual 会话结构图 tab): nodes = sessions
 * / issues / commits / decisions; edges = forked-from / executed-in /
 * landed-in / implements / raised-in. Deterministic, capped for layout.
 */
export interface GraphViewNode {
  id: string
  kind: 'session' | 'issue' | 'commit' | 'decision'
  label: string
  sessionId?: string
  messageId?: string
  state?: string
}
export interface GraphViewEdge {
  from: string
  to: string
  kind: string
  /** Evidence strength of landed-in/implements edges (P1) — absent on legacy. */
  evidenceKind?: 'declared' | 'observed' | 'candidate' | 'unmapped'
  confidence?: number
}
export interface GraphViewData { nodes: GraphViewNode[]; edges: GraphViewEdge[] }
export async function projectGraphView(store: TrackStore, projectId?: string): Promise<GraphViewData> {
  const graphs = await store.listGraphs()
  const issues = await store.listIssues()
  const commits = await store.listCommits(projectId)
  const decisions = await store.listDecisions()
  const links = await store.listLinks()
  let sessionIds: Set<string>
  if (projectId) {
    const p = await store.getProject(projectId)
    const repoUrl = p?.repoUrl
    sessionIds = new Set(graphs.filter((g) => (repoUrl !== undefined && g.header.repos !== undefined && g.header.repos.some((r) => r.url === repoUrl)) || (repoUrl === undefined && g.header.cwd === p?.path)).map((g) => g.sessionId))
  } else {
    sessionIds = new Set(graphs.map((g) => g.sessionId))
  }
  const sessionNodes = graphs.filter((g) => sessionIds.has(g.sessionId)).slice(0, 40).map((g) => {
    const root = g.nodes.find((n) => n.kind === 'session')
    return { id: 's:' + g.sessionId, kind: 'session' as const, label: (root?.title ?? g.sessionId).slice(0, 32), sessionId: g.sessionId }
  })
  const sessionSet = new Set(sessionNodes.map((n) => n.sessionId))
  const issueNodes = issues.filter((i) => (i.linkedSessionIds ?? []).some((s) => sessionSet.has(s))).slice(0, 60).map((i) => ({
    id: 'i:' + i.id, kind: 'issue' as const, label: (i.identifier + ' ' + i.title).slice(0, 28),
    sessionId: i.linkedSessionIds?.[0], messageId: i.promptMessageId, state: i.state,
  }))
  const commitNodes = commits.slice(0, 40).map((c) => ({ id: 'c:' + c.id, kind: 'commit' as const, label: c.sha.slice(0, 8) }))
  const decisionNodes = decisions.filter((d) => d.sessionId !== undefined && sessionSet.has(d.sessionId)).slice(0, 20).map((d) => ({
    id: 'd:' + d.id, kind: 'decision' as const, label: d.question.slice(0, 26), sessionId: d.sessionId,
  }))
  const nodes: GraphViewNode[] = [...sessionNodes, ...issueNodes, ...commitNodes, ...decisionNodes]
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges: GraphViewEdge[] = []
  const addEdge = (from: string, to: string, kind: string, evidenceKind?: GraphViewEdge['evidenceKind'], confidence?: number): void => {
    if (nodeIds.has(from) && nodeIds.has(to)) edges.push({ from, to, kind, evidenceKind, confidence })
  }
  for (const g of graphs) {
    if (g.header.parentSession !== undefined && sessionSet.has(g.sessionId) && sessionSet.has(g.header.parentSession)) addEdge('s:' + g.sessionId, 's:' + g.header.parentSession, 'forked-from')
  }
  for (const l of links) {
    if (l.kind === 'executed-in' && nodeIds.has('i:' + l.fromId) && nodeIds.has('s:' + l.toId)) addEdge('i:' + l.fromId, 's:' + l.toId, 'executed-in')
    else if (l.kind === 'landed-in' && nodeIds.has('s:' + l.fromId) && nodeIds.has('c:' + l.toId)) addEdge('s:' + l.fromId, 'c:' + l.toId, 'landed-in', l.evidenceKind ?? 'candidate', l.confidence)
    else if (l.kind === 'implements' && nodeIds.has('i:' + l.fromId) && nodeIds.has('c:' + l.toId)) addEdge('i:' + l.fromId, 'c:' + l.toId, 'implements', l.evidenceKind ?? 'candidate', l.confidence)
    else if (l.kind === 'raised-in' && nodeIds.has('d:' + l.fromId) && nodeIds.has('s:' + l.toId)) addEdge('d:' + l.fromId, 's:' + l.toId, 'raised-in')
  }
  return { nodes, edges }
}
