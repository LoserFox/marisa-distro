/**
 * Package-owned invariant companion for `@fakechris/dsh-track`.
 *
 * Follows the official plugin-template convention: the companion is a separate
 * Cordis plugin (`dsh-track-invariant`) that registers dsh-track's runtime
 * invariants with the host `invariants` service. The harness mounts
 * `test-invariants` over real compositions (see `verify-package-invariants`
 * / the repo hygiene gates); a profile that composes dsh-track WITHOUT the
 * services it injects fails here with a named reason instead of silently
 * degrading at first tool call.
 * @module @fakechris/dsh-track/invariant
 */
const PACKAGE_NAME = '@fakechris/dsh-track';
/** Cordis companion plugin name. */
export const name = 'dsh-track-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * dsh-track's runtime invariants:
 *  - the plugin injects `tools` and `storage`; a composition that mounts it
 *    without either would register nothing (tools) or strand the KV store
 *    (storage). Fail loud instead of degrading.
 *  - when the plugin is itself mounted, its four tools must be registered
 *    (capture_thought / report_decision_point / track_create_issue /
 *    track_sync_history) — a tool-registration regression is caught here.
 */
const install = (ctx, fail) => {
    if (ctx.get('tools') === undefined) {
        fail(`${PACKAGE_NAME} requires the "tools" registry to register its tools`);
    }
    if (ctx.get('storage') === undefined) {
        fail(`${PACKAGE_NAME} requires the "storage" KV service for its store`);
    }
    const tools = ctx.get('tools');
    if (tools !== undefined) {
        for (const toolName of ['capture_thought', 'report_decision_point', 'track_create_issue', 'track_sync_history']) {
            if (tools.get?.(toolName) === undefined) {
                fail(`${PACKAGE_NAME} tool "${toolName}" is not registered`);
            }
        }
    }
};
/**
 * Resolve the host registry through Cordis's named service lookup. Keeping this
 * narrow local contract lets the companion build without host source files; a
 * composed DSH profile still supplies the real `invariants` service.
 * @param ctx - Cordis context carrying the host service.
 * @returns the host invariant registry.
 * @throws {Error} when the companion is loaded without its host service.
 */
function getInvariantRegistry(ctx) {
    const registry = ctx.get('invariants');
    if (registry === undefined) {
        throw new Error(`invariant companion requires the "invariants" service for ${PACKAGE_NAME}`);
    }
    return registry;
}
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(getInvariantRegistry(ctx).register(PACKAGE_NAME, install));
