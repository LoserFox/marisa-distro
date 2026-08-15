/**
 * Task-progress plugin, browser half: the resident session-progress strip
 * (input dock). The strip derives live execution state from the conversation
 * snapshot — no model-facing tool required; the report_progress toolview was
 * removed in v0.8.0 (hosts that provide the tool render their own surface).
 * Export discipline: packages/client/AGENTS.md — only the cordis apply
 * surface and contract types leave this package.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the `todos` SessionProjectionMap key merge (single source, the todo domain's pure outlet).
import type {} from '@deepseek-ai/dsh-tool-todo/client'
// Type-only: pulls the SlotMap merge for the slot this plugin registers
// into — 'conversation.input.dock' (declared by ui-conversation's contract).
// Without it the register overload sees no declared slot name.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionProgressBar } from './SessionProgressBar.tsx'
import { en, zh, type ProgressKey } from './locales.ts'

export type { SessionProgressBarProps } from './SessionProgressBar.tsx'
export type { ProgressKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The progress surfaces' copy. */
    progress: ProgressKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'progress'

/**
 * Required services (cordis fiber inject). 'conversation' is an ordering
 * edge for the input-dock registration, not a call dependency: the dock slot
 * is declared by ui-conversation's apply.
 */
export const inject = ['slots', 'conversation', 'locale']

/**
 * Client plugin body: register the `progress` dictionaries and the resident
 * session-progress strip into the input dock.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-progress: dictionaries')

  // Conditional mount: the input dock is declared by the conversation entry;
  // waiting on the conversation service is the registration-safe signal.
  ctx.inject(['slots', 'conversation', 'sessions'], (scope: ClientContext) => {
    scope.effect(
      () => scope.slots.register(
        { name: 'conversation.input.dock', id: 'progress', order: 20, locale: NS },
        SessionProgressBar,
      ),
      'ui-progress: session progress strip',
    )
  })
}
