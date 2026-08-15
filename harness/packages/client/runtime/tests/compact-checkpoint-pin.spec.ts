/**
 * Behavioral half of the compaction-checkpoint drift trap.
 *
 * `TranscriptAdapter` pins its plugin literal to the seam's own declaration at
 * compile time through a type-only import of `dsh-compact/checkpoint`, so
 * renaming the seam's plugin already fails `tsc`. This spec covers the same
 * drift from the other side — end to end through the adapter, driving it with a
 * checkpoint built from the canonical `COMPACT_CHECKPOINT_SOURCE` value and
 * checking the seam's own predicate agrees. Both values come from the
 * cordis-free checkpoint leaf, so the client test program never loads the host
 * package root or its `Context` merges.
 */

import { COMPACT_CHECKPOINT_SOURCE, isCompactCheckpointSource } from '@deepseek-ai/dsh-compact/checkpoint'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { TranscriptAdapter } from '../src/client/sessions/transcript-adapter.ts'

/** A replacement user message stamped with the seam's own canonical source. */
function canonicalCheckpoint(seq: number): SessionEvent {
  return {
    type: 'user/message',
    seq,
    time: 1_700_000_000_000 + seq,
    surfaceOp: { op: 'replace', start: 0, end: 0 },
    sourceEventSeqs: [0],
    data: createUserMessage({
      content: [{ type: 'text', text: '<context_checkpoint>model only</context_checkpoint>' }],
      source: COMPACT_CHECKPOINT_SOURCE,
    }),
  } as unknown as SessionEvent
}

describe('compaction checkpoint recognition', () => {
  it('recognizes a checkpoint carrying the seam-canonical source', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset([canonicalCheckpoint(1)])
    expect(adapter.nodes()).toEqual([{
      kind: 'compaction', seq: 1, time: 1_700_000_000_001, summary: null,
      summaryEventSeq: null, shadowedItemCount: null, shadowedTokenCount: null,
    }])
  })

  it("agrees with the seam's own predicate on the source it recognizes", () => {
    // Both sides answer the same question about the same value: if the seam
    // renames its plugin, this equality is what breaks.
    const checkpoint = canonicalCheckpoint(1)
    expect(checkpoint.type === 'user/message' && isCompactCheckpointSource(checkpoint.data.source)).toBe(true)
    expect(COMPACT_CHECKPOINT_SOURCE).toEqual({ kind: 'plugin', plugin: 'compact' })
  })
})
