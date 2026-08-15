# Same-session goals

English | [中文](goal.zh.md)

Types shared by the event-sourced goal domain and its policy consumers. The [goal-domain Agent Note](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md) owns the persistence and activation decisions; this page records the literal shapes from [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts).

## Identity and lifecycle

`GoalId` is a [branded id](core.md#branded-ids). A caller mutates one exact revision through `GoalRef`; every accepted durable mutation increments the revision.

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

The durable phase answers what happened to the objective. Process-local activation separately answers whether a continuation consumer may start another round.

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

Blocking is the single durable stopped-by-a-problem state. Its policy-owned reason carries a stable lower-kebab-case code for routing and a free-form explanation for humans and models.

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

## Durable changes

Every mutation is a durable `goal/change` session event whose payload is either a complete post-mutation snapshot or a clear tombstone. The strict fold and persisted projection derive lifecycle state only from these events; inbox mutations do not affect goal state.

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

A continuation consumer attributes each admitted user-message turn with a positive, sequential round number and the current revision; only these admitted `user/message` events advance `roundsStarted`. Replay rejects non-positive rounds, gaps, stale revisions, stopped phases, and cap overflow.

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## Requests and notifications

Creation separates caller omission from the deployment choice, which `create()` resolves internally. An edit is a partial replacement whose runtime validator requires at least one field. Every mutation notification carries the accepted operation and exact revision; clear omits `goal`.

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## Service behavior

[`GoalService`](../../packages/goal/goal/src/index.ts) resolves creation defaults, folds strict replay from durable `goal/change` events, enforces exact-live-agent identity and compare-and-set mutations, and emits contained `goal/changed` notifications. The package [README](../../packages/goal/goal/README.md) owns the callable and model-visible contract.
