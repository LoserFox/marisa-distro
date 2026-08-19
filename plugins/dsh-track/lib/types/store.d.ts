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
import type { KvFacet, KvUnitDescriptor } from '@deepseek-ai/dsh-storage';
import { type AuditEntry, type Capture, type Decision, type Epic, type TrackGlobal, type TrackConfig, type Issue, type Link, type LlmUsageRecord, type EvidenceRef, type SessionGraph, type Project, type CommitArtifact, type ExtractionRun } from './types.ts';
/** Open captures older than this are reported as stale by the auto-maintenance
 *  loop (they should be promoted, archived, or deleted). */
export declare const STALE_CAPTURE_MS: number;
/** Token-overlap similarity in [0,1]: shared / smaller set, requiring ≥3 shared
 *  tokens (never merges on incidental bigram hits). */
export declare function titleSimilarity(a: Set<string>, b: Set<string>): number;
/** Branded identifier prefixes keep record ids recognizable and collision-free. */
export declare const ID_PREFIX: {
    readonly capture: "track_capture_";
    readonly issue: "track_issue_";
    readonly epic: "track_epic_";
    readonly link: "track_link_";
    readonly decision: "track_decision_";
    readonly audit: "track_audit_";
    readonly usage: "track_usage_";
};
/** Random id with the given brand prefix. */
export declare function makeId(kind: keyof typeof ID_PREFIX): string;
/**
 * Normalize capture content for dedup: trim and collapse every whitespace
 * run to a single space, so " 摸清 前提 " and "摸清 前提" hash the same.
 * Case is preserved — a case-fold would risk merging distinct thoughts
 * (conservative dedup: only obvious copies collapse).
 */
export declare function normalizeCaptureContent(content: string): string;
/**
 * Stable content hash for capture dedup (sha256 of the normalized content,
 * first 16 hex chars). Used as the content-level fallback so an identical
 * thought never lands twice on the capture wall.
 */
