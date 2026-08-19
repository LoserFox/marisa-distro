/**
 * Rule-based clustering — turn extracted worklogs into epic/issue candidates.
 *
 * Deterministic, dependency-free clustering (the "rule skeleton" of the hybrid
 * engine): sessions whose normalized titles match form one epic (a work
 * thread); each session becomes one issue candidate under its epic. The LLM
 * refiner (P4) can later re-title, merge, or split these candidates.
 * @module @fakechris/dsh-track/sync/cluster
 */
import type { Epic, Issue, IssueState } from '../types.ts';
import type { SessionWorklog } from './extract.ts';
/** An issue candidate produced by clustering. */
export interface IssueCandidate {
    /** Stable dedupe key: the session id (one issue per session in rule mode). */
    key: string;
    sessionId: string;
    title: string;
    description: string;
    priority: Issue['priority'];
    /** Rule-inferred state — conservative: never auto-`done`. */
    suggestedState: IssueState;
    labels: string[];
    linkedSessionIds: string[];
    createdAt: string;
    updatedAt: string;
    /** Epic key this candidate belongs to (cluster key). */
    epicKey: string;
    /** Evidence span that produced this candidate (v2 engine) — the citation
     *  pointer back to the raw log, persisted onto the created issue. */
    span?: {
        seqStart: number;
        seqEnd: number;
    };
    /** Semantic node kind (requirement/problem/decision/...) — mapped from the
     *  v2 candidate kind; absent on v1 rule candidates. */
    semanticKind?: 'requirement' | 'problem' | 'decision' | 'task' | 'investigation';
    /** Source authority (invariant #3) — mapped from the v2 candidate authority. */
    origin?: 'user_explicit' | 'user_confirmed' | 'agent_proposed' | 'system_inferred';
}
/** An epic candidate: a work thread grouping one or more sessions. */
export interface EpicCandidate {
    /** Cluster key (normalized shared title), stable across runs. */
    key: string;
    name: string;
    description: string;
    status: Epic['status'];
    sessionIds: string[];
    /** Span of session activity. */
    createdAt: string;
    updatedAt: string;
}
/** One session's metadata for clustering. */
export interface SessionMeta {
    /** Session id. */
    id: string;
    /** Folded session title, when available. */
    title?: string;
    /** Workspace / team key (Linear team id). */
    teamKey: string;
    /** Session creation time (epoch ms). */
    createdAt: number;
}
export interface ClusterResult {
    epics: EpicCandidate[];
    issues: IssueCandidate[];
}
/**
 * Normalize a title for clustering: lowercase, strip ALL non-alphanumeric
 * characters (so "OAuth 回调" and "OAuth回调" are identical), collapse space.
 */
export declare function normalizeTitle(title: string): string;
/** Fallback title from the first user request. */
export declare function titleFromRequest(worklog: SessionWorklog): string;
/** Short description listing the session's requests. */
export declare function describeRequests(worklog: SessionWorklog): string;
/**
 * Cluster worklogs into epic/issue candidates.
 *
 * Rules (v1):
 * - Sessions sharing a normalized title → one epic (work thread).
 * - Untitled sessions cluster under their own epic keyed by the first request.
 * - Each session → one issue candidate linked to its epic.
 * - State: `in_progress` when the log shows tool activity, else `todo`.
 *   Never auto-`done` — completion is confirmed by the user at write-back.
 */
export declare function clusterWorklogs(worklogs: SessionWorklog[], metas: Record<string, SessionMeta>): ClusterResult;
