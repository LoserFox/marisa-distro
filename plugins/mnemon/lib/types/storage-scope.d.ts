import type { ResolvedConfig } from './config.ts';
import type { MnemonRunner } from './runner.ts';
import type { StorageScopeCatalog } from './shared/contracts.ts';
export type { StorageAreaInventory, StorageAreaKind, StorageAreaStatus, StorageScopeCatalog, StorageScopeInventory, StorageScopeKind } from './shared/contracts.ts';
/** Read-only catalog of the three storage domains. It never creates, moves, or repairs files. */
export declare class StorageScopeInspector {
    private readonly runner;
    private readonly config;
    constructor(runner: Pick<MnemonRunner, 'effectiveDataDir'>, config: Pick<ResolvedConfig, 'dataDir' | 'storageScope'>);
    catalog(workspaceRoot?: string): StorageScopeCatalog;
}
export declare function validateCustomStorageRoot(value: string): string;
