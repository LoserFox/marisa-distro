/** Tests for the suggested-replies settings RPC. */
import { describe, expect, it, vi } from 'vitest'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import {
  CHANNEL,
  registerSuggestedRepliesRpc,
  type SettingsResponse,
  type SuggestedRepliesStateResponse,
} from '../src/rpc.ts'

type RpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>

/** Capture one registered RPC handler without constructing a Cordis host. */
function makeCtxStub(): { ctx: object; handler: () => RpcHandler } {
  let captured: RpcHandler | undefined
  const ctx = {
    connection: { rpc: { handle: vi.fn((_channel: string, handler: RpcHandler) => {
      captured = handler
      return async () => undefined
    }) } },
    inject: (_deps: readonly string[], callback: (ctx: typeof ctx) => void) => callback(ctx),
  }
  return { ctx, handler: () => captured as RpcHandler }
}

const signal = new AbortController().signal

function state(revision = 0): SuggestedRepliesStateResponse {
  return { lifecycle: { createdAt: 1, cwd: '/work' }, revision, turn: null, phase: 'cleared', suggestions: [] }
}

function storeStub() {
  return {
    get: vi.fn(async () => state()),
    watch: vi.fn(async () => state(2)),
  }
}

describe('registerSuggestedRepliesRpc', () => {
  it('registers the dedicated trusted channel', () => {
    const { ctx } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, () => true, async () => undefined)
    expect((ctx.connection.rpc.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      CHANNEL,
      expect.any(Function),
      { authority: 'trusted-host' },
    )
  })

  it('gets and sets the enabled state', async () => {
    const { ctx, handler } = makeCtxStub()
    let enabled = true
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, () => enabled, async next => { enabled = next })
    expect(await handler()('settings.get', {}, signal)).toEqual({ ok: true, value: { enabled: true } })
    expect(await handler()('settings.set', { enabled: false }, signal)).toEqual({ ok: true, value: { enabled: false } } satisfies RpcResult<SettingsResponse>)
  })

  it.each([{}, null, { enabled: 'false' }, []])('rejects malformed set payload %#', async payload => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, () => true, async () => undefined)
    const result = await handler()('settings.set', payload, signal)
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('returns writer failures and unknown endpoint errors', async () => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, () => true, async () => { throw new Error('write failed') })
    expect(await handler()('settings.set', { enabled: false }, signal)).toMatchObject({ ok: false, error: { message: 'write failed' } })
    expect(await handler()('other', {}, signal)).toMatchObject({ ok: false, error: { message: 'unknown endpoint: other' } })
  })

  it('gets and watches sidecar state with the request signal', async () => {
    const { ctx, handler } = makeCtxStub()
    const store = storeStub()
    registerSuggestedRepliesRpc(ctx as never, store as never, () => true, async () => undefined)

    expect(await handler()('state.get', { sessionId: 'session-a' }, signal))
      .toEqual({ ok: true, value: state() })
    expect(store.get).toHaveBeenCalledWith('session-a', signal)

    expect(await handler()('state.watch', {
      sessionId: 'session-a', lifecycle: { createdAt: 1, cwd: '/work' }, revision: 1,
    }, signal))
      .toEqual({ ok: true, value: state(2) })
    expect(store.watch).toHaveBeenCalledWith('session-a', { createdAt: 1, cwd: '/work' }, 1, signal)
  })

  it.each([
    ['state.get', {}],
    ['state.get', { sessionId: '' }],
    ['state.watch', { sessionId: 's', revision: 1 }],
    ['state.watch', { sessionId: 's', revision: -1 }],
    ['state.watch', { sessionId: 's', revision: 1.5 }],
  ])('rejects malformed %s payload %#', async (endpoint, payload) => {
    const { ctx, handler } = makeCtxStub()
    registerSuggestedRepliesRpc(ctx as never, storeStub() as never, () => true, async () => undefined)
    expect(await handler()(endpoint, payload, signal)).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})
