/**
 * P3 — cross-session identity resolution (v2-design §3.7).
 *
 * Determines when two candidates (or sessions) are the SAME work line, so a
 * sync pass does not create duplicates for fork copies or continuation
 * sessions. Pipeline:
 *  1. fork-copy detection by event-content overlap (deterministic, rules):
 *     two sessions whose normalized event-id sets overlap heavily are the
 *     same logical session (fork copies) → their spans never duplicate.
 *  2. candidate recall: candidates sharing a session or a normalized title
 *     become merge candidates (blocking).
 *  3. relation classification: LLM judges SAME_TASK / CONTINUATION_OF /
 *     RELATED_TO / NEW_TASK; without an LLM, rules decide conservatively.
 *  4. merge: SAME_TASK (high confidence, no conflicts) merges into one
 *     canonical candidate; everything else stays separate with a relation
 *     note (never over-merge — v2-design §3.7).
 * @module @fakechris/dsh-track/sync/identity
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TaskCandidate } from './candidate.ts';
/** One session's normalized event content (session-independent keys). */
export interface SessionEventProfile {
    sessionId: string;
    /** Session-independent content keys (seq:payloadHash) — overlap detects fork copies. */
    contentKeys: Set<string>;
    /** Parent session id when the session was forked (header.parentSession). */
    parentSession?: string;
}
/** Relation kinds between two work items (v2-design §3.7). */
export type WorkRelation = 'SAME_TASK' | 'CONTINUATION_OF' | 'SUBTASK_OF' | 'BLOCKS' | 'RELATED_TO' | 'DUPLICATES' | 'NEW_TASK';
/** Jaccard overlap of two event-id sets. */
export declare function jaccard(a: Set<string>, b: Set<string>): number;
/**
 * Detect fork-copy session pairs: two sessions whose event CONTENT overlaps
 * above a high threshold are the same logical session (fork copies). Uses the
 * session-independent content key (seq:payloadHash) — deterministic and
 * replay-stable, and identical across fork copies living under different
 * session ids.
 */
export declare function detectForkCopies(profiles: SessionEventProfile[], threshold?: number): Array<[string, string]>;
/** Union-find over fork pairs → fork groups. */
export declare function forkGroups(pairs: Array<[string, string]>): string[][];
/** A merge decision for one candidate group. */
export interface MergeGroup {
    /** The canonical candidate (first by creation, richest by evidence). */
    canonical: TaskCandidate;
    /** Members folded into the canonical (same task line). */
    members: TaskCandidate[];
    /** Relation notes for members that are NOT merged but linked. */
    relations: Array<{
        from: string;
        to: string;
        kind: WorkRelation;
    }>;
}
/** LLM relation classification between two candidates. */
export declare function classifyRelation(ctx: Context, opts: {
    provider: string;
    model: string;
    a: TaskCandidate;
    b: TaskCandidate;
}): Promise<{
    relation: WorkRelation;
    confidence: number;
    reason: string;
    decidedBy: 'rule' | 'model';
} | undefined>;
/** Rule-only relation fallback: normalized-title equality → SAME_TASK; else NEW_TASK. */
export declare function ruleRelation(a: TaskCandidate, b: TaskCandidate): {
    relation: WorkRelation;
    confidence: number;
    reason: string;
};
/**
 * Merge a list of candidates into canonical groups.
 *
 * Pairwise classification (LLM, fallback rules); pairs classified
 * SAME_TASK / CONTINUATION_OF / DUPLICATES with confidence ≥ mergeThreshold
 * are merged; RELATED_TO stays separate with a relation note. A candidate is
 * the canonical of its group if it has the most evidence requests.
 */
export declare function mergeCandidates(ctx: Context | undefined, candidates: TaskCandidate[], opts: {
    provider: string;
    model: string;
    mergeThreshold?: number;
    adjacentOnly?: boolean;
}): Promise<{
    groups: MergeGroup[];
    standalone: TaskCandidate[];
}>;
