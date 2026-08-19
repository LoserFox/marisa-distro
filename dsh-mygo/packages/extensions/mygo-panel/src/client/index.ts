/**
 * dsh-mygo-panel browser half — a dsh web Settings section that lists and
 * manages mygo-managed plugins. All data crosses the /api/mygo JSON API.
 *
 * 插件配置合并（r7.1）：受管插件在 settings.plugin.item（默认插件配置区）
 * 逐张渲染配置卡片（mygo 小标 + 核心 API 读写），取代原先的聚合卡片；
 * 卡片集合随 config-cards 轮询差异注册/注销。
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Panel } from './Panel'
import { MygoPluginConfigCard, type MygoPluginCardSeed } from './PluginConfigCard'
import { applyLiveRailHmr } from './live-rail'

/**
 * settings.plugin.item 槽契约镜像（与官方 dsh-client-ui-settings-plugins
 * slot-contract 同形状：kind list / scope root / owner 空）。面板暂不引入
 * 该包为 devDep（其 peer 闭包含未公开发布的内部包，pnpm 解析会撞 404）；
 * 解析墙解除后改回官方类型导入。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugin.item': {
      readonly kind: 'keyed'
      readonly scope: 'root'
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      readonly owner: Record<string, never>
    }
  }
}

export const inject = ['slots']

/** mygo 卡片排在官方 feature 卡片（bash/agent-loop/web-search）之后。 */
const MYGO_CARD_ORDER = 70
/** config-cards 轮询间隔：覆盖面板安装/卸载后的卡片集合变化。 */
const MYGO_CARD_POLL_MS = 8000

interface CardsResult {
  readonly ok: boolean
  readonly cards?: readonly MygoPluginCardSeed[]
}

export function apply(ctx: ClientContext): void {
  // rc8：live rail 页内图变更通道（loader/modules 不可达时内部降级不订阅）。
  applyLiveRailHmr(ctx)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mygo-plugins',
    order: 70,
    label: () => 'My 插件',
    inject: () => ({}),
  }, Panel))
  // r7.1：受管插件逐张卡片直接进默认插件配置区（mygo 小标；读写统一走
  // mygo 核心方法）。轮询 config-cards 维护集合：新增注册、消失注销；
  // 注入回调返回组合 disposer，随声明生命周期/插件卸载整体拆除。
  ctx.slots.inject('settings.plugin.item', () => {
    const disposers = new Map<string, () => void>()
    let timer: ReturnType<typeof setInterval> | undefined
    let closed = false
    let inFlight = false
    const sync = async (): Promise<void> => {
      if (closed || inFlight) return
      inFlight = true
      try {
        const res = await fetch('/api/mygo/config-cards')
        const data = (await res.json()) as CardsResult
        const cards = data.cards ?? []
        const seen = new Set<string>()
        for (const card of cards) {
          const entryId = 'mygo-config-' + card.id
          seen.add(entryId)
          if (disposers.has(entryId)) continue
          const dispose = ctx.slots.register({
            name: 'settings.plugin.item',
            key: entryId,          }, () => createElement(MygoPluginConfigCard, { seed: card }))
          disposers.set(entryId, dispose)
        }
        for (const [entryId, dispose] of disposers) {
          if (!seen.has(entryId)) {
            dispose()
            disposers.delete(entryId)
          }
        }
      } catch {
        // 服务端暂不可达：下个轮询周期重试
      } finally {
        inFlight = false
      }
    }
    void sync()
    timer = setInterval(() => { void sync() }, MYGO_CARD_POLL_MS)
    return () => {
      closed = true
      if (timer !== undefined) clearInterval(timer)
      for (const dispose of disposers.values()) dispose()
      disposers.clear()
    }
  })
}
