/** Browser A2A plugin: shared directory, collaboration tab, badge, and panel. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { A2aView, type A2aViewInjected } from './A2aView.tsx'
import { A2aBadge } from './A2aBadge.tsx'
import { A2aPanel } from './A2aPanel.tsx'
import { createA2aComposerStore } from './stores.ts'
import { A2aDirectoryService } from './service.ts'
import { en, zh, type A2aViewKey } from './locales.ts'

const NS = 'a2a' as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** A2A collaboration copy. */
    a2a: A2aViewKey
  }
}

/** Required client services. */
export const inject = ['slots', 'connection', 'locale', 'sessions']

/**
 * Register the A2A browser surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-a2a: dictionaries')
  ctx.plugin(A2aDirectoryService)
  const composerStore = createA2aComposerStore()
  const face = (sessionId: SessionId): A2aViewInjected => ({
    directory: (ctx.get('a2aDirectory') as A2aDirectoryService).directoryFor(sessionId),
  })
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'a2a', order: 20, label: 'A2A', locale: NS, inject: face,
  }, A2aView))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'a2a-identity', order: 10, locale: NS, store: composerStore, inject: face,
  }, A2aBadge))
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'a2a-identity-panel', order: 10, locale: NS, store: composerStore, inject: face,
  }, A2aPanel))
}
