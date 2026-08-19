/** A2A's plugin-owned Connection RPC projection and invalidation behavior. */
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A2aError, type A2aMeshService } from '@dpskh/a2a'
import { A2A_RPC_CHANNEL, A2A_RPC_ENDPOINTS } from '../src/api.ts'
import { apply, inject } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async ctx => { await ctx.fiber.dispose() }))
})

function mesh(): A2aMeshService {
  return {
    status: vi.fn(async () => ({ connected: false, peers: [], projects: [] })),
    connect: vi.fn(async () => { throw new A2aError('name is already present', 'A2A_NAME_IN_USE') }),
    disconnect: vi.fn(async () => false),
    createProject: vi.fn(),
  } as unknown as A2aMeshService
}

async function host(): Promise<{ ctx: Context; handler: ConnectionRpcHandler }> {
  const ctx = new Context()
  contexts.push(ctx)
  let handler: ConnectionRpcHandler | undefined
  const handle = vi.fn((_channel, next: ConnectionRpcHandler) => {
    handler = next
    return async () => {}
  })
  const registerUpgrade = vi.fn(() => () => {})
  ctx.provide('connection', { rpc: { handle } } as never)
  ctx.provide('webServer', { registerUpgrade } as never)
  ctx.provide('a2aMesh', mesh())
  await ctx.plugin({ inject: [...inject], apply }).await()
  expect(handle).toHaveBeenCalledWith(A2A_RPC_CHANNEL, expect.any(Function), { authority: 'trusted-host' })
  expect(registerUpgrade).toHaveBeenCalledWith(expect.objectContaining({ path: '/dpskh-a2a/events' }))
  if (handler === undefined) throw new Error('A2A RPC handler was not registered')
  return { ctx, handler }
}

describe('A2A Host bridge', () => {
  it('projects snapshots and maps domain failures to typed browser errors', async () => {
    const { handler } = await host()
    await expect(handler(A2A_RPC_ENDPOINTS.snapshot, { sessionId: 's1' }, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { ok: true, value: { revision: 0, connected: false, peers: [], projects: [] } },
    })
    await expect(handler(A2A_RPC_ENDPOINTS.connect, {
      sessionId: 's1', project: 'demo', name: 'worker',
    }, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { ok: false, error: { code: 'a2a-name-in-use', details: { project: 'demo', name: 'worker' } } },
    })
  })

  it('tracks per-session and global revisions across a2a/change', async () => {
    const { ctx, handler } = await host()
    // A session-scoped change bumps only that session's revision.
    ctx.emit('a2a/change', { scope: 'session', agentId: 's2' })
    await expect(handler(A2A_RPC_ENDPOINTS.snapshot, { sessionId: 's1' }, new AbortController().signal))
      .resolves.toMatchObject({ ok: true, value: { ok: true, value: { revision: 0, connected: false, peers: [], projects: [] } } })
    ctx.emit('a2a/change', { scope: 'session', agentId: 's1' })
    await expect(handler(A2A_RPC_ENDPOINTS.snapshot, { sessionId: 's1' }, new AbortController().signal))
      .resolves.toMatchObject({ ok: true, value: { ok: true, value: { revision: 2 } } })
    // A global change invalidates every session.
    ctx.emit('a2a/change', { scope: 'all' })
    await expect(handler(A2A_RPC_ENDPOINTS.snapshot, { sessionId: 's1' }, new AbortController().signal))
      .resolves.toMatchObject({ ok: true, value: { ok: true, value: { revision: 3 } } })
    // The watch RPC endpoint is gone: unknown endpoints are rejected.
    await expect(handler('watch', { sessionId: 's1', revision: 0 }, new AbortController().signal))
      .resolves.toMatchObject({ ok: true, value: { ok: false, error: { code: 'a2a-invalid-request' } } })
  })
})
