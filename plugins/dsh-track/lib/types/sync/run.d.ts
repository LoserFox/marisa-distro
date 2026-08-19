/**
 * Sync pipeline — review workspace sessions and fold epic/issue-level task
 * history into the Track store.
 *
 * The "plugin command" entry: `track_sync_history` (model tool) and
 * `POST /api/track/sync` (panel) both funnel through `runSync`. The pipeline
 * is dependency-injected (session-query service + store) so it is testable
 * without a live harness, and dry-run-first so write-back stays human/track
 * confirmed (the triage discipline).
 * @module @fakechris/dsh-track/sync/run
 */
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';
import type { Context } from '@deepseek-ai/cordis';
import type { TrackStore } from '../store.ts';
import { type IssueAction } from './align.ts';
import { type EpicCandidate, type IssueCandidate } from './cluster.ts';
/** Sync scope and write-back control. */
export interface SyncOptions {
    /** Exact workspace `cwd` to scan (same equality rule as session-query). */
    cwd: string;
    /** Only fold sessions with activity after this epoch ms (default: 7 days ago). */
    since?: number;
    /** Preview only — do not write. Default true. */
    dryRun?: boolean;
    /** Safety cap on sessions scanned per run. */
    maxSessions?: number;
    /**
     * Extraction engine. 'v1' = extract→cluster→align (original); 'v2' =
     * normalize→segment→intent→synthesize→project→align (v2 evidence-to-work
     * pipeline). Default 'v1' for backward compatibility.
     */
    engine?: 'v1' | 'v2';
}
/** Structured result of one sync run. */
export interface SyncReport {
    /** Sessions scanned (after cursor/since filtering). */
    scannedSessions: number;
    /** Sessions skipped by the incremental cursor or `since`. */
    skippedByCursor: number;
    /** Total user-initiated requests folded across scanned sessions. */
    userRequests: number;
    /** Issue candidates produced by clustering. */
    issueCandidates: IssueCandidate[];
    /** Epic candidates produced by clustering. */
    epicCandidates: EpicCandidate[];
    /** Per-candidate reconcile action (create/update/skip). */
    actions: IssueAction[];
    /** Counts after write-back (dry-run reports what *would* happen). */
    created: number;
    updated: number;
    skipped: number;
    /** Captures promoted to issues by this pass (open capture → create+promote). */
    promotedCaptures: number;
}
/** Minimal service surface runSync needs — easy to stub in tests. */
export interface SyncDeps {
    sessionQuery: Pick<SessionQueryEngine, 'filterSessions' | 'readSession' | 'readTitle'>;
    store: TrackStore;
    /** Optional refiner hook (LLM enhancement, P4); default identity. */
    refine?: (candidates: IssueCandidate[], epics: EpicCandidate[]) => Promise<{
        issues: IssueCandidate[];
        epics: EpicCandidate[];
    }>;
    /** Cordis context — required for the v2 engine's LLM calls (getLlm). */
    ctx?: Context;
}
/**
 * Map an array through a worker with bounded concurrency, preserving input
 * order in the result. Used by the v2 Phase A session loop — sessions are
 * independent, so a small pool (default 3) cuts wall time ~3-5× for LLM-heavy
 * runs without tripping provider burst-QPS limits.
 */
export declare function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
/**
 * Run one sync pass.
 *
 * Pipeline (v1): filterSessions(cwd) → readSession+readTitle per session →
 * extractWorklog → clusterWorklogs → alignCandidates → dry-run report or
 * write-back (upsert issues/epics + advance the cursor).
 *
 * Pipeline (v2, engine:'v2'): …→ normalizeLog → segmentByRules →
 * intent-layering per span (LLM, drops directives) → synthesizeCandidate
 * (LLM) or candidateFromSpan (downgrade) → projectToIssueCandidate →
 * alignCandidates → same report/write-back.
 */
export declare function runSync(deps: SyncDeps, options: SyncOptions): Promise<SyncReport>;
