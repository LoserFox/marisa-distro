import type { EvaluatedRecallQualityCandidate, RecallQualityCandidate, RecallQualityPolicy, RecallQualityPolicyContext } from './contracts.ts';
export interface PreparedRecallQualityPolicy {
    policy: RecallQualityPolicy;
    candidateLimit: number;
    fallbackFrom?: string;
}
export declare function prepareRecallQualityPolicy(policy: RecallQualityPolicy, context: RecallQualityPolicyContext, fallback?: RecallQualityPolicy): PreparedRecallQualityPolicy;
export declare function applyRecallQualityPolicy(prepared: PreparedRecallQualityPolicy, candidates: readonly RecallQualityCandidate[], context: RecallQualityPolicyContext, fallback?: RecallQualityPolicy): {
    policyId: string;
    fallbackFrom?: string;
    evaluated: EvaluatedRecallQualityCandidate[];
    selected: EvaluatedRecallQualityCandidate[];
};
