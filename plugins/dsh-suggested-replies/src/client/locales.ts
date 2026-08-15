/**
 * Locale dictionaries for the suggested-replies Web surface.
 *
 * @module @dsh-external/dsh-suggested-replies/client/locales
 */

/** Keys used by the input dock and settings section. */
export type SuggestedRepliesKey =
  | 'title'
  | 'hint'
  | 'loading'
  | 'settings.nav'
  | 'settings.enabled.label'
  | 'settings.enabled.description'
  | 'settings.disabled.note'

/** Locale namespace registered by the client plugin. */
export const NS = 'suggested-replies'

/** English copy. */
export const en: Record<SuggestedRepliesKey, string> = {
  title: 'Suggested next messages',
  hint: 'Click to fill the message box',
  loading: 'Preparing next-message suggestions...',
  'settings.nav': 'Suggested replies',
  'settings.enabled.label': 'Enable suggested replies',
  'settings.enabled.description': 'Generate candidate next messages after an AI reply. Clicking a candidate only fills the draft; it never sends automatically.',
  'settings.disabled.note': 'Disabled. Completed turns do not make auxiliary suggestion calls until you enable it again.',
}

/** Simplified Chinese copy. */
export const zh: Record<SuggestedRepliesKey, string> = {
  title: '下一步建议',
  hint: '点击填入输入框',
  loading: '正在生成下一步建议...',
  'settings.nav': '下一步建议',
  'settings.enabled.label': '启用下一步建议',
  'settings.enabled.description': 'AI 回复结束后生成可直接作为下一条消息发送的候选。点击候选只会填入输入框，绝不会自动发送。',
  'settings.disabled.note': '已关闭。后续完成的对话轮次不会再发起候选生成，重新启用后恢复。',
}
