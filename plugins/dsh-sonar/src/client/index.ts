import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import React from 'react'
import { ViewController } from './controller.ts'
import { ViewPanel } from './ViewPanel.tsx'
import { ViewSettingsCard } from './ViewSettingsCard.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': {
      kind: 'list'
      scope: 'root'
      owner: { children?: never }
    }
  }
}

export const ID = 'dsh-sonar'
export const inject = ['slots', 'connection']

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const controller = new ViewController(connection)
  ctx.effect(() => {
    void controller.load()
    return () => controller.dispose()
  }, 'dsh-sonar: View controller')

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'sonar-view',
      order: 25,
      label: () => '◇ View',
    }, props => React.createElement(ViewPanel, { ...props, controller })),
  )
  ctx.slots.inject('settings.plugin.item', () =>
    ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'dsh-sonar',
      order: 30,
    }, () => React.createElement(ViewSettingsCard, { controller })),
  )
}
