import type { JsonValue } from './contracts.ts';
import type { ResolvedConfig } from './config.ts';
import { MemoryBodyRegistry, type CreateMemoryBodyRequest, type MemoryBody, type UpdateMemoryBodyRequest } from './memory-bodies.ts';
import type { MnemonRunner } from './runner.ts';
import { type LlmMemoryPlacementSelection, type PreparedMemoryPlacement } from './provider-placement.ts';
import { type RecallQualityPolicyRegistry } from './recall-quality/index.ts';
import { type EdgeType, type EntityView, type Insight, type MemoryBodyCatalog, type MemoryBodyMetadataUpdate, type MemoryBodyView, type MemoryGraphSnapshot, type MemoryListRequest, type MemoryListView, type MemoryPlacementDecision, type MemoryReadSource, type RememberRequest, type SearchRequest, type StatusView } from './shared/contracts.ts';
export { CATEGORIES, EDGE_TYPES, INTENTS, SOURCES } from './shared/contracts.ts';
export type { Category, EdgeType, EntityView, Insight, Intent, MemoryBodyCatalog, MemoryBodyStats, MemoryBodyView, MemoryGraphEdge, MemoryGraphNode, MemoryGraphSnapshot, MemoryListRequest, MemoryListView, MemoryReadSource, RecallQualityStats, RememberRequest, SearchRequest, Source, StatusView, } from './shared/contracts.ts';
export interface MemoryBodyMetadataSample {
    memoryBodyId: string;
    name: string;
    description: string;
    providerId: MemoryBody['provider']['id'];
    providerLabel: string;
    method: 'native-basic' | 'browse' | 'search';
    evidence: Array<Pick<Insight, 'content' | 'category' | 'entities'>>;
}
/** Parse the official Mnemon vis.js export without executing its HTML or loading its CDN script. */
export declare function parseMemoryGraph(html: string, now?: Date): MemoryGraphSnapshot;
export declare class MnemonService {
    readonly runner: MnemonRunner;
    readonly config: ResolvedConfig;
    readonly memoryBodies: MemoryBodyRegistry;
    private readonly providers;
    private readonly recallQualityPolicy;
    private bodiesInFlight;
    constructor(runner: MnemonRunner, config: ResolvedConfig, memoryBodies?: MemoryBodyRegistry, recallQualityPolicyRegistry?: RecallQualityPolicyRegistry);
    bodies(signal?: AbortSignal): Promise<MemoryBodyCatalog>;
    /** Coalesce simultaneous Status/Memory-page probes without caching mutations. */
    private collectBodies;
    /** Return the control-plane directory without waiting for provider I/O. */
    bodyDirectory(): MemoryBodyCatalog;
    /** Return a usable system snapshot without waiting for any Provider I/O. */
    statusSummary(): StatusView;
    status(signal?: AbortSignal): Promise<StatusView>;
    reconnectBody(id: string, signal?: AbortSignal): Promise<MemoryBodyView>;
    search(request: SearchRequest, signal?: AbortSignal): Promise<{
        query: string;
        mode: string;
        results: Insight[];
        hint?: string;
        sources: MemoryReadSource[];
    }>;
    /**
     * Read a deliberately small metadata sample through the cheapest useful path
     * exposed by the owning Provider. This avoids federated ranking, graph
     * expansion, and large browse projections before an LLM metadata pass.
     */
    metadataSample(memoryBodyId: string, signal?: AbortSignal): Promise<MemoryBodyMetadataSample>;
    graph(signal?: AbortSignal, memoryBodyIds?: string[]): Promise<MemoryGraphSnapshot>;
    list(request?: MemoryListRequest, signal?: AbortSignal): Promise<MemoryListView>;
    entities(entity?: string, limit?: number, signal?: AbortSignal): Promise<EntityView>;
    remember(request: RememberRequest, signal?: AbortSignal): Promise<JsonValue>;
    related(id: string, depth?: number, edge?: EdgeType, signal?: AbortSignal, memoryBodyId?: string): Promise<Insight[]>;
    link(sourceId: string, targetId: string, type?: EdgeType, weight?: number, reason?: string, signal?: AbortSignal, memoryBodyId?: string): Promise<JsonValue>;
    forget(id: string, signal?: AbortSignal, memoryBodyId?: string): Promise<JsonValue>;
    prepareBodyPlacement(request: CreateMemoryBodyRequest): PreparedMemoryPlacement;
    createBody(request: CreateMemoryBodyRequest, signal?: AbortSignal, placement?: MemoryPlacementDecision): Promise<MemoryBody>;
    /**
     * Create a Memory Space from the configured distillation policy. The model
     * may choose only among candidates already filtered by the host; manual mode
     * ignores model preference and always uses the configured fixed provider.
     */
    createBodyForPersistence(body: {
        name: string;
        description: string;
    }, selection: LlmMemoryPlacementSelection | undefined, signal?: AbortSignal, delegation?: {
        runId: string;
        provider: string;
    }): Promise<MemoryBody>;
    updateProviderService(providerId: MemoryBody['provider']['id'], settings: Record<string, string | number | boolean>, clearSecrets?: readonly string[], enabled?: boolean, signal?: AbortSignal): Promise<import("./shared/contracts.ts").MemoryProviderServiceView>;
    updateBody(id: string, request: UpdateMemoryBodyRequest): MemoryBody;
    updateBodyMetadata(updates: readonly MemoryBodyMetadataUpdate[]): MemoryBody[];
    deleteBody(id: string, signal?: AbortSignal): Promise<MemoryBody>;
    mergeBodies(targetBodyId: string, sourceBodyIds: string[], deactivateSources?: boolean, signal?: AbortSignal): Promise<JsonValue>;
    private nativeBodyStatus;
    private parseStats;
    private nativeGraph;
    private allNativeInsights;
    private nativeMetadataSample;
    private nativeSearch;
    private nativeRemember;
    private nativeRelated;
    private nativeLink;
    private nativeForget;
    private providerFor;
    private readBodies;
    private readBody;
    private writeBody;
    private annotate;
    private annotateResult;
    private activateAfterWrite;
    private assertWritable;
}
