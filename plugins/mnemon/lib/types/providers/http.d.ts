import type { JsonValue } from '../contracts.ts';
import type { MemoryBodyRegistry } from '../memory-bodies.ts';
import type { Insight, MemoryBody, MemoryGraphSnapshot, MemoryListRequest, MemoryProviderConnection, MemoryProviderId } from '../shared/contracts.ts';
export interface HttpProviderOptions {
    fetch?: typeof fetch;
    requestTimeoutMs?: number;
}
export interface JsonRequestOptions {
    method?: string;
    headers?: HeadersInit;
    json?: JsonValue;
    signal?: AbortSignal | undefined;
    timeoutMs?: number;
}
export declare function jsonObject(value: unknown): Record<string, unknown> | undefined;
export declare function jsonString(value: unknown): string | undefined;
export declare function jsonNumber(value: unknown): number | undefined;
export declare function jsonArray(value: unknown): unknown[];
export declare function firstArray(value: unknown, ...keys: string[]): unknown[];
/** Shared timeout, cancellation, error, and projection behavior for HTTP providers. */
export declare abstract class HttpMemoryProvider {
    protected readonly memoryBodies: MemoryBodyRegistry;
    abstract readonly id: MemoryProviderId;
    protected readonly requestFetch: typeof fetch;
    protected readonly requestTimeoutMs: number;
    constructor(memoryBodies: MemoryBodyRegistry, options?: HttpProviderOptions);
    abstract list(body: MemoryBody, request: MemoryListRequest, signal?: AbortSignal): Promise<Insight[]>;
    graph(body: MemoryBody, signal?: AbortSignal): Promise<MemoryGraphSnapshot>;
    protected connection(body: MemoryBody): MemoryProviderConnection;
    protected request(body: MemoryBody, path: string, options?: JsonRequestOptions): Promise<unknown>;
    protected requestConnection(connection: MemoryProviderConnection, path: string, options?: JsonRequestOptions): Promise<unknown>;
}
