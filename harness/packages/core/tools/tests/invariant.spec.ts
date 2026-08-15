import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { CallId } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import type { ToolExecution, ToolExecutionResult, ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import * as ToolsInvariant from '@deepseek-ai/dsh-tools/invariant'
import InvariantService from '@deepseek-ai/dsh-invariants'

const testToolSignal = new AbortController().signal

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantService)
  await ctx.plugin(ToolsInvariant)
  return ctx
}

const execution = (overrides: Partial<ToolExecution> = {}): ToolExecution => ({
  token: Symbol('tool') as ToolExecutionToken,
  callId: CallId('call-1'),
  name: 'echo',
  arguments: Object.freeze({ text: 'hi' }),
  ...overrides,
  signal: overrides.signal ?? testToolSignal,
})

const outcome = (): ToolExecutionResult => Object.freeze({
  content: Object.freeze([{ type: 'text' as const, text: 'ok' }]) as never,
  isError: false,
  value: null,
})

function emitResult(ctx: Context, exec: ToolExecution, result: ToolExecutionResult): void {
  ctx.emit(scopeTarget(ctx as never, undefined), 'tools/result', exec, result)
}

async function stage(ctx: Context, name: 'tools/pre-execute' | 'tools/execute', exec: ToolExecution): Promise<void> {
  if (name === 'tools/pre-execute') {
    await ctx.waterfall(ctx as never, name, exec, () => Promise.resolve({ kind: 'allow' as const }))
  } else await ctx.waterfall(ctx as never, name, exec, () => Promise.resolve(outcome()))
}

describe('tool-pipeline invariants', () => {
  it('accepts dispatch and denial stage orders with frozen results', async () => {
    const ctx = await setup()
    const dispatched = execution()
    await stage(ctx, 'tools/pre-execute', dispatched)
    await stage(ctx, 'tools/execute', dispatched)
    await ctx.waterfall(ctx as never, 'tools/post-execute', dispatched, outcome(), () => Promise.resolve({ kind: 'accept' as const }))
    Object.freeze(dispatched)
    emitResult(ctx, dispatched, outcome())

    const denied = execution({ callId: CallId('call-2') })
    await stage(ctx, 'tools/pre-execute', denied)
    await ctx.waterfall(ctx as never, 'tools/post-execute', denied, outcome(), () => Promise.resolve({ kind: 'accept' as const }))
    Object.freeze(denied)
    emitResult(ctx, denied, outcome())
    ctx.emit('tools/change')
  })

  it('rejects repeated and out-of-order pipeline stages', async () => {
    const ctx = await setup()
    const exec = execution()
    await stage(ctx, 'tools/pre-execute', exec)
    await expect(stage(ctx, 'tools/pre-execute', exec)).rejects.toThrow(/repeated/)

    const noPre = execution({ callId: CallId('call-2') })
    await expect(stage(ctx, 'tools/execute', noPre)).rejects.toThrow(/must follow tools\/pre-execute/)
    expect(() => ctx.waterfall(
      ctx as never, 'tools/post-execute', noPre, outcome(),
      () => Promise.resolve({ kind: 'accept' as const }),
    )).toThrow(/must follow tools\/pre-execute or tools\/execute/)
  })

  it('rejects mutable or anonymous final snapshots', async () => {
    const ctx = await setup()
    expect(() => { emitResult(ctx, execution(), outcome()) }).toThrow(/execution must be frozen/)

    const exec = Object.freeze(execution())
    expect(() => { emitResult(ctx, exec, { content: [], isError: false, value: null }) })
      .toThrow(/outcome and content must be frozen/)

    const anonymous = Object.freeze(execution({ name: '' }))
    expect(() => { emitResult(ctx, anonymous, outcome()) }).toThrow(/non-empty name and callId/)
  })

  it('requires code-dispatch records to be turn-enclosed', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create()
    const data = {
      parentCallId: CallId('parent'),
      subCallId: CallId('child'),
      name: 'echo',
      arguments: {},
    }
    expect(() => session.append('tool/code-dispatch-start', data)).toThrow(/outside any open turn/)
    session.append('turn/start', { turn: 1 })
    expect(() => session.append('tool/code-dispatch-start', data)).not.toThrow()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  })

  it('replays enclosed code-dispatch records on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('tool/code-dispatch', {
      parentCallId: CallId('parent'),
      subCallId: CallId('child'),
      name: 'echo',
      arguments: {},
      isError: false,
      content: [{ type: 'text', text: 'ok' }],
    })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.plugin(InvariantService)
    await expect(ctx.plugin(ToolsInvariant).then(() => undefined)).resolves.toBeUndefined()
  })

  it('rejects an unenclosed code-dispatch record on late registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    ctx.sessions.create().append('tool/code-dispatch-start', {
      parentCallId: CallId('parent'),
      subCallId: CallId('child'),
      name: 'echo',
      arguments: {},
    })
    await ctx.plugin(InvariantService)
    await expect(ctx.plugin(ToolsInvariant).then(() => undefined)).rejects.toThrow(/outside any open turn/)
  })
})
