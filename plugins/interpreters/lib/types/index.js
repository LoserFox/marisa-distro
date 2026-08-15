/**
 * index.ts — dsh-interpreters host plugin entry.
 *
 * Registers two model-facing tools (`run_python`, `run_node`) whose
 * descriptions embed the configured interpreter paths. The paths persist
 * through the settings seam under the `interpreters` namespace in
 * `$DSH_HOME/settings.yaml`; runtime edits dispose and re-register the tools
 * so the model immediately sees the updated path. The browser reaches the
 * same namespace through a self-hosted `/interpreters/api` HTTP route
 * (the DSH settings RPC domain only serves allowlisted namespaces to
 * configuration clients, so this plugin exposes its own route through
 * `ctx.webServer.register`, bypassing the wire-layer allowlist by calling
 * the settings seam in-process).
 *
 * Architecture:
 *   - `installInterpretersSettings` registers the namespace and exposes a
 *     `source()` thunk + `onChange()` subscription.
 *   - `registerHttpGateway` claims `/interpreters/api/get|set` and
 *     reads/writes through the bridge + `ctx.settings` in-process.
 *   - The tool registration is re-run on every `bridge.onChange` notification
 *     so the model-visible description tracks the live interpreter path.
 *   - Headless assemblies without a settings provider fall back to the
 *     composition config (no persistence, no live reload, the `set`
 *     endpoint returns a clear "settings service unavailable" error).
 *
 * @module @huanlin/dsh-plugin-interpreters
 */
import { resolveConfig } from './config.js';
import { registerHttpGateway } from './gateway.js';
import { installInterpretersSettings } from './settings.js';
import { registerTools } from './tools.js';
export { Config, resolveConfig } from './config.js';
export { registerHttpGateway } from './gateway.js';
export { SETTINGS_NAMESPACE } from './settings.js';
export const name = 'dsh-interpreters';
export const inject = ['tools', 'webServer'];
/**
 * Plugin body: register tools with the composition config, then swap to
 * settings-resolved config when the settings service mounts, and expose the
 * config through a `/interpreters/api/get|set` HTTP route.
 * @param ctx - host context carrying `tools` and `webServer`.
 * @param config - resolved composition config (seed).
 */
export function apply(ctx, config = {}) {
    ctx.logger('dsh-interpreters').info('apply() called, config=', JSON.stringify(config));
    const bridge = installInterpretersSettings(ctx, config);
    let disposeTools = registerTools(ctx, resolveConfig(bridge.source()));
    // Live re-register on every committed settings change so the model-visible
    // tool description tracks the live interpreter path.
    bridge.onChange(() => {
        disposeTools?.();
        disposeTools = registerTools(ctx, resolveConfig(bridge.source()));
    });
    // Register the HTTP gateway; the /interpreters/api route claims get/set.
    registerHttpGateway(ctx, bridge);
    ctx.logger('dsh-interpreters').info('http gateway registered at /interpreters/api');
    ctx.effect(() => () => { disposeTools?.(); }, 'dsh-interpreters: cleanup');
}
