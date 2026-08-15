/**
 * One-shot runner behavior over a scripted in-process API: idle-to-idle
 * aggregation (last text of the whole interval), exit-code mapping by the
 * final turn-end reason, stream-error and RPC-error paths, and the
 * launcher-owned `ctx.headlessIo` requirement.
 */

import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { apply, Config, type HeadlessIo } from '../src/index.ts'

interface ScriptedEvent { type: string; seq?: number; time?: number; sessionId?: string; data: Record<string, unknown> }

let nextSeq = 0
/** Stamp the envelope fields the wire schema requires. */
function stamped(event: ScriptedEvent): ScriptedEvent {
  nextSeq += 1
  return { seq: nextSeq, time: nextSeq, ...event }
}

interface RpcShapedRequest { rpcId: string }

interface ScriptedApiOptions {
  promptFails?: boolean
  framesAfterPrompt?: boolean
  onPrompt?: () => void
}

/** Build a fake apiProxy (echoing rpcIds like the real gateway) whose mux stream replays `events` for the created session. */
function scriptedApi(events: ScriptedEvent[], options: ScriptedApiOptions = {}): unknown {
  let releaseFrames = (): void => {}
  const framesReady = options.framesAfterPrompt === true
    ? new Promise<void>((resolve) => { releaseFrames = resolve })
    : Promise.resolve()
  const prepared = events.map((event) => {
    if (event.type === 'stream/error') return { streamError: true } as const
    const { sessionId = 'S1', ...rest } = event
    return { streamError: false, sessionId, event: stamped(rest) } as const
  })
  return {
    sessions: {
      create: (request: RpcShapedRequest) =>
        Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value: { sessionId: 'S1' } } }),
      prompt: (request: RpcShapedRequest) => {
        releaseFrames()
        options.onPrompt?.()
        return Promise.resolve(options.promptFails === true
          // A code from the closed wire union: the carrier schema rejects invented codes.
          ? { rpcId: request.rpcId, result: { ok: false, error: { code: 'agent-busy', message: 'agent is busy', details: { reason: 'test' } } } }
          : { rpcId: request.rpcId, result: { ok: true, value: { accepted: true } } })
      },
    },
    events: {
      mux: async function* () {
        await framesReady
        for (const item of prepared) {
          if (item.streamError) {
            yield { rpcId: 'e', payload: { type: 'stream/error', error: { code: 'cancelled', message: 'stream broke', details: {} } } }
            continue
          }
          yield { rpcId: 'e', payload: { type: 'session/event', sessionId: item.sessionId, event: item.event } }
        }
      },
    },
  }
}

/**
 * Mount the runner against a scripted API, emit the idle transition after the
 * scripted frames drain, and wait for its exit request.
 */
async function run(
  events: ScriptedEvent[],
  options: { promptFails?: boolean; framesAfterPrompt?: boolean; idleInPrompt?: boolean } = {},
): Promise<{ code: number; out: string; err: string }> {
  const ctx = new Context()
  let out = ''
  let err = ''
  const exited = new Promise<number>((resolve) => {
    const io: HeadlessIo = {
      stdout: { write: (chunk: string) => { out += chunk; return true } },
      stderr: { write: (chunk: string) => { err += chunk; return true } },
      exit: resolve,
    }
    ctx.provide('headlessIo', io)
  })
  const emitIdle = (): void => {
    ctx.emit('agent/status', { agent: { id: 'S1', session: { seq: nextSeq + 1 } } as Agent, status: 'idle' })
  }
  ctx.provide('apiProxy', scriptedApi(events, {
    ...options.promptFails === undefined ? {} : { promptFails: options.promptFails },
    ...options.framesAfterPrompt === undefined ? {} : { framesAfterPrompt: options.framesAfterPrompt },
    ...options.idleInPrompt === true ? { onPrompt: emitIdle } : {},
  }) as never)
  ctx.provide('httpServer', { port: 12345 } as never)
  apply(ctx, { task: 'do the thing' })
  // Quiescence is out of band: give the scripted stream a beat to drain, then
  // flip the agent idle exactly as the loop would. Foreign agents and
  // non-idle transitions must not settle the run.
  if (options.idleInPrompt !== true) {
    await new Promise(resolve => setTimeout(resolve, 10))
    ctx.emit('agent/status', { agent: { id: 'OTHER' } as Agent, status: 'idle' })
    ctx.emit('agent/status', { agent: { id: 'S1' } as Agent, status: 'running' })
    emitIdle()
  }
  const code = await exited
  await ctx.fiber.dispose()
  return { code, out, err }
}

const startupTurn: ScriptedEvent = { type: 'turn/start', data: { turn: 0, trigger: { kind: 'startup' } } }
const messageTurn: ScriptedEvent = { type: 'turn/start', data: { turn: 1, trigger: { kind: 'message' } } }
const text = (turn: number, value: string): ScriptedEvent => ({
  type: 'assistant/message',
  data: { turn, message: { content: [{ type: 'text', text: value }] } },
})
const end = (turn: number, reason: string): ScriptedEvent => ({ type: 'turn/end', data: { turn, reason: { kind: reason } } })

