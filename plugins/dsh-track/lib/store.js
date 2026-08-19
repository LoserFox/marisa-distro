/**
 * TrackStore — the single data face of the Track Bridge engine.
 *
 * Wraps one `ctx.storage` KV unit (`track`) with typed CRUD over
 * captures / issues / epics / links / decisions. The KV contract puts write
 * ordering on the caller, so every mutation funnels through one serialized
 * write chain per table (a simple in-flight promise queue).
 *
 * Storage is host-side only: the model never touches this store directly;
 * model-facing tools registered in index.ts are the only entry points.
 * @module @fakechris/dsh-track/store
 */
import { createHash } from 'node:crypto';
import { TRACK_UNIT, DEFAULT_TRACK_CONFIG, } from "./types.js";
import { MAX_EVIDENCE, isAutoCommit, nextInferred, sweepProposal } from "./lifecycle/state-machine.js";
/** Open captures older than this are reported as stale by the auto-maintenance
 *  loop (they should be promoted, archived, or deleted). */
export const STALE_CAPTURE_MS = 14 * 24 * 60 * 60 * 1000;
import { normalizeTitle } from "./sync/cluster.js";
import { contentTokens } from "./sync/align.js";
/** Token-overlap similarity in [0,1]: shared / smaller set, requiring ≥3 shared
 *  tokens (never merges on incidental bigram hits). */
export function titleSimilarity(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let shared = 0;
    for (const t of b)
        if (a.has(t))
            shared += 1;
    if (shared < 3)
        return 0;
    return shared / Math.min(a.size, b.size);
}
/** Branded identifier prefixes keep record ids recognizable and collision-free. */
export const ID_PREFIX = {
    capture: 'track_capture_',
    issue: 'track_issue_',
    epic: 'track_epic_',
    link: 'track_link_',
    decision: 'track_decision_',
    audit: 'track_audit_',
    usage: 'track_usage_',
};
/** Random id with the given brand prefix. */
export function makeId(kind) {
    const rand = crypto.randomUUID().replaceAll('-', '');
    return `${ID_PREFIX[kind]}${rand}`;
}
/**
 * Normalize capture content for dedup: trim and collapse every whitespace
 * run to a single space, so " 摸清 前提 " and "摸清 前提" hash the same.
 * Case is preserved — a case-fold would risk merging distinct thoughts
 * (conservative dedup: only obvious copies collapse).
 */
export function normalizeCaptureContent(content) {
    return content.replace(/\s+/g, ' ').trim();
}
/**
 * Stable content hash for capture dedup (sha256 of the normalized content,
 * first 16 hex chars). Used as the content-level fallback so an identical
 * thought never lands twice on the capture wall.
 */
export function captureContentHash(content) {
    return createHash('sha256').update(normalizeCaptureContent(content)).digest('hex').slice(0, 16);
}
/**
 * P6 — layered-discipline evidence guard (aligned with Better Harness:
 * the semantic layer can never fabricate deterministic evidence).
 *
 * Only EXPLICIT declarations may claim `declared`/`observed` evidence:
 * - explicit methods: typed commit trailers (`trailer`), direct user refs (`user`).
 * Everything else is derived:
 * - heuristic methods (commit-window / title-overlap): time/similarity hints;
 * - semantic methods (promotion / identity / session-link / session-lineage /
 *   parent / supersedes / decision-record): LLM or clustering-derived.
 *
 * A strong evidenceKind on a non-explicit method is COERCED DOWN to
 * `candidate` (never the reverse — weak evidence is never presented as
 * strong). The coercion is the guarantee; it cannot throw the pipeline.
 */
