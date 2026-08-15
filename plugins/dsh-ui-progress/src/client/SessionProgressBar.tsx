/**
 * SessionProgressBar: a resident session-progress strip in the composer
 * input dock, derived entirely from the live {@link ConversationSnapshot}
 * plus the `todos` session projection.
 *
 * The bar needs no model-facing tool: it reads the framework's `useSession`
 * hook and the `todos` projection (session-scope standard kit) and renders
 * the real execution state — whether the turn is running, which tool call is
 * in flight, whether the model is emitting reasoning, and the task
 * completion ratio. Progress follows the truth order: a live todos list wins
 * (completed/total is the real task completion — five tasks with two done
 * reads 40%); without one the fill rests at its 100% default, because
 * session-overall progress has no dedicated projection and a fake percentage
 * is worse than none. Animation follows the state: a spinning glyph and
 * shimmer glide while running, a static filled bar when idle.
 *
 * While running, the strip also shows a live elapsed readout (since the
 * current turn started). The ETA is never extrapolated: it rides the model's
 * own knowledge — the latest in-window `report_progress` call's `eta`
 * argument (a rough remaining-time estimate). When the model has not
 * reported one, no ETA shows (unknown stays unknown).
 *
 * Attention state: when this session or any descendant subagent session
 * waits on a human interaction (approval / question / plan review), the bar
 * switches to the amber warning palette and the label names the wait —
 * subagent waits surface through the global session list (`origin:
 * 'subagent'` rows carry `pendingInteraction`; the sidebar hides them, so
 * this strip is where the main agent surfaces them).
 *
 * Interrupted state: when the session's latest completed turn was stopped —
 * a manual stop, an API failure, or another unexpected break — the bar
 * switches to the orange-red palette with a slow pulse and the label reads
 * 已中断. Only the latest completed turn is judged (by its turn/end seq), so
 * an interruption followed by a clean turn does not keep the bar orange.
 *
 * Live token rate (v0.9.0): while the model is emitting (running with a
 * non-empty partial and no pending human interaction), the strip shows a
 * live generation-rate readout — estimated tokens over the decode window
 * since the first visible token. Streaming chunks carry no token counts, so
 * the figure is an estimate that self-calibrates to the model's real
 * tokenizer density from the latest settled step's provider usage (CJK-aware
 * char heuristic before the first calibrated step; see token-rate.ts), and
 * is smoothed through a sliding window so the readout changes at most once
 * per second instead of on every chunk. Measured from the same first-token
 * anchor the core uses for its settled tokens/s, the live number is directly
 * comparable to the post-turn value on the conversation StatsLine.
 */
