/** 同源路由：state / check / dismiss / settings。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { CHECK_ROUTE, DISMISS_ROUTE, SETTINGS_ROUTE, STATE_ROUTE } from './protocol.ts'
import { MANUAL_CHECK_WINDOW_MS, type UpdateChecker } from './checker.ts'

const MAX_BODY_BYTES = 4 * 1024

interface RouteLike {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/**
 * registerRoutes 需要的 ctx 面：真实 cordis Context 结构兼容（webServer 的
 * register 返回 disposer，effect 注册销毁器），测试可传最小替身。
 */
export interface RouteContext {
  readonly webServer: { register(route: RouteLike): () => void }
  /** 方法声明保持参数双变，真实 cordis Context 可结构兼容。 */
  effect(disposer: () => void | (() => void), label?: string): void
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export interface RouteServices {
  readonly checker: UpdateChecker
  /** settings namespace 的自动检查开关写入（经 settings 服务，触发 onChange 重排定时器）。 */
  readonly updateAutoCheck: (autoCheck: boolean) => Promise<void>
}

/**
 * 注册四个同源路由。手动检查与定时检查共用 30s 缓存窗口：GitHub 未认证
 * 限流 60 次/时/IP，不能让客户端重试循环烧掉配额。窗口内返回 429（而非
 * 静默返回缓存）——客户端能明确提示"检查太频繁"，且 429 语义即"稍后再试"。
 */
export function registerRoutes(ctx: RouteContext, services: RouteServices): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATE_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { message: 'method not allowed' })
        return
      }
      sendJson(res, 200, await services.checker.payload())
    },
  }), 'update-check: state route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: CHECK_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { message: 'method not allowed' })
        return
      }
      if (await services.checker.lastCheckWithin(Date.now(), MANUAL_CHECK_WINDOW_MS)) {
        sendJson(res, 429, { message: 'check window: retry later' })
        return
      }
      try {
        const outcome = await services.checker.check()
        // 隐身模式（dev 形态）下检查是无操作：回 400 明确告知前端。
        sendJson(res, outcome.checked ? 200 : 400, outcome.state)
      } catch (error) {
        sendJson(res, 502, { message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'update-check: check route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: DISMISS_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { message: 'method not allowed' })
        return
      }
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) })
        return
      }
      const version = typeof body === 'object' && body !== null
        ? (body as { version?: unknown }).version
        : undefined
      if (typeof version !== 'string' || version === '') {
        sendJson(res, 400, { message: 'version must be a non-empty string' })
        return
      }
      await services.checker.dismiss(version)
      sendJson(res, 200, { ok: true })
    },
  }), 'update-check: dismiss route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: SETTINGS_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { message: 'method not allowed' })
        return
      }
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch (error) {
        sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) })
        return
      }
      const autoCheck = typeof body === 'object' && body !== null
        ? (body as { autoCheck?: unknown }).autoCheck
        : undefined
      if (typeof autoCheck !== 'boolean') {
        sendJson(res, 400, { message: 'autoCheck must be a boolean' })
        return
      }
      try {
        await services.updateAutoCheck(autoCheck)
      } catch (error) {
        sendJson(res, 500, { message: error instanceof Error ? error.message : String(error) })
        return
      }
      sendJson(res, 200, { autoCheck })
    },
  }), 'update-check: settings route')
}
