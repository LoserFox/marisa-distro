import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls ui-tool's `tool.call.toolview` slot declaration (DSH 0808+).
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { StickerCommandCard, StickerToolCard } from './StickerCard.tsx'
import { StickerPicker } from './StickerPicker.tsx'
import { en, zh, type StickerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { stickers: StickerKey }
}

export const inject = ['slots', 'conversation', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('stickers', { zh, en }), 'dsh-stickers: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'send_sticker', locale: 'stickers' }, StickerToolCard,
  ))
  ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register(
    { name: 'conversation.chat.commandview', key: 'sticker', locale: 'stickers' }, StickerCommandCard,
  ))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
    { name: 'conversation.input.right', id: 'stickers', order: 30, locale: 'stickers' }, StickerPicker,
  ))
}
