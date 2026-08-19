import type { MnemonRunner } from './runner.ts';
import type { MemoryPlacementCandidate } from './provider-placement.ts';
import type { CreateMemoryBodyRequest, MemoryBody, MemoryPlacementDecision, MemoryProviderServiceCatalog, MemoryProviderServiceView, MemoryProviderConnection, MemoryProviderId, MemoryBodyMetadataUpdate, OpenVikingBodyConnection, UpdateMemoryBodyRequest } from './shared/contracts.ts';
import type { ProviderMemorySpace } from './providers/provider.ts';
export type { CreateMemoryBodyRequest, MemoryBody, UpdateMemoryBodyRequest } from './shared/contracts.ts';
export declare function validateMemoryBodyId(value: string): string;
/**
 * Persistent metadata layered over Mnemon's native named stores.
 *
 * Native metadata lives beside Store directories so existing Mnemon Packs stay
 * compatible. External connection metadata lives under state and is never
 * included in Memory Space Packs.
 */
export declare class MemoryBodyRegistry {
    readonly runner: MnemonRunner;
    private readonly persistent;
    private readonly now;
    readonly directory: string;
    readonly registryPath: string;
    readonly providerRegistryPath: string;
    private bodies;
    private services;
    private serviceEnabled;
    constructor(runner: MnemonRunner, persistent?: boolean, now?: () => Date);
    list(): MemoryBody[];
    active(): MemoryBody[];
    get(id: string): MemoryBody;
    openVikingConnection(id: string): OpenVikingBodyConnection;
    providerConnection(id: string, expectedProviderId?: MemoryProviderId): MemoryProviderConnection;
    providerServiceConfigured(providerId: MemoryProviderId): boolean;
    providerServiceEnabled(providerId: MemoryProviderId): boolean;
    providerServices(options?: {
        includeSecrets?: boolean;
    }): MemoryProviderServiceCatalog;
    updateProviderService(providerId: MemoryProviderId, settings: MemoryProviderConnection, clearSecrets?: readonly string[], enabled?: boolean): MemoryProviderServiceView;
    resolveProviderService(providerId: MemoryProviderId, settings: MemoryProviderConnection, clearSecrets?: readonly string[]): MemoryProviderConnection;
    /** Atomically replace one provider's local projections after authoritative discovery. */
    syncProviderService(providerId: MemoryProviderId, service: MemoryProviderConnection, discovered: readonly ProviderMemorySpace[]): MemoryProviderServiceView;
    placementCandidates(request: Pick<CreateMemoryBodyRequest, 'connection' | 'providerConnections' | 'openViking'>): MemoryPlacementCandidate[];
    create(request: CreateMemoryBodyRequest, signal?: AbortSignal, placement?: MemoryPlacementDecision): Promise<MemoryBody>;
    update(id: string, request: UpdateMemoryBodyRequest): MemoryBody;
    /** Validate every model-authored update before committing the batch. */
    updateMetadata(updates: readonly MemoryBodyMetadataUpdate[]): MemoryBody[];
    remove(id: string, signal?: AbortSignal): Promise<MemoryBody>;
    setActive(id: string, active: boolean): MemoryBody;
    /** Refresh metadata after an atomic Pack import replaced the data component. */
    reload(): void;
    private loadAndReconcile;
    private reconcileDiscoveredStores;
    private nativeStoreIds;
    private view;
    private save;
    private writeRegistry;
}
