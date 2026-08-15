/**
 * Track Bridge data shapes — Linear-compatible issue model plus Track's
 * capture/decision/link extensions. KV records keep these exact shapes so a
 * future export to a real Linear-compatible GraphQL service is a straight
 * mapping (see docs/track-bridge-plugin-plan.md).
 * @module @fakechris/dsh-track/types
 */

/** Capture wall entry: an unstructured thought from any source. */
export interface Capture {
  /** Stable id: `track_capture_<uuid>`. */
  id: string
  /** The thought itself (user's words or an agent summary). */
  content: string
  /** Where the thought came from. */
  source: 'user' | 'agent' | 'session'
  /** Source session id when the thought was captured from a session. */
  sourceSessionId?: string
  /**
   * Message id of the user prompt behind this capture (`user/message`
   * `data.id` when `source.kind === 'user'`). The web panel uses it to jump
   * back to the exact prompt in the left conversation. Best-effort: filled
   * by the live observer, `capture_thought`, and context backfill; absent
   * for captures with no session or no explicit user request.
   */
  sourceMessageId?: string
  /** Lifecycle state. */
  status: 'open' | 'promoted' | 'archived' | 'rejected'
  /** Free-form tags for clustering. */
  tags: string[]
  /** Motivation context: the most recent explicit user request behind this
   *  capture (source.kind === 'user'), so an execution-level capture ("调研
   *  StreamChunk usage/token 字段") carries its "why" ("做一个模块记录所有
   *  llm 数据计算开销"). Filled by the auto-observer; empty for captures
   *  with no preceding user request. */
  context?: string
  /** ISO 8601 creation time. */
  createdAt: string
  /** Issue id when this capture was promoted. */
  promotedToIssueId?: string
}

/** Issue state (Linear-compatible subset). */
export type IssueState = 'todo' | 'in_progress' | 'done' | 'canceled'

/** Linear-compatible priority: 0=urgent, 1=high, 2=medium, 3=low, 4=no priority. */
export type IssuePriority = 0 | 1 | 2 | 3 | 4

/** Structured work unit — mirrors Linear's Issue core fields. */
export interface Issue {
  /** Stable id: `track_issue_<uuid>`. */
  id: string
  /** Linear-style identifier, e.g. `INV-12`. */
  identifier: string
  /** One-line title. */
  title: string
  /** Full description. */
  description: string
  /** Linear-compatible priority. */
  priority: IssuePriority
  /** Lifecycle state. */
  state: IssueState
  /** Assignee: 'user', 'agent', or a session id. */
  assignee?: string
  /** Parent epic or issue id. */
  parentId?: string
  /** Workspace / team id. */
  teamId: string
  /** Labels. */
  labels: string[]
  /** Acceptance criteria — the contract field Track owns. */
  acceptanceCriteria?: string
  /** Sessions that executed this issue (one issue, many sessions). */
  linkedSessionIds: string[]
  /**
   * Message id of the user prompt that originated this issue (best-effort).
   * Set by `track_create_issue` (the current session's latest explicit user
   * request), by capture promotion (the capture's source message), and by
   * the sync align pass where the originating request is known. The web
   * panel falls back to the first user message of the first linked session
   * when absent.
   */
  promptMessageId?: string
  /** ISO 8601 timestamps. */
  createdAt: string
  updatedAt: string
  /**
   * Session currently declared to be driving this issue (track_attach_issue).
   * The evidence observer records signals from this session against the issue.
   */
  attachSessionId?: string
  /** Heartbeat: epoch ms of the last real progress (evidence, not liveness). */
  lastProgressAt?: number
  /**
   * Machine-proposed lifecycle state. NOT authoritative — `state` only
   * changes on explicit confirmation (user confirm / confirmed_by_user).
   * `inferred` is what the evidence says; `state` is what we've committed to.
   */
  inferred?: IssueInferred
  /**
   * Confirmation-gated state change awaiting a user nod (done / canceled).
   * Written by the live evidence path AND by the periodic lifecycle sweep —
   * the sweep re-evaluates EVERY in_progress issue, because sync-created
   * issues have no attached session and never accumulate live evidence. The
   * panel renders a pending-confirmation section; confirm/dismiss resolves it.
   * Cleared on confirm (state commit) or explicit dismiss. `state` never
   * changes without the user (the confirmation-gate principle).
   */
  pendingConfirm?: { to: 'done' | 'canceled' | 'review'; reason: string; at: number }
}

