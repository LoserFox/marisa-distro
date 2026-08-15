# Session Persistence

English | [中文](persistence.zh.md)

The **durability seam** for the event log. [session.md](session.md) describes the in-memory `Session` — the append-only `SessionEvent` log that is the source of truth. This page describes how that log is made durable: the abstract `SessionPersistence` service, its backends, the flush checkpoint, crash recovery, and the metadata header that travels alongside the log. The event vocabulary the log carries is enumerated, member by member, in the generated [persistence log event catalog](../persistence-catalog.md).

The seam is a textbook [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md): one abstract service ([dsh-session-persistence](../../packages/session-persistence/session-persistence), `ctx.sessionPersistence`) defining locate/create/append, reusable Session preparation, logical load/inspect, physical suffix reads, and lightweight list/snapshot observation over the existing `SessionEvent` — **no parallel persisted event type** — and two interchangeable backends implementing the same contract. See the [session-persistence Agent Note](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md).

## The flush checkpoint

`session/event` is a *synchronous* notification; persistence plugins copy the event into a per-session controller without blocking the producer. The first pending event starts a fixed batching window, and later events join without resetting its deadline. Expiry starts one durable batch; events admitted during that write receive their own deadline and form a follow-up batch. `session/flush` cancels the wait and drains through quiescence, so the loop still uses it as the ordering and error-observation checkpoint before claiming the next ordinary turn. A rejected background write retains its events and pauses automatic retry; a new event starts a fresh window, while explicit flush retries immediately and reports failure through `agent/error` and the logger, never as a session event past the closed turn. Disposal performs the same final drain. The configured maximum bounds only intentional batching wait, not event-loop scheduling or backend durability latency ([decision](../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md)).

## Crash recovery preserves an interrupted turn

