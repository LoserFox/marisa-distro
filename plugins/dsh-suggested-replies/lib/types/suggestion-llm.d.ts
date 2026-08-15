/** Logged auxiliary Agent run that predicts concise next user messages. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type { SuggestedRepliesRoute, SuggestedReply } from './types.ts';
import { type SuggestionOutputLimits } from './suggestion-prompt.ts';
/** Resolved runtime choices for one suggested-replies model request. */
export interface SuggestionGenerationConfig extends SuggestionOutputLimits {
    /** Number of recent model-visible messages retained as context. */
    readonly contextMessageCount: number;
    /** Maximum output tokens requested from the model. */
    readonly maxTokens: number;
    /** Optional explicit auxiliary route that overrides the conversation route. */
    readonly suggestionRoute?: SuggestedRepliesRoute;
}
/** Complete auxiliary request that the internal Agent logs through official events. */
export interface PreparedSuggestionRequest {
    /** Provider/model route for the internal Agent. */
    readonly route: SuggestedRepliesRoute;
    /** Complete system instruction installed as the Agent's only prompt section. */
    readonly system: string;
    /** Complete user-role prompt sent through the Agent inbox. */
    readonly prompt: string;
    /** Maximum output tokens for the Agent request. */
    readonly maxTokens: number;
}
/** Select the trailing model-visible conversation messages from a Session. */
export declare function deriveRecentMessages(agent: Agent, contextMessageCount: number): import("@deepseek-ai/dsh-llm").Message[];
/** Resolve the latest logged route, falling back to the Agent creation route. */
export declare function resolveSuggestionRoute(agent: Agent): SuggestedRepliesRoute | null;
/** Validate and normalize an optional explicit auxiliary route. */
export declare function resolveConfiguredSuggestionRoute(provider: string | undefined, model: string | undefined): SuggestedRepliesRoute | undefined;
/** Prepare one internal Agent request when the completed turn has usable text and routing. */
export declare function prepareSuggestionRequest(agent: Agent, config: SuggestionGenerationConfig, turn: number, signal: AbortSignal): PreparedSuggestionRequest | null;
/** Extract the last non-empty assistant text produced inside one owned run interval. */
export declare function extractSuggestionText(events: readonly SessionEvent[], firstSeq: number): string | null;
/**
 * Run the auxiliary request through an official Agent Session, archive it
 * before model work starts, flush its log, then dispose the live handle.
 */
export declare function generateSuggestedReplies(ctx: Context, parent: Agent, internalSessionId: SessionId, request: PreparedSuggestionRequest, config: SuggestionGenerationConfig, signal: AbortSignal): Promise<SuggestedReply[] | null>;
