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
import type { Context } from '@deepseek-ai/cordis';
import { type Config } from './config.js';
export { Config, resolveConfig, type ResolvedConfig } from './config.js';
export { registerHttpGateway, type InterpretersConfigPatch, type InterpretersConfigView } from './gateway.js';
export { SETTINGS_NAMESPACE, type InterpretersSettingsBridge } from './settings.js';
export declare const name = "dsh-interpreters";
export declare const inject: string[];
/**
 * Plugin body: register tools with the composition config, then swap to
 * settings-resolved config when the settings service mounts, and expose the
 * config through a `/interpreters/api/get|set` HTTP route.
 * @param ctx - host context carrying `tools` and `webServer`.
 * @param config - resolved composition config (seed).
 */
export declare function apply(ctx: Context, config?: Config): void;