const EXPLICIT_LINK_METHODS = new Set(['trailer', 'user']);
const STRONG_EVIDENCE = new Set(['declared', 'observed']);
export function enforceEvidenceDiscipline(link) {
    if (link.evidenceKind !== undefined
        && STRONG_EVIDENCE.has(link.evidenceKind)
        && (link.linkMethod === undefined || !EXPLICIT_LINK_METHODS.has(link.linkMethod))) {
        console.warn(`[dsh-track] evidence guard: ${link.kind} link via '${link.linkMethod ?? 'unknown'}' cannot be ${link.evidenceKind} — downgraded to candidate`);
        return { ...link, evidenceKind: 'candidate' };
    }
    return link;
}
export class TrackStore {
    descriptor;
    unit;
    chains = {};
    opened = false;
    openPromise = null;
    constructor(descriptor = TRACK_UNIT) {
        this.descriptor = descriptor;
    }
    /** Open the unit on a kv facet (json or sqlite backend). Call once at plugin apply. */
    open(kvFacet) {
        if (this.opened)
            return Promise.resolve();
        this.openPromise ??= kvFacet.open(this.descriptor).then((unit) => {
            this.unit = unit;
            this.opened = true;
        });
        return this.openPromise;
    }
    /** Wait for the unit to be open before any store operation. */
    async ready() {
        if (this.opened)
            return;
        if (this.openPromise) {
            await this.openPromise;
            return;
        }
        throw new Error('track: store is not open — the plugin did not complete initialization');
    }
    get isOpen() {
        return this.opened;
    }
    /** Close the unit and drain in-flight writes. */
    async close() {
        if (!this.opened)
            return;
        await this.unit.close();
        this.opened = false;
        // A later open() must mint a fresh unit instead of returning the closed
        // promise (test harnesses reopen the store on a new backend per case).
        this.openPromise = null;
    }
    /** Serialize one write on a table: next write waits for the previous. */
    chain(table, run) {
        const prev = this.chains[table] ?? Promise.resolve();
        const next = prev.then(run);
        // Keep the chain alive but swallow errors for the next waiter.
        this.chains[table] = next.catch(() => undefined);
        return next;
    }
    // ---- global ----
    async readGlobal() {
        await this.ready();
        const g = await this.unit.loadAll().then(({ global }) => global);
        return g;
    }
    /** Effective auto-maintenance config: stored values merged over defaults. */
    async readConfig() {
        const g = await this.readGlobal();
        return { ...DEFAULT_TRACK_CONFIG, ...(g?.config ?? {}) };
    }
    /** Persist a partial config patch (missing fields keep their current value). */
    async writeConfig(patch) {
        await this.ready();
        const g = (await this.readGlobal()) ?? {
            version: 1,
            teams: {},
            identifierCounter: 0,
        };
        const config = { ...(g.config ?? DEFAULT_TRACK_CONFIG), ...patch };
        await this.chain('__global', () => this.unit.setGlobal({ ...g, config }));
        return config;
    }
    async writeGlobal(g) {
        await this.ready();
        await this.chain('__global', () => this.unit.setGlobal(g));
    }
    /** Mint the next Linear-style identifier, e.g. `INV-12`. */
    async nextIdentifier(teamKey = 'INV') {
        await this.ready();
        const g = (await this.readGlobal()) ?? {
            version: 1,
            teams: {},
            identifierCounter: 0,
        };
        g.identifierCounter += 1;
        await this.writeGlobal(g);
        return `${teamKey}-${g.identifierCounter}`;
    }
    // ---- captures ----
    async listCaptures(status, opts = {}) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        let caps = Object.values(tables.captures ?? {});
        if (!opts.includeDeleted)
            caps = caps.filter((c) => c.deletedAt === undefined);
        return status ? caps.filter((c) => c.status === status) : caps;
    }
    async upsertCapture(capture) {
        await this.ready();
        await this.chain('captures', () => this.unit.putRecord('captures', capture.id, capture));
    }
    /**
     * Find an open capture whose normalized content matches `content` — the
     * content-hash dedup fallback. Only OPEN captures count: promoted/archived
     * items left the wall, so the same thought resurfacing later is a fresh
     * instance, not a wall duplicate.
     */
    async findOpenCaptureByContent(content) {
        await this.ready();
        const hash = captureContentHash(content);
        const caps = await this.listCaptures();
        return caps.find((c) => c.status === 'open' && captureContentHash(c.content) === hash);
    }
    /**
     * Durable per-session "first todo already captured" marker — the fix for
     * the restart-resurrected observer: the in-memory `todoSeen` set dies with
     * the web process, so a continued session used to re-capture its first
     * todo after every restart. The marker lives in the unit global, so it
     * survives restarts.
     */
    async isSessionTodoCaptured(sessionId) {
        await this.ready();
        const g = await this.readGlobal();
        return g?.autoTodoSessions?.[sessionId] !== undefined;
    }
    /** Persist the per-session todo-capture marker (idempotent). */
    async markSessionTodoCaptured(sessionId) {
        await this.ready();
        const g = (await this.readGlobal()) ?? {
            version: 1,
            teams: {},
            identifierCounter: 0,
        };
        await this.writeGlobal({
            ...g,
            autoTodoSessions: {
                ...(g.autoTodoSessions ?? {}),
                [sessionId]: new Date().toISOString(),
            },
        });
    }
    /** Has this session's first long REQUIREMENT already been captured (durable)? */
    async isSessionRequirementCaptured(sessionId) {
        await this.ready();
        const g = await this.readGlobal();
        return g?.autoRequirementSessions?.[sessionId] !== undefined;
    }
    /** Persist the per-session requirement-capture marker (idempotent). */
    async markSessionRequirementCaptured(sessionId) {
        await this.ready();
        const g = (await this.readGlobal()) ?? {
            version: 1,
            teams: {},
            identifierCounter: 0,
        };
        await this.writeGlobal({
            ...g,
            autoRequirementSessions: {
                ...(g.autoRequirementSessions ?? {}),
                [sessionId]: new Date().toISOString(),
            },
        });
    }
    /**
     * Dedup-aware capture creation — the single gate every capture path
     * (auto-observer, capture_thought, HTTP panel) goes through.
     *
     * Two guards, in order:
     *  1. `dedupeBySession` (auto-observer only): the durable per-session
     *     marker — one todo-capture per session even across restarts.
     *  2. Content hash: an identical open capture (any session) means the
     *     thought is already on the wall — do not re-insert.
     *
     * A duplicate returns `{ status: 'duplicate' }` and inserts nothing, so
     * callers can surface the existing capture instead of a silent drop.
     */
    async createCapture(capture, opts = {}) {
        await this.ready();
        if (opts.dedupeRequirementBySession && capture.sourceSessionId !== undefined) {
            if (await this.isSessionRequirementCaptured(capture.sourceSessionId)) {
                return { status: 'duplicate' };
            }
            await this.markSessionRequirementCaptured(capture.sourceSessionId);
        }
        if (opts.dedupeBySession && capture.sourceSessionId !== undefined) {
            // Durable marker hit, OR the session already has a todo-derived capture
            // (pre-fix sessions have no marker — backfill it so the next restart
            // dedupes without scanning).
            const sessionCaps = (await this.listCaptures())
                .filter((c) => c.sourceSessionId === capture.sourceSessionId);
            const alreadyTodo = sessionCaps.some((c) => c.source === 'session' && c.tags.includes('todo'));
            if (await this.isSessionTodoCaptured(capture.sourceSessionId) || alreadyTodo) {
                await this.markSessionTodoCaptured(capture.sourceSessionId);
                return { status: 'duplicate', existing: sessionCaps[0] };
            }
        }
        const existing = await this.findOpenCaptureByContent(capture.content);
        if (existing !== undefined)
            return { status: 'duplicate', existing };
        await this.upsertCapture(capture);
        if (opts.dedupeBySession && capture.sourceSessionId !== undefined) {
            await this.markSessionTodoCaptured(capture.sourceSessionId);
        }
        return { status: 'created', capture };
    }
    async getCapture(id) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.captures ?? {})[id];
    }
    /**
     * Soft-delete a capture (2026-08-18): marks `deletedAt`, never removes the
     * row — deletion is a strong user negation and the record must stay
     * complete and queryable. Default listings hide tombstones.
     */
    async deleteCapture(id, opts = {}) {
        await this.ready();
        const capture = await this.getCapture(id);
        if (!capture)
            return undefined;
        const now = Date.now();
        const updated = { ...capture, deletedAt: new Date(now).toISOString() };
        await this.chain('captures', () => this.unit.putRecord('captures', id, updated));
        await this.appendAudit({
            id: makeId('audit'),
            tool: 'track_delete_capture',
            ts: now,
            ok: true,
            detail: `capture deleted (${opts.by ?? 'user'})${opts.reason ? `: ${opts.reason}` : ''}`,
        });
        return updated;
    }
    /** Hard-delete a capture record (tests / storage cleanup — NOT the user path). */
    async purgeCapture(id) {
        await this.ready();
        await this.chain('captures', () => this.unit.deleteRecord('captures', id));
    }
    /**
     * Promote an open capture into a real issue: mint the issue from the
     * capture content and flip the capture to `promoted` with the issue id
     * attached (the same dedup contract the sync align pass uses).
     * @returns the freshly created issue.
     */
    async promoteCaptureToIssue(captureId, teamKey = 'INV') {
        await this.ready();
        const capture = await this.getCapture(captureId);
        if (!capture)
            throw new Error(`capture not found: ${captureId}`);
        if (capture.status === 'promoted' && capture.promotedToIssueId) {
            const existing = await this.getIssue(capture.promotedToIssueId);
            if (existing)
                return existing;
        }
        // Dedupe: a capture that is the concrete form of an existing issue
        // (same normalized title) promotes ONTO that issue instead of minting
        // a duplicate task — the same contract the sync align pass uses.
        const existingByTitle = (await this.listIssues())
            .find((i) => normalizeTitle(i.title) === normalizeTitle(capture.content));
        if (existingByTitle) {
            await this.chain('captures', () => this.unit.putRecord('captures', capture.id, {
                ...capture,
                status: 'promoted',
                promotedToIssueId: existingByTitle.id,
            }));
            return existingByTitle;
        }
        const issue = {
            id: makeId('issue'),
            identifier: await this.nextIdentifier(teamKey),
            title: capture.content,
            // Carry the motivation context into the issue description so the task
            // keeps its 'why' (capture context = the most recent explicit request).
            description: capture.context
                ? `${capture.content}\n\n动机: ${capture.context}`
                : capture.content,
            priority: 2,
            state: 'todo',
            teamId: teamKey,
            labels: [...capture.tags],
            linkedSessionIds: capture.sourceSessionId ? [capture.sourceSessionId] : [],
            promptMessageId: capture.sourceMessageId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, issue));
        await this.chain('captures', () => this.unit.putRecord('captures', capture.id, {
            ...capture,
            status: 'promoted',
            promotedToIssueId: issue.id,
        }));
        return issue;
    }
    // ---- decisions ----
    async upsertDecision(decision) {
        await this.ready();
        await this.chain('decisions', () => this.unit.putRecord('decisions', decision.id, decision));
    }
    async getDecision(id) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.decisions ?? {})[id];
    }
    /**
     * List decisions, newest first. Filters are optional and composable.
     * @param state   lifecycle filter (pending | answered | dismissed)
     * @param since   only decisions created at/after this epoch ms
     * @param sessionId  only decisions raised in this session
     */
    async listDecisions(state, since, sessionId) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        let decisions = Object.values(tables.decisions ?? {});
        if (state)
            decisions = decisions.filter((d) => d.status === state);
        if (sessionId)
            decisions = decisions.filter((d) => d.sessionId === sessionId);
        if (since !== undefined)
            decisions = decisions.filter((d) => Date.parse(d.createdAt) >= since);
        return decisions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    // ---- issues ----
    async listIssues(teamId, state, opts = {}) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        let issues = Object.values(tables.issues ?? {});
        if (!opts.includeDeleted)
            issues = issues.filter((i) => i.deletedAt === undefined);
        if (teamId)
            issues = issues.filter((i) => i.teamId === teamId);
        if (state)
            issues = issues.filter((i) => i.state === state);
        return issues;
    }
    async getIssue(id) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.issues ?? {})[id];
    }
    async upsertIssue(issue) {
        await this.ready();
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, issue));
    }
    /**
     * Soft-delete an issue (2026-08-18): marks `deletedAt`/`deletedBy`/
     * `deletedReason`, records the strong-negation `user-delete` evidence into
     * the issue's ledger, clears any pending confirmation, and appends an
     * audit entry. The row is NEVER removed by the user path — the identifier
     * stays durable and the full record (title, description, evidence, links)
     * remains queryable via includeDeleted. Default listings hide tombstones.
     * @returns the tombstoned issue, or undefined when not found.
     */
    async deleteIssue(id, opts = {}) {
        await this.ready();
        const issue = await this.getIssueByInput(id);
        if (!issue)
            return undefined;
        const now = Date.now();
        const evidence = {
            signal: 'user-delete',
            at: now,
            weight: -1,
            sessionId: opts.sessionId,
            pointer: opts.reason ?? 'user deleted',
        };
        const updated = {
            ...issue,
            deletedAt: new Date(now).toISOString(),
            deletedBy: opts.by ?? 'user',
            deletedReason: opts.reason,
            pendingConfirm: undefined,
            // The negation is ALWAYS recorded — even when the issue never had an
            // `inferred` ledger (fresh issues): evidence must survive the tombstone.
            inferred: {
                ...(issue.inferred ?? { state: issue.state, confidence: 0, at: now, by: 'auto' }),
                evidence: [...(issue.inferred?.evidence ?? []), evidence].slice(-MAX_EVIDENCE),
            },
            updatedAt: new Date(now).toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated));
        await this.appendAudit({
            id: makeId('audit'),
            tool: 'track_delete_issue',
            ts: now,
            sessionId: opts.sessionId,
            ok: true,
            detail: `${issue.identifier} deleted (${opts.by ?? 'user'})${opts.reason ? `: ${opts.reason}` : ''}`,
        });
        return updated;
    }
    /** Hard-delete an issue record (tests / storage cleanup — NOT the user path). */
    async purgeIssue(id) {
        await this.ready();
        await this.chain('issues', () => this.unit.deleteRecord('issues', id));
    }
    /** Resolve an issue by its store id OR Linear-style identifier (INV-12). */
    async getIssueByInput(input) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        const issues = Object.values(tables.issues ?? {});
        return issues.find((i) => i.id === input || i.identifier === input);
    }
    /**
     * Declare that `sessionId` is driving this issue (track_attach_issue).
     * Sets attachSessionId, appends the session to linkedSessionIds (R8
     * traceability), and clears any previous attachment so one session owns
     * one issue at a time.
     */
    async attachSession(issueId, sessionId) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        const issues = Object.values(tables.issues ?? {});
        const target = issues.find((i) => i.id === issueId || i.identifier === issueId);
        if (!target)
            return undefined;
        // Clear a stale attachment pointing at another issue from the same session.
        for (const other of issues) {
            if (other.id !== target.id && other.attachSessionId === sessionId) {
                await this.chain('issues', () => this.unit.putRecord('issues', other.id, { ...other, attachSessionId: undefined }));
            }
        }
        const updated = {
            ...target,
            attachSessionId: sessionId,
            linkedSessionIds: target.linkedSessionIds.includes(sessionId)
                ? target.linkedSessionIds
                : [...target.linkedSessionIds, sessionId],
            updatedAt: new Date().toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', target.id, updated));
        return updated;
    }
    /**
     * Apply one evidence signal to an issue in memory: re-evaluate the state
     * machine, write `inferred`, bump `lastProgressAt` on positive signals,
     * auto-commit only the safe todo → in_progress transition, and surface
     * confirmation-gated proposals (done/canceled) as `pendingConfirm`.
     * Shared by the single-signal path and the batch path (one loadAll).
     */
    applyEvidenceToIssue(issue, signal, now) {
        const evidence = [...(issue.inferred?.evidence ?? []), signal].slice(-MAX_EVIDENCE);
        const next = nextInferred(issue, evidence, now);
        const updated = {
            ...issue,
            lastProgressAt: signal.weight > 0 && signal.signal !== 'user-confirm'
                ? Math.max(issue.lastProgressAt ?? 0, signal.at)
                : issue.lastProgressAt,
            inferred: next.inferred,
            updatedAt: new Date(now).toISOString(),
        };
        // Auto-commit only the reversible todo → in_progress transition.
        if (isAutoCommit(next, issue)) {
            updated.state = 'in_progress';
        }
        // Surface confirmation-gated proposals as `pendingConfirm` (done/canceled):
        // the live observer callers are fire-and-forget, so returning `confirm`
        // alone used to drop the proposal; persisting it lets the panel render a
        // pending-confirmation section. Never cleared here — only confirm/dismiss.
        if (next.confirm) {
            // The machine only ever gates done/canceled (state-machine.ts) — cast
            // the union to the pendingConfirm contract.
            updated.pendingConfirm = { to: next.confirm.to, reason: next.confirm.reason, at: now };
        }
        return updated;
    }
    /**
     * Record one evidence signal against an issue, re-evaluate the state
     * machine, and apply the result: write `inferred`, update `lastProgressAt`
     * on positive signals, and auto-commit `state` only for the safe
     * todo → in_progress transition. Confirmation-gated proposals (done /
     * canceled) are returned in `confirm` and NOT written to `state`.
     */
    async recordIssueEvidence(issueId, signal, sessionId, now = Date.now()) {
        await this.ready();
        const issue = await this.getIssue(issueId);
        if (!issue)
            return null;
        const updated = this.applyEvidenceToIssue(issue, signal, now);
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated));
        // The machine only ever gates done/canceled (state-machine.ts) — the
        // pendingConfirm union's 'review' arm never comes from evidence signals.
        return { issue: updated, confirm: updated.pendingConfirm ? { to: updated.pendingConfirm.to, reason: updated.pendingConfirm.reason } : undefined };
    }
    /**
     * Record many evidence signals with ONE store load — the batch face for
     * scan pipelines (track_git_artifacts) that fire signals for many issues.
     * Each issue is loaded once, updated in memory, and written once; signals
     * for the same issue are applied in order.
     */
    async recordIssueEvidenceMany(items, now = Date.now()) {
        await this.ready();
        if (items.length === 0)
            return 0;
        const { tables } = await this.unit.loadAll();
        const issues = Object.values(tables.issues ?? {});
        const byId = new Map(issues.map((i) => [i.id, i]));
        let written = 0;
        for (const item of items) {
            const issue = byId.get(item.issueId);
            if (!issue)
                continue;
            const updated = this.applyEvidenceToIssue(issue, item.signal, now);
            byId.set(issue.id, updated);
            await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated));
            written += 1;
        }
        return written;
    }
    /**
     * Commit a state change on explicit confirmation (user nod / panel / a
     * confirmed_by_user tool call). Writes `state` and records the confirmed
     * state as the current inference.
     */
    async confirmIssueState(issueId, state, by = 'user', now = Date.now()) {
        await this.ready();
        const issue = await this.getIssue(issueId);
        if (!issue)
            return undefined;
        const updated = {
            ...issue,
            state,
            // A committed done/canceled resolves any pending confirmation.
            pendingConfirm: (state === 'done' || state === 'canceled') ? undefined : issue.pendingConfirm,
            inferred: {
                state,
                confidence: 1,
                evidence: issue.inferred?.evidence ?? [],
                at: now,
                by,
            },
            updatedAt: new Date().toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated));
        return updated;
    }
    /**
     * Auto-confirm canceled proposals past their grace period (config
     * autoCancelPendingDays, default 14d): a canceled proposal that has stood
     * untouched for the whole grace is garbage-collected — the user never
     * engaged, the work is abandoned. done is NEVER auto-confirmed (the
     * confirmation-gate principle). Audited via the state commit itself.
     */
    async autoConfirmPendingCanceled(now = Date.now()) {
        await this.ready();
        const cfg = await this.readConfig();
        if (!cfg.autoCancelPendingDays)
            return { confirmed: 0 };
        const graceMs = cfg.autoCancelPendingDays * 86_400_000;
        const issues = await this.listIssues();
        let confirmed = 0;
        for (const issue of issues) {
            const pc = issue.pendingConfirm;
            if (!pc || pc.to !== 'canceled')
                continue;
            if (now - pc.at > graceMs) {
                await this.confirmIssueState(issue.id, 'canceled', 'auto', now);
                confirmed += 1;
            }
        }
        return { confirmed };
    }
    /**
     * Periodic lifecycle sweep: re-evaluate EVERY in_progress issue (not just
     * attached-session ones) and persist `pendingConfirm` where the machine sees
     * completion evidence or abandonment. The live observer only fires for the
     * attached session, so sync-created issues never accumulate evidence —
     * without this sweep their done/canceled proposals would never surface.
     * Confirmation stays user-gated: this only PROPOSES (writes pendingConfirm).
     * @returns how many issues were evaluated and how many got a fresh proposal.
     */
    async sweepLifecycle(now = Date.now()) {
        await this.ready();
        const issues = await this.listIssues();
        let evaluated = 0;
        let proposed = 0;
        for (const issue of issues) {
            if (issue.state !== 'in_progress')
                continue;
            evaluated += 1;
            const proposal = sweepProposal(issue, now);
            if (!proposal)
                continue;
            const same = issue.pendingConfirm !== undefined
                && issue.pendingConfirm.to === proposal.to
                && issue.pendingConfirm.reason === proposal.reason;
            if (same)
                continue;
            await this.chain('issues', () => this.unit.putRecord('issues', issue.id, {
                ...issue,
                pendingConfirm: { to: proposal.to, reason: proposal.reason, at: now },
                updatedAt: new Date().toISOString(),
            }));
            proposed += 1;
        }
        return { evaluated, proposed };
    }
    /**
     * User dismissed a pending proposal: clear the marker without changing
     * `state`. The sweep may re-propose while the underlying evidence stands —
     * dismissal is a one-shot ack, not a veto; users can also delete the issue.
     */
    async dismissPending(issueId) {
        await this.ready();
        const issue = await this.getIssue(issueId);
        if (!issue)
            return undefined;
        if (!issue.pendingConfirm)
            return issue;
        const updated = {
            ...issue,
            pendingConfirm: undefined,
            updatedAt: new Date().toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', issue.id, updated));
        return updated;
    }
    /**
     * Merge `sourceId` into `canonicalId` (same work line, duplicate task):
     * union linked sessions / description / labels onto the canonical, then
     * mark the source canceled with an evidence pointer. The caller is the
     * confirmation gate — user-confirmed via the API, or 'auto' for the
     * deterministic exact-title dedup loop (state-machine discipline: only
     * the auto loop uses by='auto', and only for EXACT normalized-title
     * equality, which is mechanical not judgmental).
     */
    async mergeIntoCanonical(sourceId, canonicalId, by = 'user', now = Date.now()) {
        await this.ready();
        const source = await this.getIssue(sourceId);
        const canonical = await this.getIssue(canonicalId);
        if (!source || !canonical)
            return undefined;
        if (source.id === canonical.id)
            return canonical;
        const merged = {
            ...canonical,
            linkedSessionIds: Array.from(new Set([...(canonical.linkedSessionIds ?? []), ...(source.linkedSessionIds ?? [])])),
            description: canonical.description || source.description,
            labels: Array.from(new Set([...canonical.labels, ...source.labels])),
            updatedAt: new Date().toISOString(),
        };
        const closed = {
            ...source,
            state: 'canceled',
            pendingConfirm: undefined,
            inferred: {
                state: 'canceled',
                confidence: 1,
                at: now,
                by: by === 'user' ? 'user' : 'auto',
                evidence: [
                    ...(source.inferred?.evidence ?? []),
                    { signal: 'model-propose', at: now, weight: 0, pointer: `merged into ${canonical.identifier} (${canonical.id})` },
                ].slice(-MAX_EVIDENCE),
            },
            updatedAt: new Date().toISOString(),
        };
        await this.chain('issues', () => this.unit.putRecord('issues', canonical.id, merged));
        await this.chain('issues', () => this.unit.putRecord('issues', source.id, closed));
        await this.appendAudit({
            id: makeId('audit'),
            tool: 'track_update_issue_state',
            ts: now,
            ok: true,
            detail: `${source.identifier} merged into ${canonical.identifier} (${by})`,
        });
        return merged;
    }
    /**
     * Capture triage (deterministic, zero LLM — part of the auto-maintenance
     * loop): an open capture whose content IS an existing issue's title
     * (normalized equality) is the concrete form of that work — promote it
     * onto the issue instead of leaving it open forever. Counts stale open
     * captures (older than STALE_CAPTURE_MS) so the loop can surface them.
     */
    async triageCaptures(now = Date.now()) {
        await this.ready();
        const [captures, issues] = await Promise.all([this.listCaptures(), this.listIssues()]);
        const titles = new Set(issues.map((i) => normalizeTitle(i.title)));
        let promoted = 0;
        let stale = 0;
        for (const capture of captures) {
            if (capture.status !== 'open')
                continue;
            if (titles.has(normalizeTitle(capture.content))) {
                await this.promoteCaptureToIssue(capture.id, 'INV');
                promoted += 1;
                continue;
            }
            if (now - Date.parse(capture.createdAt) > STALE_CAPTURE_MS)
                stale += 1;
        }
        return { open: captures.filter((c) => c.status === 'open').length, promoted, stale };
    }
    /**
     * Auto-merge exact-title duplicates (the dedup loop): group NON-terminal
     * issues by normalized title; every group with more than one member is a
     * mechanical duplicate — merge the later ones into the first. Audited via
     * mergeIntoCanonical(by='auto'). Near-duplicates (different wording) are
     * NOT touched here — they need a human call.
     */
    /**
     * Auto-merge duplicate issues (the dedup loop): group NON-terminal issues
     * by token similarity at or above the configured nearDupThreshold (exact
     * titles are similarity 1.0 — one pass covers both). Each group's issues
     * merge into the LOWEST identifier (canonical), unioning sessions; the
     * sources are canceled with an audited pointer. Approved 2026-08-14: the
     * user wants suspected duplicates merged automatically, not proposed —
     * nothing is lost (canonical keeps union data) and every merge is audited.
     */
    async autoMergeDuplicates(now = Date.now()) {
        await this.ready();
        const cfg = await this.readConfig();
        const issues = (await this.listIssues())
            .filter((i) => i.state !== 'done' && i.state !== 'canceled')
            .sort((a, b) => a.identifier.localeCompare(b.identifier, undefined, { numeric: true }));
        const tokenized = issues.map((i) => ({ issue: i, tokens: contentTokens(i.title) }));
        const used = new Set();
        let groups = 0;
        let merged = 0;
        for (let i = 0; i < tokenized.length; i++) {
            const entry = tokenized[i];
            if (used.has(entry.issue.id))
                continue;
            const group = [entry];
            used.add(entry.issue.id);
            for (let j = i + 1; j < tokenized.length; j++) {
                const other = tokenized[j];
                if (used.has(other.issue.id))
                    continue;
                if (titleSimilarity(entry.tokens, other.tokens) >= cfg.nearDupThreshold) {
                    group.push(other);
                    used.add(other.issue.id);
                }
            }
            if (group.length < 2)
                continue;
            groups += 1;
            // Already identifier-sorted: group[0] is the canonical.
            for (const dup of group.slice(1)) {
                await this.mergeIntoCanonical(dup.issue.id, group[0].issue.id, 'auto', now);
                merged += 1;
            }
        }
        return { groups, merged };
    }
    // ---- epics ----
    async listEpics() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.epics ?? {});
    }
    async upsertEpic(epic) {
        await this.ready();
        await this.chain('epics', () => this.unit.putRecord('epics', epic.id, epic));
    }
    // ---- links ----
    async listLinks() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.links ?? {});
    }
    async upsertLink(link) {
        await this.ready();
        const safe = enforceEvidenceDiscipline(link);
        await this.chain('links', () => this.unit.putRecord('links', safe.id, safe));
    }
    /** All links touching one entity id (either direction). */
    async linksFor(id) {
        await this.ready();
        const links = await this.listLinks();
        return links.filter((l) => l.fromId === id || l.toId === id);
    }
    // ---- session execution graphs (M1 genealogy floor) ----
    /** Persist (or replace) the execution graph of one session. Idempotent:
     *  the deterministic builder produces the same nodes/edges for the same log. */
    async upsertGraph(graph) {
        await this.ready();
        await this.chain('graph', () => this.unit.putRecord('graph', graph.sessionId, graph));
    }
    async getGraph(sessionId) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.graph ?? {})[sessionId];
    }
    /** All stored session graphs (for status / build-all reporting). */
    async listGraphs() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.graph ?? {});
    }
    /** Persist the per-session graph-built marker (observability only). */
    async markGraphBuilt(sessionId, at = new Date().toISOString()) {
        await this.ready();
        const g = (await this.readGlobal()) ?? {
            version: 1,
            teams: {},
            identifierCounter: 0,
        };
        await this.writeGlobal({
            ...g,
            graphBuiltSessions: {
                ...(g.graphBuiltSessions ?? {}),
                [sessionId]: at,
            },
        });
    }
    // ---- projects (genealogy Layer 1 grouping) ----
    /** Persist (or replace) a project. Idempotent: project ids are cwd hashes. */
    async upsertProject(project) {
        await this.ready();
        await this.chain('projects', () => this.unit.putRecord('projects', project.id, project));
    }
    /** Remove a project record (stale induction cleanup). */
    async deleteProject(id) {
        await this.ready();
        await this.chain('projects', () => this.unit.deleteRecord('projects', id));
    }
    async getProject(id) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.projects ?? {})[id];
    }
    async listProjects() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.projects ?? {});
    }
    // ---- git commit artifacts (M3 — Layer 0 code anchor) ----
    /** Persist (or replace) a commit artifact. Idempotent: ids are sha hashes. */
    async upsertCommit(commit) {
        await this.ready();
        await this.chain('commits', () => this.unit.putRecord('commits', commit.id, commit));
    }
    async getCommit(id) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return (tables.commits ?? {})[id];
    }
    async listCommits(projectId) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        const commits = Object.values(tables.commits ?? {});
        return projectId ? commits.filter((c) => c.projectId === projectId) : commits;
    }
    // ---- extraction runs (ledger-first: durable intermediate knowledge) ----
    /** Persist one extraction run. Idempotent: deterministic run ids. */
    async upsertExtraction(run) {
        await this.ready();
        await this.chain('extractions', () => this.unit.putRecord('extractions', run.id, run));
    }
    async listExtractions(limit = 20) {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.extractions ?? {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    }
    // ---- audit (observability) ----
    async appendAudit(entry) {
        await this.ready();
        await this.chain('audit', () => this.unit.putRecord('audit', entry.id, entry));
    }
    async listAudit() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.audit ?? {});
    }
    // ---- llm usage ledger (observability / cost accounting) ----
    /** Append one LLM usage record (append-only ledger, one per real request). */
    async appendUsage(record) {
        await this.ready();
        await this.chain('usage', () => this.unit.putRecord('usage', record.id, record));
    }
    async listUsage() {
        await this.ready();
        const { tables } = await this.unit.loadAll();
        return Object.values(tables.usage ?? {});
    }
    /**
     * Funnel summary over the audit trail — the observability face for the
     * capture/issue/decision pipeline. Answers "how many times was each tool
     * invoked, and what is the capture conversion" directly from the store,
     * instead of archaeology over session logs.
     */
    async funnel() {
        await this.ready();
        const audit = await this.listAudit();
        const tools = {};
        for (const entry of audit) {
            const acc = (tools[entry.tool] ??= { calls: 0, ok: 0, fail: 0 });
            acc.calls += 1;
            if (entry.ok)
                acc.ok += 1;
            else
                acc.fail += 1;
        }
        const captures = await this.listCaptures();
        const open = captures.filter((c) => c.status === 'open').length;
        const promoted = captures.filter((c) => c.status === 'promoted').length;
        const issues = await this.listIssues();
        const decisions = await this.listDecisions();
        const pending = decisions.filter((d) => d.status === 'pending').length;
        const answered = decisions.filter((d) => d.status === 'answered').length;
        const dismissed = decisions.filter((d) => d.status === 'dismissed').length;
        const captureCalls = tools['capture_thought']?.calls ?? 0;
        return {
            tools,
            captures: { open, promoted },
            issues: { total: issues.length },
            decisions: {
                pending,
                answered,
                dismissed,
                answerRate: decisions.length > 0 ? Number((answered / decisions.length).toFixed(3)) : null,
            },
            captureConversion: captureCalls > 0 ? Number((promoted / captureCalls).toFixed(3)) : null,
        };
    }
}
