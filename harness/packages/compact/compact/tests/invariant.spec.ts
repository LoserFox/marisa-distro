import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as CompactInvariant from '@deepseek-ai/dsh-compact/invariant'
import InvariantService from '@deepseek-ai/dsh-invariants'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantService)
  await ctx.plugin(CompactInvariant)
  return ctx
}

const summary = (overrides: Record<string, unknown> = {}) => ({
  summary: [{ type: 'text' as const, text: 'short' }],
  shadowedRange: { start: 2, end: 4 },
  shadowedSeqs: [2, 3, 4],
  shadowedTokenCount: 12,
  provider: 'mock',
  model: 'mock',
  ...overrides,
})

function startTurn(session: ReturnType<Context['sessions']['create']>, turn = 1): void {
  session.append('turn/start', { turn })
}

describe('compaction invariants', () => {
  it('accepts successful and failed compaction lifecycles', async () => {
    const ctx = await setup()
    const success = ctx.sessions.create()
    startTurn(success)
    success.append('compact/start', { turn: 1 })
    success.append('compact/summary', summary())
    success.append('compact/end', { turn: 1 })

    const failed = ctx.sessions.create()
    startTurn(failed, 2)
    failed.append('compact/start', { turn: 2 })
    failed.append('compact/end', { turn: 2, error: 'provider failed' })
  })

  it('accepts standalone successful and failed compaction lifecycles between turns', async () => {
    const ctx = await setup()
    const success = ctx.sessions.create()
    success.append('compact/start', { turn: null })
    success.append('compact/summary', summary())
    success.append('compact/end', { turn: null })

    const failed = ctx.sessions.create()
    failed.append('compact/start', { turn: null })
    failed.append('compact/end', { turn: null, error: 'provider failed' })
  })

  it('clears an inherited open compaction trace at end-seed during replay', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const source = Session.create(SessionId('stale-compaction-source'))
    source.append('compact/start', { turn: null })
    const replayed = ctx.sessions.create(SessionId('stale-compaction-replay'), {
      seed: source.events,
    })
    expect(replayed.events.map(event => event.type))
      .toEqual(['compact/start', 'session/end-seed'])

    await ctx.plugin(InvariantService)
    await ctx.plugin(CompactInvariant)

    expect(() => {
      replayed.append('compact/start', { turn: null })
      replayed.append('compact/end', { turn: null, error: 'new attempt failed' })
    }).not.toThrow()
  })

  it('allows repair turn boundaries after end-seed clears a seeded numbered orphan', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const source = Session.create(SessionId('stale-numbered-compaction-source'))
    startTurn(source)
    source.append('compact/start', { turn: 1 })
    const replayed = ctx.sessions.create(SessionId('stale-numbered-compaction-replay'), {
      seed: source.events,
    })
    expect(replayed.events.map(event => event.type))
      .toEqual(['turn/start', 'compact/start', 'session/end-seed'])

    await ctx.plugin(InvariantService)
    await ctx.plugin(CompactInvariant)

    expect(() => replayed.append(
      'turn/end',
      { turn: 1, reason: { kind: 'interrupted' } },
    )).not.toThrow()
  })

  it('accepts inherited repair boundaries before the end-seed that clears a standalone orphan', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const source = Session.create(SessionId('stale-repaired-compaction-source'))
    source.append('compact/start', { turn: null })
    startTurn(source)
    source.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
    const replayed = ctx.sessions.create(SessionId('stale-repaired-compaction-replay'), {
      seed: source.events,
    })
    expect(replayed.events.map(event => event.type)).toEqual([
      'compact/start',
      'turn/start',
      'turn/end',
      'session/end-seed',
    ])

    await ctx.plugin(InvariantService)
    await expect(ctx.plugin(CompactInvariant).then(() => { return undefined })).resolves.toBeUndefined()

    expect(() => {
      startTurn(replayed, 2)
      replayed.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    }).not.toThrow()
  })

  it('rejects a closed standalone bracket that contains a turn before end-seed', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const source = Session.create(SessionId('closed-nested-compaction-source'))
    source.append('compact/start', { turn: null })
    startTurn(source)
    source.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
    source.append('compact/end', { turn: null, error: 'failed after crossing turn' })
    const replayed = ctx.sessions.create(SessionId('closed-nested-compaction-replay'), {
      seed: source.events,
    })
    expect(replayed.events.at(-1)?.type).toBe('session/end-seed')

    await ctx.plugin(InvariantService)
    await expect(ctx.plugin(CompactInvariant).then(() => undefined))
      .rejects.toThrow(/turn\/start cannot cross an open standalone compaction/)
  })

  it('rebuilds an open trace when the companion loads after the session', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('compact/start', { turn: 1 })
    await ctx.plugin(InvariantService)
    await ctx.plugin(CompactInvariant)
    expect(() => session.append('compact/end', { turn: 1, error: 'resume failed' })).not.toThrow()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  })

  it('adopts a bare session and ignores unrelated committed events', async () => {
    const ctx = await setup()
    const session = Session.create(SessionId('bare-compaction-session'))
    expect(() => {
      ctx.emit('session/event', session, {
        type: 'turn/start', seq: 0, time: 0,
        data: { turn: 1 },
      })
      ctx.emit('session/event', session, {
        type: 'step/start', seq: 1, time: 1, data: { turn: 1, step: 1 },
      })
      ctx.emit('session/event', session, {
        type: 'compact/start', seq: 2, time: 2, data: { turn: 1 },
      })
    }).not.toThrow()
  })

  it('rejects compaction outside or for a different open turn', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    expect(() => session.append('compact/start', { turn: 1 })).toThrow(/outside any open turn/)
    startTurn(session)
    expect(() => { return session.append('compact/start', { turn: 2 }) }).toThrow(/but open turn is 1/)
  })

  it('rejects a standalone bracket while a turn is open and a numbered bracket between turns', async () => {
    const ctx = await setup()
    const open = ctx.sessions.create()
    startTurn(open)
    expect(() => open.append('compact/start', { turn: null }))
      .toThrow(/standalone but turn 1 is open/)

    const idle = ctx.sessions.create()
    expect(() => idle.append('compact/start', { turn: 1 }))
      .toThrow(/outside any open turn/)
  })

  it('attributes a nested standalone start to the standalone owner', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    session.append('compact/start', { turn: null })
    expect(() => session.append('compact/start', { turn: null }))
      .toThrow(/standalone compaction is still compacting/)
  })

  it('rejects an unenclosed compaction event when replaying an existing session', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create()
    startTurn(session)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('compact/start', { turn: 1 })
    await ctx.plugin(InvariantService)
    await expect(ctx.plugin(CompactInvariant).then(() => undefined)).rejects.toThrow(/outside any open turn/)
  })

  it('rejects turn boundaries that cross live standalone or numbered compaction brackets', async () => {
    const ctx = await setup()
    const standalone = ctx.sessions.create()
    standalone.append('compact/start', { turn: null })
    expect(() => { startTurn(standalone) })
      .toThrow(/turn\/start cannot cross an open standalone compaction/)
    standalone.append('compact/end', { turn: null, error: 'cancelled' })
    expect(() => {
      startTurn(standalone)
      standalone.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    }).not.toThrow()

    const numbered = ctx.sessions.create()
    startTurn(numbered)
    numbered.append('compact/start', { turn: 1 })
    expect(() => numbered.append(
      'turn/end',
      { turn: 1, reason: { kind: 'completed' } },
    )).toThrow(/turn\/end cannot cross an open compaction for turn 1/)
    numbered.append('compact/end', { turn: 1, error: 'cancelled' })
    expect(() => numbered.append(
      'turn/end',
      { turn: 1, reason: { kind: 'completed' } },
    )).not.toThrow()
  })

  it.each([
    ['summary without start', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/summary', summary())
    }, /no matching compact\/start/],
    ['nested start', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/start', { turn: 2 })
    }, /still compacting/],
    ['repeated summary', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/summary', summary())
      session.append('compact/summary', summary())
    }, /repeated within one compaction/],
    ['empty shadow set', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/summary', summary({ shadowedSeqs: [] }))
    }, /shadowedSeqs must be non-empty/],
    ['wrong endpoints', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/summary', summary({ shadowedRange: { start: 1, end: 4 } }))
    }, /shadowedRange must match/],
    ['invalid token count', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/summary', summary({ shadowedTokenCount: -1 }))
    }, /non-negative safe integer/],
    ['end without start', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/end', { turn: 1, error: 'failed' })
    }, /no matching compact\/start/],
    ['wrong end turn', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/end', { turn: 2, error: 'failed' })
    }, /does not match/],
    ['success without summary', (session: ReturnType<Context['sessions']['create']>) => {
      session.append('compact/start', { turn: 1 })
      session.append('compact/end', { turn: 1 })
    }, /requires one compact\/summary/],
  ])('rejects %s', async (_name, action, message) => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    startTurn(session)
    expect(() => { action(session) }).toThrow(message)
  })
})
