/**
 * Host-half toast route: same-origin endpoint forwarding browser intents to
 * the desktop shell's native-toast bridge (MARISA_TOAST_PORT). Exercised with
 * a fake webServer registration face + a stubbed global fetch, mirroring the
 * dsh-update-check route-test pattern.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerToastRoute, toastEndpoint, TOAST_ROUTE, type ToastRouteContext } from '../src/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Fake IncomingMessage: async-iterable body + method. */
function fakeRequest(method: string, body?: unknown): IncomingMessage {
  const req = {
    method,
    [Symbol.asyncIterator]: async function* () {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  } as unknown as IncomingMessage
  return req
}

/** Fake ServerResponse capturing status + body. */
function fakeResponse(): { res: ServerResponse; status: number; body: string } {
  let status = 0
  let body = ''
  const res = {
    writeHead(code: number, _headers?: unknown) { status = code; return res },
    end(payload?: string) { body = payload ?? '' },
  } as unknown as ServerResponse
  return { res, get status() { return status }, get body() { return body } }
}

/** Capture the route registration from a fake ctx. */
function captureRoute(env: Record<string, string | undefined>): { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } {
  let captured: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } | undefined
  const ctx: ToastRouteContext = {
    webServer: {
      register(route) {
        captured = route as never
        return () => {}
      },
    },
    // 真实 cordis 的 effect 会立即执行注册回调；这里同样执行。
    effect(fn) {
      fn()
    },
  }
  registerToastRoute(ctx, env)
  if (captured === undefined) throw new Error('route was not registered')
  return captured
}

describe('host toast route', () => {
  it('resolves the bridge endpoint from MARISA_TOAST_PORT', () => {
    expect(toastEndpoint({ MARISA_TOAST_PORT: '39011' })).toBe('http://127.0.0.1:39011/toast')
    expect(toastEndpoint({ MARISA_TOAST_PORT: 'abc' })).toBeNull()
    expect(toastEndpoint({})).toBeNull()
  })

  it('answers 503 without the desktop bridge env', async () => {
    const route = captureRoute({})
    const resp = fakeResponse()
    await route.handler(fakeRequest('POST', { title: 't' }), resp.res)
    expect(resp.status).toBe(503)
    expect(JSON.parse(resp.body).message).toMatch(/MARISA_TOAST_PORT/)
  })

  it('forwards the intent (with sessionId) to the bridge and answers 204', async () => {
    const route = captureRoute({ MARISA_TOAST_PORT: '39011' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const resp = fakeResponse()
    await route.handler(fakeRequest('POST', { title: '会话 · 需要审批', body: '越权执行', sessionId: 's1' }), resp.res)
    expect(resp.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:39011/toast')
    expect(JSON.parse(String(init.body))).toEqual({ title: '会话 · 需要审批', body: '越权执行', sessionId: 's1' })
  })

  it('forwards without sessionId when absent', async () => {
    const route = captureRoute({ MARISA_TOAST_PORT: '39011' })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const resp = fakeResponse()
    await route.handler(fakeRequest('POST', { title: 't', body: 'b' }), resp.res)
    expect(resp.status).toBe(204)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ title: 't', body: 'b' })
  })

  it('answers 400 for a missing or empty title', async () => {
    const route = captureRoute({ MARISA_TOAST_PORT: '39011' })
    const resp = fakeResponse()
    await route.handler(fakeRequest('POST', { body: 'x' }), resp.res)
    expect(resp.status).toBe(400)
  })

  it('answers 405 for non-POST', async () => {
    const route = captureRoute({ MARISA_TOAST_PORT: '39011' })
    const resp = fakeResponse()
    await route.handler(fakeRequest('GET'), resp.res)
    expect(resp.status).toBe(405)
  })

  it('answers 502 when the bridge rejects the forward', async () => {
    const route = captureRoute({ MARISA_TOAST_PORT: '39011' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const resp = fakeResponse()
    await route.handler(fakeRequest('POST', { title: 't' }), resp.res)
    expect(resp.status).toBe(502)
    expect(JSON.parse(resp.body).message).toMatch(/500/)
  })

  it('registers under the plugin route path', () => {
    expect(TOAST_ROUTE).toBe('/plugins/dsh-web-ui-approval-notify/toast')
  })
})
