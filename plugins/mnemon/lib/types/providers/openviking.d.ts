import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import type { Insight, MemoryBody, MemoryGraphSnapshot, MemoryListRequest, MemoryProviderConnection, RememberRequest, SearchRequest } from '../shared/contracts.ts';
import { type MemoryProviderAdapter, type ProviderBodyStatus, type ProviderMemorySpace, type ProviderSearchResult } from './provider.ts';
interface OpenVikingProviderOptions {
    fetch?: typeof fetch;
    requestTimeoutMs?: number;
    settlementTimeoutMs?: number;
    pollIntervalMs?: number;
}
export declare class OpenVikingProvider implements MemoryProviderAdapter {
    private readonly memoryBodies;
    readonly id: "openviking";
    readonly scoreSemantics: import("./provider.ts").ProviderScoreSemantics;
    private readonly requestFetch;
    private readonly requestTimeoutMs;
    private readonly settlementTimeoutMs;
    private readonly pollIntervalMs;
    constructor(memoryBodies: MemoryBodyRegistry, options?: OpenVikingProviderOptions);
    discover(connection: MemoryProviderConnection, signal?: AbortSignal): Promise<ProviderMemorySpace[]>;
    status(body: MemoryBody, signal?: AbortSignal): Promise<ProviderBodyStatus>;
    search(body: MemoryBody, request: SearchRequest, signal?: AbortSignal): Promise<ProviderSearchResult>;
    graph(body: MemoryBody, signal?: AbortSignal): Promise<MemoryGraphSnapshot>;
    list(body: MemoryBody, request: MemoryListRequest, signal?: AbortSignal): Promise<Insight[]>;
    remember(body: MemoryBody, request: RememberRequest, signal?: AbortSignal): Promise<JsonValue>;
    forget(body: MemoryBody, id: string, signal?: AbortSignal): Promise<JsonValue>;
    private connection;
    private settleTask;
    private request;
    private requestConnection;
}
export {};
