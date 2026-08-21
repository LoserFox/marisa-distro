/**
 * Pure notification helpers: visibility check, permission gate, and the
 * Notification construction for one pending wait, one completed turn, or one
 * background-session event. Kept side-effect-free (beyond constructing
 * Notification) so the browser-plugin spec can drive them with a stub
 * Notification and a fake visibilityState.
 */
import type { PendingInteraction } from '@deepseek-ai/dsh-client-runtime/client'
import type { NotifyKey } from './locales.ts'

/** Locale translate function shape (the bound `t` from ctx.locale). */
export type Translate = (key: NotifyKey, params?: Record<string, string>) => string

/** What clicking a notification does: focus the window, then jump to the source conversation. */
export type OpenHandler = () => void

/**
 * Session-target bundle every notification carries: the session's display
 * label (for the title), the click-to-jump handler (browser path), and — in
 * the desktop shell — the session id carried into the native-toast activation
 * payload so clicking the toast can open the same conversation.
 */
export interface NotifyTarget {
  /** Session display label appended to the title, e.g. "重构数据库 · 需要审批". */
  label: string
  /** Click-to-jump handler (open the source conversation). */
  onOpen: OpenHandler
  /** Source session id, forwarded to the native-toast bridge for click-to-open. */
  sessionId?: string
}

/**
 * Whether the page is currently hidden (the user is on another tab).
 * @returns true when the document visibility state is 'hidden'.
 */
export function hiddenNow(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

/**
 * Whether the page runs inside the Wails desktop shell rather than a plain
 * browser: the shell injects `window._wails` on every document.
 * @returns true when the Wails runtime marker is present.
 */
export function desktopShellNow(): boolean {
  return typeof window !== 'undefined' && '_wails' in window
}

/** localStorage key persisting the user's notification display style. */
export const STYLE_KEY = 'dsh-web-ui-notify.style'

/** Notification display style: native Windows toast, or the browser default UI. */
export type NotifyStyle = 'native' | 'webview'

/**
 * Read the persisted notification style. Missing or invalid values fall back
 * to 'native' (the desktop shell's preferred path; when the native bridge is
 * unavailable the display falls back to the browser default anyway).
 * @returns the persisted style, defaulting to 'native'.
 */
export function notificationStyle(): NotifyStyle {
  if (typeof localStorage === 'undefined') return 'native'
  return localStorage.getItem(STYLE_KEY) === 'webview' ? 'webview' : 'native'
}

/**
 * Whether the user is away from this app: the page is hidden, or — in the
 * Wails desktop shell — the window lost focus while staying visible. A plain
 * browser tab keeps `visibilityState` 'visible' when the window is merely
 * unfocused, so the shell check keeps browser behavior unchanged.
 * @returns true when the plugin should raise a notification.
 */
export function awayNow(): boolean {
  if (hiddenNow()) return true
  return desktopShellNow() && typeof document !== 'undefined' && !document.hasFocus()
}

/**
 * Whether the browser supports the Notification API and has granted permission.
 * @returns true when `new Notification` may be constructed.
 */
export function notificationUsable(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/**
 * Attach the click-to-jump behavior shared by every notification this plugin
 * builds: raise the window, jump to the source conversation, and dismiss.
 */
function withClickFocus(notification: Notification, onOpen: OpenHandler): Notification {
  notification.onclick = () => {
    window.focus()
    onOpen()
    notification.close()
  }
  return notification
}

/** Compose a notification title: the session label first, then the kind title. */
function titled(kindTitle: string, label: string): string {
  return label === '' ? kindTitle : `${label} · ${kindTitle}`
}

/** 与 host 半边 TOAST_ROUTE 保持同步（双 bundle 无法共享常量）。 */
const TOAST_ROUTE = '/plugins/dsh-web-ui-approval-notify/toast'

/**
 * 把通知意图交给 host 半边的原生 toast 路由（桌面壳经 Wails 通知服务弹
 * Windows 原生 toast）。非 2xx 视为失败。
 * @param title - toast 标题。
 * @param body - toast 正文。
 * @param sessionId - 可选：源会话 id，随激活载荷回传用于点击跳转。
 * @returns 完成即成功；网络错误或非 2xx 以 rejection 呈现。
 */
function fetchNativeToast(title: string, body: string, sessionId: string | undefined): Promise<void> {
  const payload: Record<string, string> = { title, body }
  if (sessionId !== undefined) payload.sessionId = sessionId
  return fetch(TOAST_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) throw new Error(`toast route responded ${response.status}`)
  })
}

