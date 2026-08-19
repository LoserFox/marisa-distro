import type { HostAgent, HostSubagentsService, ToolDefinition } from './contracts.ts';
import { type DocumentManager, type DocumentMutation, type DocumentMutationResult, type DocumentView } from './documents.ts';
import { type RuntimeMemoryController, type RuntimeMemoryMutation, type RuntimeMemoryMutationResult } from './runtime-memory.ts';
import type { Insight, MnemonService, RememberRequest, SearchRequest } from './service.ts';
import { type PreparedMemoryPlacement } from './provider-placement.ts';
import type { MemoryBodyMetadataMaintenanceResult, MemoryPlacementDecision, SubagentCounters } from './shared/contracts.ts';
export type { SubagentCounters } from './shared/contracts.ts';
interface AgentRuntimeSource {
    forAgent(agent: HostAgent): {
        service: MnemonService;
        runtimeMemory: RuntimeMemoryController;
        documents: DocumentManager;
    };
}
interface HostToolRegistry {
    register(definition: ToolDefinition): unknown;
}
interface HostResultToolRuntime {
    tools: HostToolRegistry;
    on(name: string, listener: (...args: never[]) => unknown): unknown;
}
/** Rejects schema keywords that DSH structured-output tools cannot compile. */
export declare function assertDshOutputSchema(schema: unknown, path?: string): void;
export interface DelegatedRecallResult {
    query: string;
    mode: string;
    results: Insight[];
    hint?: string;
    delegation: {
        runId: string;
        provider: string;
        summary: string;
        selectedMemoryBodyIds: string[];
    };
}
export interface DelegatedWriteResult {
    delegated: true;
    runId: string;
    provider: string;
    summary: string;
    action: string;
    memoryBodyIds: string[];
    documentIds?: string[];
}
export type CoordinatedDocumentResult = DocumentMutationResult & {
    maintenance?: {
        runId: string;
        provider: string;
        summary: string;
        memoryBodyIds: string[];
        archivedDocumentIds: string[];
    };
};
export interface DelegatedAnswerResult {
    answer: string;
    citations: string[];
    delegation: {
        runId: string;
        provider: string;
    };
}
export type CoordinatedRuntimeMemoryResult = RuntimeMemoryMutationResult & {
    maintenance?: {
        runId: string;
        provider: string;
        summary: string;
        memoryBodyIds: string[];
    };
};
export declare function isSubagent(agent: HostAgent | undefined): boolean;
/** Delegates memory judgment and execution to a fresh, tool-scoped DSH child. */
export declare class MnemonSubagentCoordinator {
    private readonly subagents;
    private readonly runtimeMemoryOrSource?;
    private readonly documents?;
    private readonly resultRuntime?;
    private readonly counters;
    private runtimeQueue;
    private documentQueue;
    constructor(subagents: HostSubagentsService, runtimeMemoryOrSource?: (RuntimeMemoryController | AgentRuntimeSource) | undefined, documents?: DocumentManager | undefined, resultRuntime?: HostResultToolRuntime | undefined);
    snapshot(): SubagentCounters;
    documentsSnapshot(parent: HostAgent): import("./documents.ts").DocumentSnapshot;
    documentGet(parent: HostAgent, id: string): DocumentView;
    documentSearch(parent: HostAgent, query: string, includeArchived?: boolean, limit?: number): Promise<import("./documents.ts").DocumentSearchResult>;
    recall(parent: HostAgent, request: SearchRequest, signal: AbortSignal): Promise<DelegatedRecallResult>;
    related(parent: HostAgent, id: string, memoryBodyId: string | undefined, signal: AbortSignal): Promise<DelegatedRecallResult>;
    placeProvider(parent: HostAgent, body: {
        name: string;
        description: string;
    }, prepared: PreparedMemoryPlacement, signal: AbortSignal): Promise<MemoryPlacementDecision>;
    maintainMetadata(parent: HostAgent, memoryBodyIds: readonly string[], signal: AbortSignal): Promise<MemoryBodyMetadataMaintenanceResult>;
    remember(parent: HostAgent, request: RememberRequest, signal: AbortSignal): Promise<DelegatedWriteResult>;
    runtime(parent: HostAgent, request: RuntimeMemoryMutation, signal: AbortSignal): Promise<CoordinatedRuntimeMemoryResult>;
    document(parent: HostAgent, request: DocumentMutation, signal: AbortSignal): Promise<CoordinatedDocumentResult>;
    archiveDocument(parent: HostAgent, id: string, signal: AbortSignal): Promise<CoordinatedDocumentResult>;
    answer(parent: HostAgent, query: string, evidence: Insight[], signal: AbortSignal): Promise<DelegatedAnswerResult>;
    write(parent: HostAgent, operation: string, request: unknown, signal: AbortSignal): Promise<DelegatedWriteResult>;
    review(parent: HostAgent, signal: AbortSignal): Promise<DelegatedWriteResult>;
    private recallResult;
    private documentLocked;
    private archiveDocumentLocked;
    private runtimeLocked;
    private compactUserAndRetry;
    private delegate;
    private provider;
    private runtimeMemoryFor;
    private serviceFor;
    private documentsFor;
}
