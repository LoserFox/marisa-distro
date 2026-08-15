/**
 * Suggested replies browser plugin.
 *
 * The candidate row registers in `conversation.input.dock`, the official
 * stacked strip rendered immediately above the message input. Clicking a
 * candidate only calls `inputActions.setDraft`; submission remains the user's
 * explicit action in the composer.
 *
 * @module @dsh-external/dsh-suggested-replies/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type SuggestedRepliesKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy used by the suggested replies dock and settings section. */
        'suggested-replies': SuggestedRepliesKey;
    }
}
/** Required client services: slots, locale registration, and settings RPC transport. */
export declare const inject: string[];
/**
 * Register the input-dock candidate row and the settings master switch.
 * @param ctx - browser client root context.
 */
export declare function apply(ctx: ClientContext): void;
