/** Package-owned compaction log-stream invariants. @module @deepseek-ai/dsh-compact/invariant */

import type { Context } from 'cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type {} from './types.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-compact'

/** Cordis companion plugin name. */
export const name = 'compact-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

interface CompactionTrace {
  startSeq: number
  turn: number | null
  summarized: boolean
}

interface SessionTrace {
  openTurn: number | null
  compaction: CompactionTrace | undefined
}

type CompactionTransition =
  | { kind: 'start'; startSeq: number; turn: number | null }
  | { kind: 'summary'; startSeq: number; turn: number | null }
  | { kind: 'end' }
  | { kind: 'end-seed' }

/** Compaction starts still unmatched when a later seed boundary made them stale. */
function inheritedOrphanStartSeqs(
  events: readonly SessionEvent[],
): ReadonlySet<number> {
  const stale = new Set<number>()
  let openStartSeq: number | undefined
  for (const event of events) {
    if (event.type === 'compact/start') {
      openStartSeq = event.seq
    } else if (event.type === 'compact/end') {
      openStartSeq = undefined
    } else if (event.type === 'session/end-seed') {
      if (openStartSeq !== undefined) stale.add(openStartSeq)
      openStartSeq = undefined
    }
  }
  return stale
}

/** Keep every live compaction bracket on one side of each turn boundary. */
function validateTurnBoundary(
  trace: SessionTrace,
  event: SessionEvent,
  fail: InvariantFailure,
): void {
  if (
    (event.type !== 'turn/start' && event.type !== 'turn/end')
    || trace.compaction === undefined
  ) return
  const owner = trace.compaction.turn === null
    ? 'standalone compaction'
    : `compaction for turn ${trace.compaction.turn}`
  fail(`${event.type} cannot cross an open ${owner}`)
}

/** Advance the committed turn cursor after its boundary has been accepted. */
function applyTurnBoundary(trace: SessionTrace, event: SessionEvent): boolean {
  if (event.type === 'turn/start') {
    trace.openTurn = event.data.turn
    return true
  }
  if (event.type === 'turn/end') {
    trace.openTurn = null
    return true
  }
  return false
}

/** Require a numbered bracket inside its exact turn, or a standalone bracket between turns. */
function validateOwner(
  owner: number | null,
  openTurn: number | null,
  eventType: 'compact/start' | 'compact/summary' | 'compact/end',
  fail: InvariantFailure,
): void {
  if (owner === null) {
    if (openTurn !== null) fail(`${eventType} is standalone but turn ${openTurn} is open`)
    return
  }
  if (openTurn === null) fail(`${eventType} for turn ${owner} appended outside any open turn`)
  if (owner !== openTurn) fail(`${eventType} names turn ${owner} but open turn is ${openTurn}`)
}

/** Validate one compaction event without advancing committed trace state. */
function validateCompactionEvent(
  trace: SessionTrace,
  event: SessionEvent,
  fail: InvariantFailure,
): CompactionTransition | undefined {
  if (event.type === 'session/end-seed') return { kind: 'end-seed' }
  if (event.type !== 'compact/start' && event.type !== 'compact/summary' && event.type !== 'compact/end') {
    return undefined
  }
  const open = trace.compaction
  if (event.type === 'compact/start') {
    if (open !== undefined) {
      const owner = open.turn === null ? 'standalone compaction' : `turn ${open.turn}`
      fail(`compact/start while ${owner} is still compacting`)
    }
    validateOwner(event.data.turn, trace.openTurn, event.type, fail)
    return { kind: 'start', startSeq: event.seq, turn: event.data.turn }
  }
  if (event.type === 'compact/summary') {
    if (open === undefined) fail('compact/summary has no matching compact/start')
    validateOwner(open.turn, trace.openTurn, event.type, fail)
    if (open.summarized) fail('compact/summary repeated within one compaction')
    const seqs = event.data.shadowedSeqs
    if (seqs.length === 0) fail('compact/summary shadowedSeqs must be non-empty')
    if (seqs[0] !== event.data.shadowedRange.start || seqs.at(-1) !== event.data.shadowedRange.end) {
      fail('compact/summary shadowedRange must match the first and last shadowedSeqs')
    }
    if (!Number.isSafeInteger(event.data.shadowedTokenCount) || event.data.shadowedTokenCount < 0) {
      fail('compact/summary shadowedTokenCount must be a non-negative safe integer')
    }
    return { kind: 'summary', startSeq: open.startSeq, turn: open.turn }
  }
  if (open === undefined) fail('compact/end has no matching compact/start')
  if (event.data.turn !== open.turn) {
    fail(`compact/end owner ${String(event.data.turn)} does not match compact/start owner ${String(open.turn)}`)
  }
  validateOwner(open.turn, trace.openTurn, event.type, fail)
  if (event.data.error === undefined && !open.summarized) {
    fail('successful compact/end requires one compact/summary')
  }
  return { kind: 'end' }
}

