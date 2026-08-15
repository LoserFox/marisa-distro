/** Suggested replies host plugin with plugin-owned sidecar state. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SuggestedRepliesSettings } from './types.ts';
export type * from './types.ts';
export type { SuggestedRepliesStateSnapshot } from './state.ts';
/** Cordis plugin identity. */
export declare const name = "dsh-suggested-replies";
/** Required official extension points. */
export declare const inject: string[];
/** User-settings namespace used by the master enable switch. */
export declare const SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Configurable runtime parameters for candidate generation. */
export interface Config extends SuggestedRepliesSettings {
    /** Candidate messages requested from the auxiliary model. */
    suggestionCount: number;
    /** Trailing visible conversation messages supplied to the auxiliary model. */
    contextMessageCount: number;
    /** Maximum retained characters for one candidate message. */
    maxSuggestionChars: number;
    /** Maximum response tokens requested from the auxiliary model. */
    maxTokens: number;
    /** Maximum lifetime of one auxiliary Agent run. */
    timeoutMs: number;
    /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
    suggestionProvider?: string;
    /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
    suggestionModel?: string;
}
/** Config schema with deployment-adjustable generation limits. */
export declare const Config: z<Config>;
/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
export declare function apply(ctx: Context, config: Config): Promise<() => Promise<void>>;
