import type { MnemonRunner } from './runner.ts';
import type { RuntimeMemoryCompactedEntry, RuntimeMemoryMutation, RuntimeMemoryMutationResult, RuntimeMemorySnapshot, RuntimeMemoryTarget } from './shared/contracts.ts';
export type { RuntimeMemoryAction, RuntimeMemoryCompactedEntry, RuntimeMemoryEntry, RuntimeMemoryImportance, RuntimeMemoryMutation, RuntimeMemoryMutationResult, RuntimeMemorySnapshot, RuntimeMemoryTarget, RuntimeMemoryTargetView, RuntimeMemoryUsage, } from './shared/contracts.ts';
export declare const RUNTIME_MEMORY_VERSION = 1;
export declare const RUNTIME_ENTRY_DELIMITER = "\n\u00A7\n";
export declare const RUNTIME_MEMORY_LIMITS: {
    readonly memory: number;
    readonly user: number;
};
export declare class RuntimeMemoryCapacityError extends Error {
    readonly target: RuntimeMemoryTarget;
    readonly used: number;
    readonly projected: number;
    readonly limit: number;
    constructor(target: RuntimeMemoryTarget, used: number, projected: number, limit: number);
}
export declare class RuntimeMemoryConflictError extends Error {
    constructor();
}
/**
 * Single authority for hot memory. JSON is the durable source of truth;
 * Markdown files are deterministic projections consumed by prompt assembly.
 */
export declare class RuntimeMemoryController {
    private readonly now;
    readonly directory: string;
    readonly sourcePath: string;
    readonly memoryPath: string;
    readonly userPath: string;
    readonly lockPath: string;
    private queue;
    constructor(runner: Pick<MnemonRunner, 'effectiveDataDir'>, now?: () => Date);
    snapshot(): RuntimeMemorySnapshot;
    contextText(): string;
    mutate(request: RuntimeMemoryMutation): Promise<RuntimeMemoryMutationResult>;
    /** Apply an LLM-produced compaction only to the exact snapshot it reviewed. */
    compactTarget(expectedRevision: string, target: RuntimeMemoryTarget, compacted: RuntimeMemoryCompactedEntry[], maxBytes?: number): Promise<RuntimeMemorySnapshot>;
    private initialize;
    private mutateLocked;
    private result;
    private targetView;
    private snapshotUnlocked;
    private readSource;
    private persist;
    private repairProjections;
    private withLock;
}
