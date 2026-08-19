import type { HostAgent } from './contracts.ts';
import type { DocumentMutation, DocumentMutationResult, DocumentRecord, DocumentSearchResult, DocumentSnapshot, DocumentView } from './shared/contracts.ts';
export type { DocumentMutation, DocumentMutationResult, DocumentRecord, DocumentSearchResult, DocumentSnapshot, DocumentStatus, DocumentView } from './shared/contracts.ts';
export declare const DOCUMENTS_VERSION = 1;
export declare const DOCUMENTS_ACTIVE_LIMIT_BYTES: number;
export interface DocumentCapacityPlan {
    projected: number;
    limit: number;
    fits: boolean;
    candidates: DocumentRecord[];
}
export declare class DocumentCapacityError extends Error {
    readonly projected: number;
    readonly limit: number;
    readonly candidates: DocumentRecord[];
    constructor(projected: number, limit: number, candidates: DocumentRecord[]);
}
export declare class DocumentConflictError extends Error {
    constructor();
}
/** Project-scoped control plane for managed active and cold document copies. */
export declare class DocumentController {
    readonly limitBytes: number;
    private readonly now;
    readonly workspaceRoot: string;
    readonly storageRoot: string;
    readonly directory: string;
    readonly activeDirectory: string;
    readonly archivedDirectory: string;
    readonly indexPath: string;
    readonly lockPath: string;
    private readonly managedRelativePrefix;
    private queue;
    constructor(workspaceRoot: string, limitBytes?: number, now?: () => Date, storageRoot?: string);
    snapshot(): DocumentSnapshot;
    get(id: string): DocumentView;
    capacityPlan(request: DocumentMutation): DocumentCapacityPlan;
    search(query: string, options?: {
        includeArchived?: boolean;
        limit?: number;
    }): Promise<DocumentSearchResult>;
    mutate(request: DocumentMutation): Promise<DocumentMutationResult>;
    archive(id: string, expectedRevision: number, details: {
        summary: string;
        memoryBodyIds: string[];
    }): Promise<DocumentMutationResult>;
    private mutateLocked;
    private initialize;
    private readIndex;
    private snapshotUnlocked;
    private requireDocument;
    private assertCapacity;
    private normalizeSourcePaths;
    private relativeManagedPath;
    private pathFor;
    private readBody;
    private view;
    private persistDocument;
    private persistIndex;
    private atomicWrite;
    private withLock;
}
/** Resolves one cached controller per canonical DSH workspace. */
export declare class DocumentManager {
    private readonly limitBytes;
    private readonly now;
    private readonly storageRoot?;
    private readonly controllers;
    constructor(limitBytes?: number, now?: () => Date, storageRoot?: (() => string) | undefined);
    forWorkspace(workspaceRoot: string): DocumentController;
    forAgent(agent: HostAgent): DocumentController;
}
