/**
 * Alignment — reconcile clustered candidates against the existing Track store
 * so a re-run is idempotent: a session already linked to an issue updates that
 * issue instead of creating a duplicate.
 * @module @fakechris/dsh-track/sync/align
 */
import type { Capture, Issue } from '../types.ts';
import type { EpicCandidate, IssueCandidate } from './cluster.ts';
/** What to do with one candidate. */
export type IssueAction = {
    kind: 'create';
    candidate: IssueCandidate;
    promoteCaptureId?: string;
    promoteCaptureIds?: string[];
} | {
    kind: 'update';
    candidate: IssueCandidate;
    existing: Issue;
    changes: string[];
} | {
    kind: 'skip';
    candidate: IssueCandidate;
    existing: Issue;
    reason: string;
};
export interface AlignResult {
    /** One action per candidate, in input order. */
    actions: IssueAction[];
    /** Epic candidates that exist (matched by key) vs new. */
    epicActions: Array<{
        kind: 'create';
        candidate: EpicCandidate;
        existingKey?: undefined;
    } | {
        kind: 'skip';
        candidate: EpicCandidate;
        existingKey: string;
    }>;
}
/**
 * Reconcile candidates against existing issues.
 *
 * Match rules (v1):
 * - `linkedSessionIds` contains the candidate's session → update (session already tracked).
 * - Otherwise, normalized-title equality → update (same work, new session folded in).
 * - Otherwise, capture-content overlap → the candidate is the concrete form of a
 *   previously captured thought: if the capture was already promoted to an
 *   issue, update that issue (dedup); if it is still open, create the issue and
 *   promote the capture to it (mapping).
 * - Otherwise → create.
 *
 * State evolution: a candidate never downgrades an existing issue's state, and
 * never auto-moves an existing issue to `done` (that stays human-confirmed).
 */
export declare function alignCandidates(candidates: IssueCandidate[], existingIssues: Issue[], epicCandidates?: EpicCandidate[], existingEpicKeys?: readonly string[], captures?: Capture[]): AlignResult;
/** Merge an update action's candidate into the existing issue shape. */
export declare function mergeIntoIssue(existing: Issue, candidate: IssueCandidate): Issue;
/**
 * Does a capture's content overlap a candidate's work line?
 *
 * Conservative token-overlap test (rule layer — the "rules hold invariants"
 * discipline): normalize both sides, then require a minimum number of shared
 * tokens AND a minimum containment ratio. CJK is tokenized as character
 * bigrams so multi-character shared substrings count; Latin tokens are words.
 * Low bar on purpose (open captures are sparse) but never matches on empty
 * content or single shared tokens.
 *
 * C2 (motivation context): the match surface is `content + context` — the
 * capture's own words AND the user intent behind it. A capture like "调研
 * StreamChunk 结构确认是否有 usage/token 字段" alone does not overlap a
 * candidate titled "LLM 用量计量模块", but its context ("做一个模块记录所有
 * llm 数据计算开销") does. If either surface matches, the capture maps.
 */
export declare function captureOverlaps(capture: Capture, candidate: IssueCandidate): boolean;
/** Normalize content into comparable tokens: CJK bigrams + latin words. */
export declare function contentTokens(text: string): Set<string>;
