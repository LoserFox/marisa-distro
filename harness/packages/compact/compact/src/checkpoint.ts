/**
 * The compaction seam's canonical checkpoint source: the plugin marker every
 * backend stamps on the replacement user message that lands a checkpoint, plus
 * the predicate that recognizes it.
 *
 * The seam itself lives in `@deepseek-ai/dsh-compact`, which re-exports both of
 * these; this module is a pure value/predicate outlet (no cordis imports, no
 * module augmentation) so client and wire programs can name the checkpoint
 * source without loading the host plugin's Context merges — the
 * `dsh-commands/brand` shape.
 *
 * @module @deepseek-ai/dsh-compact/checkpoint
 */

import type { MessageSource } from '@deepseek-ai/dsh-llm/message'

/** Canonical source for the replacement user message produced by every compaction backend. */
export const COMPACT_CHECKPOINT_SOURCE = Object.freeze({ kind: 'plugin', plugin: 'compact' } as const)

/**
 * Test whether a persisted message source identifies a compaction checkpoint.
 * @param source - source restored from a surface user message.
 * @returns whether the source carries the backend-independent checkpoint marker.
 */
export function isCompactCheckpointSource(source: MessageSource): boolean {
  return source.kind === 'plugin' && source.plugin === COMPACT_CHECKPOINT_SOURCE.plugin
}
