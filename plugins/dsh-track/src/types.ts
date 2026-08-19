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
  /**
   * Soft-delete tombstone (2026-08-18): deletion marks, it never removes —
   * a deleted capture keeps its full record and is only hidden from default
   * listings. Deletion is a strong user negation; the row stays queryable.
   */
  deletedAt?: string
}

/**
 * Evidence pointer from a semantic node back to the raw session log
 * (Layer 0 — the immutable fact layer). kind='span' cites the evidence
 * span that produced the node; kind='prompt' cites the originating user
 * request message.
 */
export interface IssueCitation {
  sessionId: string
  seqStart: number
  seqEnd: number
  kind: 'span' | 'prompt'
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
   * Semantic node kind (genealogy Layer 1): requirement (a work thread that
   * grew from user intent), problem (a defect/pain discovered while doing
   * something else — the '做 A 时发现 B' node), decision, task (mechanical
   * execution), investigation. Populated by the sync v2 pipeline from the
   * candidate kind; absent on legacy issues.
   */
  semanticKind?: 'requirement' | 'problem' | 'decision' | 'task' | 'investigation'
  /**
   * Source authority (invariant #3): where the requirement's content came from.
   * user_explicit — verbatim user intent; user_confirmed — user accepted a
   * proposal; agent_proposed — the model suggested it (only proposed, never
   * treated as confirmed); system_inferred — deterministic rules.
   */
  origin?: 'user_explicit' | 'user_confirmed' | 'agent_proposed' | 'system_inferred'
  /**
   * Evidence pointers back to Layer 0 (the raw session log): every semantic
   * edge/claim must cite its source (sessionId, seqRange) so the graph stays
   * explainable. The first citation is also stored as sourceSpan.
   */
  citations?: IssueCitation[]
  /** The originating evidence span (first citation, shorthand). */
  sourceSpan?: IssueCitation
  /** Inducted project id (see track_project_* — group of sessions by cwd). */
  projectId?: string
  /** Issue this one supersedes (evolution edge — supersedes keeps both nodes,
   *  the older stays visible with state canceled/archived). */
  supersedesIssueId?: string
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
  /**
   * Soft-delete tombstone (2026-08-18): deletion marks, it never removes —
   * a deleted issue keeps its full record (title, description, evidence
   * ledger, links) and is only hidden from default listings. Deletion is a
   * strong user negation: the row stays queryable (includeDeleted), the
   * `user-delete` evidence signal is recorded in the ledger, and an audit
   * entry is appended. The identifier is never reused.
   */
  deletedAt?: string
  /** Who deleted the issue ('user' from the panel/API; agent/auto reserved). */
  deletedBy?: 'user' | 'agent' | 'auto'
  /** Optional user-stated reason for the deletion. */
  deletedReason?: string
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
  | 'commit-observed' // an implements/landed-in commit link landed inside the evidence window (P0: Output-first — done proposals require it)
  | 'user-delete'    // user deleted the issue (strong negation — recorded into the ledger before tombstoning)

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
  fromType: 'capture' | 'issue' | 'session' | 'epic' | 'decision' | 'commit' | 'project'
  fromId: string
  toType: 'capture' | 'issue' | 'session' | 'epic' | 'decision' | 'commit' | 'project'
  toId: string
  kind: 'relates' | 'blocks' | 'derives' | 'belongs' | 'spawned-by' | 'supersedes' | 'executed-in' | 'raised-in' | 'forked-from' | 'landed-in' | 'implements'
  createdAt: string
  /**
   * Bi-temporal light: when the relation became true in the world (event
   * time — e.g. the session start for executed-in, the commit author date
   * for landed-in). Absent on legacy links.
   */
  eventTime?: number
  /** When track ingested this relation (ingestion time, ISO). Defaults to createdAt. */
  ingestedAt?: string
  /**
   * How this edge was derived: trailer | commit-window | title-overlap |
   * identity | session-link | session-lineage | user | promotion |
   * decision-record. This is the METHOD (mechanism), not the evidence
   * strength — see evidenceKind/confidence for the quality of the relation.
   * (2026-08-18: the old 'deterministic' default conflated idempotent-hash
   * with evidence quality; methods are now explicit per link.)
   */
  linkMethod?: string
  /**
   * Evidence strength of this relation (2026-08-18, aligned with
   * Better Harness): declared (reviewed explicit ref/trailer — the only
   * provenance) > observed (typed host evidence) > candidate (time-window /
   * title-overlap heuristics awaiting review) > unmapped. Absent on legacy
   * links written before grading — treat as candidate.
   */
  evidenceKind?: 'declared' | 'observed' | 'candidate' | 'unmapped'
  /** Evidence confidence in [0,1]. Absent on legacy links. */
  confidence?: number
  /**
   * Fixed human-readable limitations of what this link does NOT prove
   * (the UI never upgrades weak-evidence wording).
   */
  limitations?: string[]
}

