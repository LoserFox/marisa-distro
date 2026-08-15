/**
 * Session orchestration: drive the object through contract calls and injected
 * frames (open → prompt → stream → finalize → cancel → resync) and assert the
 * ConversationSnapshot it settles into. Reference stability is asserted with
 * toBe/not.toBe — it is the React.memo/uSES contract, equal-value output is not
 * enough.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import { Session } from '../src/client/sessions/session.ts'
import { FakeApiClient, deferred, err, ok } from './fake-api.ts'
import { entries, ev, plainTurn } from './event-script.ts'

const at = (seq: number, e: Record<string, unknown>): SessionEvent =>
  ({ seq, time: 1_700_000_000_000 + seq, ...e }) as unknown as SessionEvent

const SID = 'fk-s1' as SessionId
const PARENT = 'fk-parent' as SessionId

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeSession(api = new FakeApiClient()): { api: FakeApiClient; session: Session } {
  return { api, session: new Session(SID, api) }
}

function histResponse(events: SessionEvent[], hasMore = false) {
  // history now returns HistoryEntry[] ({event, view?}); these tests are view-less.
  return Promise.resolve(ok({ events: entries(events) as never[], hasMore }))
}

describe('open', () => {
  it('installs the tail page: cold → loading → open with window and nodes in place', async () => {
    const { api, session } = makeSession()
    const page = plainTurn(10, 3, '问', '答')
    api.onHistory = () => histResponse(page, true)
    expect(session.getSnapshot().openState).toBe('cold')
    const opening = session.open()
    expect(session.getSnapshot().openState).toBe('loading')
    await opening
    const snapshot = session.getSnapshot()
    expect(snapshot.openState).toBe('open')
    expect(snapshot.hasMore).toBe(true)
    expect(snapshot.nodes.map(n => n.kind)).toEqual(['user', 'assistant'])
    expect(snapshot.turnTimings.get(3)).toEqual({
      startTime: 1_700_000_000_010,
      endTime: 1_700_000_000_015,
    })
    expect(snapshot.turnEnds.get(3)).toBe(15)
  })

  it('is idempotent: concurrent opens share one history call, reopening when open is a no-op', async () => {
    const { api, session } = makeSession()
    await Promise.all([session.open(), session.open()])
    await session.open()
    expect(api.callsOf('session.history')).toHaveLength(1)
  })

  it('lands an error result in openState=error with the RpcError kept', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => Promise.resolve(err({ code: 'session-not-found', message: 'gone', details: { sessionId: SID } }))
    await session.open()
    const snapshot = session.getSnapshot()
    expect(snapshot.openState).toBe('error')
    expect(snapshot.openError?.code).toBe('session-not-found')
  })

  it('folds a transport throw into openState=error / internal', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => Promise.reject(new Error('socket died'))
    await session.open()
    expect(session.getSnapshot().openState).toBe('error')
    expect(session.getSnapshot().openError).toMatchObject({ code: 'internal', message: 'socket died' })
  })

  it('stitches live frames arriving while history is pending, dropping the page overlap', async () => {
    const { api, session } = makeSession()
    const gate = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => gate.promise
    const opening = session.open()
    // Three live frames land mid-open; seq 15 overlaps the page tail (page covers 10..15).
    const page = plainTurn(10, 0, '早', '安')
    session.handleMuxEnvelope('r1' as never, { type: 'session/event', sessionId: SID, event: ev.turnStart(15, 1) })
    session.handleMuxEnvelope('r2' as never, { type: 'session/event', sessionId: SID, event: ev.user(16, '插进来的') })
    gate.resolve(ok({
      events: entries(page) as Array<never>,
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }))
    await opening
    const seqs = session.getSnapshot().nodes.map(n => n.seq)
    // Overlapping seq-15 frame (== page tail turn/end) was dropped; 16 appended once.
    expect(seqs).toEqual([11, 13, 16])
  })
})


describe('live event path', () => {
  async function opened(events: SessionEvent[] = plainTurn(0, 0, 'a', 'b')) {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(events)
    await session.open()
    return { api, session }
  }

  it('drops replayed frames at or below the window tail', async () => {
    const { session } = await opened()
    const before = session.getSnapshot()
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.user(3, '重放') })
    await Promise.resolve()
    expect(session.getSnapshot().nodes).toEqual(before.nodes)
  })

  it('materializes a command node from live lifecycle frames and reproduces it from a history window', async () => {
    // Live path: run mints an executing node, done settles it in the flow.
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.commandRun(6, 'cmd-live', 'plan'))
    let command = session.getSnapshot().nodes.at(-1)
    expect(command).toMatchObject({ kind: 'command', name: 'plan', args: '', outcome: null })
    feed(ev.commandDone(7, 'cmd-live', 'success', '已进入 plan mode'))
    command = session.getSnapshot().nodes.at(-1)
    expect(command).toMatchObject({ kind: 'command', seq: 6, outcome: { kind: 'success', text: '已进入 plan mode' } })

    // Replay path (refresh): the same pair inside the history window folds identically.
    const replayed = await opened([
      ...plainTurn(0, 0, 'a', 'b'),
      ev.commandRun(6, 'cmd-live', 'plan'),
      ev.commandDone(7, 'cmd-live', 'success', '已进入 plan mode'),
    ])
    expect(replayed.session.getSnapshot().nodes.at(-1)).toMatchObject({
      kind: 'command', seq: 6, name: 'plan', outcome: { kind: 'success', text: '已进入 plan mode' },
    })
  })

  it('command lifecycle rows alone keep the composer blank (hero survives a /permission or /plan switch)', async () => {
    // A fresh session whose only window content is a command pair (plus the
    // knob events a /permission switch appends — not surface-eligible, so
    // they never become nodes) stays phase 'blank': selecting a preset from
    // the hero must not enter the conversation view.
    const { session } = await opened([])
    expect(session.getSnapshot().composerPhase).toBe('blank')
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.commandRun(0, 'cmd-perm', 'permission', ' danger-full-access'))
    feed(ev.commandDone(1, 'cmd-perm', 'success', 'preset danger-full-access'))
    const snapshot = session.getSnapshot()
    expect(snapshot.nodes.at(-1)).toMatchObject({ kind: 'command', name: 'permission' })
    expect(snapshot.composerPhase).toBe('blank')
  })

  it('accumulates chunks into partial, then finalize swaps partial out as the node lands', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.user(7, '流式问'))
    feed(ev.chunkStart(8, 1))
    feed(ev.chunkText(9, 1, '半截'))
    let snapshot = session.getSnapshot()
    expect(snapshot.partial).toMatchObject({ turn: 1, blocks: [{ kind: 'text', text: '半截' }] })
    feed(ev.chunkText(10, 1, '回复'))
    expect(session.getSnapshot().partial?.blocks).toEqual([{ kind: 'text', text: '半截回复' }])
    feed(ev.assistant(11, 1, '半截回复'))
    feed(ev.turnEnd(12, 1))
    snapshot = session.getSnapshot()
    expect(snapshot.partial).toBeNull()
    const last = snapshot.nodes.at(-1)
    expect(last).toMatchObject({ kind: 'assistant', blocks: [{ kind: 'text', text: '半截回复' }] })
    expect((last as { interrupted?: true }).interrupted).toBeUndefined()
  })

  it('publishes cumulative chunks once per frame and lets finalization supersede the pending frame', async () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const { session } = await opened()
    const published: Array<string | null> = []
    session.subscribe(() => {
      const block = session.getSnapshot().partial?.blocks[0]
      published.push(block?.kind === 'text' ? block.text : null)
    })
    const feed = (event: SessionEvent) => {
      session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event })
    }

    feed(ev.chunkStart(6, 1))
    feed(ev.chunkText(7, 1, '累'))
    feed(ev.chunkText(8, 1, '计'))
    expect(published).toEqual([])
    expect(frames).toHaveLength(1)

    frames.shift()!(0)
    expect(published).toEqual(['累计'])

    feed(ev.chunkText(9, 1, '完成'))
    feed(ev.assistant(10, 1, '累计完成'))
    await Promise.resolve()
    expect(published).toEqual(['累计', null])

    frames.shift()!(0)
    expect(published).toEqual(['累计', null])
  })

  it('retracts the failed-attempt partial and starts the retry on new chunk evidence', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    const retryTurn = [
      ev.turnStart(6, 1),
      ev.user(7, '请重试'),
      ev.stepStart(8, 1),
      ev.chunkStart(9, 1),
      ev.chunkText(10, 1, '不完整回复'),
      ev.retry(11, 1, 0, 1, 2, 450, '连接被重置'),
      ev.chunkStart(12, 1),
      ev.assistant(13, 1, '完整回复'),
      ev.stepEnd(14, 1),
      ev.turnEnd(15, 1),
    ]
    for (const event of retryTurn.slice(0, 6)) feed(event)

    let snapshot = session.getSnapshot()
    expect(snapshot.partial).toBeNull()
    expect(snapshot.nodes.at(-1)).toMatchObject({
      kind: 'model-retry',
      retryState: 'scheduled',
      turn: 1,
      step: 0,
      provider: 'fake',
      mode: 'normal',
      policyKey: 'fake-normal',
      retry: 1,
      maxRetries: 2,
      delayMs: 450,
      failure: { code: 'TRANSPORT', message: '连接被重置' },
    })
    expect(JSON.stringify(snapshot.nodes)).not.toContain('不完整回复')

    for (const event of retryTurn.slice(6)) feed(event)
    snapshot = session.getSnapshot()
    expect(snapshot.nodes.slice(-2).map(node => node.kind)).toEqual(['model-retry', 'assistant'])
    expect(snapshot.nodes.some(node => node.kind === 'turn-error')).toBe(false)
    expect(snapshot.nodes.at(-2)).toMatchObject({ kind: 'model-retry', retryState: 'started' })
    expect(snapshot.nodes.at(-1)).toMatchObject({ kind: 'assistant', blocks: [{ kind: 'text', text: '完整回复' }] })
    const retryStart = retryTurn.find(event => event.type === 'turn/start')
    if (retryStart?.type !== 'turn/start') throw new Error('test fixture must include the retried turn start')
    const retryEnd = retryTurn.find(event =>
      event.type === 'turn/end' && event.data.turn === retryStart.data.turn)
    if (retryEnd?.type !== 'turn/end') throw new Error('test fixture must complete the retry turn')
    expect(snapshot.turnTimings.get(retryStart.data.turn)).toEqual({
      startTime: retryStart.time,
      endTime: retryEnd.time,
    })

    const replay = makeSession()
    replay.api.onHistory = () => histResponse([...plainTurn(0, 0, 'a', 'b'), ...retryTurn])
    await replay.session.open()
    expect(replay.session.getSnapshot().nodes).toEqual(snapshot.nodes)
    expect(replay.session.getSnapshot().turnTimings).toEqual(snapshot.turnTimings)
    expect(replay.session.getSnapshot().partial).toBeNull()
  })

  it('projects unretried terminal failures at turn/end and reproduces them from history', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => {
      session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event })
    }
    const failedTurns = [
      ev.turnStart(6, 1),
      ev.user(7, '鉴权失败'),
      ev.stepStart(8, 1),
      at(9, {
        type: 'turn/end',
        data: { turn: 1, reason: { kind: 'error', error: {
          code: 'AUTH',
          message: 'Authentication Fails, Your api key: sk-preview-secret is invalid',
        },
        },
        },
      }),
      ev.turnStart(10, 2),
      ev.user(11, '内部失败'),
      ev.stepStart(12, 2, 1),
      at(13, {
        type: 'turn/end',
        data: { turn: 2, reason: { kind: 'error', error: { message: 'plugin exploded', code: 'UNKNOWN' } } },
      }),
    ]
    for (const event of failedTurns) feed(event)

    const errors = session.getSnapshot().nodes.filter(node => node.kind === 'turn-error')
    expect(errors).toMatchObject([
      { seq: 9, turn: 1, step: 0, code: 'AUTH', message: 'API key is invalid' },
      // Every failed turn carries a structured failure; unstructured errors
      // flatten to the UNKNOWN code.
      { seq: 13, turn: 2, step: 1, code: 'UNKNOWN', message: 'plugin exploded' },
    ])

    const replay = makeSession()
    replay.api.onHistory = () => histResponse([...plainTurn(0, 0, 'a', 'b'), ...failedTurns])
    await replay.session.open()
    expect(replay.session.getSnapshot().nodes).toEqual(session.getSnapshot().nodes)
  })

  it('rejects retry payloads outside the producer contract without retracting the current partial', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.chunkStart(7, 1))
    feed(ev.chunkText(8, 1, '仍在生成'))
    const valid = {
      turn: 1, step: 0,
      provider: 'fake', mode: 'normal', policyKey: 'fake-normal',
      retry: 1, maxRetries: 2, delayMs: 500,
      failure: { code: 'TRANSPORT', message: 'temporary failure' },
    }
    const invalid = [
      { ...valid, turn: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, step: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, provider: '' },
      { ...valid, policyKey: '' },
      { ...valid, retry: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, maxRetries: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, delayMs: -1 },
      { ...valid, delayMs: Number.POSITIVE_INFINITY },
      { ...valid, delayMs: MAX_TIMER_DELAY_MS + 1 },
      { ...valid, failure: { ...valid.failure, message: '' } },
      { ...valid, failure: { ...valid.failure, code: '' } },
      { ...valid, failure: { ...valid.failure, status: '429' } },
      { ...valid, failure: { ...valid.failure, status: 99 } },
      { ...valid, failure: { ...valid.failure, status: 429.5 } },
      { ...valid, failure: { ...valid.failure, status: 600 } },
      { ...valid, failure: { ...valid.failure, providerRetryAfterMs: 0 } },
      { ...valid, failure: { ...valid.failure, providerRetryAfterMs: Number.POSITIVE_INFINITY } },
      { ...valid, failure: { ...valid.failure, requestId: 1 } },
      { ...valid, failure: { ...valid.failure, requestId: '' } },
    ]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      for (const [index, data] of invalid.entries()) {
        feed(at(9 + index, { type: 'llm/retry', data }))
      }
      expect(session.getSnapshot().partial?.blocks).toEqual([{ kind: 'text', text: '仍在生成' }])
      expect(session.getSnapshot().nodes.filter(node => node.kind === 'model-retry')).toEqual([])
      expect(errorSpy).toHaveBeenCalledTimes(invalid.length)
      expect(errorSpy).toHaveBeenCalledWith('[web-runtime] ignored malformed llm/retry event at seq 9')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('accepts complete retry payloads at the producer field boundaries', async () => {
    const { session } = await opened()
    session.handleMuxEnvelope('r' as never, {
      type: 'session/event',
      sessionId: SID,
      event: at(6, {
        type: 'llm/retry',
        data: {
          turn: Number.MAX_SAFE_INTEGER,
          step: Number.MAX_SAFE_INTEGER,
          provider: 'fake',
          mode: 'normal',
          policyKey: 'fake-normal',
          retry: Number.MAX_SAFE_INTEGER,
          maxRetries: Number.MAX_SAFE_INTEGER,
          delayMs: MAX_TIMER_DELAY_MS,
          failure: {
            code: 'RATE_LIMIT',
            message: 'provider busy',
            status: 599,
            providerRetryAfterMs: Number.MIN_VALUE,
            requestId: 'req-1',
          },
        },
      }),
    })
    expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
      kind: 'model-retry',
      retryState: 'scheduled',
      retry: Number.MAX_SAFE_INTEGER,
      delayMs: MAX_TIMER_DELAY_MS,
      failure: { status: 599, providerRetryAfterMs: Number.MIN_VALUE, requestId: 'req-1' },
    })
  })

  it('projects always-mode retries and rejects mode-specific maximums or unknown modes', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      feed(at(6, {
        type: 'llm/retry',
        data: {
          turn: 1, step: 0,
          provider: 'fake', mode: 'always', policyKey: 'fake-always',
          retry: 3, delayMs: 500,
          failure: { code: 'TRANSPORT', message: 'retry forever' },
        },
      }))
      expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
        kind: 'model-retry',
        retryState: 'scheduled',
        mode: 'always',
        retry: 3,
      })

      feed(at(7, {
        type: 'llm/retry',
        data: {
          turn: 2, step: 0,
          provider: 'fake', mode: 'always', policyKey: 'fake-always',
          retry: 4, maxRetries: 4, delayMs: 500,
          failure: { code: 'TRANSPORT', message: 'unexpected maximum' },
        },
      }))
      feed(at(8, {
        type: 'llm/retry',
        data: {
          turn: 2, step: 0,
          provider: 'fake', mode: 'sometimes', policyKey: 'fake-unknown',
          retry: 4, delayMs: 500,
          failure: { code: 'TRANSPORT', message: 'unknown mode' },
        },
      }))
      expect(session.getSnapshot().nodes.filter(node => node.kind === 'model-retry')).toHaveLength(1)
      expect(errorSpy).toHaveBeenCalledTimes(2)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it.each(['aborted', 'disposed'] as const)(
    'marks a scheduled retry as cancelled when its failed turn receives the %s cause',
    async (reason) => {
      const { session } = await opened()
      const feed = (event: SessionEvent) => {
        session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event })
      }
      feed(ev.turnStart(6, 1))
      feed(ev.retry(7, 1))
      expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
        kind: 'model-retry',
        retryState: 'scheduled',
      })
      feed(ev.turnEnd(8, 1, reason))
      expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
        kind: 'model-retry',
        retryState: 'cancelled',
      })
    },
  )

  it('marks a scheduled retry as started when its failed turn ends with an error', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => {
      session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event })
    }
    feed(ev.turnStart(6, 1))
    feed(ev.retry(7, 1))
    feed(at(8, {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'error', error: { message: 'retry failed', code: 'UNKNOWN' } } },
    }))

    expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
      kind: 'model-retry',
      retryState: 'started',
    })
  })

  it('freezes an unfinalized partial into an interrupted node on turn/end (cancel path)', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.user(7, '要被打断的'))
    feed(ev.chunkStart(8, 1))
    feed(ev.chunkText(9, 1, '说到一半'))
    feed(ev.turnEnd(10, 1, 'aborted')) // no assistant/message ever arrives
    const snapshot = session.getSnapshot()
    expect(snapshot.partial).toBeNull()
    expect(snapshot.turnEnds.get(1)).toBe(10)
    const frozen = snapshot.nodes.at(-1)
    expect(frozen).toMatchObject({ kind: 'assistant', interrupted: true, blocks: [{ kind: 'text', text: '说到一半' }] })
    // Ordered inside the flow: after the user message (seq 7), before any later turn.
    expect((frozen as { seq: number }).seq).toBeGreaterThan(7)
  })

  it('tracks tool calls in runningCalls and converts orphans to interrupted tool-result cards on turn/end', async () => {
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'c1', 'echo', '{"a":1}'))
    expect(session.getSnapshot().runningCalls).toMatchObject([{ callId: 'c1', name: 'echo' }])
    feed(ev.toolResult(8, 1, 'c1', 'ECHO'))
    expect(session.getSnapshot().runningCalls).toEqual([])
    // Second call never resolves: turn/end freezes it as an error card.
    feed(ev.toolCall(9, 1, 'c2', 'slow_tool', '{}'))
    feed(ev.turnEnd(10, 1, 'aborted'))
    const snapshot = session.getSnapshot()
    expect(snapshot.runningCalls).toEqual([])
    expect(snapshot.nodes.at(-1)).toMatchObject({
      kind: 'tool-result', callId: 'c2', isError: true, error: { code: 'interrupted' },
    })
  })

  it('keeps compacted history and adds one marker, live and on replay alike', async () => {
    // A landed compaction must not erase conversation the reader already saw:
    // the shadowed messages stay at their own log positions and the checkpoint
    // contributes one marker after them.
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.compactSummary(6, '压缩摘要', 1, 3))
    feed(ev.compactCheckpoint(7, 6, 1, 3))
    const live = session.getSnapshot().nodes
    expect(live.map(n => [n.kind, n.seq])).toEqual([['user', 1], ['assistant', 3], ['compaction', 7]])
    expect(live.at(-1)).toMatchObject({ kind: 'compaction', summary: '压缩摘要' })

    const replayed = await opened([
      ...plainTurn(0, 0, 'a', 'b'),
      ev.compactSummary(6, '压缩摘要', 1, 3),
      ev.compactCheckpoint(7, 6, 1, 3),
    ])
    expect(replayed.session.getSnapshot().nodes).toEqual(live)
  })

  it('merges an interrupted frozen node by seq into the log-ordered transcript', async () => {
    // The transcript array is seq-monotonic, so the frozen node's fractional
    // seq lands it exactly where it happened — including after a compaction
    // checkpoint whose own seq is higher than the range it shadowed.
    const { session } = await opened()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.compactSummary(6, '压缩摘要', 1, 3))
    feed(ev.compactCheckpoint(7, 6, 1, 3))
    feed(ev.turnStart(8, 1))
    feed(ev.user(9, '压缩后的提问'))
    feed(ev.chunkStart(10, 1))
    feed(ev.chunkText(11, 1, '说到一半'))
    feed(ev.turnEnd(12, 1, 'aborted'))
    expect(session.getSnapshot().nodes.map(n => n.kind)).toEqual([
      'user', 'assistant', 'compaction', 'user', 'assistant',
    ])
    expect(session.getSnapshot().nodes.at(-1)).toMatchObject({ interrupted: true })
  })

  it('repairs a seq gap by repulling the tail page instead of appending a hole', async () => {
    const { api, session } = await opened(plainTurn(0, 0, 'a', 'b')) // tail seq = 5
    const repaired = [...plainTurn(0, 0, 'a', 'b'), ...plainTurn(6, 1, 'c', 'd')]
    api.onHistory = () => histResponse(repaired)
    // seq 9 with tail 5 → gap; the event detours to the buffer and one history refetch fires.
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.assistant(9, 1, 'd') })
    await vi.waitFor(() => {
      expect(api.callsOf('session.history').length).toBe(2)
    })
    await Promise.resolve()
    const seqs = session.getSnapshot().nodes.map(n => n.seq)
    expect(seqs).toEqual([1, 3, 7, 9]) // both turns' user/assistant, no hole, no duplicate 9
  })
})

describe('paging', () => {
  it('prepends an older page and keeps seq continuity', async () => {
    const older = plainTurn(0, 0, '旧问', '旧答')
    const newer = plainTurn(6, 1, '新问', '新答')
    const { api, session } = makeSession()
    api.onHistory = payload => payload.beforeSeq === undefined
      ? histResponse(newer, true)
      : histResponse(older, false)
    await session.open()
    await session.loadOlder()
    const snapshot = session.getSnapshot()
    expect(api.callsOf('session.history')).toMatchObject([{}, { beforeSeq: 6 }].map(p => ({ sessionId: SID, ...p })))
    expect(snapshot.hasMore).toBe(false)
    expect(snapshot.nodes.map(n => n.seq)).toEqual([1, 3, 7, 9])
  })

  it('renders a page whose checkpoint shadows seqs below the window head, logging nothing', async () => {
    // Pagination no longer spends maxMessages quota on replacement copies, so a
    // page can carry a compaction checkpoint whose surfaceOp.start lies outside
    // the window. The old surface fold rejected that range and degraded with a
    // console error; the log-ordered transcript has no range to resolve.
    const { api, session } = makeSession()
    api.onHistory = () => histResponse([
      ev.compactSummary(80, '窗外范围的摘要', 3, 40),
      ev.compactCheckpoint(81, 80, 3, 40),
      ev.user(82, '压缩后的新问题'),
    ], true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await session.open()
      const snapshot = session.getSnapshot()
      expect(snapshot.openState).toBe('open')
      expect(snapshot.nodes.map(n => [n.kind, n.seq])).toEqual([['compaction', 81], ['user', 82]])
      expect(snapshot.nodes[0]).toMatchObject({ summary: '窗外范围的摘要' })
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('drops a discontinuous older page fail-soft (window unchanged, hasMore cleared)', async () => {
    const { api, session } = makeSession()
    api.onHistory = payload => payload.beforeSeq === undefined
      ? histResponse(plainTurn(10, 1, '新', '页'), true)
      : histResponse(plainTurn(0, 0, '断', '层'), true) // tail seq 5, but baseSeq is 10 → hole
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await session.open()
      const nodesBefore = session.getSnapshot().nodes
      await session.loadOlder()
      const snapshot = session.getSnapshot()
      expect(snapshot.nodes).toEqual(nodesBefore)
      expect(snapshot.hasMore).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('ignores loadOlder while one is in flight (single request)', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(6, 1, 'x', 'y'), true)
    await session.open()
    const gate = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => gate.promise
    const first = session.loadOlder()
    const second = session.loadOlder()
    gate.resolve(ok({
      events: entries(plainTurn(0, 0, 'a', 'b')) as never[],
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }))
    await Promise.all([first, second])
    expect(api.callsOf('session.history')).toHaveLength(2) // open + one page, not two
  })
})

describe('prompt and cancel errors', () => {
  it('routes an addressed child through non-activating history and continuation prompt only', async () => {
    const api = new FakeApiClient()
    const session = new Session(SID, api, {
      address: { parentSessionId: PARENT, childSessionId: SID, mode: 'continuable' },
      parentAvailable: true,
    })
    await session.open()
    const prompted = await session.prompt([{ type: 'text', text: '继续' }], 'queue')
    const cancelled = await session.cancel()

    expect(prompted).toEqual({ ok: true, value: { accepted: true } })
    expect(cancelled).toMatchObject({ ok: false, error: { code: 'subagent-delivery-unavailable' } })
    expect(api.callsOf('subagent.history')).toEqual([
      { parentSessionId: PARENT, childSessionId: SID, mode: 'continuable', maxMessages: 50 },
    ])
    expect(api.callsOf('subagent.prompt')).toEqual([
      {
        parentSessionId: PARENT, childSessionId: SID, mode: 'continuable',
        content: [{ type: 'text', text: '继续' }],
      },
    ])
    expect(api.callsOf('session.history')).toEqual([])
    expect(api.callsOf('session.prompt')).toEqual([])
    expect(api.callsOf('session.cancel')).toEqual([])
    expect(session.getSnapshot().subagent).toEqual({
      address: { parentSessionId: PARENT, childSessionId: SID, mode: 'continuable' },
      parentAvailable: true,
    })
  })

  it('keeps one-shot history readable without exposing prompt or cancel transport', async () => {
    const api = new FakeApiClient()
    const session = new Session(SID, api, {
      address: { parentSessionId: PARENT, childSessionId: SID, mode: 'one-shot' },
    })
    await session.open()
    const prompted = await session.prompt([{ type: 'text', text: '继续' }], 'queue')

    expect(prompted).toMatchObject({ ok: false, error: { code: 'subagent-not-resumable' } })
    expect(api.callsOf('subagent.history')).toEqual([
      { parentSessionId: PARENT, childSessionId: SID, mode: 'one-shot', maxMessages: 50 },
    ])
    expect(api.callsOf('subagent.prompt')).toEqual([])
  })

  it('sends content through session.prompt; composerPhase steps blank → engaging synchronously at send entry', async () => {
    const { api, session } = makeSession()
    // The blank → engaging edge fires before the RPC settles: the first-send
    // flow reads the phase on the session area's first frame to keep the
    // guidance hero from flashing back in.
    expect(session.getSnapshot().composerPhase).toBe('blank')
    const inFlight = session.prompt([{ type: 'text', text: '要发的' }], 'queue')
    expect(session.getSnapshot().composerPhase).toBe('engaging')
    const result = await inFlight
    expect(result.ok).toBe(true)
    // Monotone: settlement alone does not step the phase anywhere.
    expect(session.getSnapshot().composerPhase).toBe('engaging')
    expect(api.callsOf('session.prompt')).toMatchObject([{ sessionId: SID, mode: 'queue', content: [{ type: 'text', text: '要发的' }] }])
    // First content lands (running turn): engaging → active.
    session.handleRunning(true)
    expect(session.getSnapshot().composerPhase).toBe('active')
  })

  it('business failure lands in promptError with op=send; the phase stays engaging (retry, no hero bounce)', async () => {
    const { api, session } = makeSession()
    api.onPrompt = () => Promise.resolve(err({ code: 'agent-busy', message: 'busy', details: { reason: 'x' } }))
    const result = await session.prompt([{ type: 'text', text: '失败的' }], 'queue')
    expect(result.ok).toBe(false)
    expect(session.getSnapshot().promptError).toMatchObject({ op: 'send', error: { code: 'agent-busy' } })
    // Failed first prompt: composer + error strip is the retry surface —
    // blank is unreachable once a send was initiated.
    expect(session.getSnapshot().composerPhase).toBe('engaging')
  })

  it('lands cancel failures in promptError with op=stop', async () => {
    const { api, session } = makeSession()
    api.onCancel = () => Promise.reject(new Error('cancel transport down'))
    const result = await session.cancel()
    expect(result.ok).toBe(false)
    expect(session.getSnapshot().promptError).toMatchObject({ op: 'stop', error: { code: 'internal' } })
  })
})

describe('rename', () => {
  it('settles the title projection cell from the unary response (higher-seq-wins vs the push frame)', async () => {
    const { api, session } = makeSession()
    api.onRename = () => Promise.resolve(ok({ title: '正名', seq: 7 }))
    const result = await session.rename('  正名  ')
    expect(result).toMatchObject({ ok: true, value: { title: '正名', seq: 7 } })
    expect(api.callsOf('session.rename')).toMatchObject([{ sessionId: SID, title: '  正名  ' }])
    expect(session.projections.faceOf('title').getSnapshot()).toBe('正名')
    // A stale lower-seq apply (the push-frame path routes into this same
    // store) must not roll the settled value back.
    session.projections.apply('title', '旧名', 3)
    expect(session.projections.faceOf('title').getSnapshot()).toBe('正名')
  })

  it('returns the business error untouched and folds a transport throw to internal', async () => {
    const { api, session } = makeSession()
    api.onRename = () => Promise.resolve(err({ code: 'title-invalid', message: 'empty', details: { sessionId: SID } }))
    const rejected = await session.rename('   ')
    expect(rejected).toMatchObject({ ok: false, error: { code: 'title-invalid' } })
    expect(session.projections.faceOf('title').getSnapshot()).toBeUndefined()
    api.onRename = () => Promise.reject(new Error('rename transport down'))
    const folded = await session.rename('x')
    expect(folded).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})

describe('pending interactions', () => {
  it('adds approval/question on requested and removes them on resolved', async () => {
    const { session } = makeSession()
    session.handleMuxEnvelope('ra' as never, { type: 'approval/requested', sessionId: SID, approvalId: 'ap1' as never, toolName: 'rm' })
    session.handleMuxEnvelope('rq' as never, { type: 'question/requested', sessionId: SID, questions: [] })
    expect(session.getSnapshot().pending.map(p => p.kind).sort()).toEqual(['approval', 'question'])
    session.handleMuxEnvelope('rx' as never, { type: 'approval/resolved', sessionId: SID, approvalId: 'ap1' as never, outcome: 'approved' as never })
    session.handleMuxEnvelope('ry' as never, { type: 'question/resolved', sessionId: SID, questionRpcId: 'rq' as never, outcome: 'answered' })
    expect(session.getSnapshot().pending).toEqual([])
  })

  it('mints waits whose respond() backfills the requested rpcId into the client-response envelope', async () => {
    const { api, session } = makeSession()
    session.handleMuxEnvelope('rq-answer' as never, { type: 'question/requested', sessionId: SID, questions: [] })
    const wait = session.getSnapshot().pending[0]!
    expect(wait).toMatchObject({ kind: 'question', key: 'q:rq-answer', sessionId: SID, payload: { questions: [] } })
    const receipt = await wait.respond({
      ok: true,
      value: { sessionId: SID, answer: { answers: [{ id: 'mode', selected: ['Fast'] }] } },
    })
    expect(receipt).toEqual({ accepted: true })
    expect(api.callsOf('respond')).toEqual([{
      type: 'client-response', rpcId: 'rq-answer',
      result: {
        ok: true,
        value: { sessionId: SID, answer: { answers: [{ id: 'mode', selected: ['Fast'] }] } },
      },
    }])
  })

  it('settles the wait on the authoritative resolved frame: respond() then throws synchronously', async () => {
    const { api, session } = makeSession()
    session.handleMuxEnvelope('rq1' as never, { type: 'question/requested', sessionId: SID, questions: [] })
    const wait = session.getSnapshot().pending[0]!
    session.handleMuxEnvelope('ry' as never, { type: 'question/resolved', sessionId: SID, questionRpcId: 'rq1' as never, outcome: 'answered' })
    expect(session.getSnapshot().pending).toEqual([])
    expect(() => wait.respond({ ok: false, error: { code: 'internal', message: 'x', details: {} } }))
      .toThrow('already settled')
    expect(api.callsOf('respond')).toEqual([])
  })
})

describe('remaining branches', () => {
  it('prompt transport throw folds to internal promptError', async () => {
    const { api, session } = makeSession()
    api.onPrompt = () => Promise.reject(new Error('prompt wire down'))
    const result = await session.prompt([{ type: 'text', text: 'x' }], 'queue')
    expect(result.ok).toBe(false)
    expect(session.getSnapshot().promptError).toMatchObject({ op: 'send', error: { code: 'internal', message: 'prompt wire down' } })
  })

  it('cancel business error also lands op=stop promptError', async () => {
    const { api, session } = makeSession()
    api.onCancel = () => Promise.resolve(err({ code: 'agent-busy', message: 'nope', details: { reason: 'r' } }))
    await session.cancel()
    expect(session.getSnapshot().promptError).toMatchObject({ op: 'stop', error: { code: 'agent-busy' } })
  })

  it('loadOlder guards: not-open/no-hasMore no-op, err result kept window, empty page updates hasMore, throw fail-soft', async () => {
    const { api, session } = makeSession()
    await session.loadOlder() // cold: no-op, zero calls
    expect(api.calls).toEqual([])
    api.onHistory = () => histResponse(plainTurn(6, 1, 'x', 'y'), true)
    await session.open()
    // err result: window unchanged
    api.onHistory = () => Promise.resolve(err({ code: 'internal', message: 'x', details: {} }))
    await session.loadOlder()
    expect(session.getSnapshot().nodes).toHaveLength(2)
    expect(session.getSnapshot().hasMore).toBe(true)
    // empty page: hasMore adopts the response
    api.onHistory = () => histResponse([], false)
    await session.loadOlder()
    expect(session.getSnapshot().hasMore).toBe(false)
    // hasMore false now: further loadOlder is a guard no-op
    const calls = api.calls.length
    await session.loadOlder()
    expect(api.calls.length).toBe(calls)
    // throw path: fail-soft with console.error
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await session.resync()
      api.onHistory = () => histResponse(plainTurn(6, 1, 'x', 'y'), true)
      await session.resync()
      api.onHistory = () => Promise.reject(new Error('page wire down'))
      await session.loadOlder()
      expect(errorSpy).toHaveBeenCalled()
      expect(session.getSnapshot().loadingOlder).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('subscribe delivers snapshot-change notifications and unsubscribes', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    let notified = 0
    const unsubscribe = session.subscribe(() => { notified++ })
    await session.open()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(notified).toBeGreaterThan(0)
    const seen = notified
    unsubscribe()
    session.handleRunning(true) // any snapshot mutation; the listener must stay silent
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(notified).toBe(seen)
  })

  it('subscribed baseline past the window tail triggers the second stitch pull in doOpen', async () => {
    const { api, session } = makeSession()
    const full = [...plainTurn(0, 0, 'a', 'b'), ...plainTurn(6, 1, 'c', 'd')]
    let call = 0
    api.onHistory = () => {
      call++
      return histResponse(call === 1 ? plainTurn(0, 0, 'a', 'b') : full)
    }
    // Baseline arrives before open: lastSeq 11 > first page tail 5 → doOpen repulls once.
    session.handleMuxEnvelope('rs' as never, { type: 'session/subscribed', sessionId: SID, lastSeq: 11 })
    await session.open()
    expect(call).toBe(2)
    expect(session.getSnapshot().nodes.map(n => n.seq)).toEqual([1, 3, 7, 9])
  })

  it('a failed second stitch pull keeps the first window and still opens', async () => {
    const { api, session } = makeSession()
    let call = 0
    api.onHistory = () => {
      call++
      return call === 1
        ? histResponse(plainTurn(0, 0, 'a', 'b'))
        : Promise.resolve(err({ code: 'internal', message: 'stitch pull down', details: {} }))
    }
    session.handleMuxEnvelope('rs' as never, { type: 'session/subscribed', sessionId: SID, lastSeq: 11 })
    await session.open()
    expect(call).toBe(2)
    const snapshot = session.getSnapshot()
    expect(snapshot.openState).toBe('open') // stitch-pull failure is not an open failure
    expect(snapshot.nodes.map(n => n.seq)).toEqual([1, 3]) // first window kept
  })

  it('approval frame with callId/reason keeps the optional fields; duplicate resolved is a no-op', () => {
    const { session } = makeSession()
    session.handleMuxEnvelope('ra' as never, {
      type: 'approval/requested', sessionId: SID, approvalId: 'ap2' as never, toolName: 'rm', callId: 'c1' as never, reason: '危险',
    })
    expect(session.getSnapshot().pending[0]).toMatchObject({ kind: 'approval', payload: { callId: 'c1', reason: '危险' } })
    session.handleMuxEnvelope('rx' as never, { type: 'approval/resolved', sessionId: SID, approvalId: 'ap2' as never, outcome: 'approved' as never })
    session.handleMuxEnvelope('rx2' as never, { type: 'approval/resolved', sessionId: SID, approvalId: 'ap2' as never, outcome: 'approved' as never })
    session.handleMuxEnvelope('ry2' as never, { type: 'question/resolved', sessionId: SID, questionRpcId: 'never-was' as never, outcome: 'cancelled' })
    expect(session.getSnapshot().pending).toEqual([])
  })

  it('ignores unknown mux frame types and repeated running flips (documented defaults)', () => {
    const { session } = makeSession()
    const before = session.getSnapshot()
    session.handleMuxEnvelope('rz' as never, { type: 'future/frame' } as never)
    session.handleRunning(false) // already false: dedup branch
    expect(session.getSnapshot()).toBe(before)
    session.handleRemoved()
    expect(session.getSnapshot().removed).toBe(true)
  })

  it('drops live events while cold/error (no window upkeep)', async () => {
    const { api, session } = makeSession()
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.user(0, '冷态帧') })
    expect(session.getSnapshot().nodes).toEqual([])
    api.onHistory = () => Promise.resolve(err({ code: 'internal', message: 'x', details: {} }))
    await session.open()
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.user(0, '错态帧') })
    expect(session.getSnapshot().nodes).toEqual([])
  })

  it('repairGap failure logs and clears stitching; concurrent gaps coalesce into one repair', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const gate = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    let repairs = 0
    api.onHistory = () => {
      repairs++
      return gate.promise
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      session.handleMuxEnvelope('r1' as never, { type: 'session/event', sessionId: SID, event: ev.user(9, '洞一') })
      session.handleMuxEnvelope('r2' as never, { type: 'session/event', sessionId: SID, event: ev.user(10, '洞二') }) // stitching: detours, no second repair
      expect(repairs).toBe(1)
      gate.reject(new Error('repair wire down'))
      await vi.waitFor(() => { expect(errorSpy).toHaveBeenCalled() })
      // Window unchanged; a later successful repull still lands the buffered frames.
      expect(session.getSnapshot().nodes).toHaveLength(2)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('freezes only content-bearing partials; a content-free partial is dropped outright', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.chunkStart(7, 1)) // empty text block only, no delta
    feed(ev.turnEnd(8, 1, 'aborted'))
    const snapshot = session.getSnapshot()
    expect(snapshot.partial).toBeNull()
    expect(snapshot.nodes.filter(n => n.kind === 'assistant' && (n as { interrupted?: true }).interrupted)).toEqual([])
  })

  it('turn/end sweeps only same-turn open calls; other turns keep running', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'turn1-call', 'echo', '{}'))
    feed(ev.toolCall(8, 2, 'turn2-call', 'echo', '{}')) // stray call attributed to a later turn
    feed(ev.turnEnd(9, 1, 'aborted'))
    const snapshot = session.getSnapshot()
    expect(snapshot.runningCalls.map(c => c.callId)).toEqual(['turn2-call'])
    expect(snapshot.nodes.at(-1)).toMatchObject({ kind: 'tool-result', callId: 'turn1-call', isError: true })
  })

  it('doOpen transport throw of a stale generation is swallowed (generation guard in catch)', async () => {
    const { api, session } = makeSession()
    const stale = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => stale.promise
    const opening = session.open()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    const resynced = session.resync()
    stale.reject(new Error('stale wire'))
    await Promise.all([opening, resynced])
    expect(session.getSnapshot().openState).toBe('open') // stale catch did not write error
  })

  it('drops a stale doOpen whose history resolved successfully after resync superseded it', async () => {
    const { api, session } = makeSession()
    const stale = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => stale.promise
    const opening = session.open()
    api.onHistory = () => histResponse(plainTurn(6, 1, '新', '代'))
    const resynced = session.resync()
    stale.resolve(ok({
      events: entries(plainTurn(0, 0, '旧', '代')) as never[],
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'stale' },
    })) // success, but its generation is gone
    await Promise.all([opening, resynced])
    expect(session.getSnapshot().nodes.map(n => n.seq)).toEqual([7, 9]) // only the fresh generation's window
  })

  it('drops a stale stitch pull (second doOpen fetch) superseded mid-flight by resync', async () => {
    const { api, session } = makeSession()
    const secondPull = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    let call = 0
    api.onHistory = () => {
      call++
      if (call === 1) return histResponse(plainTurn(0, 0, 'a', 'b')) // first page: tail 5
      if (call === 2) return secondPull.promise // gap-stitch pull: held
      return histResponse(plainTurn(6, 1, 'c', 'd'))
    }
    session.handleMuxEnvelope('rs' as never, { type: 'session/subscribed', sessionId: SID, lastSeq: 11 })
    const opening = session.open() // triggers the second pull, which parks
    await vi.waitFor(() => { expect(call).toBe(2) })
    const resynced = session.resync()
    secondPull.resolve(ok({
      events: entries([...plainTurn(0, 0, 'a', 'b'), ...plainTurn(6, 1, 'c', 'd')]) as never[],
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'stale' },
    }))
    await Promise.all([opening, resynced])
    expect(session.getSnapshot().openState).toBe('open')
  })

  it('drops a gap repair superseded by a full resync while its pull was in flight', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const repairPull = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => repairPull.promise
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.user(9, '洞') }) // starts repairGap
    api.onHistory = () => histResponse(plainTurn(6, 1, 'c', 'd'))
    const resynced = session.resync() // bumps the generation
    repairPull.resolve(ok({
      events: entries(plainTurn(0, 0, '旧', '页')) as never[],
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'stale' },
    })) // repair result: stale, dropped
    await resynced
    expect(session.getSnapshot().nodes.map(n => n.seq)).toEqual([7, 9])
  })

  it('successful cancel leaves no promptError; tool/result for an unknown callId is a no-op', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const result = await session.cancel()
    expect(result.ok).toBe(true)
    expect(session.getSnapshot().promptError).toBeNull()
    const callsBefore = session.getSnapshot().runningCalls
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.toolResult(6, 0, 'never-called', 'x') })
    expect(session.getSnapshot().runningCalls).toBe(callsBefore) // callsRev untouched: same reference
  })

  it('freezes a tool-call-only partial (visible through the non-text arm)', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(at(7, { type: 'assistant/chunk', data: { turn: 1, step: 0, chunk: { type: 'tool-call-delta', index: 0, id: 'c1', name: 'echo', argumentsDelta: '{' } } }))
    feed(ev.turnEnd(8, 1, 'aborted'))
    const frozen = session.getSnapshot().nodes.at(-1)
    expect(frozen).toMatchObject({ kind: 'assistant', interrupted: true, blocks: [{ kind: 'tool-call', callId: 'c1' }] })
  })

  it('dispose is a reserved no-op on resident instances', () => {
    const { session } = makeSession()
    expect(() => { session.dispose() }).not.toThrow()
  })

  it('carries mux-frame views into runningCalls and tool-result nodes, and history-entry views through open', async () => {
    const { api, session } = makeSession()
    const callView = { for: 'call', view: { card: 'generic', title: '历史卡' } }
    api.onHistory = () => Promise.resolve(ok({
      events: [
        ...entries(plainTurn(0, 0, 'a', 'b')),
        { event: ev.toolCall(6, 1, 'h1', 'bash', '{}'), view: callView },
        { event: ev.toolResult(7, 1, 'h1', 'done'), view: { for: 'result', view: { card: 'generic', title: '历史果' } } },
      ] as never[],
      hasMore: false,
      modelTarget: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }))
    await session.open()
    expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
      kind: 'tool-result', callView: { title: '历史卡' }, resultView: { title: '历史果' },
    })
    // Live path: the frame's view slot reaches runningCalls, then the result node.
    session.handleMuxEnvelope('rv1' as never, {
      type: 'session/event', sessionId: SID, event: ev.toolCall(8, 2, 'l1', 'write', '{}'),
      view: { for: 'call', view: { card: 'generic', title: '直播卡' } },
    } as never)
    expect(session.getSnapshot().runningCalls).toMatchObject([{ callId: 'l1', callView: { title: '直播卡' } }])
    session.handleMuxEnvelope('rv2' as never, {
      type: 'session/event', sessionId: SID, event: ev.toolResult(9, 2, 'l1', 'ok'),
      view: { for: 'result', view: { card: 'generic', title: '直播果' } },
    } as never)
    expect(session.getSnapshot().nodes.at(-1)).toMatchObject({
      kind: 'tool-result', callView: { title: '直播卡' }, resultView: { title: '直播果' },
    })
  })
})

describe('resync', () => {
  it('rebuilds the window and clears pending; cold instances no-op', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    session.handleMuxEnvelope('ra' as never, { type: 'approval/requested', sessionId: SID, approvalId: 'ap1' as never, toolName: 'rm' })
    api.onHistory = () => histResponse([...plainTurn(0, 0, 'a', 'b'), ...plainTurn(6, 1, 'c', 'd')])
    await session.resync()
    const snapshot = session.getSnapshot()
    expect(snapshot.openState).toBe('open')
    expect(snapshot.pending).toEqual([]) // baseline replay re-sends still-pending frames
    expect(snapshot.nodes).toHaveLength(4)

    const cold = makeSession()
    await cold.session.resync()
    expect(cold.api.calls).toEqual([]) // never opened: no traffic
  })

  it('re-mints a replayed requested frame as a fresh wait with the same key (old reference superseded)', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, 'a', 'b'))
    await session.open()
    session.handleMuxEnvelope('rq-replay' as never, { type: 'question/requested', sessionId: SID, questions: [] })
    const before = session.getSnapshot().pending[0]!
    await session.resync()
    session.handleMuxEnvelope('rq-replay' as never, { type: 'question/requested', sessionId: SID, questions: [] })
    const after = session.getSnapshot().pending[0]!
    expect(after).not.toBe(before)
    expect(after.key).toBe(before.key)
    // Superseded ≠ settled: an in-flight respond on the stale reference still reaches the host.
    await before.respond({ ok: false, error: { code: 'internal', message: 'x', details: {} } })
    expect(api.callsOf('respond')).toMatchObject([{ rpcId: 'rq-replay' }])
  })

  it('drops a stale in-flight open superseded by resync (generation guard)', async () => {
    const { api, session } = makeSession()
    const stale = deferred<Awaited<ReturnType<FakeApiClient['onHistory']>>>()
    api.onHistory = () => stale.promise
    const firstOpen = session.open()
    api.onHistory = () => histResponse(plainTurn(6, 1, '新', '代'))
    const resynced = session.resync()
    stale.reject(new Error('dead connection')) // the doomed pre-disconnect request fails late
    await firstOpen
    await resynced
    const snapshot = session.getSnapshot()
    expect(snapshot.openState).toBe('open') // stale failure did not settle the fresh generation into error
    expect(snapshot.nodes.map(n => n.seq)).toEqual([7, 9])
  })

})

describe('nested run_code sub-dispatches', () => {
  const subCallsOf = (session: Session, callId: string) => {
    const snapshot = session.getSnapshot()
    const running = snapshot.runningCalls.find(call => call.callId === callId)
    if (running !== undefined) return running.subCalls
    for (const node of snapshot.nodes) {
      if (node.kind === 'tool-result' && node.callId === callId) return node.subCalls
    }
    return undefined
  }

  it('a start event lands as a running-shaped sub-call and its settle replaces it in place', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '问', '答'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'p1', 'run_code', '{"code":"1","description":"d"}'))
    feed(ev.codeDispatchStart(8, 'p1', 1, 'bash', { command: 'sleep' }))
    feed(ev.codeDispatchStart(9, 'p1', 2, 'read', { path: 'a.txt' }))
    const live = subCallsOf(session, 'p1')
    expect(live).toHaveLength(2)
    // Running shape (no 'kind'): the exact RunningToolCall form native rows use.
    expect(live?.[0]).toMatchObject({ callId: 'p1:code:1', name: 'bash', argsRaw: '{"command":"sleep"}' })
    expect(live?.[0] !== undefined && 'kind' in live[0]).toBe(false)
    // Settle out of order (parallel run): #2 first — replaces in place, keeping start order.
    feed(ev.codeDispatch(10, 'p1', 2, 'read', { path: 'a.txt' }, 'alpha'))
    const mixed = subCallsOf(session, 'p1')
    expect(mixed?.map(sub => 'kind' in sub)).toEqual([false, true])
    expect(mixed?.[1]).toMatchObject({ callId: 'p1:code:2', content: [{ type: 'text', text: 'alpha' }] })
    // The settle carries the paired start's time as callTime (duration source).
    feed(ev.codeDispatch(11, 'p1', 1, 'bash', { command: 'sleep' }, 'done'))
    const settled = subCallsOf(session, 'p1')
    expect(settled?.map(sub => 'kind' in sub)).toEqual([true, true])
    expect(settled?.[0]).toMatchObject({ callId: 'p1:code:1', callTime: 1_700_000_000_008 })
  })

  it('indexes live tool/code-dispatch events under their parent as native-shaped result nodes', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '问', '答'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'p1', 'run_code', '{"code":"return 1","description":"跑一个程序"}'))
    feed(ev.codeDispatch(8, 'p1', 1, 'bash', { command: 'ls', description: '列目录' }, 'demo.txt'))
    feed(ev.codeDispatch(9, 'p1', 2, 'read', { path: 'a.txt' }, 'Error: ENOENT', true))
    const subs = subCallsOf(session, 'p1')
    expect(subs).toHaveLength(2)
    expect(subs?.[0]).toMatchObject({
      kind: 'tool-result', callId: 'p1:code:1',
      call: { name: 'bash', argsRaw: '{"command":"ls","description":"列目录"}' },
      // The settle event carries no start time: callTime stays null (never a
      // fabricated zero-duration).
      callTime: null,
      isError: false, content: [{ type: 'text', text: 'demo.txt' }],
    })
    expect(subs?.[1]).toMatchObject({ callId: 'p1:code:2', isError: true })
    // No paired start in the window: duration is UNKNOWN (null), never a
    // fabricated zero-duration span.
    expect(subs?.[0]).toMatchObject({ callTime: null })
    // Sub-dispatches never join the surface flow.
    expect(session.getSnapshot().nodes.some(n => n.kind === 'tool-result' && n.callId.includes(':code:'))).toBe(false)
  })

  it('rebuilds the same nested tree from a history window (replay parity)', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse([
      ...plainTurn(0, 0, '问', '答'),
      ev.turnStart(6, 1),
      ev.toolCall(7, 1, 'p1', 'run_code', '{"code":"return 1","description":"跑一个程序"}'),
      ev.codeDispatchStart(8, 'p1', 1, 'run_code', { code: 'return tools.read({ path: "a.txt" })' }),
      ev.codeDispatch(9, 'p1:code:1', 1, 'read', { path: 'a.txt' }, 'alpha'),
      ev.codeDispatch(10, 'p1', 1, 'run_code', { code: 'return tools.read({ path: "a.txt" })' }, 'alpha'),
      ev.toolResult(11, 1, 'p1', '{"done":true}'),
      ev.turnEnd(12, 1),
    ])
    await session.open()
    const subs = subCallsOf(session, 'p1')
    expect(subs).toHaveLength(1)
    expect(subs?.[0]).toMatchObject({
      callId: 'p1:code:1',
      call: { name: 'run_code' },
      subCalls: [{ callId: 'p1:code:1:code:1', call: { name: 'read' } }],
    })
  })

  it('keeps an unaffected root reference and path-copies it on a new child', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '稳', '定'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'p1', 'run_code', '{"code":"1","description":"d"}'))
    feed(ev.codeDispatch(8, 'p1', 1, 'bash', { command: 'ls' }, 'x'))
    const before = session.getSnapshot()
    const beforeRoot = before.runningCalls.find(call => call.callId === 'p1')!
    feed(ev.chunkStart(9, 1))
    feed(ev.chunkText(10, 1, '流式'))
    const after = session.getSnapshot()
    const afterRoot = after.runningCalls.find(call => call.callId === 'p1')!
    expect(afterRoot).toBe(beforeRoot)
    feed(ev.codeDispatch(11, 'p1', 2, 'read', { path: 'a' }, 'y'))
    const changedRoot = session.getSnapshot().runningCalls.find(call => call.callId === 'p1')!
    expect(changedRoot).not.toBe(afterRoot)
    expect(changedRoot.subCalls[0]).toBe(afterRoot.subCalls[0])
    expect(changedRoot.subCalls).toHaveLength(2)
  })

  it('path-copies only the owning branch when a nested child changes', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '树', '结构'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.toolCall(7, 1, 'p1', 'run_code', '{"code":"1","description":"first"}'))
    feed(ev.toolCall(8, 1, 'p2', 'run_code', '{"code":"2","description":"second"}'))
    feed(ev.codeDispatch(9, 'p1', 1, 'run_code', { code: 'nested' }, 'child'))
    feed(ev.codeDispatch(10, 'p1', 2, 'read', { path: 'sibling' }, 'sibling'))
    feed(ev.codeDispatch(11, 'p2', 1, 'bash', { command: 'pwd' }, 'root two'))
    const before = session.getSnapshot()
    const beforeFirst = before.runningCalls.find(call => call.callId === 'p1')!
    const beforeSecond = before.runningCalls.find(call => call.callId === 'p2')!
    const beforeChild = beforeFirst.subCalls[0]!
    const beforeSibling = beforeFirst.subCalls[1]!

    feed(ev.codeDispatch(12, 'p1:code:1', 1, 'read', { path: 'nested' }, 'leaf'))
    const after = session.getSnapshot()
    const afterFirst = after.runningCalls.find(call => call.callId === 'p1')!
    const afterSecond = after.runningCalls.find(call => call.callId === 'p2')!

    expect(afterFirst).not.toBe(beforeFirst)
    expect(afterSecond).toBe(beforeSecond)
    expect(afterFirst.subCalls[0]).not.toBe(beforeChild)
    expect(afterFirst.subCalls[1]).toBe(beforeSibling)
    expect(afterFirst.subCalls[0]?.subCalls).toMatchObject([
      { callId: 'p1:code:1:code:1', call: { name: 'read' } },
    ])
  })
})

describe('reference stability (the memo contract)', () => {
  it('keeps unchanged node references across an append and swaps the snapshot object', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '稳', '定'))
    await session.open()
    const before = session.getSnapshot()
    session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event: ev.user(6, '追加') })
    const after = session.getSnapshot()
    expect(after).not.toBe(before) // top-level swap on change
    expect(after.nodes[0]).toBe(before.nodes[0]) // untouched nodes keep identity
    expect(after.nodes[1]).toBe(before.nodes[1])
    expect(after.nodes).toHaveLength(3)
    // No change → same snapshot reference.
    expect(session.getSnapshot()).toBe(after)
  })

  it('keeps untouched substructure arrays identical across unrelated changes (revision counters)', async () => {
    const { api, session } = makeSession()
    api.onHistory = () => histResponse(plainTurn(0, 0, '底', '座'))
    await session.open()
    const feed = (event: SessionEvent) => { session.handleMuxEnvelope('r' as never, { type: 'session/event', sessionId: SID, event }) }
    feed(ev.turnStart(6, 1))
    feed(ev.stepStart(7, 1))
    feed(ev.toolCall(8, 1, 'c1', 'echo', '{}'))
    session.handleMuxEnvelope('ra' as never, { type: 'approval/requested', sessionId: SID, approvalId: 'ap1' as never, toolName: 'rm' })
    const before = session.getSnapshot()
    // A chunk storm touches partial/nodes only: unrelated projections keep identity.
    feed(ev.chunkStart(9, 1))
    feed(ev.chunkText(10, 1, '与工具无关的流式'))
    const after = session.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.runningCalls).toBe(before.runningCalls)
    expect(after.pending).toBe(before.pending)
    expect(after.turnTimings).toBe(before.turnTimings)
    expect(after.turnEnds).toBe(before.turnEnds)
    // And a mutation on the tracked domain swaps that array.
    feed(ev.toolResult(11, 1, 'c1', 'ECHO'))
    const resolved = session.getSnapshot()
    expect(resolved.runningCalls).not.toBe(after.runningCalls)
    expect(resolved.pending).toBe(after.pending)
    feed(ev.assistant(12, 1, '完成'))
    expect(session.getSnapshot()).not.toBe(resolved)
  })
})
