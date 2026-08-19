import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import type { Insight, MemoryBody, MemoryGraphSnapshot, MemoryListRequest, MemoryProviderConnection, RememberRequest, SearchRequest } from '../shared/contracts.ts';
import { type MemoryProviderAdapter, type ProviderBodyStatus, type ProviderMemorySpace, type ProviderSearchResult } from './provider.ts';
export declare class HolographicProvider implements MemoryProviderAdapter {
    private readonly memoryBodies;
    readonly id: "holographic";
    readonly scoreSemantics: import("./provider.ts").ProviderScoreSemantics;
    constructor(memoryBodies: MemoryBodyRegistry);
    discover(connection: MemoryProviderConnection): Promise<ProviderMemorySpace[]>;
    status(body: MemoryBody): Promise<ProviderBodyStatus>;
    search(body: MemoryBody, request: SearchRequest): Promise<ProviderSearchResult>;
    list(body: MemoryBody, request: MemoryListRequest): Promise<Insight[]>;
    graph(body: MemoryBody): Promise<MemoryGraphSnapshot>;
    related(body: MemoryBody, id: string, _depth: number): Promise<Insight[]>;
    remember(body: MemoryBody, request: RememberRequest): Promise<JsonValue>;
    forget(body: MemoryBody, id: string): Promise<JsonValue>;
    private connection;
    private path;
    private load;
    private save;
    private stats;
}
