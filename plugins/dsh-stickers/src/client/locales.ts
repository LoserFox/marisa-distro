export const zh = {
  'picker.open': '发表情', 'picker.title': 'DSH 表情', 'picker.close': '关闭', 'card.agent': 'Agent 表情', 'card.user': '你发送的表情',
  'picker.variant': '切换角色', 'picker.variant.blue': '蓝鲸娘', 'picker.variant.black': '黑鲸娘',
} as const
export type StickerKey = keyof typeof zh
export const en: Record<StickerKey, string> = {
  'picker.open': 'Stickers', 'picker.title': 'DSH Stickers', 'picker.close': 'Close', 'card.agent': 'Agent sticker', 'card.user': 'Your sticker',
  'picker.variant': 'Switch character', 'picker.variant.blue': 'Blue Whale', 'picker.variant.black': 'Black Whale',
}
