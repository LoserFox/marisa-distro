import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import type { EdgeType, Insight, MemoryBody, MemoryGraphSnapshot, MemoryListRequest, RememberRequest, SearchRequest } from '../shared/contracts.ts';
import { HttpMemoryProvider, type HttpProviderOptions } from './http.ts';
import { type MemoryProviderAdapter, type ProviderBodyStatus, type ProviderMemorySpace, type ProviderSearchResult } from './provider.ts';
export declare class HindsightProvider extends HttpMemoryProvider implements MemoryProviderAdapter {
    readonly id: "hindsight";
    readonly scoreSemantics: import("./provider.ts").ProviderScoreSemantics;
    constructor(memoryBodies: MemoryBodyRegistry, options?: HttpProviderOptions);
    discover(connection: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<ProviderMemorySpace[]>;
    status(body: MemoryBody, signal?: AbortSignal): Promise<ProviderBodyStatus>;
    search(body: MemoryBody, request: SearchRequest, signal?: AbortSignal): Promise<ProviderSearchResult>;
    list(body: MemoryBody, request: MemoryListRequest, signal?: AbortSignal): Promise<Insight[]>;
    graph(body: MemoryBody, signal?: AbortSignal): Promise<MemoryGraphSnapshot>;
    related(body: MemoryBody, id: string, depth: number, _edge?: EdgeType, signal?: AbortSignal): Promise<Insight[]>;
    remember(body: MemoryBody, request: RememberRequest, signal?: AbortSignal): Promise<JsonValue>;
    forget(body: MemoryBody, id: string, signal?: AbortSignal): Promise<JsonValue>;
    private bankPath;
    private headers;
}
