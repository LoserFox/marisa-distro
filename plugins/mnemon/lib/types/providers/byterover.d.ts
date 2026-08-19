import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import { type ProcessRunner } from '../process.ts';
import type { Insight, MemoryBody, MemoryGraphSnapshot, MemoryListRequest, MemoryProviderConnection, RememberRequest, SearchRequest } from '../shared/contracts.ts';
import { type MemoryProviderAdapter, type ProviderBodyStatus, type ProviderMemorySpace, type ProviderSearchResult } from './provider.ts';
interface ByteRoverProviderOptions {
    process?: ProcessRunner;
    queryTimeoutMs?: number;
    curateTimeoutMs?: number;
}
export declare class ByteRoverProvider implements MemoryProviderAdapter {
    private readonly memoryBodies;
    readonly id: "byterover";
    readonly scoreSemantics: import("./provider.ts").ProviderScoreSemantics;
    private readonly process;
    private readonly queryTimeoutMs;
    private readonly curateTimeoutMs;
    private readonly statusCache;
    private readonly statusInFlight;
    constructor(memoryBodies: MemoryBodyRegistry, options?: ByteRoverProviderOptions);
    discover(connection: MemoryProviderConnection): Promise<ProviderMemorySpace[]>;
    status(body: MemoryBody, signal?: AbortSignal): Promise<ProviderBodyStatus>;
    invalidateStatus(memoryBodyId?: string): void;
    private checkStatus;
    search(body: MemoryBody, request: SearchRequest, signal?: AbortSignal): Promise<ProviderSearchResult>;
    graph(body: MemoryBody): Promise<MemoryGraphSnapshot>;
    list(body: MemoryBody, request: MemoryListRequest, signal?: AbortSignal): Promise<Insight[]>;
    remember(body: MemoryBody, request: RememberRequest, signal?: AbortSignal): Promise<JsonValue>;
    private connection;
    private run;
}
export {};