/** One piece of lifecycle evidence (the state machine's input). */
export interface EvidenceRef {
  /** Which signal fired. */
  signal: LifecycleSignal
  /** Epoch ms when the signal fired. */
  at: number
  /** Weight of this signal (positive supports progress, negative penalizes). */
  weight: number
  /** Source session, when the signal came from an observed session. */
  sessionId?: string
  /** Short human-readable pointer to the signal (e.g. todo count, turn reason). */
  pointer?: string
}

/** Lifecycle evidence signals the observer can collect. */
export type LifecycleSignal =
  | 'user-confirm'   // explicit user confirmation ("可以了/完成/验收通过") — the only path to `done`
  | 'todo-all-done'  // todo_write snapshot: completed === total > 0
  | 'turn-completed' // turn/end reason.kind === 'completed'
  | 'turn-error'     // turn/end reason.kind === 'error' | 'max-tokens'
  | 'turn-blocked'   // turn/end reason.kind === 'blocked'
  | 'tool-error'     // tool/result carried an error-ish payload
  | 'activity'       // file write/edit or shell activity (heartbeat, weak)
  | 'model-propose'  // model explicitly proposed a state via track_update_issue_state
  | 'timeout'        // wall-clock: no lastProgressAt for the abandonment window

/** Machine-proposed lifecycle state (attached to an Issue as `inferred`). */
export interface IssueInferred {
  /** Proposed Linear-compatible state. */
  state: IssueState
  /** Composite confidence in [0,1]. */
  confidence: number
  /** Recent evidence this proposal is based on (newest last, capped). */
  evidence: EvidenceRef[]
  /** Epoch ms of the proposal. */
  at: number
  /** Who/what produced the proposal. */
  by: 'auto' | 'model' | 'user'
}

/** Epic (Linear Project-shaped simplification). */
export interface Epic {
  id: string
  name: string
  description: string
  status: 'backlog' | 'active' | 'done'
  teamId: string
  issueIds: string[]
  createdAt: string
  updatedAt: string
}

/** Relation edge in the capture↔issue↔session↔epic graph. */
export interface Link {
  id: string
  fromType: 'capture' | 'issue' | 'session' | 'epic'
  fromId: string
  toType: 'capture' | 'issue' | 'session' | 'epic'
  toId: string
  kind: 'relates' | 'blocks' | 'derives' | 'belongs'
  createdAt: string
}

/** Decision point: AI-raised, user-answered, persisted to the KV decisions table. */
export interface Decision {
  id: string
  /** Session where the decision point arose. */
  sessionId: string
  /** One-line question. */
  question: string
  /** Candidate options. */
  options: string[]
  /** AI's preferred option. */
  aiPreference: string
  /** AI's rationale. */
  aiRationale: string
  /** Impact of the choice. */
  impact: string
  /** What the user must do. */
  need: 'confirm' | 'choose' | 'supplement'
  /** Lifecycle. */
  status: 'pending' | 'answered' | 'dismissed'
  /** User's answer as stated (or 'dismissed'). Recorded via track_respond_decision. */
  answer?: string
  /** Optional user rationale / note captured with the answer. */
  rationale?: string
  /** Who the answer came from — always the user; the model only relays it. */
  answeredBy?: 'user' | 'model'
  answeredAt?: string
  /**
   * Motivation context: the most recent explicit user request behind this
   * decision point (same idea as Capture.context). Optional in v1 — filled
   * when the raising turn carries one.
   */
  context?: string
  /** Message id of that motivation request (`user/message` `data.id`) —
   *  the panel's deep link target when jumping back to the conversation. */
  contextMessageId?: string
  /** Id of a previous decision of the same topic that this one supersedes. */
  supersedesDecisionId?: string
  createdAt: string
}

