# Compaction

English | [中文](compaction.zh.md)

The compaction seam — a [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) split like bash: interface ([dsh-compact](../../packages/compact/compact), `ctx.compact`), implementation (a backend such as [dsh-compact-basic](../../packages/compact/compact-basic)), and human consumer ([dsh-command-compact](../../packages/compact/command-compact)). Compaction is **one optional capability**, not part of the agent-loop spine — so its vocabulary lives here, not in [core.md](core.md). A tokenizer- or template-based backend is a sibling package implementing the same interface. Unlike bash, the interface necessarily depends on `dsh-session` and `dsh-llm`: its verbs act on an agent-owned `Session`, and its durable summary event uses the `ContentBlock` vocabulary (see the [compaction capability-seam Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)).

Source: [`packages/compact/compact/src/types.ts`](../../packages/compact/compact/src/types.ts)

## The `compact/*` session events

Compaction extends [`SessionEventMap`](session.md) with three event types via declaration merging. All three are **log-only** — they record the compaction lock and its provenance, and never join the surface. `SurfaceEventType` is deliberately NOT extended (only message-producing events reach the model), so the summary itself rides on a separate `user/message` with `surfaceOp: { op: 'replace', start, end }` — the only surface mutation performed by summary compaction. See the Agent Note for why reusing `user/message` is honest rather than a workaround.

| Event | Payload | Role |
|---|---|---|
| `compact/start` | `{ turn }` | acquires the log-recorded lock; a number identifies the open automatic turn, while `null` identifies a standalone manual attempt |
| `compact/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | provenance: the safe summary projection, optional complete provider output and usage, an `llmStreamCall: true` marker when producing the result consumed exactly one call through this context's `ctx.llm.stream()` (which requires complete `rawOutput`), the shadowed surface-boundary pair (`start`/`end` seqs — a position span, not a numeric interval), the shadowed seqs in surface order, the estimated token count, and the summarize call's envelope (`provider`, `model`, plus its generation cap when one applied) — logged so the one-shot request is reconstructable from log + code (the reconstructability Agent Note); unmarked `rawOutput` does not identify the call path |
| `compact/end` | `{ turn, error? }` | releases the lock with the same numeric-or-null owner (`error` records an unsuccessful attempt) |

The lock brackets the **whole** operation: `compact/start` is appended first, then summarization, the `compact/summary` provenance record, and the `user/message` replacement all land, and only then `compact/end`. Releasing the lock last turns a crash mid-operation into a detectable orphaned lock (a `compact/start` with no matching `compact/end`) rather than a `compact/end` that falsely claims compaction finished.

The markers are lock time points, not an exclusive container. An unrelated idle injection can appear between a standalone manual start and end while summarization is pending. The manual path revalidates only its selected positional span, so that injected context survives after the replacement checkpoint. A live unmatched start blocks every entry point; an unmatched start before a newer `session/end-seed` is stale evidence from a prior lifecycle and is ignored.

These variants are merged inside a `declare module '@deepseek-ai/dsh-session'` block, so — unlike the top-level types on the other sub-pages — they are not pasted as a drift-checked ` ```ts type-equiv ` block (the `verify-type-equiv` extractor matches only top-level declarations by name). The payload table above is the catalog entry; follow the source link for the authoritative shapes.

## `CompactionResult`

What a successful compaction returns to its caller: the bookkeeping-event seqs, safe summary projection, shadowed range and seqs, and estimated token count.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** The seq of the appended `compact/start` event. */
  startSeq: number
  /** The seq of the appended `compact/summary` event. */
  summarySeq: number
  /** The seq of the appended `compact/end` event. */
  endSeq: number
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: number; end: number }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: number[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## The service

Automatic callers state why policy is running; implementations may treat confirmed overflow more aggressively than ordinary pressure.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactService` exposes `compactIfNeeded(agent, trigger, signal)` for automatic `pressure` or `context-overflow` policy, `compactNow(agent, signal)` for one useful idle-session reduction even below pressure, and `compactRegion(...)` for an explicit inclusive surface range. `compactNow()` runs as agent maintenance between turns, returns `null` without writing when no useful range exists, records a standalone `turn: null` bracket before summarization, and flushes a closed attempt before later queued prompts may derive from the new surface. Every backend marks its replacement `user/message` with `COMPACT_CHECKPOINT_SOURCE`; client and wire consumers import that value and `isCompactCheckpointSource()` from the cordis-free `@deepseek-ai/dsh-compact/checkpoint` subpath, while the package root re-exports both for host consumers. The predicate keeps checkpoint recognition independent of any one backend. Implementations must forward the supplied signal to summarization. The seam owns no pricing API: the singleton [`ctx.tokenMeter`](token-meter.md) directly owns estimation and replay, while `dsh-compact-basic` owns retention, event sequencing, routed summarization calls, and their configuration.

Expected manual failures use `ManualCompactionErrorCode`:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` and `summary` leave the conversation surface unchanged but still close and persist the failed attempt in the log. `commit` may follow partial mutation; `persistence` means the in-memory bracket closed but its flush failed. Cancellation remains separate and throws the exact abort reason after required cleanup.

Pressure compaction runs at serial `agent/pre-step` before request derivation. Once pressure or canonical overflow qualifies, compact-basic invokes optional [`ctx.toolResultPrune`](../../packages/compact/compact-tool-result-prune/README.md) before range selection, remeasures through `ctx.tokenMeter`, and can advance the surface without a summary. Failed-request recovery runs through `agent/request-error` after the failed step closes and returns a retry action only when the surface replacement generation advances, even if later summary work throws after pruning; cancellation still wins. Region boundaries preserve tool-call/result pairing but not whole turns, allowing early closed steps of one oversized turn to compact. `dsh-compact-basic` owns thresholds, retained-tail policy, overflow caps, and failure handling.

The seam exports `toolPairingBalancedBefore(session, seq)` and `toolPairingBalancedAfter(session, seq)` for those edge checks. Both validate current surface membership and reject missing seqs and orphan results; the [package contract](../../packages/compact/compact/README.md#tool-pairing-boundaries) owns their cache semantics.

## Tool-result pruning outcomes

The optional tool-result pruning service reports each durable content replacement and the aggregate Unicode-code-point reduction. Its public result types live in [`compact-tool-result-prune/src/types.ts`](../../packages/compact/compact-tool-result-prune/src/types.ts).

```ts type-equiv
/** Provenance and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: number
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: number
  /** Tool call shared by the original and replacement. */
  readonly callId: CallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```
