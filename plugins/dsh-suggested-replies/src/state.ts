/** Durable per-Session sidecar state for the suggested-replies Web surface. */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain, KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SuggestedReply } from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Session header fields that fence one sidecar row to one log lifecycle. */
export const suggestedRepliesSessionIdentitySchema = z.object({
  createdAt: nonNegativeSafeInteger,
  cwd: z.string().optional(),
})

/** Persisted identity of one exact Session lifecycle. */
export type SuggestedRepliesSessionIdentity = z.infer<typeof suggestedRepliesSessionIdentitySchema>

/** Runtime schema for one durable suggested-replies row. */
export const suggestedRepliesRowSchema = z.object({
  session: suggestedRepliesSessionIdentitySchema,
  revision: nonNegativeSafeInteger,
  turn: nonNegativeSafeInteger,
  phase: z.union([z.literal('generating'), z.literal('ready'), z.literal('cleared')]),
  suggestions: z.array(z.string()),
  generationSessionId: z.string().min(1).optional(),
}).superRefine((row, ctx) => {
  if (row.phase === 'generating' && row.generationSessionId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['generationSessionId'],
      message: 'generating suggested-replies state requires generationSessionId',
    })
  }
  if (row.phase !== 'generating' && row.generationSessionId !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['generationSessionId'],
      message: 'only generating suggested-replies state may retain generationSessionId',
    })
  }
  if (row.phase !== 'ready' && row.suggestions.length !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['suggestions'],
      message: 'only ready suggested-replies state may retain suggestions',
    })
  }
})

/** One persisted state row owned by this plugin. */
export type SuggestedRepliesRow = z.infer<typeof suggestedRepliesRowSchema>

/** Plugin-owned state domain; parent Session logs contain no plugin event types. */
export const suggestedRepliesStateDomainSpec = defineDomain({
  name: 'suggested_replies_state',
  version: 0,
  tables: {
    sessions: domainTable<SessionId, SuggestedRepliesRow>(suggestedRepliesRowSchema),
  },
})

/** Client-facing state snapshot. */
export interface SuggestedRepliesStateSnapshot {
  /** Header identity of the Session lifecycle represented by this snapshot. */
  readonly lifecycle: SuggestedRepliesSessionIdentity
  /** Monotonic revision within the current Session lifecycle. */
  readonly revision: number
  /** Completed parent turn, or null before this lifecycle has stored state. */
  readonly turn: number | null
  /** Current UI phase. */
  readonly phase: 'generating' | 'ready' | 'cleared'
  /** Ready candidates; empty in every other phase. */
  readonly suggestions: readonly SuggestedReply[]
}

type CurrentPredicate = () => boolean

function identityOf(header: SessionHeader): SuggestedRepliesSessionIdentity {
  return Object.freeze({
    createdAt: header.createdAt,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
  })
}

function sameIdentity(row: SuggestedRepliesRow, header: SessionHeader): boolean {
  return row.session.createdAt === header.createdAt && row.session.cwd === header.cwd
}

function rowSnapshot(row: SuggestedRepliesRow): SuggestedRepliesRow {
  const suggestions = Object.freeze([...row.suggestions]) as unknown as string[]
  return Object.freeze({ ...row, session: Object.freeze({ ...row.session }), suggestions })
}