/** Apply one committed compaction transition. */
function applyCompactionTransition(
  transition: CompactionTransition,
): CompactionTrace | undefined {
  if (transition.kind === 'start') {
    return {
      startSeq: transition.startSeq,
      turn: transition.turn,
      summarized: false,
    }
  }
  if (transition.kind === 'summary') {
    return {
      startSeq: transition.startSeq,
      turn: transition.turn,
      summarized: true,
    }
  }
  return undefined
}

/** Install compaction start/summary/end checks. */
// Event owners keep precommit staging local so their vocabularies never move into a central helper.
/* jscpd:ignore-start */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const traces = new WeakMap<Session, SessionTrace>()
  const staged = new WeakMap<SessionEvent, { session: Session; transition: CompactionTransition }>()
  const seed = (session: Session): SessionTrace => {
    const trace: SessionTrace = { openTurn: null, compaction: undefined }
    traces.set(session, trace)
    const staleOrphanStartSeqs = inheritedOrphanStartSeqs(session.events)
    for (const event of session.events) {
      // Constructor-seed repair boundaries can precede the end-seed marker
      // that proves an inherited orphan stale. Replay that inherited prefix
      // without letting the soon-to-be-cleared bracket veto its repair.
      if (
        trace.compaction === undefined
        || !staleOrphanStartSeqs.has(trace.compaction.startSeq)
      ) {
        validateTurnBoundary(trace, event, fail)
      }
      const transition = validateCompactionEvent(trace, event, fail)
      if (transition !== undefined) trace.compaction = applyCompactionTransition(transition)
      applyTurnBoundary(trace, event)
    }
    return trace
  }
  const traceFor = (session: Session): SessionTrace => traces.get(session) ?? seed(session)

  for (const session of ctx.sessions.list()) seed(session)
  ctx.on('session/created', (session) => { seed(session) }, { global: true })
  ctx.on('session/event', (session, event) => {
    const trace = traceFor(session)
    validateTurnBoundary(trace, event, fail)
    if (applyTurnBoundary(trace, event)) return
    if (event.type !== 'session/end-seed'
      && event.type !== 'compact/start'
      && event.type !== 'compact/summary'
      && event.type !== 'compact/end') return
    const candidate = staged.get(event)
    /* v8 ignore next -- internal/dispatch stages every compaction event */
    if (candidate === undefined || candidate.session !== session) return fail('compaction event published without pre-commit validation')
    staged.delete(event)
    trace.compaction = applyCompactionTransition(candidate.transition)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    const trace = traceFor(session)
    validateTurnBoundary(trace, event, fail)
    const transition = validateCompactionEvent(trace, event, fail)
    if (transition !== undefined) staged.set(event, { session, transition })
  }, { global: true })
}, { inject: ['sessions'] })
/* jscpd:ignore-end */

/**
 * Register the compact invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