/**
 * M1 event-graph — the deterministic execution tree of one session.
 *
 * Nodes cover the conversation's structural facts (turns / steps / tool calls /
 * user requests / assistant replies); edges express containment (session→turn→
 * step→tool) and provenance (user message → the turn it provoked). Every node
 * and edge carries a GraphCitation (sessionId + seq range) that points back
 * into the raw session.jsonl — the source-of-truth chain for the genealogy
 * vision (docs/genealogy-vision.md).
 * @module @fakechris/dsh-track/types
 */

/** Node kinds in the per-session execution graph. */
export type GraphNodeKind =
  | 'session'       // the session root (header facts)
  | 'turn'          // turn/start
  | 'step'          // step/start
  | 'tool'          // tool/call (+ paired tool/result)
  | 'user-message'  // user/message (a user request)
  | 'assistant'     // assistant/message (a model reply)

/** Edge kinds in the per-session execution graph. */
export type GraphEdgeKind =
  | 'contains'   // session→turn, turn→step, turn→assistant, session→user-message
  | 'invokes'    // step→tool (or turn→tool when the log has no step)
  | 'provoked'   // user-message→turn: this request opened this turn's work

/** Exact log range a node/edge cites (inclusive). */
export interface GraphCitation {
  /** Session owning the cited log range. */
  sessionId: string
  /** First event seq of the source range (inclusive). */
  seqStart: number
  /** Last event seq of the source range (inclusive). */
  seqEnd: number
}

/** One node of the per-session execution graph. */
export interface GraphNode {
  /** Deterministic id (gn_<hash>) — stable across rebuilds of the same log. */
  id: string
  kind: GraphNodeKind
  /** Short display title (truncated text / turn label / tool name). */
  title: string
  /** Exact raw-log range this node covers. */
  citation: GraphCitation
  /** Turn number this node belongs to, when derivable. */
  turn?: number
  /** Step number within the turn, when derivable. */
  step?: number
  /** Tool name for kind === 'tool'. */
  toolName?: string
  /** Tool call id — pairs tool/call with tool/result. */
  callId?: string
  /** user/message data.id — the web panel's jump-back target. */
  messageId?: string
  /** Whether the paired tool/result carried an error-ish payload. */
  toolError?: boolean
  /** Turn outcome (from turn/end reason.kind) — the calendar-yarn ✓/⊘/✕. */
  outcome?: 'completed' | 'aborted' | 'error' | 'blocked'
  /** Header facts on the session root node only. */
  parentSessionId?: string
  origin?: 'subagent'
  agentLabel?: string
  /** Epoch ms when the node's first event occurred. */
  createdAt: number
}

/** One edge of the per-session execution graph. */
export interface GraphEdge {
  /** Deterministic id (ge_<hash>). */
  id: string
  kind: GraphEdgeKind
  fromId: string
  toId: string
  /** Exact raw-log range this edge cites. */
  citation: GraphCitation
}

/** The complete per-session execution graph — stored under key = sessionId. */
export interface SessionGraph {
  /** Session id — also the KV record key. */
  sessionId: string
  /** Header facts (id/cwd/parentSession/origin/delegationDepth/createdAt). */
  header: {
    id: string
    cwd?: string
    parentSession?: string
    origin?: 'subagent'
    delegationDepth?: number
    agentPreset?: string
    createdAt: number
    /** Repos this session's tool calls touched (repo-touch project induction). */
    repos?: Array<{ url: string; root: string; name: string }>
    /** Sorted tool-call seq -> repo url index (requirement-level attribution). */
    repoTouch?: Array<{ seq: number; url: string }>
  }
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Highest event seq folded into the graph. */
  seqEnd: number
  /** Epoch ms of the last event folded into the graph (activity window end). */
  lastActivityAt: number
  /** Epoch ms when this graph was built. */
  builtAt: number
  /** Builder schema version (bump on breaking shape changes). */
  version: number
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
  /** Evidence pointer to the raise turn in the raw log (best-effort). */
  citation?: { sessionId: string; seqStart: number; seqEnd: number }
  /** Id of a previous decision of the same topic that this one supersedes. */
  supersedesDecisionId?: string
  /** QOC evaluation criteria — the yardsticks used to pick the option (cost, complexity, privacy...). */
  criteria?: string[]
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
  /**
   * Durable per-session marker for the G2 REQUIREMENT capture (one long user
   * request per session, survives restarts — the in-memory set dies with the
   * web process and caused re-captures after every restart).
   */
  autoRequirementSessions?: Record<string, string>
  /** Durable per-session event-graph build marker: sessionId → ISO build time.
   *  Progress/observability only — freshness is judged by the stored graph's
   *  seqEnd vs the log length, so a stale marker never blocks a rebuild. */
  graphBuiltSessions?: Record<string, string>
  /** Runtime-tunable auto-maintenance knobs (defaults when absent). */
  config?: TrackConfig
}

