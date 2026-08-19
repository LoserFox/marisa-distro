/**
 * M7 — Evolution Brief: deterministic project-intent summary + gap detection.
 * Aggregates the store (issues, decisions, commits, links, sessions) into a
 * compact brief for planning. Zero LLM — every line is store fact; gaps are
 * 'proposed' findings (never auto-confirmed, per the research invariants).
 * @module @fakechris/dsh-track/graph/brief
 */

import type { TrackStore } from '../store.ts'
import type { Decision, Issue } from '../types.ts'

export interface BriefIssue {
  id: string
  identifier: string
  title: string
  state: Issue['state']
  semanticKind?: string
  projectId?: string
  lastProgressAt?: number
}

export type BriefGapType = 'no-artifact' | 'done-without-commit' | 'in-progress-stale' | 'unresolved-question'

export interface BriefGap {
  type: BriefGapType
  issue?: BriefIssue
  decisionId?: string
  question?: string
  detail: string
}

export interface EvolutionBrief {
  project?: { id: string; name: string; path: string; repoUrl?: string; sessionCount: number; issueCount: number }
  issues: { total: number; byState: Record<string, number>; bySemantic: Record<string, number>; recent: BriefIssue[] }
  openDecisions: Array<{ id: string; question: string; createdAt: string }>
  recentCommits: Array<{ sha: string; subject: string; authorAt: number }>
  superseded: Array<{ newer: string; older: string }>
  gaps: BriefGap[]
  generatedAt: string
}

/** Stale window for in_progress issues with no recent evidence. */
export const STALE_MS = 14 * 24 * 60 * 60 * 1000
/**
 * Build the evolution brief for one project (or the whole store).
 * @param store track store.
 * @param projectId optional project filter (issue.projectId).
 * @param now injectable clock for deterministic tests.
 */
export async function buildEvolutionBrief(store: TrackStore, projectId?: string, now = Date.now()): Promise<EvolutionBrief> {
  const issues = await store.listIssues()
  const decisions = await store.listDecisions()
  const commits = await store.listCommits(projectId)
  const links = await store.listLinks()
  const scoped = projectId ? issues.filter((i) => i.projectId === projectId) : issues
  const briefIssues: BriefIssue[] = scoped.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title, state: i.state, semanticKind: i.semanticKind, projectId: i.projectId, lastProgressAt: i.lastProgressAt }))
  const byState: Record<string, number> = {}
  const bySemantic: Record<string, number> = {}
  for (const i of briefIssues) {
    byState[i.state] = (byState[i.state] ?? 0) + 1
    if (i.semanticKind) bySemantic[i.semanticKind] = (bySemantic[i.semanticKind] ?? 0) + 1
  }
  const recent = briefIssues.slice().sort((a, b) => (b.lastProgressAt ?? 0) - (a.lastProgressAt ?? 0)).slice(0, 10)
  const openDecisions = decisions.filter((d) => d.status === 'pending').map((d) => ({ id: d.id, question: d.question, createdAt: d.createdAt }))
  const recentCommits = commits.slice().sort((a, b) => b.authorAt - a.authorAt).slice(0, 8).map((c) => ({ sha: c.sha, subject: c.subject, authorAt: c.authorAt }))
  const superseded: Array<{ newer: string; older: string }> = []
  for (const i of scoped) if (i.supersedesIssueId) superseded.push({ newer: i.identifier, older: i.supersedesIssueId })
  for (const d of decisions) if (d.supersedesDecisionId) superseded.push({ newer: d.id, older: d.supersedesDecisionId })
  const gaps: BriefGap[] = []
  const issueHasCommit = (issueId: string): boolean => links.some((l) => l.kind === 'implements' && (l.fromId === issueId || l.toId === issueId))
  for (const i of briefIssues) {
    if (i.state === 'canceled') continue
    const has = issueHasCommit(i.id)
    if (i.state === 'done' && !has) gaps.push({ type: 'done-without-commit', issue: i, detail: '标记完成但没有实现 commit 链接' })
    else if (!has) gaps.push({ type: 'no-artifact', issue: i, detail: '没有实现 commit 链接' })
    if (i.state === 'in_progress' && i.lastProgressAt !== undefined && now - i.lastProgressAt > STALE_MS) gaps.push({ type: 'in-progress-stale', issue: i, detail: '超过 14 天无进展证据' })
  }
  for (const d of openDecisions) gaps.push({ type: 'unresolved-question', decisionId: d.id, question: d.question, detail: '待确认的决策点' })
  gaps.sort((a, b) => (a.issue?.identifier ?? '').localeCompare(b.issue?.identifier ?? ''))
  let project: EvolutionBrief['project']
  if (projectId) {
    const p = await store.getProject(projectId)
    if (p) project = { id: p.id, name: p.name, path: p.path, repoUrl: p.repoUrl, sessionCount: p.sessionIds.length, issueCount: scoped.length }
  }
  const brief: EvolutionBrief = {
    project,
    issues: { total: briefIssues.length, byState, bySemantic, recent },
    openDecisions,
    recentCommits,
    superseded,
    gaps,
    generatedAt: new Date(now).toISOString(),
  }
  return brief
}
