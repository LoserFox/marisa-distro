import type { CommandRowProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { isStickerVariant, stickerAssetUrl, stickerById, type StickerVariant } from '../shared/catalog.ts'
import css from './StickerCard.module.css'

interface ParsedArgs { id: string | undefined; variant: StickerVariant }

function parseArgs(raw: string | null | undefined): ParsedArgs {
  if (raw === null || raw === undefined) return { id: undefined, variant: 'blue' }
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; variant?: unknown }
    const variant = String(parsed.variant ?? 'blue')
    return { id: String(parsed.id ?? ''), variant: isStickerVariant(variant) ? variant : 'blue' }
  } catch {
    const [id, variant = 'blue'] = raw.trim().split(/\s+/u)
    return { id, variant: isStickerVariant(variant) ? variant : 'blue' }
  }
}

function Card({ args, label, sender }: { args: ParsedArgs; label: string; sender: 'agent' | 'user' }) {
  const sticker = stickerById(args.id ?? '')
  if (sticker === undefined) return null
  return <figure className={`${css.card} ${sender === 'user' ? css.user : ''}`} data-sticker-id={sticker.id} data-sticker-variant={args.variant} data-sticker-sender={sender}><span>{label}</span><img src={stickerAssetUrl(sticker.file, args.variant)} alt={sticker.text} /></figure>
}

type ToolProps = ToolCallViewProps & PropsLocale<'stickers'>
export function StickerToolCard({ block, t }: ToolProps) {
  // `block` is a ToolCallBlock: a settled ToolResultNode (kind: 'tool-result',
  // args on the backfilled call head) or a frozen RunningToolCall (argsRaw inline).
  return <Card args={parseArgs(('kind' in block ? block.call?.argsRaw : block.argsRaw) ?? '')} label={t('card.agent')} sender="agent" />
}

type CommandProps = CommandRowProps & PropsLocale<'stickers'>
export function StickerCommandCard({ node, t }: CommandProps) {
  return <Card args={parseArgs(node.args)} label={t('card.user')} sender="user" />
}
