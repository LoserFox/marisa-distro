// AssistantMarkdown: renders assistant blocks in order — markdown text body,
// reasoning as the figma Think summary row (expand = indented gray text),
// other-block JSON fallback. Tool-call heads are NOT rendered here: the chat
// view groups them into tool rows through its keyed toolview slot (figma
// step-summary flow). Shared by finalized nodes and the streaming partial;
// the turn-level loading dots live in the chat view's tail, not here.
// Finalized content (text) nodes append IconActions once their turn ends
// (`time` is omitted for mid-turn narration and while the turn still runs);
// their branch action is enabled only when the node is also the completed
// turn's transcript tail. Think / tool-head-only nodes stay chrome-free.

import { memo, useMemo } from 'react'
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps, TurnTailOwnerProps } from '../contract/slots.ts'
import { hasContentText } from './chat-flow.ts'
import { MessageIconActions } from './MessageIconActions.tsx'
import { ReasoningRow } from './ReasoningRow.tsx'
import css from './AssistantMarkdown.module.css'

export interface AssistantMarkdownProps {
  blocks: readonly AssistantBlock[]
  streaming: boolean
  /** Frozen partial of an aborted turn: rendered with a stopped marker. */
  interrupted?: boolean | undefined
  /** Unix epoch ms for the IconActions clock; omitted while streaming or when
   *  the parent withholds chrome (mid-turn content assistants and every node
   *  of a turn that has not ended). */
  time?: number | undefined
  /** Turn wall time in ms for the IconActions run-time label; omitted when the
   *  turn's triggering input is outside the loaded window. */
  runMs?: number | undefined
  /** Turn first-step TTFT in ms for the IconActions label; omitted when unrecorded. */
  ttftMs?: number | undefined
  /** Turn decode throughput for the IconActions label; omitted when unrecorded. */
  tokensPerSecond?: number | undefined
  /** Event sequence used as the fork boundary; omitted while streaming. */
  seq?: number | undefined
  /** Fork the session through this finalized message's completed turn when eligible. */
  onFork?: ((seq: number) => void) | undefined
  /** Turn-tail slot dispatch share and owner currency; omitted for a mid-turn assistant. */
  turnTail?: (Pick<PropsRenderSlots<'conversation.chat.turnTail'>, 'renderSlotChain'> & { owner: TurnTailOwnerProps }) | undefined
  /** The message is not the transcript tail of a completed turn. */
  forkUnavailable?: boolean | undefined
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}

/** Joined text blocks for the copy action (reasoning / tool heads stay out). */
function copyText(blocks: readonly AssistantBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.kind === 'text') parts.push(block.text)
  }
  return parts.join('')
}

/** Reasoning block as the Think variant summary row (figma 39:28304). */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  blocks, streaming, interrupted, time, runMs, ttftMs, tokensPerSecond, seq, onFork, forkUnavailable, turnTail, t,
}: AssistantMarkdownProps) {
  // Stable per locale revision (t identity changes on switch): a fresh object
  // per render would rebuild MarkdownText's component table every chunk.
  const codeLabels = useMemo(() => ({ copyLabel: t('copy'), copiedLabel: t('copied') }), [t])
  const last = blocks.length - 1
  // Tool-call heads render as tool rows in the chat view's grouping pass, so
  // a node that is only those heads (or empty) would paint an empty root
  // between tool groups — skip the shell unless something visible remains.
  const hasVisible = streaming
    || interrupted === true
    || blocks.some(block => block.kind !== 'tool-call')
  if (!hasVisible) return null
  // Footer only under settled content text; Think-only / streaming omit it.
  const showActions = !streaming && time !== undefined && hasContentText(blocks)
  return (
    <div className={css.root} data-streaming={streaming || undefined} data-time-hover-root>
      <div className={css.body}>
        {blocks.map((block, i) => {
          switch (block.kind) {
            case 'text': return (
              <MarkdownText key={i} text={block.text} streaming={streaming} codeLabels={codeLabels} />
            )
            case 'reasoning': return <ReasoningRow key={i} text={block.text} running={streaming && i === last} t={t} />
            // Grouped into tool rows by ChatView; hasVisible above skips an empty shell.
            case 'tool-call': return null
            default: return (
              <JsonBlock
                key={i}
                label={t('message.unknownBlock')}
                payload={block.block}
                truncatedLabel={total => t('json.truncated', { total })}
              />
            )
          }
        })}
        {interrupted && <span className={css.stopped}>{t('message.stopped')}</span>}
      </div>
      {showActions && turnTail?.renderSlotChain('conversation.chat.turnTail', turnTail.owner)}
      {showActions && (
        <MessageIconActions
          text={copyText(blocks)}
          time={time}
          runMs={runMs}
          ttftMs={ttftMs}
          tokensPerSecond={tokensPerSecond}
          clock="end"
          onBranch={onFork === undefined || seq === undefined ? undefined : () => { onFork(seq) }}
          branchUnavailable={forkUnavailable}
          className={css.actions}
          t={t}
        />
      )}
    </div>
  )
})