export declare function captureContentHash(content: string): string;
/** Result of a dedup-aware capture creation. */
export type CaptureCreateResult = {
    status: 'created';
    capture: Capture;
}
/** The capture was not inserted — an equivalent one already exists. */
 | {
    status: 'duplicate';
    existing?: Capture;
};
export declare function enforceEvidenceDiscipline(link: Link): Link;
export declare class TrackStore {
    private readonly descriptor;
    private unit;
    private chains;
    private opened;
    private openPromise;
    constructor(descriptor?: KvUnitDescriptor);
    /** Open the unit on a kv facet (json or sqlite backend). Call once at plugin apply. */
    open(kvFacet: KvFacet): Promise<void>;
    /** Wait for the unit to be open before any store operation. */
    private ready;
    get isOpen(): boolean;
    /** Close the unit and drain in-flight writes. */
    close(): Promise<void>;
    /** Serialize one write on a table: next write waits for the previous. */
    private chain;
    readGlobal(): Promise<TrackGlobal | null>;
    /** Effective auto-maintenance config: stored values merged over defaults. */
    readConfig(): Promise<TrackConfig>;
    /** Persist a partial config patch (missing fields keep their current value). */
    writeConfig(patch: Partial<TrackConfig>): Promise<TrackConfig>;
    writeGlobal(g: TrackGlobal): Promise<void>;
    /** Mint the next Linear-style identifier, e.g. `INV-12`. */
    nextIdentifier(teamKey?: string): Promise<string>;
    listCaptures(status?: Capture['status'], opts?: {
        includeDeleted?: boolean;
    }): Promise<Capture[]>;
    upsertCapture(capture: Capture): Promise<void>;
    /**
     * Find an open capture whose normalized content matches `content` — the
     * content-hash dedup fallback. Only OPEN captures count: promoted/archived
     * items left the wall, so the same thought resurfacing later is a fresh
     * instance, not a wall duplicate.
     */
    findOpenCaptureByContent(content: string): Promise<Capture | undefined>;
    /**
     * Durable per-session "first todo already captured" marker — the fix for
     * the restart-resurrected observer: the in-memory `todoSeen` set dies with
     * the web process, so a continued session used to re-capture its first
     * todo after every restart. The marker lives in the unit global, so it
     * survives restarts.
     */
    isSessionTodoCaptured(sessionId: string): Promise<boolean>;
    /** Persist the per-session todo-capture marker (idempotent). */
    markSessionTodoCaptured(sessionId: string): Promise<void>;
    /** Has this session's first long REQUIREMENT already been captured (durable)? */
    isSessionRequirementCaptured(sessionId: string): Promise<boolean>;
    /** Persist the per-session requirement-capture marker (idempotent). */
    markSessionRequirementCaptured(sessionId: string): Promise<void>;
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
    createCapture(capture: Capture, opts?: {
        dedupeBySession?: boolean;
        dedupeRequirementBySession?: boolean;
    }): Promise<CaptureCreateResult>;
    getCapture(id: string): Promise<Capture | undefined>;
    /**
     * Soft-delete a capture (2026-08-18): marks `deletedAt`, never removes the
     * row — deletion is a strong user negation and the record must stay
     * complete and queryable. Default listings hide tombstones.
     */
    deleteCapture(id: string, opts?: {
        by?: 'user' | 'agent' | 'auto';
        reason?: string;
    }): Promise<Capture | undefined>;
    /** Hard-delete a capture record (tests / storage cleanup — NOT the user path). */
    purgeCapture(id: string): Promise<void>;
    /**
     * Promote an open capture into a real issue: mint the issue from the
     * capture content and flip the capture to `promoted` with the issue id
     * attached (the same dedup contract the sync align pass uses).
     * @returns the freshly created issue.
     */
    promoteCaptureToIssue(captureId: string, teamKey?: string): Promise<Issue>;
    upsertDecision(decision: Decision): Promise<void>;
    getDecision(id: string): Promise<Decision | undefined>;
    /**
     * List decisions, newest first. Filters are optional and composable.
     * @param state   lifecycle filter (pending | answered | dismissed)
     * @param since   only decisions created at/after this epoch ms
     * @param sessionId  only decisions raised in this session
     */
    listDecisions(state?: Decision['status'], since?: number, sessionId?: string): Promise<Decision[]>;
    listIssues(teamId?: string, state?: Issue['state'], opts?: {
        includeDeleted?: boolean;
    }): Promise<Issue[]>;
    getIssue(id: string): Promise<Issue | undefined>;
    upsertIssue(issue: Issue): Promise<void>;
    /**
     * Soft-delete an issue (2026-08-18): marks `deletedAt`/`deletedBy`/
     * `deletedReason`, records the strong-negation `user-delete` evidence into
     * the issue's ledger, clears any pending confirmation, and appends an
     * audit entry. The row is NEVER removed by the user path — the identifier
     * stays durable and the full record (title, description, evidence, links)
     * remains queryable via includeDeleted. Default listings hide tombstones.
     * @returns the tombstoned issue, or undefined when not found.
     */
    deleteIssue(id: string, opts?: {
        by?: Issue['deletedBy'];
        reason?: string;
        sessionId?: string;
    }): Promise<Issue | undefined>;
    /** Hard-delete an issue record (tests / storage cleanup — NOT the user path). */
    purgeIssue(id: string): Promise<void>;
    /** Resolve an issue by its store id OR Linear-style identifier (INV-12). */
    getIssueByInput(input: string): Promise<Issue | undefined>;
    /**
     * Declare that `sessionId` is driving this issue (track_attach_issue).
     * Sets attachSessionId, appends the session to linkedSessionIds (R8
     * traceability), and clears any previous attachment so one session owns
     * one issue at a time.
     */
    attachSession(issueId: string, sessionId: string): Promise<Issue | undefined>;
    /**
     * Apply one evidence signal to an issue in memory: re-evaluate the state
     * machine, write `inferred`, bump `lastProgressAt` on positive signals,
     * auto-commit only the safe todo → in_progress transition, and surface
     * confirmation-gated proposals (done/canceled) as `pendingConfirm`.
     * Shared by the single-signal path and the batch path (one loadAll).
     */
    private applyEvidenceToIssue;
    /**
     * Record one evidence signal against an issue, re-evaluate the state
     * machine, and apply the result: write `inferred`, update `lastProgressAt`
     * on positive signals, and auto-commit `state` only for the safe
     * todo → in_progress transition. Confirmation-gated proposals (done /
     * canceled) are returned in `confirm` and NOT written to `state`.
     */
    recordIssueEvidence(issueId: string, signal: EvidenceRef, sessionId: string, now?: number): Promise<{
        issue: Issue;
        confirm?: {
            to: Issue['state'];
            reason: string;
        };
    } | null>;
    /**
     * Record many evidence signals with ONE store load — the batch face for
     * scan pipelines (track_git_artifacts) that fire signals for many issues.
     * Each issue is loaded once, updated in memory, and written once; signals
     * for the same issue are applied in order.
     */
    recordIssueEvidenceMany(items: Array<{
        issueId: string;
        signal: EvidenceRef;
    }>, now?: number): Promise<number>;
    /**
     * Commit a state change on explicit confirmation (user nod / panel / a
     * confirmed_by_user tool call). Writes `state` and records the confirmed
     * state as the current inference.
     */
    confirmIssueState(issueId: string, state: Issue['state'], by?: 'user' | 'model' | 'auto', now?: number): Promise<Issue | undefined>;
    /**
     * Auto-confirm canceled proposals past their grace period (config
     * autoCancelPendingDays, default 14d): a canceled proposal that has stood
     * untouched for the whole grace is garbage-collected — the user never
     * engaged, the work is abandoned. done is NEVER auto-confirmed (the
     * confirmation-gate principle). Audited via the state commit itself.
     */
    autoConfirmPendingCanceled(now?: number): Promise<{
        confirmed: number;
    }>;
    /**
     * Periodic lifecycle sweep: re-evaluate EVERY in_progress issue (not just
     * attached-session ones) and persist `pendingConfirm` where the machine sees
     * completion evidence or abandonment. The live observer only fires for the
     * attached session, so sync-created issues never accumulate evidence —
     * without this sweep their done/canceled proposals would never surface.
     * Confirmation stays user-gated: this only PROPOSES (writes pendingConfirm).
     * @returns how many issues were evaluated and how many got a fresh proposal.
     */
    sweepLifecycle(now?: number): Promise<{
        evaluated: number;
        proposed: number;
    }>;
    /**
     * User dismissed a pending proposal: clear the marker without changing
     * `state`. The sweep may re-propose while the underlying evidence stands —
     * dismissal is a one-shot ack, not a veto; users can also delete the issue.
     */
    dismissPending(issueId: string): Promise<Issue | undefined>;
    /**
     * Merge `sourceId` into `canonicalId` (same work line, duplicate task):
     * union linked sessions / description / labels onto the canonical, then
     * mark the source canceled with an evidence pointer. The caller is the
     * confirmation gate — user-confirmed via the API, or 'auto' for the
     * deterministic exact-title dedup loop (state-machine discipline: only
     * the auto loop uses by='auto', and only for EXACT normalized-title
     * equality, which is mechanical not judgmental).
     */
    mergeIntoCanonical(sourceId: string, canonicalId: string, by?: 'user' | 'auto', now?: number): Promise<Issue | undefined>;
    /**
     * Capture triage (deterministic, zero LLM — part of the auto-maintenance
     * loop): an open capture whose content IS an existing issue's title
     * (normalized equality) is the concrete form of that work — promote it
     * onto the issue instead of leaving it open forever. Counts stale open
     * captures (older than STALE_CAPTURE_MS) so the loop can surface them.
     */
    triageCaptures(now?: number): Promise<{
        open: number;
        promoted: number;
        stale: number;
    }>;
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
    autoMergeDuplicates(now?: number): Promise<{
        groups: number;
        merged: number;
    }>;
    listEpics(): Promise<Epic[]>;
    upsertEpic(epic: Epic): Promise<void>;
    listLinks(): Promise<Link[]>;
    upsertLink(link: Link): Promise<void>;
    /** All links touching one entity id (either direction). */
    linksFor(id: string): Promise<Link[]>;
    /** Persist (or replace) the execution graph of one session. Idempotent:
     *  the deterministic builder produces the same nodes/edges for the same log. */
    upsertGraph(graph: SessionGraph): Promise<void>;
    getGraph(sessionId: string): Promise<SessionGraph | undefined>;
    /** All stored session graphs (for status / build-all reporting). */
    listGraphs(): Promise<SessionGraph[]>;
    /** Persist the per-session graph-built marker (observability only). */
    markGraphBuilt(sessionId: string, at?: string): Promise<void>;
    /** Persist (or replace) a project. Idempotent: project ids are cwd hashes. */
    upsertProject(project: Project): Promise<void>;
    /** Remove a project record (stale induction cleanup). */
    deleteProject(id: string): Promise<void>;
    getProject(id: string): Promise<Project | undefined>;
    listProjects(): Promise<Project[]>;
    /** Persist (or replace) a commit artifact. Idempotent: ids are sha hashes. */
    upsertCommit(commit: CommitArtifact): Promise<void>;
    getCommit(id: string): Promise<CommitArtifact | undefined>;
    listCommits(projectId?: string): Promise<CommitArtifact[]>;
    /** Persist one extraction run. Idempotent: deterministic run ids. */
    upsertExtraction(run: ExtractionRun): Promise<void>;
    listExtractions(limit?: number): Promise<ExtractionRun[]>;
    appendAudit(entry: AuditEntry): Promise<void>;
    listAudit(): Promise<AuditEntry[]>;
    /** Append one LLM usage record (append-only ledger, one per real request). */
    appendUsage(record: LlmUsageRecord): Promise<void>;
    listUsage(): Promise<LlmUsageRecord[]>;
    /**
     * Funnel summary over the audit trail — the observability face for the
     * capture/issue/decision pipeline. Answers "how many times was each tool
     * invoked, and what is the capture conversion" directly from the store,
     * instead of archaeology over session logs.
     */
    funnel(): Promise<{
        tools: Record<string, {
            calls: number;
            ok: number;
            fail: number;
        }>;
        captures: {
            open: number;
            promoted: number;
        };
        issues: {
            total: number;
        };
        decisions: {
            pending: number;
            answered: number;
            dismissed: number;
            answerRate: number | null;
        };
        captureConversion: number | null;
    }>;
}
export type { KvFacet };
