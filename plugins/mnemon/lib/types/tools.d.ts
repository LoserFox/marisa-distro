import type { HostContextShape } from './contracts.ts';
import type { HostAgent } from './contracts.ts';
import type { DocumentManager } from './documents.ts';
import type { RuntimeMemoryController } from './runtime-memory.ts';
import { MnemonSubagentCoordinator } from './subagent.ts';
import { type MnemonService } from './service.ts';
interface AgentRuntimeSource {
    readonly config: MnemonService['config'];
    forAgent(agent: HostAgent): {
        service: MnemonService;
        runtimeMemory: RuntimeMemoryController;
        documents: DocumentManager;
    };
}
/** Root calls delegate to a bounded child; memory-worker calls reach the deterministic service. */
export declare function registerTools(ctx: HostContextShape, serviceOrSource: MnemonService | AgentRuntimeSource, coordinator: MnemonSubagentCoordinator, runtimeMemory?: RuntimeMemoryController, documents?: DocumentManager): void;
export {};
