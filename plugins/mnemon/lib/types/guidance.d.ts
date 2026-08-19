import type { HostAgent, HostContextShape } from './contracts.ts';
import type { ResolvedConfig } from './config.ts';
import type { RuntimeMemoryController } from './runtime-memory.ts';
export declare const GUIDANCE_SECTION_NAME = "mnemon:routing";
export declare const RUNTIME_MEMORY_CONTEXT_NAME = "mnemon:runtime-memory";
export declare const ROUTING_GUIDANCE = "Use memory only by need. For substantial project records, search active Mnemon Documents before deep recall. Call mnemon_recall when durable history may matter or an exact prior detail is missing; never infer a missing historical rule. New explicit reusable facts normally go to mnemon_runtime_memory. A write completes only with a tool receipt.";
export declare function registerGuidance(ctx: HostContextShape, config?: Pick<ResolvedConfig, 'routingGuidance'>): void;
/** Project the latest committed USER.md/MEMORY.md as DSH's durable runtime-context snapshot. */
export declare function registerRuntimeMemoryContext(ctx: HostContextShape, runtimeMemory: RuntimeMemoryController): void;
/** Shadow the global fallback with the current Agent workspace's hot memory. */
export declare function registerAgentRuntimeMemoryContext(agent: HostAgent, runtimeMemory: () => RuntimeMemoryController): () => void;