/**
 * The one rendering path every notification kind funnels through. In the
 * Wails desktop shell with the 'native' style (the default) the notification
 * is delegated to the host-side native toast bridge (falling back to the
 * WebView2 default UI when the bridge is unavailable); with the 'webview'
 * style — or in a plain browser, which has no native bridge — it uses
 * `new Notification` directly.
 */
function show(title: string, body: string, tag: string, target: NotifyTarget): Notification | undefined {
  if (desktopShellNow() && notificationStyle() === 'native') {
    void fetchNativeToast(title, body, target.sessionId).catch(() => {
      withClickFocus(new Notification(title, { body, tag, requireInteraction: true }), target.onOpen)
    })
    return undefined
  }
  return withClickFocus(new Notification(title, { body, tag, requireInteraction: true }), target.onOpen)
}

/**
 * Build and show the desktop notification for one pending wait. The caller
 * gates on {@link hiddenNow} / {@link notificationUsable} and dedupes by
 * wait key; this function only renders.
 * @param wait - the pending approval or question interaction.
 * @param t - bound locale translate for the plugin namespace.
 * @param target - session label + click-to-jump handler.
 * @returns the constructed Notification in a browser, or undefined when the
 *   desktop-shell native-toast bridge took over the display.
 */
export function fireNotification(wait: PendingInteraction, t: Translate, target: NotifyTarget): Notification | undefined {
  const title = titled(
    wait.kind === 'approval' ? t('notify.approval.title') : t('notify.question.title'),
    target.label,
  )
  const body = wait.kind === 'approval'
    ? (wait.payload.reason ?? t('notify.approval.body', { toolName: wait.payload.toolName }))
    : (() => {
      const first = wait.payload.questions[0]
      return first?.question !== undefined && first.question !== ''
        ? first.question
        : t('notify.question.bodyGeneric')
    })()
  return show(title, body, wait.key, target)
}

/**
 * Build and show the desktop notification for a completed turn. The caller
 * gates on {@link hiddenNow} / {@link notificationUsable} and dedupes by
 * turn; this function only renders.
 * @param turn - the completed turn number.
 * @param summary - optional excerpt of the turn's final assistant text; when
 *   absent (a tool-only turn) the notification falls back to the turn number.
 * @param t - bound locale translate for the plugin namespace.
 * @param target - session label + click-to-jump handler.
 * @returns the constructed Notification in a browser, or undefined when the
 *   desktop-shell native-toast bridge took over the display.
 */
export function fireTurnNotification(
  turn: number,
  summary: string | undefined,
  t: Translate,
  target: NotifyTarget,
): Notification | undefined {
  const body = summary !== undefined && summary !== ''
    ? summary
    : t('notify.turn.body', { turn: String(turn) })
  return show(titled(t('notify.turn.title'), target.label), body, `turn:${turn}`, target)
}

/**
 * Build and show the desktop notification for a whole background session
 * finishing ("done" reminder). The caller gates on {@link hiddenNow} /
 * {@link notificationUsable} and dedupes per session; this function only
 * renders.
 * @param t - bound locale translate for the plugin namespace.
 * @param target - session label + click-to-jump handler + a unique tag so the
 *   browser never replaces one session's notification with another's.
 * @returns the constructed Notification in a browser, or undefined when the
 *   desktop-shell native-toast bridge took over the display.
 */
export function fireSessionDoneNotification(
  t: Translate,
  target: NotifyTarget & { tag: string },
): Notification | undefined {
  return show(titled(t('notify.sessionDone.title'), target.label), t('notify.other.done.body'), target.tag, target)
}
