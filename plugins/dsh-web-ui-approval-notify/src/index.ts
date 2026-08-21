/**
 * Node half: routes browser notification intents to the desktop shell's
 * native-toast bridge. All event detection stays in the browser half
 * (src/client, built into lib/client.js); in the Wails desktop shell the
 * browser half POSTs {title, body} to {@link TOAST_ROUTE} instead of using
 * the WebView2 default (Edge-styled) notification UI, and this half forwards
 * it to the loopback bridge (MARISA_TOAST_PORT, injected by the shell) which
 * shows a native Windows toast via the Wails notification service. Outside
 * the shell (no MARISA_TOAST_PORT) the route answers 503 and the browser
 * half falls back to `new Notification`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Plugin name (= the config entry id). */
export const name = 'dsh-web-ui-notify'

/** Required services: the host web server (same-origin route). */
export const inject = ['webServer']

/** 同源路由：浏览器半在 Wails 壳内把通知意图 POST 到这里。 */
export const TOAST_ROUTE = '/plugins/dsh-web-ui-approval-notify/toast'

const MAX_BODY_BYTES = 4096

/** 与 dsh-update-check 同款的最小路由注册面（真实 cordis ctx 结构兼容）。 */
export interface ToastRouteContext {
  readonly webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
  effect(disposer: () => void, label?: string): void
}

/** 桌面壳回环桥地址（MARISA_TOAST_PORT 由壳注入）；未设置/非法时返回 null。 */
export function toastEndpoint(env: Record<string, string | undefined> = process.env): string | null {
  const port = env.MARISA_TOAST_PORT
  if (port === undefined || !/^\d{1,5}$/.test(port)) return null
  return `http://127.0.0.1:${port}/toast`
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

interface ToastIntent {
  title: string
  body: string
  sessionId?: string
}

async function readToastIntent(req: IncomingMessage): Promise<ToastIntent> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('request body must be a JSON object')
  }
  const title = (parsed as { title?: unknown }).title
  if (typeof title !== 'string' || title === '') {
    throw new Error('title must be a non-empty string')
  }
  const body = (parsed as { body?: unknown }).body
  const sessionId = (parsed as { sessionId?: unknown }).sessionId
  return {
    title,
    body: typeof body === 'string' ? body : '',
    sessionId: typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined,
  }
}

/** 注册 toast 转发路由。env 参数供测试注入（真实运行默认读进程环境）。 */
export function registerToastRoute(ctx: ToastRouteContext, env: Record<string, string | undefined> = process.env): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TOAST_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { message: 'method not allowed' })
        return
      }
      const endpoint = toastEndpoint(env)
      if (endpoint === null) {
        sendJson(res, 503, { message: 'desktop toast bridge unavailable (MARISA_TOAST_PORT unset)' })
        return
      }
      let intent: ToastIntent
      try {
        intent = await readToastIntent(req)
      } catch (error) {
        sendJson(res, 400, { message: error instanceof Error ? error.message : String(error) })
        return
      }
      try {
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: intent.title, body: intent.body, sessionId: intent.sessionId }),
        })
        if (!upstream.ok) {
          sendJson(res, 502, { message: `toast bridge responded ${upstream.status}` })
          return
        }
        res.writeHead(204)
        res.end()
      } catch (error) {
        sendJson(res, 502, { message: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'web-ui-notify: toast route')
}

/** Host plugin body: mount the toast-forwarding route. */
export function apply(ctx: ToastRouteContext): void {
  registerToastRoute(ctx)
}