function responseOf(header: SessionHeader, row: SuggestedRepliesRow | undefined): SuggestedRepliesStateSnapshot {
  const lifecycle = identityOf(header)
  if (row === undefined) {
    return Object.freeze({ lifecycle, revision: 0, turn: null, phase: 'cleared', suggestions: Object.freeze([]) })
  }
  return Object.freeze({
    lifecycle,
    revision: row.revision,
    turn: row.turn,
    phase: row.phase,
    suggestions: Object.freeze([...row.suggestions]),
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('suggested-replies request aborted')
}

function sameLifecycle(
  left: SuggestedRepliesSessionIdentity,
  right: SuggestedRepliesSessionIdentity,
): boolean {
  return left.createdAt === right.createdAt && left.cwd === right.cwd
}

function sameCursor(
  state: SuggestedRepliesStateSnapshot,
  lifecycle: SuggestedRepliesSessionIdentity,
  revision: number,
): boolean {
  return sameLifecycle(state.lifecycle, lifecycle) && state.revision === revision
}

/** Owns the storage-domain handle, serialized row mutations, and RPC waiters. */
export class SuggestedRepliesStateStore {
  private readonly operationTails = new Map<SessionId, Promise<void>>()
  private readonly waiters = new Map<SessionId, Set<() => void>>()
  private readonly lifecycle = new AbortController()
  private closing = false
  private closeTask: Promise<void> | undefined

  /** Open the plugin domain through the official storage-domain facility. */
  static async open(ctx: Context): Promise<SuggestedRepliesStateStore> {
    const domain = await ctx.storageDomain.open(suggestedRepliesStateDomainSpec)
    const store = new SuggestedRepliesStateStore(ctx, domain.table('sessions'), domain)
    ctx.effect(() => () => store.close(), 'dsh-suggested-replies: sidecar lifecycle')
    await store.clearInterruptedGenerations()
    return store
  }

  /** Construct around one owned table; public for focused storage tests. */
  constructor(
    private readonly ctx: Context,
    private readonly table: KvTable<SessionId, SuggestedRepliesRow>,
    private readonly domain: Pick<Domain<typeof suggestedRepliesStateDomainSpec>, 'close'>,
  ) {}

  /** Read state only when the sidecar identity matches the addressed Session. */
  async get(sessionId: SessionId, signal?: AbortSignal): Promise<SuggestedRepliesStateSnapshot> {
    signal?.throwIfAborted()
    const header = await this.inspectHeader(sessionId, signal)
    signal?.throwIfAborted()
    const row = this.table.get(sessionId)
    return responseOf(header, row !== undefined && sameIdentity(row, header) ? row : undefined)
  }

  /** Wait until the Session state revision differs, or until the request is aborted. */
  async watch(
    sessionId: SessionId,
    observedLifecycle: SuggestedRepliesSessionIdentity,
    observedRevision: number,
    signal: AbortSignal,
  ): Promise<SuggestedRepliesStateSnapshot> {
    const combined = AbortSignal.any([signal, this.lifecycle.signal])
    while (true) {
      const before = await this.get(sessionId, combined)
      if (!sameCursor(before, observedLifecycle, observedRevision)) return before

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const listeners = this.waiters.get(sessionId) ?? new Set<() => void>()
        this.waiters.set(sessionId, listeners)

        const cleanup = (): void => {
          listeners.delete(onChanged)
          if (listeners.size === 0) this.waiters.delete(sessionId)
          combined.removeEventListener('abort', onAbort)
        }
        const finish = (error?: Error): void => {
          if (settled) return
          settled = true
          cleanup()
          if (error === undefined) resolve()
          else reject(error)
        }
        const onChanged = (): void => { finish() }
        const onAbort = (): void => { finish(abortReason(combined)) }
        listeners.add(onChanged)
        combined.addEventListener('abort', onAbort, { once: true })

        if (combined.aborted) {
          onAbort()
          return
        }
        void this.get(sessionId, combined).then((after) => {
          if (!sameCursor(after, observedLifecycle, observedRevision)) finish()
        }, error => { finish(error instanceof Error ? error : new Error(String(error))) })
      })
    }
  }

  /** Publish loading state after the parent turn is durably checkpointed. */
  async setGenerating(
    session: Session,
    turn: number,
    generationSessionId: SessionId,
    isCurrent: CurrentPredicate,
  ): Promise<boolean> {
    await this.ensureSessionDurable(session)
    return await this.enqueue(session.id, async () => {
      if (!isCurrent()) return false
      const current = this.currentRow(session.header)
      await this.put(session.id, rowSnapshot({
        session: identityOf(session.header),
        revision: (current?.revision ?? 0) + 1,
        turn,
        phase: 'generating',
        suggestions: [],
        generationSessionId,
      }))
      return true
    })
  }

  /** Commit candidates only over the exact generation row that produced them. */
  async setReady(
    session: Session,
    turn: number,
    generationSessionId: SessionId,
    suggestions: readonly SuggestedReply[],
    isCurrent: CurrentPredicate,
  ): Promise<boolean> {
    return await this.enqueue(session.id, async () => {
      if (!isCurrent()) return false
      const current = this.currentRow(session.header)
      if (current?.phase !== 'generating'
        || current.turn !== turn
        || current.generationSessionId !== generationSessionId) return false
      await this.put(session.id, rowSnapshot({
        session: identityOf(session.header),
        revision: current.revision + 1,
        turn,
        phase: 'ready',
        suggestions: [...suggestions],
      }))
      return true
    })
  }

  /** Clear one current row, optionally checkpointing a new parent Session fact first. */
  async clear(session: Session, flushSession: boolean): Promise<boolean> {
    if (flushSession) await this.ensureSessionDurable(session)
    return await this.enqueue(session.id, async () => {
      const current = this.currentRow(session.header)
      if (current === undefined || current.phase === 'cleared') return false
      await this.put(session.id, rowSnapshot({
        session: identityOf(session.header),
        revision: current.revision + 1,
        turn: current.turn,
        phase: 'cleared',
        suggestions: [],
      }))
      return true
    })
  }

  /** Clear only if no newer generation has replaced the expected row. */
  async clearGeneration(
    session: Session,
    generationSessionId: SessionId,
  ): Promise<boolean> {
    return await this.enqueue(session.id, async () => {
      const current = this.currentRow(session.header)
      if (current?.phase !== 'generating' || current.generationSessionId !== generationSessionId) return false
      await this.put(session.id, rowSnapshot({
        session: identityOf(session.header),
        revision: current.revision + 1,
        turn: current.turn,
        phase: 'cleared',
        suggestions: [],
      }))
      return true
    })
  }

  /** Clear every stored non-cleared row after a global disable or plugin unload. */
  async clearAll(): Promise<void> {
    const rows = [...this.table.entries()]
    await Promise.all(rows.map(([sessionId]) => this.enqueue(sessionId, async () => {
      const current = this.table.get(sessionId)
      if (current === undefined || current.phase === 'cleared') return
      await this.put(sessionId, rowSnapshot({
        session: current.session,
        revision: current.revision + 1,
        turn: current.turn,
        phase: 'cleared',
        suggestions: [],
      }))
    })))
  }

  /** Replace crash-orphaned loading rows before the RPC surface becomes available. */
  async clearInterruptedGenerations(): Promise<void> {
    const rows = [...this.table.entries()]
    await Promise.all(rows.map(([sessionId]) => this.enqueue(sessionId, async () => {
      const current = this.table.get(sessionId)
      if (current?.phase !== 'generating') return
      await this.put(sessionId, rowSnapshot({
        session: current.session,
        revision: current.revision + 1,
        turn: current.turn,
        phase: 'cleared',
        suggestions: [],
      }))
    })))
  }

  /** Reject new operations, wake long polls, drain writes, and release the domain. */
  async close(): Promise<void> {
    this.closeTask ??= (async () => {
      this.closing = true
      this.lifecycle.abort(new Error('suggested-replies state store disposed'))
      await Promise.all(this.operationTails.values())
      await this.domain.close()
    })()
    return await this.closeTask
  }

  private currentRow(header: SessionHeader): SuggestedRepliesRow | undefined {
    const row = this.table.get(header.id)
    return row !== undefined && sameIdentity(row, header) ? row : undefined
  }

  private async inspectHeader(sessionId: SessionId, signal?: AbortSignal): Promise<SessionHeader> {
    const live = this.ctx.sessions.get(sessionId)
    if (live !== undefined) return live.header
    return (await this.ctx.sessionPersistence.inspect(sessionId, signal)).meta
  }

  private async ensureSessionDurable(session: Session): Promise<void> {
    if (!(await this.ctx.sessions.flush(session))) {
      throw new Error(`dsh-suggested-replies: no durability listener participated for Session '${session.id}'`)
    }
  }

  private async put(sessionId: SessionId, row: SuggestedRepliesRow): Promise<void> {
    await this.table.put(sessionId, row)
    for (const resolve of [...this.waiters.get(sessionId) ?? []]) resolve()
  }

  private enqueue<T>(sessionId: SessionId, operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('dsh-suggested-replies: state store is disposing'))
    const previous = this.operationTails.get(sessionId) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operationTails.set(sessionId, tail)
    return result.finally(() => {
      if (this.operationTails.get(sessionId) === tail) this.operationTails.delete(sessionId)
    })
  }
}
