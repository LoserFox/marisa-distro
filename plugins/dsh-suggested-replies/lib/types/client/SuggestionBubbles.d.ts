/**
 * Input-dock bubbles that copy a suggested reply into the message draft.
 *
 * @module @dsh-external/dsh-suggested-replies/client/SuggestionBubbles
 */
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Connection capability injected by the browser plugin registration. */
export interface SuggestionBubblesInjected {
    /** RPC transport used to read and watch this Session's sidecar state. */
    readonly rpc: ClientConnectionRpc;
}
/** Full prop currency supplied by the `conversation.input.dock` slot. */
export type SuggestionBubblesProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'suggested-replies'> & SuggestionBubblesInjected;
/** Render loading text or ready bubbles directly above the composer card. */
export declare function SuggestionBubbles({ rpc, sessionId, useInput, inputActions, t }: SuggestionBubblesProps): import("react").JSX.Element | null;
