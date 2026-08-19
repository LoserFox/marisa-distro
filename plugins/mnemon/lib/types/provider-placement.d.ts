import type { AutomaticMemoryPlacementRequest, MemoryPlacementDecision, MemoryProviderCapabilities, MemoryProviderId } from './shared/contracts.ts';
export interface MemoryPlacementCandidate {
    id: MemoryProviderId;
    label: string;
    kind: 'local' | 'remote';
    configured: boolean;
    summary: string;
    capabilities: MemoryProviderCapabilities;
}
export interface PreparedMemoryPlacement {
    prompt: string;
    candidates: MemoryPlacementCandidate[];
    appliedRules: string[];
    selectorBrief: string;
}
export interface LlmMemoryPlacementSelection {
    providerId: string;
    reason: string;
    confidence: string;
}
export declare function prepareMemoryPlacement(request: AutomaticMemoryPlacementRequest, candidates: readonly MemoryPlacementCandidate[]): PreparedMemoryPlacement;
export declare function rulesOnlyPlacement(prepared: PreparedMemoryPlacement, now?: () => Date): MemoryPlacementDecision | undefined;
export declare function finalizeLlmPlacement(prepared: PreparedMemoryPlacement, selection: LlmMemoryPlacementSelection, delegation: {
    runId: string;
    provider: string;
}, now?: () => Date): MemoryPlacementDecision;
