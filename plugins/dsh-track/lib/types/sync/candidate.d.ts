/**
 * P2 — candidate synthesis + deterministic refinement (v2-design §2 stages ④⑤).
 *
 * Each EvidenceSpan that survived intent layering becomes a TaskCandidate.
 * The LLM synthesizes the title/description/acceptance criteria from the
 * span's requests (schema-constrained JSON); the deterministic refiner then
 * validates evidence, strips unsupported claims, lints the title, and marks
 * inferred AC as proposed. Rule-only fallback produces a plain candidate when
 * no LLM is available (downgrade path).
 * @module @fakechris/dsh-track/sync/candidate
 */
import type { Context } from '@deepseek-ai/cordis';
import type { EvidenceSpan } from './segment.ts';
import type { IssueCandidate } from './cluster.ts';
export type CandidateKind = 'investigation' | 'bug' | 'implementation' | 'refactor' | 'docs' | 'ops' | 'decision' | 'question' | 'follow_up' | 'non_task';
export interface AcceptanceCriterion {
    text: string;
    source: 'explicit_user' | 'inferred' | 'test_derived';
    authority: 'proposed' | 'confirmed';
    required: boolean;
}
export interface TaskCandidate {
    id: string;
    sessionId: string;
    span: {
        seqStart: number;
        seqEnd: number;
    };
    kind: CandidateKind;
    authority: 'explicit_user' | 'agent_proposed' | 'system_inferred';
    title: string;
    goal?: string;
    deliverable?: string;
    scope: string[];
    nonGoals: string[];
    constraints: string[];
    acceptanceCriteria: AcceptanceCriterion[];
    evidenceRefs: string[];
    confidence: number;
    decidedBy: 'rule' | 'model';
    /** Raw requests of the span (triage display + provenance). */
    requests: string[];
}
/** Deterministic refiner (v2-design §2 stage ⑤): validate + strip unsupported fields. */
export declare function refineCandidate(candidate: TaskCandidate): TaskCandidate;
/**
 * Does the title carry a work object — a repo/component/file/package name or
 * an issue/PR number? Conservative: anything with an explicit object wins.
 * Bare verb phrases ("调研一下", "更新 issue 514", "分析看看") fail, so the
 * rule layer de-ranks them instead of surfacing as confident tasks.
 */
export declare function titleHasObject(title: string): boolean;
/** Pull a work-object phrase from the evidence requests to backfill a title. */
export declare function backfillObjectFromRequests(title: string, requests: string[]): string | null;
/** Greeting / no-object / placeholder titles are not tasks (defect #1 fix). */
export declare function isGenericTitle(title: string): boolean;
/** Rule-only fallback candidate from a span (no LLM). */
export declare function candidateFromSpan(span: EvidenceSpan): TaskCandidate;
/** LLM synthesis for one span. Returns undefined on failure (downgrade to rule). */
export declare function synthesizeCandidate(ctx: Context, opts: {
    provider: string;
    model: string;
    span: EvidenceSpan;
    workspaceContext?: string;
    /**
     * Motivation context: captures from this session (content + their `context`
     * — the user's explicit request behind them). Lets the LLM synthesize a
     * title at the requirement level ("LLM 用量计量模块") instead of the
     * execution level ("调研 StreamChunk usage/token 字段").
     */
    motivationContext?: string;
}): Promise<TaskCandidate | undefined>;
export declare function projectToIssueCandidate(c: TaskCandidate, teamKey?: string): IssueCandidate;
