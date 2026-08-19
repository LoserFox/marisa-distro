/**
 * QoderWork 0.9.12's deterministic post-turn review gate.
 *
 * The upstream implementation scores user text length rather than provider
 * token usage, which keeps the gate stable when an adapter omits usage data.
 */
export declare const QODERWORK_REVIEW_POLICY: Readonly<{
    reviewThreshold: 5;
    textLengthScoreUnit: 50;
    textLengthScoreCap: 3;
    toolCountScoreUnit: 5;
    toolCountScoreCap: 2;
    toolDiversityThreshold: 3;
    toolDiversityScoreCap: 2;
    turnScore: 1;
}>;
export declare function scoreReviewActivity(activity: ReviewActivity): ReviewActivityScore;
import type { ReviewActivity, ReviewActivityScore } from './shared/contracts.ts';
export type { ReviewActivity, ReviewActivityScore } from './shared/contracts.ts';
