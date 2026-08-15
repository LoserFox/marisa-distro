/**
 * Command cards for `/side` and `/btw` (browser half). Live child discovery
 * is owned by the always-mounted panel host, not
 * the card: blank sessions deliberately do not render chat rows, and fast
 * commands may settle before a row mounts.
 */

import type { CommandNode, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'

/** Props supplied by the keyed command row. */
export interface SideCommandCardProps {
  node: CommandNode
}

/** Command key → child mode carried by the host's success text marker. */
export type SideCommandKind = 'side' | 'btw'

/**
 * Resolve the created child session id from a settled command node, or
 * undefined while the command is running, failed, or the id is absent.
 * The host pins the id in a stable marker: `/side` texts start with
 * `Side conversation started: <uuid>.`, `/btw` texts with
 * `BTW question started: <uuid>.`.
 */
export function resolveChildSessionId(node: CommandNode, kind: SideCommandKind): SessionId | undefined {
  const text = node.outcome?.kind === 'success' ? node.outcome.text : undefined
  if (text === undefined) return undefined
  const pattern = kind === 'side' ? /Side conversation started: ([0-9a-f-]{36})/ : /BTW question started: ([0-9a-f-]{36})/
  return pattern.exec(text)?.[1] as SessionId | undefined
}

/** Last resolved child id for each observed sidechain command. */
export type ObservedSideCommands = ReadonlyMap<CommandNode['commandId'], SessionId | undefined>

/**
 * Fold one command-node snapshot into the observer state.
 *
 * The first snapshot is a replay baseline and emits nothing. Later snapshots
 * emit a child when a post-mount command appears already settled or an
 * observed pending command settles. The mount timestamp excludes late
 * history hydration; recording the resolved id makes repeats idempotent.
 */
export function observeCreatedChildren(
  previous: ObservedSideCommands | undefined,
  nodes: readonly CommandNode[],
  startedAt: number,
): { known: ObservedSideCommands; children: readonly SessionId[] } {
  const known = new Map(previous)
  const children: SessionId[] = []
  for (const node of nodes) {
    if (node.name !== 'side' && node.name !== 'btw') continue
    const child = resolveChildSessionId(node, node.name)
    if (
      previous !== undefined
      && node.time >= startedAt
      && child !== undefined
      && previous.get(node.commandId) !== child
    ) {
      children.push(child)
    }
    known.set(node.commandId, child)
  }
  return { known, children }
}

/** The command card is presentation only; the panel host owns live discovery. */
export function SideCommandCard({ node }: SideCommandCardProps): JSX.Element {
  const kind: SideCommandKind = node.name === 'btw' ? 'btw' : 'side'
  const outcome = node.outcome
  const label = outcome === null
    ? '…'
    : outcome.kind === 'error'
      ? (outcome.text ?? '')
      : (outcome.text ?? `/${kind}`)
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: '8px',
        background: 'var(--ds-color-surface-2, #f2f3f5)',
        fontSize: '13px',
        lineHeight: '1.5',
      }}
    >
      <strong style={{ whiteSpace: 'nowrap', display: 'block', marginBottom: '2px' }}>/{node.name ?? kind}</strong>
      {/* The /btw answer and /side notice render as markdown (tables, code, lists). */}
      <div style={{ overflowX: 'auto' }}>
        <MarkdownText text={label} streaming={false} />
      </div>
    </div>
  )
}
