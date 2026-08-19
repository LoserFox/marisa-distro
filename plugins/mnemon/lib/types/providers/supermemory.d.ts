import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import type { Insight, MemoryBody, MemoryListRequest, RememberRequest, SearchRequest } from '../shared/contracts.ts';
import { HttpMemoryProvider, type HttpProviderOptions } from './http.ts';
import { type MemoryProviderAdapter, type ProviderBodyStatus, type ProviderMemorySpace, type ProviderSearchResult } from './provider.ts';
export declare class SupermemoryProvider extends HttpMemoryProvider implements MemoryProviderAdapter {
    readonly id: "supermemory";
    readonly scoreSemantics: import("./provider.ts").ProviderScoreSemantics;
    constructor(memoryBodies: MemoryBodyRegistry, options?: HttpProviderOptions);
    discover(connection: Record<string, string | number | boolean>, signal?: AbortSignal): Promise<ProviderMemorySpace[]>;
    status(body: MemoryBody, signal?: AbortSignal): Promise<ProviderBodyStatus>;
    search(body: MemoryBody, request: SearchRequest, signal?: AbortSignal): Promise<ProviderSearchResult>;
    list(body: MemoryBody, request: MemoryListRequest, signal?: AbortSignal): Promise<Insight[]>;
    remember(body: MemoryBody, request: RememberRequest, signal?: AbortSignal): Promise<JsonValue>;
    forget(body: MemoryBody, id: string, signal?: AbortSignal): Promise<JsonValue>;
    private headers;
}
