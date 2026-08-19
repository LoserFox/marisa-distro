/**
 * P2 — LLM facade over the harness `ctx.llm` service.
 *
 * All semantic judgement in the v2 pipeline (intent layering, segmentation
 * boundary decisions, candidate synthesis) funnels through this module. It
 * provides a single JSON-output call that:
 * - streams via `ctx.llm.stream(GenerateOptions)` and assembles text blocks
 *   through the harness BlockAssembler,
 * - requests JSON via a `system` instruction + structural validation,
 * - degrades gracefully when the llm service is unavailable or a call fails
 *   (returns `undefined` so callers fall back to rule-only behavior).
 *
 * Keyless-safe: `getLlm` returns undefined without the service; every caller
 * must handle the undefined path (v2-design §3.2 downgrade policy).
 *
 * Usage metering (2026-08-11): every streamed call is metered here, at the
 * single funnel point, so the ledger covers ANY future caller without extra
 * wiring. The BlockAssembler already captures the stream's `usage` chunk and
 * terminal `finish` reason (the global token-meter cannot see plugin-direct
 * `ctx.llm` calls — they never surface as session events). Records are
 * emitted through the injected recorder (see `setUsageRecorder`); metering is
 * fire-and-forget and must never affect the call's result.
 * @module @fakechris/dsh-track/sync/llm
 */
import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { LlmUsageRecord } from '../types.ts';
/** Minimal surface of the harness llm service we consume. */
export interface LlmLike {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Recorder callback: one ledger record per real LLM request. */
export type UsageRecorder = (record: Omit<LlmUsageRecord, 'id'>) => void | Promise<void>;
/** Inject the usage ledger writer (host wiring; store-backed in index.ts). */
export declare function setUsageRecorder(recorder: UsageRecorder | undefined): void;
/** Read the injected recorder (tests, tooling). */
export declare function getUsageRecorder(): UsageRecorder | undefined;
/** Per-call metadata the caller attaches for the usage ledger. */
export interface CallMeta {
    /** Call site label recorded with the usage record (e.g. intent | synthesize). */
    label?: string;
    /** 1-based retry attempt; each attempt is one real HTTP request. */
    attempt?: number;
}
/** Resolve the llm service non-throwingly (same pattern as sessionQuery). */
export declare function getLlm(ctx: Context | undefined): LlmLike | undefined;
/** Build a user message from text (source: plugin). */
export declare function userMessage(text: string): Message;
/** System message from text. */
export declare function systemMessage(text: string): Message;
/**
 * Assemble a text-only completion from a stream.
 *
 * Meters the call through the injected recorder: one record per invocation
 * (success or failure), using the assembler's captured `usage` chunk and
 * terminal finish reason. `meta.label` distinguishes the call site; `attempt`
 * is the 1-based retry index (each attempt is a separate real request).
 */
export declare function assembleText(llm: LlmLike, options: GenerateOptions, meta?: CallMeta): Promise<string | undefined>;
/**
 * Request one JSON object from the model.
 *
 * The system prompt instructs "output ONLY a JSON object, no markdown fence";
 * we also strip a surrounding ```json fence if the model adds one. Structural
 * check: result is an object and every key in `requiredKeys` is present (extra
 * keys allowed). No schema library — keep the dependency surface zero.
 *
 * `label` is ledger metadata identifying the call site; every retry attempt
 * is metered separately (one record per real request).
 */
export declare function llmJson(llm: LlmLike, opts: {
    provider: string;
    model: string;
    system: string;
    prompt: string;
    requiredKeys: string[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
    purpose?: string;
    label?: string;
}): Promise<Record<string, unknown> | undefined>;
