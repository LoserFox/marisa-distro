/**
 * Suggested replies browser plugin.
 *
 * The candidate row registers in `conversation.input.dock`, the official
 * stacked strip rendered immediately above the message input. Clicking a
 * candidate only calls `inputActions.setDraft`; submission remains the user's
 * explicit action in the composer.
 *
 * @module @dsh-external/dsh-suggested-replies/client
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SuggestedRepliesSection, type SuggestedRepliesSectionInjected } from './SuggestedRepliesSection.tsx'
import { SuggestionBubbles, type SuggestionBubblesInjected } from './SuggestionBubbles.tsx'
import { en, NS, zh, type SuggestedRepliesKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy used by the suggested replies dock and settings section. */
    'suggested-replies': SuggestedRepliesKey
  }
}

/** Required client services: slots, locale registration, and settings RPC transport. */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the input-dock candidate row and the settings master switch.
 * @param ctx - browser client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-suggested-replies: dictionaries')
  const connection = ctx.connection as unknown as ConnectionHandle
  const bubblesInjected = (): SuggestionBubblesInjected => ({ rpc: connection.rpc })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'suggested-replies',
    order: 15,
    locale: NS,
    inject: bubblesInjected,
  }, SuggestionBubbles))

  const settingsInjected = (): SuggestedRepliesSectionInjected => ({ rpc: connection.rpc })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'suggested-replies',
    order: 70,
    label: () => ctx.locale.bind(NS)('settings.nav'),
    locale: NS,
    inject: settingsInjected,
  }, SuggestedRepliesSection))
}
