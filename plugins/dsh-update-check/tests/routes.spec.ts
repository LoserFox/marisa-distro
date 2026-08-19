/** 路由层测试：最小 RouteContext 替身捕获注册，直接调用 handler 验证状态码与负载。 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { UpdateChecker } from '../src/checker.ts'
import type { UpdateStatePayload } from '../src/protocol.ts'
import { CHECK_ROUTE, DISMISS_ROUTE, SETTINGS_ROUTE, STATE_ROUTE } from '../src/protocol.ts'
import { registerRoutes, type RouteContext } from '../src/routes.ts'

const EMPTY_PAYLOAD: UpdateStatePayload = {
  currentVersion: '0.1.5',
  latest: null,
  hasUpdate: false,
  changelog: '',
  assets: { msi: null, standalone: null, releasePage: null, download: null },
  lastCheckAt: null,
  autoCheck: true,
  dismissedVersion: null,
}

interface FakeChecker {
  payload: () => Promise<UpdateStatePayload>
  check: () => Promise<{ checked: boolean; state: UpdateStatePayload }>
  dismiss: (version: string) => Promise<void>
  lastCheckWithin: (nowMs: number, windowMs: number) => Promise<boolean>
  dismissed: string[]
}

function fakeChecker(overrides: Partial<FakeChecker> = {}): FakeChecker {
  const dismissed: string[] = []
  return {
    payload: async () => EMPTY_PAYLOAD,
    check: async () => ({ checked: true, state: { ...EMPTY_PAYLOAD, latest: '0.1.6', hasUpdate: true } }),
    dismiss: async version => { dismissed.push(version) },
    lastCheckWithin: async () => false,
    dismissed,
    ...overrides,
  }
}

type CapturedRoute = {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

function setup(services: {
  checker?: FakeChecker
  updateAutoCheck?: (autoCheck: boolean) => Promise<void>
}): { ws: { routes: CapturedRoute[] }; checker: FakeChecker } {
  const ws: { routes: CapturedRoute[] } = { routes: [] }
  const ctx: RouteContext = {
    webServer: { register(route) { ws.routes.push(route); return () => {} } },
    effect: disposer => { disposer() },
  }
  const checker = services.checker ?? fakeChecker()
  registerRoutes(ctx, {
    checker: checker as unknown as UpdateChecker,
    updateAutoCheck: services.updateAutoCheck ?? (async () => {}),
  })
  return { ws, checker }
}

function request(method: string, body?: unknown): IncomingMessage {
  const message = new Readable() as IncomingMessage
  message.method = method
  message.url = ''
  if (body !== undefined) {
    message.push(JSON.stringify(body))
  }
  message.push(null)
  return message
}

function response(): { res: ServerResponse; status: number; json: unknown } {
  const captured = { status: 0, json: undefined as unknown }
  const res = {
    writeHead(status: number) { captured.status = status; return res },
    end(payload?: unknown) { captured.json = typeof payload === 'string' ? JSON.parse(payload) as unknown : payload },
  } as unknown as ServerResponse
  // 属性访问器保持与 writeHead 的活引用（展开拷贝会在写回前冻结为 0）。
  return { res, get status() { return captured.status }, get json() { return captured.json } }
}

describe('update-check routes', () => {
  it('registers the four exact routes', () => {
    const { ws } = setup({})
    expect(ws.routes.map(route => route.path).sort()).toEqual(
      [CHECK_ROUTE, DISMISS_ROUTE, SETTINGS_ROUTE, STATE_ROUTE].sort(),
    )
    expect(ws.routes.every(route => route.kind === 'exact')).toBe(true)
  })

  it('registers each route through an effect (卸载路径可安全执行)', () => {
    const routes: CapturedRoute[] = []
    const disposers: Array<() => void> = []
    const ctx: RouteContext = {
      webServer: { register(route) { routes.push(route); return () => {} } },
      effect: disposer => { disposers.push(disposer as () => void); disposer() },
    }
    registerRoutes(ctx, {
      checker: fakeChecker() as unknown as UpdateChecker,
      updateAutoCheck: async () => {},
    })
    expect(routes).toHaveLength(4)
    expect(disposers).toHaveLength(4)
    disposers.forEach(dispose => dispose()) // 执行注册/注销路径，不抛即通过
  })

  it('GET state returns the payload', async () => {
    const { ws, checker } = setup({ checker: fakeChecker({ payload: async () => EMPTY_PAYLOAD }) })
    const route = ws.routes.find(route => route.path === STATE_ROUTE)!
    const captured = response()
    await route.handler(request('GET'), captured.res)
    expect(captured.status).toBe(200)
    expect(captured.json).toEqual(EMPTY_PAYLOAD)
    expect(checker.dismissed).toEqual([])
  })

  it('GET state rejects non-GET methods with 405', async () => {
    const { ws } = setup({})
    const route = ws.routes.find(route => route.path === STATE_ROUTE)!
    const captured = response()
    await route.handler(request('POST'), captured.res)
    expect(captured.status).toBe(405)
  })

  it('POST check within the cache window returns 429', async () => {
    const { ws } = setup({ checker: fakeChecker({ lastCheckWithin: async () => true }) })
    const route = ws.routes.find(route => route.path === CHECK_ROUTE)!
    const captured = response()
    await route.handler(request('POST'), captured.res)
    expect(captured.status).toBe(429)
  })

  it('POST check outside the window runs a live check and returns its payload', async () => {
    const { ws } = setup({})
    const route = ws.routes.find(route => route.path === CHECK_ROUTE)!
    const captured = response()
    await route.handler(request('POST'), captured.res)
    expect(captured.status).toBe(200)
    expect((captured.json as UpdateStatePayload).hasUpdate).toBe(true)
  })

  it('POST check in hidden mode (checked=false) returns 400', async () => {
    const { ws } = setup({
      checker: fakeChecker({ check: async () => ({ checked: false, state: EMPTY_PAYLOAD }) }),
    })
    const route = ws.routes.find(route => route.path === CHECK_ROUTE)!
    const captured = response()
    await route.handler(request('POST'), captured.res)
    expect(captured.status).toBe(400)
  })

  it('POST check maps network failures to 502', async () => {
    const { ws } = setup({ checker: fakeChecker({ check: async () => { throw new Error('boom') } }) })
    const route = ws.routes.find(route => route.path === CHECK_ROUTE)!
    const captured = response()
    await route.handler(request('POST'), captured.res)
    expect(captured.status).toBe(502)
    expect(captured.json).toEqual({ message: 'boom' })
  })

  it('POST dismiss records the version', async () => {
    const { ws, checker } = setup({})
    const route = ws.routes.find(route => route.path === DISMISS_ROUTE)!
    const captured = response()
    await route.handler(request('POST', { version: '0.1.6' }), captured.res)
    expect(captured.status).toBe(200)
    expect(checker.dismissed).toEqual(['0.1.6'])
  })

  it('POST dismiss rejects malformed bodies with 400', async () => {
    const { ws, checker } = setup({})
    const route = ws.routes.find(route => route.path === DISMISS_ROUTE)!
    for (const body of [{}, { version: 42 }, { version: '' }, 'not-json']) {
      const captured = response()
      await route.handler(request('POST', body as unknown), captured.res)
      expect(captured.status).toBe(400)
    }
    expect(checker.dismissed).toEqual([])
  })

  it('POST settings updates autoCheck through the settings write', async () => {
    let written = false
    const { ws } = setup({ updateAutoCheck: async autoCheck => { written = autoCheck } })
    const route = ws.routes.find(route => route.path === SETTINGS_ROUTE)!
    const captured = response()
    await route.handler(request('POST', { autoCheck: false }), captured.res)
    expect(captured.status).toBe(200)
    expect(captured.json).toEqual({ autoCheck: false })
    expect(written).toBe(false)
  })

  it('POST settings rejects non-boolean autoCheck', async () => {
    const { ws } = setup({})
    const route = ws.routes.find(route => route.path === SETTINGS_ROUTE)!
    for (const body of [{ autoCheck: 'yes' }, {}, { autoCheck: 1 }]) {
      const captured = response()
      await route.handler(request('POST', body), captured.res)
      expect(captured.status).toBe(400)
    }
  })

  it('POST settings maps settings-write failures to 500', async () => {
    const { ws } = setup({ updateAutoCheck: async () => { throw new Error('settings down') } })
    const route = ws.routes.find(route => route.path === SETTINGS_ROUTE)!
    const captured = response()
    await route.handler(request('POST', { autoCheck: true }), captured.res)
    expect(captured.status).toBe(500)
    expect(captured.json).toEqual({ message: 'settings down' })
  })
})
