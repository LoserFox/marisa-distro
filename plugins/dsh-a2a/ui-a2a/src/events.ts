/**
 * Plugin-owned downlink event channel: one WebSocket endpoint on the host
 * webServer (the same HTTP server every official route rides), broadcasting
 * change frames to every connected browser. The channel is private to this
 * plugin — no cross-plugin sharing — and replaces the old per-session watch
 * long-poll: the browser subscribes once and the server pushes on change.
 *
 * @module @dpskh/ui-a2a/events
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'

/**
 * One plugin-owned WebSocket downlink: upgrade handling, connected-client
 * set, broadcast, and teardown. All sockets are tracked and terminated on
 * close; the upgrade route is removed and the server closed on dispose.
 */
export class PluginEvents {
  private readonly wss = new WebSocketServer({ noServer: true })
  private readonly clients = new Set<WebSocket>()
  private readonly removeRoute: () => void
  private closed = false

  /**
   * @param ctx - host context with the webServer service.
   * @param path - absolute upgrade pathname, e.g. `/dpskh-a2a/events`.
   */
  constructor(ctx: Context, path: string) {
    this.removeRoute = ctx.webServer.registerUpgrade({
      path,
      handler: (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
        if (new URL(request.url ?? '/', 'http://localhost').pathname !== path) {
          socket.destroy()
          return
        }
        this.wss.handleUpgrade(request, socket, head, (websocket) => {
          this.clients.add(websocket)
          websocket.on('close', () => { this.clients.delete(websocket) })
          websocket.on('error', () => { this.clients.delete(websocket) })
        })
      },
    })
  }

  /** Push one JSON frame to every connected browser. */
  broadcast(frame: unknown): void {
    if (this.closed) return
    const text = JSON.stringify(frame)
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(text)
    }
  }

  /**
   * Tear down the channel: remove the upgrade route, terminate every socket,
   * close the WebSocket server. Idempotent.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.removeRoute()
    for (const client of this.clients) client.terminate()
    this.clients.clear()
    this.wss.close()
  }
}
