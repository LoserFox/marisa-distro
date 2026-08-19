/**
 * Rule-based auto-capture — the deterministic half of Track observability.
 *
 * The model-facing `capture_thought` tool depends on the agent's judgment,
 * which in practice almost never fires (measured ~1/148 in 62 sessions). This
 * observer instead watches the *structured tool stream* (session/event) for
 * ONE signal that is reliable by construction, with zero model cost:
 *
 *  - todo_write (planning path): an agent that plans a work unit issues a
 *    todo_write whose FIRST entry is the requirement summary. Only the first
 *    change of the first entry captures once (B — a later refresh is the same
 *    requirement's execution, not a new thought). Reacts to the canonical
 *    `todo/write` event OR the `todo_write` tool call (same per-session gate).
 *  - goal/change (goal creation): a `create_goal` carries the FULL objective
 *    (A/B/C…), which the todo signal alone misses — the first todo entry is
 *    often a sub-task. Every goal creation captures its objective once
 *    (2026-08-14: session "任务转派与历史状态清理机制讨论" planned a 10-item
 *    todo + one goal; only the first todo entry ("C 调研…") captured and the
 *    A/B requirements in the goal were never seen).
 *  - subagent delegation (G1): a subagent child's first user message IS its
 *    delegation prompt — captured once per child session (tag
 *    `auto:delegate`), so a direct subagent/workflow/ralph spawn without a
 *    prior todo still lands. Children are detected from the session header
 *    (`origin: 'subagent'`); the `subagent/descriptor` event is a seed-phase
 *    write that never publishes to live observers.
 *  - requirement-level user messages (G2): the first long (≥ minChars),
 *    non-ack user request per session captures as `auto:requirement`, so a
 *    discussion-style requirement that no todo/goal carries ("任务转派与历史
 *    状态清理机制讨论") still reaches the wall.
 *
 * Every signal is a configurable flag (`AutoCaptureOptions.signals`); the
 * default mask enables all four (todo / goal / delegate / requirement).
 *
 * Git branch creation was REMOVED as a signal (2026-08-11): "新建分支 feat/…"
 * is an execution carrier, not a requirement — in practice it dominated the
 * capture wall with noise (9 of 17 captures) even when context was attached.
 * The todo_write signal covers the same work lines with the requirement's
 * own wording.
 *
 * Exact pattern match on structured fields — no LLM, no semantic guesswork,
 * no per-message cost. Captures land with `source: 'session'` and an
 * `auto:*` tag so they are distinguishable from explicit `capture_thought`
 * calls.
 *
 * Motivation context (A): every capture carries `context` = the most recent
 * FULL user instruction (user/message with source.kind === 'user', skipping
 * terse acks — see capture/context.ts), so an execution-level capture
 * ("调研 StreamChunk usage/token 字段") keeps its "why" ("做一个模块记录所有
 * llm 数据计算开销"). The observer keeps a per-session one-entry cache of the
 * latest full user request.
 *
 * Reentrancy: our own appends (track/* events) never match the signal.
 * @module @fakechris/dsh-track/capture/observe
 */
import { makeId } from "../store.js";
import { isShortAck, titleifyCapture } from "./context.js";
const DEFAULT_TAG = 'auto';
/** G2 bounds: below minChars is a terse ask, above maxChars is truncated. */
const DEFAULT_REQ_MIN = 40;
const DEFAULT_REQ_MAX = 500;
/**
 * Wire the rule-based capture observer onto session/event. Returns a
 * disposer that unregisters the listener.
 *
 * `deps.seedContext` (optional): on the FIRST event of a session, the observer
 * has no in-memory context (fresh process — e.g. after a restart, where the
 * spliced continuation session's earlier user requests happened in the
 * PREVIOUS process). seedContext backfills the most recent explicit user
 * request from the persisted session log so a continued session still gets
 * motivation context. Without it, continued sessions never capture context.
 *
 * `deps.recentUser` (optional): a caller-owned per-session cache of the latest
 * explicit user request (`UserPromptRef` — text + message id). The observer
 * writes into it on every live `user/message` and on seed; the model-facing
 * tools (capture_thought, report_decision_point, track_create_issue) read the
 * same map so captures/decisions/issues carry the message id of the prompt
 * they happened under — the web panel's deep-link target.
 */