A backend that reloads a log crashed mid-turn finds an open `turn/start` with no `turn/end`. It does **not** truncate — a single turn can be huge in a long-horizon task (many steps, large tool output), and those events were durably appended before the crash. Instead it closes the orphaned turn with a synthetic `turn/end { reason: { kind: 'interrupted' } }`, keeping the interrupted execution balanced without changing any standalone events before or after it. `interrupted` is the one `TurnEndReason` no loop emits (see [session.md](session.md#why-a-turn-ended-turnendreasonmap)).

Repair applies only to cold sessions. For a live id, `SessionPersistence.load(id)` waits until the authoritative in-memory snapshot is durable and returns it only when balanced; an open live turn rejects rather than receiving synthetic interruption boundaries. HMR adopts a live prefix without closing its active turn.

`SessionPersistence.inspect(id)` constructs an immutable logical Session without publishing it or writing recovery. Cold inspection balances an interrupted turn in memory while leaving torn physical tails untouched; inspection of an already-live Session borrows its current immutable snapshot and may therefore contain an open turn. Coordinator-backed implementations retain the exact cold unpublished Session in a bounded LRU, so repeated history reads and a later `prepare(id)` share one read, decompression, validation, freeze, and Session construction. `prepare(id)` reserves the Session, commits pending repair, and returns a disposable publication handle; `load(id)` uses the same machinery to commit repair without publication. The [Session preparation decision](../../.agents/notes/implemented/architecture/2026-08-05-session-preparation.md) owns this lifecycle.

## `SessionLocation` — optional per-session artifact target

`SessionPersistence.locate(meta)` synchronously resolves a backend-owned independent artifact without reading, creating, or flushing it. JSONL returns the absolute transcript path inside its project/session directory; SQLite returns `undefined` because sessions share one database. A returned path can therefore name a file that does not yet exist or lacks the current unflushed turn; it is a location hint, not authorization or a freshness guarantee.

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. The path is an
 * absolute target path and can name an artifact that has not materialized yet.
 * Consumers must treat it as a location hint, never as an authorization token.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

## `SessionHeader` — metadata beside the log

Per-session metadata travels **separately** from the event log: format version, cwd, lineage, and the seed boundary are storage concerns, not conversation events, so they stay out of `SessionEventMap` and never reach `deriveMessages()`. The header is attached to a `Session` via `session.header`.

Source: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * On-disk format version, stamped from {@link SESSION_FORMAT_VERSION} when the
   * session is created. A persistence backend rejects any other version on load
   * (no migration — see the constant).
   */
  readonly version: number
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * How many leading events were inherited through a seed. Persisting this
   * boundary lets resume and replay distinguish parent history from child work.
   */
  readonly seedLength?: number
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
}
```

## `CreateSessionOptions` — seeding and metadata

Creating a `Session` through the store takes a `seed` (initial replay or fork history) and `meta` (the storage-level fields the store folds into a `SessionHeader`). The store fills in `version`/`id` and defaults `createdAt`; the caller may supply the validated absolute `cwd`, the `parentSession` lineage, the `seedLength` seed boundary, the optional coarse `origin`, the `delegationDepth`, and an existing `createdAt`. `origin: 'subagent'` lets product navigation hide duplicate child rows; it does not prove that a descriptor is valid or that the child can resume.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Storage metadata read once before publication. `seedLength` is explicit
   * because a resumed seed contains the full stored log, not only its inherited prefix.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
  }
}
```

Replay/fork is therefore `ctx.sessions.create(id, { seed: seedEvents })`; resuming a *persisted* session into a live agent is `ctx.agents.resume({ resumeSessionId })`.

## Preparation and restoration ownership

`SessionStore.prepare()` accepts ordinary creation options or fresh persistence graphs transferred through `RestoredSessionOptions`. The restoration branch validates and freezes the transferred header and events in place, so callers must retain no mutable aliases. `SessionPreparation` then owns the exact unpublished Session until publication or rollback; disposal is synchronous and idempotent. Persistence inspection exposes only `SessionInspection`, an immutable logical view borrowed from the same prepared Session.

```ts type-equiv
/**
 * Fresh storage values transferred to {@link SessionStore.prepare} without a
 * second serialization copy. Callers retain no mutable aliases.
 */
interface RestoredSessionOptions {
  /** Fresh detached storage events to validate and freeze in place. */
  readonly seed: SessionEvent[]
  /** Fresh detached storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Select the persistence ownership-transfer path. */
  readonly seedSource: 'persistence'
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly seedSource?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

```ts type-equiv
/** Immutable logical session prepared from persistence or a live owner. */
interface SessionInspection {
  /** Validated immutable session metadata. */
  readonly meta: SessionHeader
  /** Validated contiguous logical event log. */
  readonly events: readonly SessionEvent[]
}
```

## Lightweight source revisions

Consumers of derived state compare a cheap opaque revision before loading a full event log. The persistence backend owns its representation and changes it transactionally with append or mutating load repair; callers compare it only for equality.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/** Lightweight immutable source identity returned without loading a full log. */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one materialized session. */
  header: SessionHeader
  /** Opaque source-qualified token that changes whenever this stored log changes. */
  revision: SessionPersistenceRevision
}
```

## The backends

Both implement the same abstract `SessionPersistence` (locate/create/append/prepare/load/inspect/readFrom/list/listSnapshots over `SessionEvent`, with optional cancellation on observation methods) and pass `runPersistenceContract`, proving the seam is genuinely backend-agnostic:

- **[dsh-session-persistence-jsonl](../../packages/session-persistence/session-persistence-jsonl)** — an append-only logical JSONL log per session, stored as checksummed concatenated Zstandard frames by default or raw lines by configuration, with crash-safe atomic writes, interrupted-turn recovery, and a read/replay path.
- **[dsh-session-persistence-sqlite](../../packages/session-persistence/session-persistence-sqlite)** — `node:sqlite`, one row per `SessionEvent`. The row shape `(session_id, seq, type, time, data, source_event_seqs, surface_op)` maps 1:1 onto the event, including optional surface metadata, so there is no parallel persisted schema to keep in sync.