/**
 * Auto-maintenance configuration — tunable at runtime via the panel settings
 * (gear ⚙ in the Track panel) or POST /api/track/config. Missing fields fall
 * back to DEFAULT_TRACK_CONFIG, so a partial write is safe.
 */
export interface TrackConfig {
  /** Days a canceled proposal may sit in pendingConfirm before auto-confirm
   *  (garbage collection for abandoned work; 0 = never auto-confirm). */
  autoCancelPendingDays: number
  /** Days between scheduled sync passes over the lastSync workspaces
   *  (0 = disabled). LLM-engine (v2) runs are memory/cost heavy — default v1. */
  syncIntervalDays: number
  /** Session cap per workspace per scheduled sync (memory guard). */
  syncMaxSessions: number
  /** Scheduled-sync engine: 'v1' (deterministic, zero LLM) or 'v2' (LLM). */
  syncEngine: 'v1' | 'v2'
  /** Token-similarity threshold for AUTO near-duplicate merge (0..1). */
  nearDupThreshold: number
}

/** Defaults: 14d auto-cancel grace (“至少两周”), weekly v1 sync capped at 10. */
export const DEFAULT_TRACK_CONFIG: TrackConfig = {
  autoCancelPendingDays: 14,
  syncIntervalDays: 7,
  syncMaxSessions: 10,
  syncEngine: 'v1',
  nearDupThreshold: 0.6,
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
  tool: 'capture_thought' | 'report_decision_point' | 'track_create_issue' | 'track_sync_history' | 'track_usage' | 'track_backfill_captures' | 'track_respond_decision' | 'track_list_decisions' | 'track_attach_issue' | 'track_update_issue_state' | 'track_issue_evidence' | 'track_session_graph' | 'track_genealogy' | 'track_git_artifacts' | 'track_evolution_brief' | 'track_delete_issue' | 'track_delete_capture'
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

/**
 * A Project (genealogy Layer 1 grouping): sessions whose cwd belongs to one
 * workspace/repository. Inducted deterministically from graph headers
 * (header.cwd) + the repo's git remote — the '归纳到几个项目' dimension.
 */
export interface Project {
  /** Stable id: track_project_<hash(cwd)> — deterministic across re-runs. */
  id: string
  /** Project display name (basename of the cwd). */
  name: string
  /** Absolute workspace path (also the identity key). */
  path: string
  /** Git remote origin URL, when readable from <path>/.git/config. */
  repoUrl?: string
  /** Sessions inducted into this project (graph docs with this cwd). */
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

/**
 * A git commit artifact (genealogy Layer 1 Artifact node / Layer 0 code
 * anchor). Scanned from a project's git log and linked to sessions (by
 * activity time window) and issues (by title token overlap).
 */
export interface CommitArtifact {
  /** Stable id: track_commit_<hash(sha)> — deterministic across scans. */
  id: string
  /** Git commit sha (full 40-hex). */
  sha: string
  /** Project id the commit belongs to (projectIdFor(cwd)). */
  projectId: string
  /** Repo cwd the commit was scanned from. */
  repo: string
  /** Author date, epoch ms (display). */
  authorAt: number
  /** Committer date, epoch ms (production-time correlation — P2). */
  committedAt: number
  /** Commit subject line (first line of the message). */
  subject: string
  /** Commit message body (bounded) — source of typed trailers (P2). */
  body?: string
  /**
   * Typed trailers parsed from the body (P2 explicit channel):
   * `Track-Issue: INV-12` / `Harness-Session: <session-id>`.
   */
  trailers?: Array<{ key: string; value: string }>
  createdAt: string
}

/**
 * One extraction run — the durable record of what the sync pipeline inferred
 * (Ledger-first: candidates are knowledge, not throwaway intermediates).
 * Keeps a compact projection of the candidates so a re-run never loses the
 * richer intermediate view that got flattened into Issues.
 */
export interface ExtractionRun {
  /** Deterministic id: track_extract_<hash(workspace, at)>. */
  id: string
  /** Workspace cwd the run scanned. */
  workspace: string
  /** Sync engine ('v1' | 'v2'). */
  engine: 'v1' | 'v2'
  /** Model route used for LLM synthesis, when any. */
  model?: string
  scannedSessions: number
  spanCount: number
  /** Compact candidate projection: id, span, kind, authority, title, confidence. */
  candidates: Array<{
    id: string
    sessionId: string
    seqStart: number
    seqEnd: number
    kind: string
    authority: string
    title: string
    confidence: number
  }>
  createdAt: string
}

/** KV unit descriptor for the track unit. */
export const TRACK_UNIT = {
  name: 'track',
  version: 1,
  tables: ['captures', 'issues', 'epics', 'links', 'decisions', 'audit', 'usage', 'graph', 'projects', 'commits', 'extractions'],
  hasGlobal: true,
} as const

// No custom session-event declarations: the `track/decision` and
// `track/sync-preview` appends were removed (2026-08-11) because the 20260811
// harness refuses to resume a session carrying an unknown (out-of-repo) event
// type, and neither event was ever consumed by anything.