/** Engine metadata stored in the KV global slot. */
export interface TrackGlobal {
  version: 1
  teams: Record<string, { id: string; name: string; cwd?: string }>
  identifierCounter: number
  /**
   * Incremental-sync cursor per workspace: last synced activity timestamp
   * (epoch ms) keyed by session `cwd`. Sync only folds sessions whose
   * lastActivityAt exceeds the cursor, so a re-run is idempotent.
   */
  lastSync?: Record<string, number>
  /**
   * Durable auto-capture dedup markers: sessionId → ISO timestamp of when
   * that session's FIRST todo_write was captured. The auto-observer's
   * in-memory set dies with the web process; this persisted marker keeps a
   * continued (spliced) session from re-capturing its first todo after a
   * restart (the 2026-08-13 duplicate-capture bug).
   */
  autoTodoSessions?: Record<string, string>
}

/**
 * One tool-invocation audit record — the observability face. Written on every
 * model-facing tool call so funnel questions ("how many captures vs how many
 * candidates?") are answered by the store, not by archaeology over session
 * logs (2026-08-11: capture conversion was ~1/148 and only recoverable by
 * decompressing 62 session logs by hand).
 */
export interface AuditEntry {
  id: string
  /** The tool that ran: capture_thought | report_decision_point | track_create_issue | track_sync_history | track_usage | track_backfill_captures | track_respond_decision | track_list_decisions | track_attach_issue | track_update_issue_state | track_issue_evidence. */
  tool: 'capture_thought' | 'report_decision_point' | 'track_create_issue' | 'track_sync_history' | 'track_usage' | 'track_backfill_captures' | 'track_respond_decision' | 'track_list_decisions' | 'track_attach_issue' | 'track_update_issue_state' | 'track_issue_evidence'
  /** Epoch ms of the invocation. */
  ts: number
  /** Owning agent session id when available. */
  sessionId?: string
  /** Whether execution succeeded. */
  ok: boolean
  /** Short result annotation (e.g. created identifier, capture id, sync counts). */
  detail?: string
}

/**
 * One LLM call made by the track engine — the usage ledger (2026-08-11).
 *
 * The track engine's semantic judgement (intent layering, candidate
 * synthesis, relation classification) streams through the plugin-direct
 * `ctx.llm` facade in `sync/llm.ts`; those calls never surface as session
 * events, so the global token-meter never prices them. Every streamed call
 * is recorded here (one record per HTTP request, i.e. per retry attempt),
 * so "how many requests / tokens / dollars did track cost" is answered by
 * the store instead of session-log archaeology.
 */
export interface LlmUsageRecord {
  /** Stable id: `track_usage_<uuid>`. */
  id: string
  /** Epoch ms of the call start. */
  at: number
  /** Call site label passed to llmJson: intent | span-intent | synthesize | relation. */
  label: string
  /** Provider route key (e.g. deepseek-official). */
  provider: string
  /** Model id (e.g. deepseek-v4-flash). */
  model: string
  /** Whether the call produced a usable text result. */
  ok: boolean
  /** Finish-reason kind from the stream: stop | max-tokens | aborted | error. */
  finishKind: string
  /** Wall time of the streamed call in ms. */
  durationMs: number
  /** 1-based retry attempt inside llmJson — each attempt is one real request. */
  attempt: number
  /** Uncached input tokens (provider-reported, disjoint buckets). */
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

/** KV unit descriptor for the track unit. */
export const TRACK_UNIT = {
  name: 'track',
  version: 1,
  tables: ['captures', 'issues', 'epics', 'links', 'decisions', 'audit', 'usage'],
  hasGlobal: true,
} as const

// No custom session-event declarations: the `track/decision` and
// `track/sync-preview` appends were removed (2026-08-11) because the 20260811
// harness refuses to resume a session carrying an unknown (out-of-repo) event
// type, and neither event was ever consumed by anything.
