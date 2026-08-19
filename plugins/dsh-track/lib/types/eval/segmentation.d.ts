/**
 * Segmentation evaluation — Pk / WindowDiff / boundary-F1 for the v2 span
 * segmentation against golden task boundaries (v2-design §5.2, acceptance A4).
 *
 * Both golden tasks and v2 spans are seq ranges [seqStart, seqEnd]. We map
 * each integer seq position to a segment label (a run of seqs belonging to
 * the same segment), then score the predicted segmentation against the golden
 * one on a common seq axis. Pk and WindowDiff are the standard boundary
 * quality metrics (Beeferman & Berger 1999; Pevzner & Hearst 2002).
 * @module @fakechris/dsh-track/eval/segmentation
 */
/** One segment: a seq range plus its label (index). */
export interface SegRange {
    seqStart: number;
    seqEnd: number;
}
/**
 * Convert seq ranges into a per-position label array on [minSeq, maxSeq].
 * Each position gets the index of the segment whose range contains it.
 * Positions inside no range are labeled -1 (gap).
 */
export declare function labelPositions(ranges: readonly SegRange[]): number[];
/** Is there a segment boundary between position i-1 and i? */
export declare function boundaries(labels: readonly number[]): boolean[];
/**
 * Pk — probability that two positions k apart are judged inconsistently
 * segmented. Lower is better; 0 = perfect. Uses the k-hypothesis test with
 * the golden's average segment length as window (Beeferman & Berger).
 */
export declare function pk(golden: readonly number[], predicted: readonly number[]): number;
/**
 * WindowDiff — counts boundary disagreements within a sliding window.
 * Lower is better; 0 = perfect.
 */
export declare function windowDiff(golden: readonly number[], predicted: readonly number[]): number;
/** Boundary precision / recall / F1 (boundary = position where a segment starts). */
export declare function boundaryF1(golden: readonly number[], predicted: readonly number[]): {
    precision: number;
    recall: number;
    f1: number;
};
/** Full evaluation of one session. */
export interface SessionSegEval {
    sessionId: string;
    goldenSegments: number;
    predictedSegments: number;
    pk: number;
    windowDiff: number;
    boundaryF1: number;
}
/** Evaluate predicted segment ranges against golden ranges per session. */
export declare function evaluateSession(sessionId: string, golden: readonly SegRange[], predicted: readonly SegRange[]): SessionSegEval;
/** Aggregate metrics across sessions (weighted by position count). */
export declare function aggregateEval(results: readonly SessionSegEval[]): {
    meanPk: number;
    meanWindowDiff: number;
    meanBoundaryF1: number;
    totalGolden: number;
    totalPredicted: number;
};
