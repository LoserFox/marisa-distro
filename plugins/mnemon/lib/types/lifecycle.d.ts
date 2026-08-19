import type { ResolvedConfig } from './config.ts';
import type { HostAgent, HostContextShape } from './contracts.ts';
import type { Insight, RememberRequest, SearchRequest } from './service.ts';
import type { RuntimeMemoryMutation } from './runtime-memory.ts';
import type { DocumentMutation } from './documents.ts';
import { MnemonSubagentCoordinator, type DelegatedWriteResult } from './subagent.ts';
import { type TurnMemoryActivitySnapshot } from './activity.ts';
import type { RuntimeMemoryController } from './runtime-memory.ts';
import type { AssistantMessageText, LifecycleSnapshot, TaskAgentModelCatalog } from './shared/contracts.ts';
import type { PreparedMemoryPlacement } from './provider-placement.ts';
interface AgentRuntimeSource {
    forAgent(agent: HostAgent): {
        runtimeMemory: RuntimeMemoryController;
    };
}
export type { TurnMemoryActivity, TurnMemoryActivitySnapshot } from './activity.ts';
export type { AssistantMessageText, LifecycleAgentSnapshot, LifecycleCounters, LifecyclePhase, LifecycleSnapshot } from './shared/contracts.ts';
export declare const MNEMON_PLUGIN_SOURCE = "dsh-mnemon";
export interface SupervisedWritebackResult extends DelegatedWriteResult {
    sessionId: string;
}
/** DSH-native owner for per-agent Mnemon lifecycle hooks and UI-triggered LLM work. */
export declare class MnemonLifecycle {
    private readonly ctx;
    private readonly coordinator;
    private readonly config;
    private readonly runtimeSource?;
    private readonly owners;
    private readonly counters;
    /** Creation ids reserved before DSH publishes clean task-root Agents. */
    private readonly taskAgentIds;
    /** Bounded process-local replay fence for finalized-message write actions. */
    private readonly supervisedWritebacks;
    constructor(ctx: HostContextShape, coordinator: MnemonSubagentCoordinator, config: ResolvedConfig, runtimeSource?: AgentRuntimeSource | undefined);
    start(): () => void;
    snapshot(sessionId?: string, workspaceRoot?: string): LifecycleSnapshot;
    /** Provider/model directory used by Settings without requiring a live session. */
    taskAgentModels(includeCatalog?: boolean): Promise<TaskAgentModelCatalog>;
    private availableAgent;
    workspaceRoot(sessionId?: string): string | undefined;
    /** Settled memory-tool activity for all turns, resolved per session. */
    turnActivities(sessionId: string): TurnMemoryActivitySnapshot;
    /** Plain text of one finalized assistant message, resolved per session; null while absent. */
    assistantMessage(sessionId: string, messageId: string): AssistantMessageText | null;
    recall(sessionId: string, request: SearchRequest, signal?: AbortSignal): Promise<import("./subagent.ts").DelegatedRecallResult>;
    related(sessionId: string, id: string, memoryBodyId?: string, signal?: AbortSignal): Promise<import("./subagent.ts").DelegatedRecallResult>;
    answer(sessionId: string, query: string, evidence: Insight[], signal?: AbortSignal): Promise<import("./subagent.ts").DelegatedAnswerResult>;
    /** Synthesize a Web Agent Query without borrowing a conversation Agent or its history. */
    answerTask(sessionId: string, query: string, evidence: Insight[], workspaceRoot?: string, signal?: AbortSignal): Promise<import("./subagent.ts").DelegatedAnswerResult>;
    remember(sessionId: string, request: RememberRequest, signal?: AbortSignal): Promise<DelegatedWriteResult>;
    runtime(sessionId: string, request: RuntimeMemoryMutation, signal?: AbortSignal): Promise<import("./subagent.ts").CoordinatedRuntimeMemoryResult>;
    documents(sessionId: string): import("./documents.ts").DocumentSnapshot;
    document(sessionId: string, id: string): import("./documents.ts").DocumentView;
    searchDocuments(sessionId: string, query: string, includeArchived?: boolean, limit?: number): Promise<import("./documents.ts").DocumentSearchResult>;
    mutateDocument(sessionId: string, request: DocumentMutation, signal?: AbortSignal): Promise<import("./subagent.ts").CoordinatedDocumentResult>;
    archiveDocument(sessionId: string, id: string, workspaceRoot?: string, signal?: AbortSignal): Promise<import("./subagent.ts").CoordinatedDocumentResult>;
    mutate(sessionId: string, operation: string, request: unknown, signal?: AbortSignal): Promise<DelegatedWriteResult>;
    placeProvider(sessionId: string, body: {
        name: string;
        description: string;
    }, prepared: PreparedMemoryPlacement, signal?: AbortSignal): Promise<import("./shared/contracts.ts").MemoryPlacementDecision>;
    maintainMetadata(sessionId: string, memoryBodyIds: readonly string[], workspaceRoot?: string, signal?: AbortSignal): Promise<import("./shared/contracts.ts").MemoryBodyMetadataMaintenanceResult>;
    supervise(sessionId: string, content: string, idempotencyKey?: string, signal?: AbortSignal): Promise<SupervisedWritebackResult>;
    /** Run a Web workbench distillation under a fresh top-level task Agent. */
    superviseTask(sessionId: string, content: string, idempotencyKey?: string, workspaceRoot?: string, signal?: AbortSignal): Promise<SupervisedWritebackResult>;
    private superviseResolved;
    private liveAgent;
    /**
     * Run session-independent maintenance under a fresh top-level Agent. Its cwd
     * is the explicit Web workbench scope, so LiveMnemonRuntime resolves the same
     * workspace graph without borrowing conversation history or ownership.
     */
    private runTaskAgent;
    /** Resolve the same model route and preset composition as an ordinary fresh DSH Agent. */
    private taskAgentCreation;
    /** Resolve a complete task route for both status admission and actual creation. */
    private taskAgentModelRoute;
    private taskAgentModelOptions;
    private install;
}
