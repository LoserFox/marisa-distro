import type { MemoryProviderConfigField, MemoryProviderConnection, MemoryProviderDescriptor, MemoryProviderId } from '../shared/contracts.ts';
export declare const MEMORY_PROVIDER_IDS: readonly ["mnemon-native", "openviking", "honcho", "mem0", "hindsight", "holographic", "retaindb", "byterover", "supermemory"];
export declare const MEMORY_PROVIDER_ID_SET: Set<MemoryProviderId>;
export declare const MEMORY_PROVIDER_CATALOG: readonly MemoryProviderDescriptor[];
export declare function memoryProviderDescriptor(id: MemoryProviderId): MemoryProviderDescriptor;
export declare function isMemoryProviderId(value: unknown): value is MemoryProviderId;
export declare function providerServiceFields(providerId: MemoryProviderId): MemoryProviderConfigField[];
export declare function providerMemoryFields(providerId: MemoryProviderId): MemoryProviderConfigField[];
export declare function splitProviderConnection(providerId: MemoryProviderId, connection: MemoryProviderConnection | undefined): {
    service: MemoryProviderConnection;
    memory: MemoryProviderConnection;
};
export declare function normalizeProviderServiceConnection(providerId: MemoryProviderId, input: MemoryProviderConnection | undefined, previous?: MemoryProviderConnection, clearSecrets?: readonly string[]): MemoryProviderConnection;
export declare function normalizeProviderMemoryConnection(providerId: MemoryProviderId, input: MemoryProviderConnection | undefined, previous?: MemoryProviderConnection): MemoryProviderConnection;
export declare function normalizeProviderConnection(providerId: MemoryProviderId, input: MemoryProviderConnection | undefined, previous?: MemoryProviderConnection, clearSecrets?: readonly string[]): MemoryProviderConnection;
export declare function publicScopedProviderConnection(providerId: MemoryProviderId, scope: MemoryProviderConfigField['scope'], connection: MemoryProviderConnection): {
    settings: MemoryProviderConnection;
    configuredSecrets: string[];
};
export declare function publicProviderConnection(providerId: MemoryProviderId, connection: MemoryProviderConnection): {
    settings: MemoryProviderConnection;
    configuredSecrets: string[];
};
