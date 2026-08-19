import type { ResolvedConfig } from './config.ts';
import type { HostAgent, HostAgentsService, HostWorkspace, HostWorkspaceRegistry } from './contracts.ts';
import { DocumentManager } from './documents.ts';
import { MnemonPackManager } from './pack.ts';
import { type MnemonRunner } from './runner.ts';
import { RuntimeMemoryController } from './runtime-memory.ts';
import { MnemonService } from './service.ts';
import { StorageScopeInspector } from './storage-scope.ts';
export interface MnemonRuntimeGraph {
    config: ResolvedConfig;
    runner: MnemonRunner;
    service: MnemonService;
    runtimeMemory: RuntimeMemoryController;
    documents: DocumentManager;
    storage: StorageScopeInspector;
    packs: MnemonPackManager;
}
/**
 * Build a complete generation before it can become visible. Constructors also
 * validate and initialize the selected storage root, so a failed candidate is
 * rejected by DSH settings validation without disturbing the active graph.
 */
export declare function createRuntimeGraph(config: ResolvedConfig, workspaceRoot?: string): MnemonRuntimeGraph;
/**
 * Stable faces handed to DSH registrations. `swap` is synchronous and contains
 * no user code, so all faces move to the same prevalidated generation in one
 * JavaScript turn. A method obtained before the swap stays bound to its old
 * generation until that invocation settles.
 */
export declare class LiveMnemonRuntime {
    private readonly workspaceRegistry?;
    private readonly agents?;
    private current;
    private readonly workspaceGraphs;
    readonly config: ResolvedConfig;
    readonly runner: MnemonRunner;
    readonly service: MnemonService;
    readonly runtimeMemory: RuntimeMemoryController;
    readonly documents: DocumentManager;
    readonly storage: StorageScopeInspector;
    readonly packs: MnemonPackManager;
    constructor(initial: MnemonRuntimeGraph, workspaceRegistry?: HostWorkspaceRegistry | undefined, agents?: HostAgentsService | undefined);
    swap(next: MnemonRuntimeGraph): void;
    snapshot(): MnemonRuntimeGraph;
    /** Resolve the runtime that must serve one Agent execution. */
    forAgent(agent: HostAgent): MnemonRuntimeGraph;
    /** Resolve an authorized DSH workspace selected by the Web workbench. */
    forWorkspaceId(workspaceId: string): MnemonRuntimeGraph;
    /** Resolve a Web request, preferring its explicit inspection workspace. */
    route(request: {
        workspaceId?: string;
        sessionId?: string;
    }): {
        graph: MnemonRuntimeGraph;
        selectedWorkspace?: HostWorkspace;
        effectiveWorkspace?: HostWorkspace;
        selectedRoot: string;
        effectiveRoot: string;
        aligned: boolean;
    };
    private forWorkspacePath;
    private agent;
    private requireWorkspace;
    private workspaceForPath;
}
