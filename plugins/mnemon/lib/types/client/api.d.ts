import { type AssistantMessageText, type CreateMemoryBodyRequest, type ClientConnectionHandle, type DocumentMutation, type DocumentMutationResult, type DocumentSearchResult, type DocumentSnapshot, type DocumentView, type EntityView, type Insight, type MemoryBody, type MemoryBodyView, type MemoryBodyMetadataMaintenanceResult, type MemoryBodyCatalog, type MemoryProviderServiceCatalog, type MemoryProviderServiceView, type MemoryGraphSnapshot, type MemoryListRequest, type MemoryListView, type MemoryReadSource, type MnemonPackExport, type MnemonPackImportResult, type MnemonPackPreview, type RememberRequest, type RuntimeMemoryImportance, type RuntimeMemoryMutationResult, type RuntimeMemorySnapshot, type RuntimeMemoryTarget, type SearchRequest, type StatusView, type TaskAgentModelCatalog, type TurnMemoryActivity, type UpdateMemoryBodyRequest, type UpdateMemoryProviderServiceRequest, type VersionComponentId, type VersionStatus, type VersionUpdateResult } from '../shared/contracts.ts';
export interface SearchResponse {
    query: string;
    mode: string;
    results: Insight[];
    hint?: string;
    /** Omitted only when talking to a pre-provider-aware Host. */
    sources?: MemoryReadSource[];
}
export interface AgentSearchResponse extends SearchResponse {
    answer: string;
    citations: string[];
    delegation: {
        runId: string;
        provider: string;
    };
}
export declare class MnemonClient {
    private readonly connection;
    private readonly sessionId?;
    private readonly workspaceId?;
    constructor(connection: ClientConnectionHandle, sessionId?: string | undefined, workspaceId?: string | undefined);
    private call;
    private scoped;
    status(): Promise<StatusView>;
    statusSummary(): Promise<StatusView>;
    taskAgentModels(includeCatalog?: boolean): Promise<TaskAgentModelCatalog>;
    versions(): Promise<VersionStatus>;
    updateVersion(component: VersionComponentId): Promise<VersionUpdateResult>;
    runtimeMemory(): Promise<RuntimeMemorySnapshot>;
    mutateRuntimeMemory(request: {
        action: 'add' | 'replace' | 'remove';
        target: RuntimeMemoryTarget;
        content?: string;
        old_text?: string;
        importance?: RuntimeMemoryImportance;
    }): Promise<RuntimeMemoryMutationResult>;
    documents(): Promise<DocumentSnapshot>;
    document(id: string): Promise<DocumentView>;
    searchDocuments(query: string, includeArchived?: boolean, limit?: number): Promise<DocumentSearchResult>;
    mutateDocument(request: DocumentMutation): Promise<DocumentMutationResult>;
    archiveDocument(id: string): Promise<DocumentMutationResult>;
    bodies(): Promise<MemoryBodyCatalog>;
    bodyDirectory(): Promise<MemoryBodyCatalog>;
    providerServices(): Promise<MemoryProviderServiceCatalog>;
    updateProviderService(request: UpdateMemoryProviderServiceRequest): Promise<MemoryProviderServiceView>;
    graph(memoryBodyIds?: string[]): Promise<MemoryGraphSnapshot>;
    list(request?: MemoryListRequest): Promise<MemoryListView>;
    entities(entity?: string, limit?: number): Promise<EntityView>;
    search(request: SearchRequest): Promise<SearchResponse>;
    agentSearch(request: SearchRequest): Promise<AgentSearchResponse>;
    related(id: string, memoryBodyId?: string): Promise<Insight[]>;
    /** Settled memory-tool activity of one turn, shared across all mounted tails. */
    turnActivity(turn: number, cursor?: number): Promise<TurnMemoryActivity | null>;
    /** Plain text of one finalized assistant message; null when absent or empty. */
    assistantMessageText(messageId: string): Promise<AssistantMessageText | null>;
    remember(request: RememberRequest): Promise<Record<string, unknown>>;
    supervise(content: string, idempotencyKey?: string): Promise<{
        delegated: true;
        sessionId: string;
        runId: string;
        provider: string;
        summary: string;
        action: string;
        memoryBodyIds: string[];
    }>;
    forget(id: string, memoryBodyId?: string): Promise<Record<string, unknown>>;
    createBody(request: CreateMemoryBodyRequest): Promise<MemoryBody>;
    updateBody(memoryBodyId: string, request: UpdateMemoryBodyRequest): Promise<MemoryBody>;
    reconnectBody(memoryBodyId: string): Promise<MemoryBodyView>;
    maintainBodyMetadata(memoryBodyIds: string[]): Promise<MemoryBodyMetadataMaintenanceResult>;
    deleteBody(memoryBodyId: string): Promise<MemoryBody>;
    packTarget(): Promise<{
        root: string;
        scope: 'global' | 'workspace' | 'custom';
    }>;
    exportPack(): Promise<MnemonPackExport>;
    inspectPack(base64: string, fileName?: string): Promise<MnemonPackPreview>;
    importPack(base64: string): Promise<MnemonPackImportResult>;
}
