/**
 * Prompt construction and strict JSON parsing for suggested replies.
 *
 * @module @dsh-external/dsh-suggested-replies/suggestion-prompt
 */
import type { Message } from '@deepseek-ai/dsh-llm';
import type { SuggestedReply } from './types.ts';
/** Runtime-controlled limits that affect prompt wording and response parsing. */
export interface SuggestionOutputLimits {
    /** Number of candidates the model must return. */
    readonly suggestionCount: number;
    /** Maximum characters retained for each ready candidate. */
    readonly maxSuggestionChars: number;
}
/**
 * Build the system instruction for one auxiliary next-message prediction call.
 * @param limits - resolved output cardinality and per-candidate text bound.
 * @returns the complete model instruction.
 */
export declare function buildSuggestionSystemPrompt(limits: SuggestionOutputLimits): string;
/**
 * Build the conversation prompt supplied beside the system instruction.
 *
 * Candidate prediction is useful only after a visible assistant answer. A
 * context containing no assistant text therefore returns `null` rather than
 * spending an auxiliary model call on an unfinished or tool-only turn.
 * @param messages - recent model-visible conversation messages, oldest first.
 * @returns serialized conversation context, or `null` when no assistant text is available.
 */
export declare function buildSuggestedRepliesUserPrompt(messages: readonly Message[]): string | null;
/**
 * Parse one model response into the configured number of candidate messages.
 * A single outer Markdown code fence is accepted defensively, but every other
 * non-JSON response is rejected.
 * @param raw - model text accumulated from the stream.
 * @param limits - resolved output cardinality and per-candidate text bound.
 * @returns ready candidates, or `null` when the response does not meet the format.
 */
export declare function parseSuggestedReplies(raw: string, limits: SuggestionOutputLimits): SuggestedReply[] | null;
/**
 * Produce a bounded deterministic fallback when the auxiliary model does not
 * return the required JSON. The fallback follows the recent conversation's
 * language and preserves the configured candidate count.
 */
export declare function fallbackSuggestedReplies(conversation: string, limits: SuggestionOutputLimits): SuggestedReply[];
