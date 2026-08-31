/**
 * Native toast bridge — marisa adaptation of two anywhere pieces:
 *  - notifications.ts decision table (MIT): four switches over turn/job
 *    completion & failure, subagent turns excluded, user-initiated turns
 *    tracked via user/message.
 *  - electron-runtime.ts showNotification: Electron native Notification with
 *    click-to-focus (anywhere's exact pattern).
 *
 * The decision logic runs in the BACKEND (harness process) via the existing
 * dsh-web-ui-notify plugin family; the shell receives finished notification
 * intents over the loopback MARISA_TOAST_PORT HTTP contract that the Wails
 * shell already established (desktop/toast_bridge.go). The four switches are
 * enforced shell-side too, so settings apply even for backends that prefilter
 * differently.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { DesktopNotificationSettings } from './desktop-settings.ts'

export interface ToastIntent {
  title: string
  body: string
  sessionId?: string
  /** Explicit outcome from the backend when it classifies (preferred over title heuristics). */
  outcome?: NotificationOutcome
}

export interface ToastSender {
  show(notification: { title: string; body: string }): void
  /** Report whether native notifications are supported at all. */
  isSupported(): boolean
}

/** Outcome classification shared by backend and shell (notifications.ts). */
export type NotificationOutcome = 'turn-completed' | 'turn-failed' | 'job-completed' | 'job-failed'

/**
 * Shell-side switch filter: the backend already decided turn/job semantics;
 * the shell enforces the user's four switches by matching the intent title
 * against the same outcome families. Returns null when filtered out.
 */
export function filterToastIntent(
  intent: ToastIntent,
  settings: DesktopNotificationSettings,
  outcomeOf: (intent: ToastIntent) => NotificationOutcome | null,
): ToastIntent | null {
  if (!settings.enabled) return null
  const outcome = outcomeOf(intent)
  if (outcome === null) return intent // not an outcome-family toast: pass through
  switch (outcome) {
    case 'turn-completed': return settings.notifyOnTurnCompletion ? intent : null
    case 'turn-failed': return settings.notifyOnTurnFailure ? intent : null
    case 'job-completed': return settings.notifyOnJobCompletion ? intent : null
    case 'job-failed': return settings.notifyOnJobFailure ? intent : null
  }
}

export interface ToastBridgeHandle {
  port: number
  close: () => void
}

/**
 * Loopback receiver for backend notification intents (toast_bridge.go
 * protocol: POST /toast {title, body, sessionId?, outcome?};
 * MARISA_TOAST_PORT env). Binds 127.0.0.1 with an OS-assigned port; the
 * token is the port itself plus loopback-only binding — same threat model
 * as the Wails shell's bridge.
 *
 * anywhere suppression order (notifyAttention): focused window ⇒ suppress
 * the toast entirely (no count, no flash); otherwise escalate attention
 * (Windows flash / badge count) AND show the native toast.
 */
export function startToastBridge(
  sender: ToastSender,
  settings: () => DesktopNotificationSettings,
  outcomeOf: (intent: ToastIntent) => NotificationOutcome | null,
  log: (message: string) => void,
  attention?: { escalate(): boolean },
): Promise<ToastBridgeHandle> {
  return new Promise(resolvePromise => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method !== 'POST' || url.pathname !== '/toast') {
        res.statusCode = 404
        res.end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Partial<ToastIntent>
          if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
            res.statusCode = 400
            res.end()
            return
          }
          const outcome = typeof parsed.outcome === 'string'
            && (['turn-completed', 'turn-failed', 'job-completed', 'job-failed'] as const).includes(parsed.outcome as NotificationOutcome)
            ? parsed.outcome as NotificationOutcome
            : undefined
          const intent: ToastIntent = {
            title: parsed.title,
            body: parsed.body,
            ...(typeof parsed.sessionId === 'string' ? { sessionId: parsed.sessionId } : {}),
            ...(outcome !== undefined ? { outcome } : {}),
          }
          const allowed = filterToastIntent(intent, settings(), i => i.outcome ?? outcomeOf(i))
          if (allowed !== null && sender.isSupported()) {
            // anywhere's isFocused early return: window focused → no toast.
            if (attention === undefined || attention.escalate()) {
              sender.show({ title: allowed.title, body: allowed.body })
            }
          }
          res.statusCode = allowed !== null ? 200 : 204
          res.end()
        } catch (cause) {
          log(`toast bridge: ${cause instanceof Error ? cause.message : String(cause)}`)
          res.statusCode = 400
          res.end()
        }
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        rejectFatal(new Error('toast bridge listen failed'))
        return
      }
      resolvePromise({ port: addr.port, close: () => server.close() })
    })
    function rejectFatal(err: Error): void {
      log(`toast bridge: ${err.message}`)
      resolvePromise({ port: 0, close: () => server.close() })
    }
  })
}