import { IconLoadingOutline16, IconSparkle16, IconWarningOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import css from './SessionProgressBar.module.css'
import {
  isReasoning, lastTurnDuration, latestReportEta, latestTurnInterrupted, progressPercent,
  runningTool, runningTurnStart, settledToolCount, todoCounts,
} from './session-state.ts'
import { formatElapsed, TOKEN_RATE_WINDOW_MS, useFirstTokenAt, useNow, useWindowedTokenRate } from './timing.ts'
import { formatTokenRate, latestTokenDensity, streamedTokenEstimate } from './token-rate.ts'

/** Dock entry props: InputZone owner share + session standard kit + locale seat. */
export type SessionProgressBarProps = import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'> & PropsLocale<'progress'>

/** Pending human interactions of this session's subagent subtree, by kind. */
export interface SubagentPending {
  approvals: number
  questions: number
  plans: number
}

/**
 * Walk the session list from the given root down its `parentId` chain and
 * count pending human interactions on subagent sessions. The sidebar hides
 * subagent rows; the global list still carries them, so the main strip can
 * surface their waits.
 * @param byId - the global session-list index.
 * @param rootId - the strip's owning session id.
 * @returns pending counts per kind across the whole subtree.
 */
function subagentPendingState(byId: Record<SessionId, SessionSummary>, rootId: SessionId): SubagentPending {
  const children = new Map<SessionId, SessionId[]>()
  for (const [sid, row] of Object.entries(byId)) {
    if (row.parentId === undefined || row.origin !== 'subagent') continue
    const list = children.get(row.parentId) ?? []
    list.push(sid as SessionId)
    children.set(row.parentId, list)
  }
  const seen = new Set<SessionId>([rootId])
  const queue: SessionId[] = [rootId]
  let approvals = 0
  let questions = 0
  let plans = 0
  while (queue.length > 0) {
    const id = queue.shift() as SessionId
    for (const childId of children.get(id) ?? []) {
      if (seen.has(childId)) continue
      seen.add(childId)
      queue.push(childId)
      const status = byId[childId]?.pendingInteraction
      if (status === 'approval') approvals += 1
      else if (status === 'question') questions += 1
      else if (status === 'plan-review') plans += 1
    }
  }
  return { approvals, questions, plans }
}

/**
 * The attention label: this session's own wait (approval/question) plus the
 * subagent subtree's waits, combined with a separator when both exist.
 */
function pendingLabel(
  ownKind: 'approval' | 'question' | null,
  sub: SubagentPending,
  t: SessionProgressBarProps['t'],
): string {
  const ownText = ownKind === 'approval' ? t('bar.pendingApproval') : ownKind === 'question' ? t('bar.pendingQuestion') : null
  const total = sub.approvals + sub.questions + sub.plans
  let subText: string | null = null
  if (total > 0) {
    if (total === 1 && sub.approvals === 1) subText = t('bar.pendingSubagentApproval')
    else if (total === 1 && sub.questions === 1) subText = t('bar.pendingSubagentQuestion')
    else if (total === 1 && sub.plans === 1) subText = t('bar.pendingSubagentPlan')
    else subText = t('bar.pendingSubagentCount', { count: total })
  }
  if (ownText !== null && subText !== null) return `${ownText} · ${subText}`
  return ownText ?? subText ?? ''
}

/** Human label for the current state; null means the dock row renders no text. */
function stateLabel(
  running: boolean,
  runningToolName: string | undefined,
  thinking: boolean,
  counts: { done: number; active: number; total: number } | null,
  t: SessionProgressBarProps['t'],
): ReactNode {
  if (running) {
    if (runningToolName !== undefined) return t('bar.tool', { name: runningToolName })
    if (thinking) return t('bar.thinking')
    return t('bar.running')
  }
  if (counts !== null) return t('bar.todos', { done: counts.done, active: counts.active, total: counts.total })
  return t('bar.idle')
}

/**
 * Resident progress strip. Renders nothing until a session snapshot exists
 * (the no-session hero has no dock content), then shows the state text, the
 * animated fill bar with a live percent readout, the turn/tool counters, and
 * — while running — the live elapsed plus the model-reported ETA (or the
 * last settled turn's duration when idle). Pending human interactions (this
 * session or its subagent subtree) and interrupted stops (manual or
 * unexpected) each override the plain states with their attention palette.
 */
export function SessionProgressBar({ session, t, useProjection, useSessions }: SessionProgressBarProps) {
  // Defensive guard: InputZone.session is typed non-null, but a host passing
  // no session must degrade to an empty dock instead of crashing.
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (session === undefined || session === null) return null
  const todos = useProjection('todos')
  const toolName = runningTool(session)
  const running = session.running
  const thinking = running && toolName === undefined && isReasoning(session)
  const counts = todoCounts(todos)
  const percent = progressPercent(session, todos)
  const turn = session.turnTimings.size
  const settled = settledToolCount(session)
  const turnStart = runningTurnStart(session)
  const now = useNow(running, turnStart)
  const elapsed = turnStart !== null ? Math.max(0, now - turnStart) : null
  // Live token rate window: the streaming partial plus its first-visible-token
  // anchor; the rate value itself is derived below, once `pending` is known
  // (a paused stream would only decay, so the chip hides while attention waits).
  const partial = session.partial
  const firstTokenAt = useFirstTokenAt(running, partial)
  const rateNow = useNow(running && firstTokenAt !== null, firstTokenAt)
  // ETA rides the model's own knowledge — never extrapolated from the fill.
  const modelEta = running ? latestReportEta(session) : null
  const lastTurn = running ? null : lastTurnDuration(session)
  // A session that has finished at least one turn rests in the success
  // palette (light green); a never-run session keeps the neutral look.
  const completed = !running && turn > 0
  // Attention state: this session's own pending waits plus the subagent
  // subtree's (the sidebar hides subagent rows — this strip surfaces them).
  const ownPending = session.pending[0]?.kind ?? null
  const subPending = subagentPendingState(useSessions(s => s.byId), session.sessionId)
  const pending = ownPending !== null || subPending.approvals + subPending.questions + subPending.plans > 0
  // Interrupted state: the latest completed turn was stopped (manual stop,
  // API failure, or another unexpected break) — orange-red, outranks the
  // running/done rests so the stop cannot be missed.
  const interrupted = !running && latestTurnInterrupted(session)
  // Live tokens/sec since the first visible token, self-calibrated to the
  // model's real tokenizer density (latest settled step's provider usage
  // over its weighted chars scales the partial; CJK-aware heuristic before
  // the first calibrated step). Smoothed through a sliding window so the
  // readout changes at most once per window instead of on every chunk.
  const density = latestTokenDensity(session.nodes)
  const tokenRate = useWindowedTokenRate(
    running && !pending && firstTokenAt !== null,
    firstTokenAt,
    streamedTokenEstimate(partial, density),
    TOKEN_RATE_WINDOW_MS,
  )

  return (
    <div className={css.dock} data-progress-bar>
      <div
        className={css.bar}
        data-state={pending ? 'pending' : running ? 'running' : interrupted ? 'interrupted' : completed ? 'done' : 'idle'}
      >
        <span className={clsx(css.glyph, running && css.glyphRunning)}>
          {running ? <IconLoadingOutline16 size={14} /> : interrupted ? <IconWarningOutline16 size={14} /> : <IconSparkle16 size={14} />}
        </span>
        <span className={css.label}>
          {pending ? pendingLabel(ownPending, subPending, t) : interrupted ? t('bar.interrupted') : stateLabel(running, toolName, thinking, counts, t)}
        </span>
        <div className={css.track} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={clsx(css.fill, running && css.fillRunning)}
            style={{ width: `${percent}%` }}
          />
          {running && !pending && <div className={css.shimmer} />}
        </div>
        <span className={css.percent}>{percent}%</span>
        {running && modelEta !== null && <span className={css.eta}>{t('bar.eta', { duration: modelEta })}</span>}
        {running && elapsed !== null && <span className={css.counter}>{t('bar.elapsed', { duration: formatElapsed(elapsed) })}</span>}
        {running && tokenRate !== null && <span className={css.rate}>{t('bar.tokenRate', { rate: formatTokenRate(tokenRate) })}</span>}
        {!running && lastTurn !== null && <span className={css.counter}>{t('bar.lastTurn', { duration: formatElapsed(lastTurn) })}</span>}
        <span className={css.counter}>{t('bar.turn', { turn })}</span>
        <span className={css.counter}>{t('bar.tools', { count: settled })}</span>
      </div>
    </div>
  )
}
