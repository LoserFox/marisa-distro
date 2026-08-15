/**
 * dsh-interpreters — browser half.
 *
 * Registers the `interpreters` card into the shell-declared
 * `settings.plugin.item` slot (the plugin-config settings page — id
 * `dsh-interpreters`, order 50, after the upstream bash / agent-loop /
 * web-search cards). The card's store reads/writes the `interpreters` config
 * through the host gateway `/api/interpreters/get|set` RPC channel, and keeps
 * fresh on pushed invalidations.
 *
 * Export discipline: the client half value-imports ONLY the frozen platform
 * module table (CLIENT_EXTERNALS); every other `@deepseek-ai/*` import is
 * type-only (erased at build) — values arrive via cordis injection
 * (`ctx.get('connection')`, slot inject faces).
 *
 * @module @huanlin/dsh-plugin-interpreters/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type InterpretersKey } from './locales.ts';
export type { InterpretersCardInjected, InterpretersCardProps } from './InterpretersCard.tsx';
export type { InterpretersKey } from './locales.ts';
export type { InterpretersCardState, InterpretersCardController } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The interpreters card copy. */
        'interpreters': InterpretersKey;
    }
}
/** Required services (cordis fiber inject). The target slot is declared by
 *  ui-plugin-config's apply, whose activation order relative to this one is
 *  NOT constrained; registration depends on the slot through `slots.inject()`. */
export declare const inject: string[];
/**
 * Register the interpreters card once the `settings.plugin.item` declaration
 * is on the ledger, wire its store to the connection, and keep it fresh on
 * every pushed invalidation.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