export function createAutoCapture(ctx, deps, options = {}) {
    const tag = options.tag ?? DEFAULT_TAG;
    /** Signal mask — every signal on unless the config opts out. */
    const signals = {
        todo: options.signals?.todo ?? true,
        goal: options.signals?.goal ?? true,
        delegate: options.signals?.delegate ?? true,
        requirement: options.signals?.requirement ?? true,
    };
    const reqMin = options.requirement?.minChars ?? DEFAULT_REQ_MIN;
    const reqMax = options.requirement?.maxChars ?? DEFAULT_REQ_MAX;
    /** sessionId → captured (in-process fast path; the durable marker in the
     *  store is authoritative across restarts — see store.createCapture). */
    const todoSeen = new Set();
    /** goalId → captured (one capture per created goal, in-process fast path;
     *  the store's content-hash dedup is the cross-restart backstop). */
    const goalSeen = new Set();
    /** sessionId → first requirement-level user message captured (G2). */
    const requirementSeen = new Set();
    /** sessionId → subagent child whose delegation prompt was captured (G1). */
    const delegateSeen = new Set();
    /** sessionId → most recent FULL user instruction (motivation context, A). */
    const lastUserRequest = deps.recentUser ?? new Map();
    /** sessionIds already seeded from the persisted log (or attempted). */
    const seeded = new Set();
    /**
     * Is this session a subagent child? Read from the session header
     * (`origin: 'subagent'` + `parentSession`), NOT from the
     * `subagent/descriptor` event — that event is appended during the child's
     * constructor seed, and seed-phase events never publish on the
     * `session/event` firehose (harness: "constructor seeds do not emit"), so a
     * live observer never sees it (verified 2026-08-14 on a real spawn: the
     * delegation prompt landed as `auto:requirement`, not `auto:delegate`).
     * Forks carry `origin: 'fork'` and are NOT delegations.
     */
    const isSubagentChild = (session) => session?.header?.origin === 'subagent';
    /** Ensure the context cache has an entry for the session (seed once from log). */
    const ensureContext = async (sessionId) => {
        if (lastUserRequest.has(sessionId) || seeded.has(sessionId))
            return;
        seeded.add(sessionId);
        if (!deps.seedContext)
            return;
        try {
            const seed = await deps.seedContext(sessionId);
            if (seed) {
                const ref = typeof seed === 'string' ? { text: seed } : seed;
                lastUserRequest.set(sessionId, { text: ref.text.slice(0, 200), id: ref.id });
            }
        }
        catch { /* seeding is best-effort */ }
    };
    const capture = (sessionId, content, tags, prompt, opts = {}) => {
        // createCapture runs the dedup gate: the durable per-session marker
        // (one todo-capture per session, survives restarts) + the content-hash
        // fallback (an identical open capture never lands twice). The in-memory
        // todoSeen set above stays as the fast path within one process. Goal
        // captures opt out of the per-session gate (a session may create several
        // goals) and rely on per-goal-id dedup + the content-hash backstop.
        void deps.store.createCapture({
            id: makeId('capture'),
            content,
            source: 'session',
            sourceSessionId: sessionId,
            sourceMessageId: prompt?.id,
            status: 'open',
            tags,
            context: prompt?.text,
            createdAt: new Date().toISOString(),
        }, { dedupeBySession: opts.dedupeBySession ?? true, dedupeRequirementBySession: opts.dedupeRequirementBySession }).catch(() => { });
    };
    const onEvent = (session, event) => {
        const sessionId = session?.id;
        // Track the most recent FULL user instruction as motivation context (A).
        // MUST run before pre-warm so a live user/message fills the cache and the
        // seed (persisted log) is not consulted for an already-warm session.
        // Terse acks ("可以", "pr merge") are skipped — they are acknowledgements,
        // not motivation; an earlier full instruction stays the context.
        if (event.type === 'user/message') {
            const data = event.data;
            const kind = data?.source?.kind;
            if (kind === 'user' && sessionId !== undefined) {
                const text = (data?.content ?? [])
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text ?? '')
                    .join('')
                    .trim();
                if (text && !isShortAck(text))
                    lastUserRequest.set(sessionId, { text: text.slice(0, 200), id: data?.id });
                // G1: subagent delegation — a child session's FIRST user message IS the
                // delegation prompt ("你是研究助理。任务：…"). Capture it once per
                // child session; the requirement signal below is skipped for children
                // (the delegation covers the same text). Subagent detection reads the
                // session header (`origin: 'subagent'`) — see isSubagentChild.
                if (signals.delegate && isSubagentChild(session) && !delegateSeen.has(sessionId)) {
                    delegateSeen.add(sessionId);
                    if (text)
                        capture(sessionId, titleifyCapture(text, reqMax), [tag, 'delegate'], undefined, { dedupeBySession: false });
                }
                else if (signals.requirement && !isSubagentChild(session)
                    && !requirementSeen.has(sessionId) && text.length >= reqMin) {
                    // G2: requirement-level user request — the first long, non-ack user
                    // message per session (length-bounded so terse asks never flood the
                    // wall). Content is TITLE-IFIED (one-line, capped) for wall
                    // consistency; the raw message rides as `context` + the message id
                    // powers the panel's jump-back. The durable per-session marker
                    // prevents re-capture after a web restart (2026-08-14: the in-memory
                    // gate died with the process and long messages re-landed).
                    requirementSeen.add(sessionId);
                    capture(sessionId, titleifyCapture(text, reqMax), [tag, 'requirement'], { text: text.slice(0, 500), id: data?.id }, { dedupeBySession: false, dedupeRequirementBySession: true });
                }
            }
            return;
        }
        // Pre-warm the context cache for this session (idempotent, fire-and-forget).
        // In a continued (spliced) session the persisted-log seed resolves during
        // the many events between splice and the first todo/branch signal, so the
        // signal below reads a warm cache synchronously.
        if (sessionId !== undefined)
            void ensureContext(sessionId);
        // Goal creation — the strongest requirement signal in the harness: a
        // create_goal carries the full objective (A/B/C…), which the todo signal
        // below cannot see (its first entry is usually a sub-task). Capture every
        // created goal's objective once (per goal id).
        if (signals.goal && event.type === 'goal/change') {
            const data = event.data;
            if (data?.operation === 'create' && sessionId !== undefined
                && data.goal?.id !== undefined && !goalSeen.has(data.goal.id)) {
                goalSeen.add(data.goal.id);
                const objective = (data.goal.objective ?? '').trim();
                if (objective) {
                    const prompt = lastUserRequest.get(sessionId);
                    capture(sessionId, titleifyCapture(objective), [tag, 'goal'], prompt, { dedupeBySession: false });
                }
            }
            return;
        }
        // Todo planning — react to the canonical `todo/write` event OR the
        // `todo_write` tool call (shared per-session gate, so a call and its
        // event never double-capture). Only the FIRST planned entry of a session
        // captures once (B): a later refresh is the same plan's execution.
        const todos = !signals.todo ? undefined
            : event.type === 'todo/write'
                ? event.data?.todos
                : event.type === 'tool/call' && event.data?.name === 'todo_write'
                    ? (() => {
                        try {
                            return JSON.parse(event.data.arguments ?? '{}').todos;
                        }
                        catch { /* malformed arguments — skip */ }
                        return undefined;
                    })()
                    : undefined;
        if (todos === undefined || sessionId === undefined || todoSeen.has(sessionId))
            return;
        todoSeen.add(sessionId);
        const first = todos[0]?.content?.trim();
        if (first) {
            const prompt = lastUserRequest.get(sessionId);
            capture(sessionId, titleifyCapture(first), [tag, 'todo'], prompt);
        }
    };
    return ctx.on('session/event', onEvent);
}
