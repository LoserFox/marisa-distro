/**
 * Pure notification helpers: visibility check, permission gate, and the
 * Notification construction for one pending wait, one completed turn, or one
 * background-session event. Kept side-effect-free (beyond constructing
 * Notification) so the browser-plugin spec can drive them with a stub
 * Notification and a fake visibilityState.
 */
import type { PendingInteraction } from '@deepseek-ai/dsh-client-runtime/client';
import type { NotifyKey } from './locales.ts';
/** Locale translate function shape (the bound `t` from ctx.locale). */
export type Translate = (key: NotifyKey, params?: Record<string, string>) => string;
/** What clicking a notification does: focus the window, then jump to the source conversation. */
export type OpenHandler = () => void;
/**
 * Session-target bundle every notification carries: the session's display
 * label (for the title), the click-to-jump handler (browser path), and — in
 * the desktop shell — the session id carried into the native-toast activation
 * payload so clicking the toast can open the same conversation.
 */
export interface NotifyTarget {
    /** Session display label appended to the title, e.g. "重构数据库 · 需要审批". */
    label: string;
    /** Click-to-jump handler (open the source conversation). */
    onOpen: OpenHandler;
    /** Source session id, forwarded to the native-toast bridge for click-to-open. */
    sessionId?: string;
}
/**
 * Whether the page is currently hidden (the user is on another tab).
 * @returns true when the document visibility state is 'hidden'.
 */
export declare function hiddenNow(): boolean;
/**
 * Whether the page runs inside the Wails desktop shell rather than a plain
 * browser: the shell injects `window._wails` on every document.
 * @returns true when the Wails runtime marker is present.
 */
export declare function desktopShellNow(): boolean;
/**
 * Whether the user is away from this app: the page is hidden, or — in the
 * Wails desktop shell — the window lost focus while staying visible. A plain
 * browser tab keeps `visibilityState` 'visible' when the window is merely
 * unfocused, so the shell check keeps browser behavior unchanged.
 * @returns true when the plugin should raise a notification.
 */
export declare function awayNow(): boolean;
/**
 * Whether the browser supports the Notification API and has granted permission.
 * @returns true when `new Notification` may be constructed.
 */
export declare function notificationUsable(): boolean;
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
export declare function fireNotification(wait: PendingInteraction, t: Translate, target: NotifyTarget): Notification | undefined;
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
export declare function fireTurnNotification(turn: number, summary: string | undefined, t: Translate, target: NotifyTarget): Notification | undefined;
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
export declare function fireSessionDoneNotification(t: Translate, target: NotifyTarget & {
    tag: string;
}): Notification | undefined;
