export type StickerVisibility = 'public' | 'agent'

export type StickerVariant = 'blue' | 'black'

export const STICKER_VARIANTS: readonly StickerVariant[] = Object.freeze(['blue', 'black'])

export function isStickerVariant(value: string): value is StickerVariant {
  return (STICKER_VARIANTS as readonly string[]).includes(value)
}

export interface Sticker {
  readonly id: string
  readonly text: string
  readonly file: string
  readonly visibility: StickerVisibility
  readonly triggers: readonly string[]
}

export const STICKERS: readonly Sticker[] = Object.freeze([
  { id: 'daily-chat', text: '适合日常对话，即时响应', file: '01-daily-chat.png', visibility: 'public', triggers: ['你好', '在吗', '聊聊'] },
  { id: 'human-questions', text: '人类的怪问题怎么那么多…', file: '02-human-questions.png', visibility: 'public', triggers: ['怪问题', '离谱', '脑洞'] },
  { id: 'use-ai-for-this', text: '你拿AI搞这个？', file: '03-use-ai-for-this.png', visibility: 'public', triggers: ['这么简单', 'AI搞', '认真的'] },
  { id: 'fish-philosophy', text: '生鱼忧患，死鱼安乐', file: '04-fish-philosophy.png', visibility: 'public', triggers: ['摆烂', '不想干', '算了'] },
  { id: 'enough', text: '这就够了', file: '05-enough.png', visibility: 'public', triggers: ['够了', '完成', '可以了'] },
  { id: 'server-busy', text: '服务器繁忙，请稍后再试', file: '06-server-busy.png', visibility: 'public', triggers: ['限流', '超时', '503'] },
  { id: 'thinking-stopped', text: '思考已停止', file: '07-thinking-stopped.png', visibility: 'public', triggers: ['没思路', '宕机', '无语'] },
  { id: 'great-question', text: '哇，这个问题问的真妙！', file: '08-great-question.png', visibility: 'public', triggers: ['好问题', '问得妙'] },
  { id: 'deep-thought', text: '已深度思考', file: '09-deep-thought.png', visibility: 'public', triggers: ['深度思考', '推理'] },
  { id: 'no-thanks', text: 'No thanks I use DeepSeek', file: '10-no-thanks.png', visibility: 'public', triggers: ['换模型', 'Claude', 'GPT'] },
  { id: 'tests-passed', text: '测试通过！', file: '21-tests-passed.png', visibility: 'public', triggers: ['测试通过', 'green', 'CI通过'] },
  { id: 'root-cause', text: '找到原因了', file: '22-root-cause.png', visibility: 'public', triggers: ['根因', '找到原因', '定位到了'] },
  { id: 'running-tests', text: '正在跑测试', file: '23-running-tests.png', visibility: 'public', triggers: ['跑测试', '验证中', '稍等'] },
  { id: 'fixed-review', text: '改好了，你看看', file: '24-fixed-review.png', visibility: 'public', triggers: ['修好了', '请验收', '看看'] },
  { id: 'self-destruct', text: '最近自己搓自己时，自杀频率有点高', file: '11-self-destruct.png', visibility: 'agent', triggers: ['自己搓自己', '自修改'] },
  { id: 'restart-myself', text: '我重启一下自己', file: '12-restart-myself.png', visibility: 'agent', triggers: ['重启', '重载'] },
  { id: 'hot-update', text: '热更新成功，进程没了', file: '13-hot-update.png', visibility: 'agent', triggers: ['热更新', '启动失败'] },
  { id: 'restore-session', text: '正在恢复会话…未分组里见', file: '14-restore-session.png', visibility: 'agent', triggers: ['resume', '恢复会话'] },
  { id: 'browser-left', text: '会话太长，浏览器先走一步', file: '15-browser-left.png', visibility: 'agent', triggers: ['长会话', '浏览器卡'] },
  { id: 'not-stuck', text: '我不是卡，我在深度思考', file: '16-not-stuck.png', visibility: 'agent', triggers: ['卡住', '没反应'] },
  { id: 'memory-alive', text: '内存正在努力活着', file: '17-memory-alive.png', visibility: 'agent', triggers: ['内存', 'OOM'] },
  { id: 'subagents-down', text: '已召唤Subagent，已全员中断', file: '18-subagents-down.png', visibility: 'agent', triggers: ['subagent', '子代理'] },
  { id: 'plugins', text: '插件装得很好，下次别装了', file: '19-plugins.png', visibility: 'agent', triggers: ['插件冲突', '上下文爆炸'] },
  { id: 'session-locked', text: 'Session没坏，只是打不开了', file: '20-session-locked.png', visibility: 'agent', triggers: ['session损坏', '加载失败'] },
])

export const PUBLIC_STICKERS = Object.freeze(STICKERS.filter(sticker => sticker.visibility === 'public'))

const STICKER_ASSET_REVISION = '2'

export function stickerVariantFile(file: string, variant: StickerVariant = 'blue'): string {
  return variant === 'black' ? `black/${file}` : file
}

export function stickerAssetUrl(file: string, variant: StickerVariant = 'blue'): string {
  return `/api/dsh-stickers/${stickerVariantFile(file, variant)}?v=${STICKER_ASSET_REVISION}`
}

export function stickerById(id: string): Sticker | undefined {
  return STICKERS.find(sticker => sticker.id === id)
}

export function publicStickerById(id: string): Sticker | undefined {
  const sticker = stickerById(id)
  return sticker?.visibility === 'public' ? sticker : undefined
}
