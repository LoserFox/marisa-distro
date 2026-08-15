/** Settings and sidecar-state RPC for the suggested-replies Web surface. */
import type { Context } from '@deepseek-ai/cordis';
import type { SuggestedRepliesSessionIdentity, SuggestedRepliesStateSnapshot, SuggestedRepliesStateStore } from './state.ts';
/** Dedicated channel for this plugin's Web endpoints. */
export declare const CHANNEL = "/suggested-replies";
/** Result returned by both settings endpoints. */
export interface SettingsResponse {
    /** Whether future completed turns generate candidates. */
    readonly enabled: boolean;
}
/** Client-facing state returned by `state.get` and `state.watch`. */
export type SuggestedRepliesStateResponse = SuggestedRepliesStateSnapshot;
/** Payload accepted by `settings.set`. */
export interface SettingsSetPayload {
    /** Requested enabled state. */
    readonly enabled: boolean;
}
/** Payload accepted by `state.get`. */
export interface StateGetPayload {
    /** Parent Session whose sidecar state should be returned. */
    readonly sessionId: string;
}
/** Payload accepted by `state.watch`. */
export interface StateWatchPayload extends StateGetPayload {
    /** Session lifecycle observed by the caller. */
    readonly lifecycle: SuggestedRepliesSessionIdentity;
    /** Last revision observed by the caller. */
    readonly revision: number;
}
/** Register settings and cancellable sidecar-state endpoints. */
export declare function registerSuggestedRepliesRpc(ctx: Context, store: SuggestedRepliesStateStore, getEnabled: () => boolean, setEnabled: (enabled: boolean) => Promise<void>): void;
