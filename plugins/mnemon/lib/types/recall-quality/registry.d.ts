import type { RecallQualityPolicy } from './contracts.ts';
export declare class RecallQualityPolicyRegistry {
    private readonly policies;
    constructor(policies?: readonly RecallQualityPolicy[]);
    register(policy: RecallQualityPolicy): () => void;
    resolve(id: string): RecallQualityPolicy;
    ids(): string[];
}
export declare const recallQualityPolicies: RecallQualityPolicyRegistry;
export declare function registerRecallQualityPolicy(policy: RecallQualityPolicy): () => void;
