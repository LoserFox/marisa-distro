import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { locate } from './locator.ts'
import { FILE_DROP_ROUTE, type LocateRequest, type LocateResponse } from './protocol.ts'

export const inject = ['webServer']

export const MAX_BODY_BYTES = 4 * 1024 * 1024

async function readJson(req: IncomingMessage): Promise<LocateRequest> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as LocateRequest
}

function sendJson(res: ServerResponse, status: number, body: LocateResponse): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: FILE_DROP_ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { status: 'error', message: 'method not allowed' })
        return
      }
      try {
        sendJson(res, 200, await locate(await readJson(req)))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sendJson(res, 400, { status: 'error', message })
      }
    },
  }), 'file-drop: locator route')
}
