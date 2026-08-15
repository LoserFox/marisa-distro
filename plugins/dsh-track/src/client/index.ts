/**
 * Track Bridge client plugin — browser half.
 *
 * Visible surfaces:
 * 1. A sidebar entry row ("Track") injected below New Session — the
 *    primary entry point (sidebar slots are single-occupant; DOM injection
 *    is the task-board precedent).
 * 2. A center-column panel (capture wall + pending decisions + issues)
 *    toggled by the entry, fed by the host HTTP API (/api/track/*).
 * 3. A composer-dock strip showing pending counts.
 * @module @fakechris/dsh-track/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-conversation's SlotMap merge (composer.dock list slot).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { TrackStripProps } from './strip-contract.ts'
import { TrackStrip } from './strip.tsx'
import { en, NS, zh, type TrackKey } from './locales.ts'
import { mountRightPanel, openTrackPanel } from './right-panel.ts'

export type { TrackStripProps } from './strip-contract.ts'
export type { TrackKey } from './locales.ts'

/** Required services: slot registration, locale dictionaries, and the
 *  sessions face (the right-panel jump-back links call ctx.sessions.open /
 *  binding — cordis property access requires the service declared). */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: sidebar entry + center panel + composer strip.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  console.log('[dsh-track] client apply called')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-track: dictionaries')

  // ---- right-side panel (lazyfish/side-panel pattern) ----
  // The panel needs the client root context for the "jump back to this
  // conversation" links (ctx.sessions.open / binding) — pass it through.
  const panelDisposer = mountRightPanel(ctx)
  ctx.effect(() => panelDisposer, 'dsh-track: right panel')

  // ---- composer-dock strip (open capture count + panel entry) ----
  // The count is fetched live by TrackStrip itself; the injected props only
  // carry the initial value and the click action (opens the right panel).
  const injectActions = (): TrackStripProps => ({
    captures: 0,
    onClick: openTrackPanel,
  })
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'track',
      order: 20,
      locale: NS,
      inject: injectActions,
    }, TrackStrip))
}
