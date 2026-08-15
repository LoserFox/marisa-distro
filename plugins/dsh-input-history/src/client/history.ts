/**
 * Pure input-history logic: history extraction from conversation nodes and
 * the Ctrl+Up/Ctrl+Down browse state machine. No DOM, no cordis — the whole
 * module is unit-testable without a runtime.
 */
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * The browse state for one session.
 * `index` indexes the extracted history array directly: `null` means "live"
 * (the composer shows the user's own draft, not a recalled entry); otherwise
 * it points at the entry currently shown (largest = newest).
 */
export interface HistoryBrowse {
  /** History index currently shown; null = live (not browsing). */
  readonly index: number | null
  /** Draft captured when browsing started; restored when returning to live. */
  readonly savedDraft: string
}

/** The resting state: not browsing, nothing saved. */
export const IDLE: HistoryBrowse = { index: null, savedDraft: '' }

/**
 * Extract the plain-text of one user message: concatenated `text` blocks.
 * The blocks are treated structurally (any array works) so the module never
 * needs the LLM ContentBlock type — a cross-package dependency.
 * @param blocks - the message content blocks.
 * @returns the concatenated text, untrimmed.
 */
export function textOf(blocks: readonly unknown[]): string {
  let text = ''
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const record = block as { readonly type?: unknown; readonly text?: unknown }
    if (record.type !== 'text' || typeof record.text !== 'string') continue
    text += record.text
  }
  return text
}

/**
 * Build the recallable history for one session: every non-blank user
 * message, newest last, with adjacent duplicates collapsed (rapid re-sends
 * of the same text must not produce repeated recall entries).
 * @param nodes - the conversation snapshot nodes.
 * @returns history in chronological order; recall walks it backwards.
 */
export function extractHistory(nodes: readonly ConversationNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'user') continue
    const trimmed = textOf(node.content).trim()
    if (trimmed === '') continue
    const last = out[out.length - 1]
    if (last !== undefined && last === trimmed) continue
    out.push(trimmed)
  }
  return out
}

/** The result of one browse step. */
export interface BrowseStep {
  /** The next browse state (always returned; equal to the input when nothing changed). */
  readonly browse: HistoryBrowse
  /** Text to fill into the composer; null = no change (no history / already at the oldest entry). */
  readonly text: string | null
}

/**
 * Ctrl+Up: enter history recall or move one entry older.
 * First press saves the current draft (the live state) and shows the newest
 * entry; subsequent presses walk older toward index 0.
 * @param history - extracted history (chronological).
 * @param draft - the composer draft at press time.
 * @param browse - current browse state.
 * @returns the next state and the text to fill.
 */
export function up(history: readonly string[], draft: string, browse: HistoryBrowse): BrowseStep {
  if (history.length === 0) return { browse, text: null }
  if (browse.index === null) {
    const nextIndex = history.length - 1
    const next: HistoryBrowse = { index: nextIndex, savedDraft: draft }
    return { browse: next, text: history[nextIndex] ?? null }
  }
  if (browse.index === 0) return { browse, text: null }
  const nextIndex = browse.index - 1
  const next: HistoryBrowse = { ...browse, index: nextIndex }
  return { browse: next, text: history[nextIndex] ?? null }
}

/**
 * Ctrl+Down: move one entry newer, or return to live.
 * At the newest entry another press returns to live, restoring the draft
 * saved on the first Ctrl+Up (the empty draft restores as empty).
 * @param history - extracted history (chronological).
 * @param browse - current browse state.
 * @returns the next state and the text to fill (null while already live).
 */
export function down(history: readonly string[], browse: HistoryBrowse): BrowseStep {
  if (browse.index === null) return { browse, text: null }
  if (browse.index === history.length - 1) {
    return { browse: IDLE, text: browse.savedDraft }
  }
  const nextIndex = browse.index + 1
  const next: HistoryBrowse = { ...browse, index: nextIndex }
  return { browse: next, text: history[nextIndex] ?? null }
}

/**
 * Re-sync after the composer changed without our keyboard path (typing,
 * paste, a send clearing the draft, a new message arriving): any draft that
 * no longer equals the shown history entry drops the browse state, so the
 * next Ctrl+Up starts fresh from the newest entry.
 * @param history - extracted history (chronological).
 * @param draft - the current composer draft.
 * @param browse - current browse state.
 * @returns the resynced state.
 */
export function resync(history: readonly string[], draft: string, browse: HistoryBrowse): HistoryBrowse {
  if (browse.index === null) return browse
  if (history[browse.index] === draft) return browse
  return IDLE
}
