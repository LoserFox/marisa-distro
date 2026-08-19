/**
 * dsh-update-check browser half: the startup banner (plain DOM, top-fixed)
 * and the settings card (settings.plugin.item, keyed by the host's
 * 'update-check' settings namespace — the card only renders when the host
 * serves that namespace).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotMap merge for the keyed settings card slot
// ('settings.plugin.item', declared by ui-settings-plugins' contract).
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import React from 'react'
import { mountUpdateBanner } from './banner.ts'
import { UpdateCheckCard } from './card.tsx'
import { en, zh, type UpdateCheckKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The update-check surfaces' copy. */
    'update-check': UpdateCheckKey
  }
}

/** 字典命名空间（与 host 的 settings namespace 同名同 key）。 */
const NS = 'update-check'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'update-check: dictionaries')

  // 设置卡片：key 与 host 注册的 settings namespace 一致，host 未服务该
  // namespace 时（settings 服务缺失）整个 tab 不渲染该 key，卡片自然消失。
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      key: NS,
      priority: 60,
      locale: NS,
    }, UpdateCheckCard),
  )

  ctx.effect(() => mountUpdateBanner(ctx).dispose, 'update-check: startup banner')
}
