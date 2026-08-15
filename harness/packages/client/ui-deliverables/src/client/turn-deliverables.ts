/**
 * Pure derivation of one turn's produced files from finalized snapshot
 * nodes. Client-only and model-free: the vocabulary is the mutation tools'
 * own follow-along `locations`, never the closing prose.
 */
import type { ConversationNode, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Paths a call view reports having created or changed, by render intent rather
 * than tool name: a diff card, or a generic card whose kind is `edit` (the
 * shape `str_replace_editor`'s insert presents). Every other card produces
 * nothing to open — a read looked, a delete removed, a terminal ran.
 */
function producedPaths(view: ToolResultNode['callView']): readonly string[] {
  if (view === null) return []
  if (view.card === 'diff') return (view.locations ?? []).map(location => location.path)
  if (view.card === 'generic' && view.kind === 'edit') {
    return (view.locations ?? []).map(location => location.path)
  }
  return []
}

/**
 * Files produced by the turn the assistant at `seq` closes — the anchor the
 * render site elects, so the row lands under the message that reports the
 * work rather than after some mid-turn narration.
 *
 * The source is the mutation tools' own follow-along `locations`, not the
 * closing prose: a produced file must be listed whether or not the model
 * remembered to name it. A mutation is recognized by render intent, not by
 * tool name — a diff card, or a generic card whose `kind` is `edit` (the shape
 * `str_replace_editor`'s insert presents) — so a new mutation tool joins by
 * declaring what it does. Reads contribute nothing (looking at a file does not
 * produce it), and neither do deletes (there is nothing left to open) or
 * failed calls. Paths keep first-seen order and appear once, so a file written
 * and then edited in the same turn is one entry.
 *
 * Accumulation resets on the turn boundary — a user message, or a node
 * reporting a different turn number — so a turn that mutates files and then
 * ends without content text cannot spill its paths into the next turn's row,
 * nor leave the dedup set suppressing a file the next turn legitimately
 * rewrites. Tool results carry no turn of their own; the boundary is read off
 * the nodes that do, and a user message resets the tracked turn to undefined
 * because the next node to report one is stating the current turn, not
 * entering a new one.
 * @param nodes - snapshot nodes (surface order).
 * @param seq - the closing assistant's seq (the render site's anchor).
 * @returns Produced paths in first-seen order; empty when the turn wrote nothing.
 */
export function producedForClosing(nodes: readonly ConversationNode[], seq: number): readonly string[] {
  let pending: string[] = []
  let seen = new Set<string>()
  let turn: number | undefined
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.isError) continue
      for (const path of producedPaths(node.callView)) {
        if (seen.has(path)) { continue }
        seen.add(path)
        pending.push(path)
      }
      continue
    }
    if (node.kind === 'user') {
      turn = undefined
      pending = []
      seen = new Set()
    } else if ('turn' in node) {
      if (turn !== undefined && node.turn !== turn) {
        pending = []
        seen = new Set()
      }
      turn = node.turn
    }
    if (node.kind === 'assistant' && node.seq === seq) return pending
  }
  return []
}

/**
 * Claim the turn-tail chain only when its closing turn produced files.
 * @param owner - Turn-tail owner currency for the closing assistant.
 * @returns Produced paths as the component's match, or null to decline before mount.
 */
export function selectProducedFiles(owner: TurnTailOwnerProps): readonly string[] | null {
  const { nodes, seq } = owner
  const paths = producedForClosing(nodes, seq)
  return paths.length === 0 ? null : paths
}