describe('headless runner', () => {
  it('aggregates to quiescence: last text wins across turns, final turn-end reason maps to exit 0', async () => {
    const { code, out, err } = await run([
      // Frames before the first turn/start are outside the task interval.
      { type: 'assistant/message', data: { turn: 0, message: { content: [{ type: 'text', text: 'pre-task noise' }] } } },
      startupTurn,
      // Off-session, non-text, and text-empty frames never affect the aggregate.
      { type: 'assistant/message', sessionId: 'OTHER', data: { turn: 1, message: { content: [{ type: 'text', text: 'other session' }] } } },
      { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'tool_call', text: 'ignored' }] } } },
      text(0, 'draft'),
      end(0, 'completed'),
      messageTurn,
      text(1, 'final answer'),
      end(1, 'completed'),
    ])
    expect(code).toBe(0)
    expect(out).toBe('final answer\n')
    expect(err).toContain('observing at http://127.0.0.1:12345')
  })

  it('consumes through the idle sequence when queued frames arrive after the status transition', async () => {
    const { code, out } = await run(
      [messageTurn, text(1, 'race-free answer'), end(1, 'completed')],
      { framesAfterPrompt: true, idleInPrompt: true },
    )
    expect(code).toBe(0)
    expect(out).toBe('race-free answer\n')
  })

  it('exits 1 when the final turn ends for any other reason', async () => {
    const { code } = await run([messageTurn, end(1, 'aborted')])
    expect(code).toBe(1)
  })

  it('exits 1 when no turn ever starts (idle without work)', async () => {
    const { code, out } = await run([])
    expect(code).toBe(1)
    expect(out).toBe('\n')
  })

  it('keeps the error outcome after a stream error ends the frame consumer early', async () => {
    const { code } = await run([messageTurn, { type: 'stream/error', data: {} }, end(1, 'completed')])
    // The consumer stopped at the stream error; the completed turn-end after
    // it is never observed, so the reason stays 'error'.
    expect(code).toBe(1)
  })

  it('prints an RPC business error and exits 1 without waiting for idle', async () => {
    const ctx = new Context()
    let err = ''
    const exited = new Promise<number>((resolve) => {
      ctx.provide('headlessIo', {
        stdout: { write: () => true },
        stderr: { write: (chunk: string) => { err += chunk; return true } },
        exit: resolve,
      } satisfies HeadlessIo)
    })
    ctx.provide('apiProxy', scriptedApi([messageTurn, end(1, 'completed')], { promptFails: true }) as never)
    ctx.provide('httpServer', { port: 1 } as never)
    apply(ctx, { task: 't' })
    expect(await exited).toBe(1)
    expect(err).toContain('agent-busy')
    await ctx.fiber.dispose()
  })

  it('reports the stream-failed diagnostic when the event channel dies, still settling at idle', async () => {
    const ctx = new Context()
    let err = ''
    const exited = new Promise<number>((resolve) => {
      ctx.provide('headlessIo', {
        stdout: { write: () => true },
        stderr: { write: (chunk: string) => { err += chunk; return true } },
        exit: resolve,
      } satisfies HeadlessIo)
    })
    ctx.provide('apiProxy', {
      sessions: {
        create: (request: RpcShapedRequest) =>
          Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value: { sessionId: 'S1' } } }),
        prompt: (request: RpcShapedRequest) =>
          Promise.resolve({ rpcId: request.rpcId, result: { ok: true, value: { accepted: true } } }),
      },
      events: {
        // Synchronous throw: the SSE response never forms, so the client-side
        // iterable rejects — the runner's own catch path, not a carrier frame.
        mux: () => { throw new Error('channel exploded') },
      },
    } as never)
    ctx.provide('httpServer', { port: 1 } as never)
    apply(ctx, { task: 't' })
    await new Promise(resolve => setTimeout(resolve, 10))
    ctx.emit('agent/status', { agent: { id: 'S1', session: { seq: nextSeq + 1 } } as Agent, status: 'idle' })
    expect(await exited).toBe(1)
    expect(err).toContain('event stream failed')
    await ctx.fiber.dispose()
  })

  it('waits for Loader settlement and abandons the run when the tree died during it', async () => {
    const ctx = new Context()
    let err = ''
    let exited = false
    ctx.provide('headlessIo', {
      stdout: { write: () => true },
      stderr: { write: (chunk: string) => { err += chunk; return true } },
      exit: () => { exited = true },
    } satisfies HeadlessIo)
    ctx.provide('apiProxy', scriptedApi([]) as never)
    // The webserver is provided by a child fiber whose disposal (early
    // SIGTERM during the boot window) removes the service; settlement
    // resolves only afterwards, and the runner must abandon rather than
    // crash on the torn-down port read.
    const webserverFiber = ctx.plugin((childCtx: Context) => {
      childCtx.provide('httpServer', { port: 1 } as never)
    })
    await webserverFiber
    let release: () => void
    const settlement = new Promise<void>((resolve) => { release = resolve })
    ctx.provide('loader', { await: () => { return settlement } } as never)
    apply(ctx, { task: 't' })
    await webserverFiber.dispose()
    release!()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(err).toBe('')
    expect(exited).toBe(false)
    await ctx.fiber.dispose()
  })

  it('fails loud without the launcher-owned headlessIo seam', () => {
    const ctx = new Context()
    ctx.provide('apiProxy', scriptedApi([]) as never)
    ctx.provide('httpServer', { port: 1 } as never)
    expect(() => { apply(ctx, { task: 't' }) }).toThrow('must provide ctx.headlessIo')
  })

  it('validates config: the task is required', () => {
    expect(() => new Config({ } as never)).toThrow()
    expect(new Config({ task: 'x' })).toEqual({ task: 'x' })
  })
})
