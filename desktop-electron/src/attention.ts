/**
 * Attention escalation — exact port of anywhere dsh-plugin-desktop
 * electron-shell-generation.ts notifyAttention + clearAttention (MIT):
 *
 *  - escalate() is a no-op when the window is focused (caller treats false
 *    as "suppress the whole notification": anywhere early-returns before
 *    counting).
 *  - Windows: taskbar flash via flashFrame(true) — no badge API on Windows.
 *  - macOS/Linux: cumulative Dock badge count.
 *  - clear() on window focus / show / destroy resets flash + badge.
 *
 * Window surface is abstracted so this stays unit-testable headless.
 */

export interface AttentionWindow {
  isFocused(): boolean
  flashFrame(flash: boolean): void
}

export interface AttentionBadge {
  setBadgeCount(count: number): void
}

export class AttentionManager {
  private count = 0

  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly window: AttentionWindow,
    private readonly badge: AttentionBadge,
  ) {}

  get attentionCount(): number {
    return this.count
  }

  /**
   * Raise the attention level for one notification. Returns false when the
   * window is focused (anywhere's isFocused early return) — the caller must
   * suppress the native toast entirely in that case.
   */
  escalate(): boolean {
    if (this.window.isFocused()) return false
    this.count += 1
    if (this.platform === 'win32') this.window.flashFrame(true)
    else this.badge.setBadgeCount(this.count)
    return true
  }

  /** anywhere clearAttention semantics: no-op when already clean. */
  clear(): void {
    if (this.count === 0) return
    this.count = 0
    if (this.platform === 'win32') {
      this.window.flashFrame(false)
    } else {
      this.badge.setBadgeCount(0)
    }
  }
}
