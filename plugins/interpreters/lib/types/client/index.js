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
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react';
import { InterpretersCard } from "./InterpretersCard.js";
import { InterpretersCardController, refreshIfLoaded } from "./store.js";
import { en, NS, zh } from "./locales.js";
/** Required services (cordis fiber inject). The target slot is declared by
 *  ui-plugin-config's apply, whose activation order relative to this one is
 *  NOT constrained; registration depends on the slot through `slots.inject()`. */
export const inject = ['slots', 'locale', 'connection'];
/**
 * Register the interpreters card once the `settings.plugin.item` declaration
 * is on the ledger, wire its store to the connection, and keep it fresh on
 * every pushed invalidation.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-interpreters: dictionaries');
    // The store reads/writes the interpreters config over the plugin's
    // self-hosted HTTP route (`/interpreters/api/get` + `/interpreters/api/set`).
    const controller = new InterpretersCardController();
    const useSnapshot = bindSnapshotSelector(controller.store);
    // Pushed invalidations converge the open surface without polling. The dsh
    // snapshot removed the `settings/changed` host passthrough from the client
    // runtime Events vocabulary, so convergence rides `connection/reset` — a
    // connection reset invalidates the whole client state. A burst of resets
    // coalesces into a single refetch via the microtask debounce, and
    // `refreshIfLoaded` keeps an unopened card idle.
    ctx.effect(() => {
        let pending = false;
        const refresh = () => {
            if (pending)
                return;
            pending = true;
            queueMicrotask(() => {
                pending = false;
                refreshIfLoaded(controller);
            });
        };
        const disposers = [ctx.on('connection/reset', refresh)];
        return () => { for (const dispose of disposers)
            dispose(); };
    }, 'dsh-interpreters: pushed invalidations');
    // The card registers into the plugin-config page's card slot with the
    // upstream card shape — generator + `yield`, `locale: NS`, and an inject
    // face carrying ONLY the business surface (controller + useSnapshot). The
    // typed `t` seat is synthesized by the renderer from `locale: NS`.
    ctx.slots.inject('settings.plugin.item', function* () {
        yield ctx.slots.register({
            name: 'settings.plugin.item',
            id: 'dsh-interpreters',
            order: 50, // bash 0 / agent-loop 10 / web-search 20 / advisor 30 / interpreters 50
            locale: NS,
            inject: () => ({ controller, useSnapshot }),
        }, InterpretersCard);
    });
}
