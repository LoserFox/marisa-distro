/**
 * gateway.ts — host-side HTTP gateway exposing the `interpreters` config to
 * the browser through a self-hosted `/interpreters/api` route.
 *
 * The DSH typertGateway `/api` RPC dispatch was the original channel
 * (TypertRemoteService + @Remote), but the host's SRC discovery
 * (ctx.reflect.props enumeration) is not claiming plugin-owned service
 * endpoints on the current dsh snapshot. The self-hosted HTTP route
 * mirrors the better-sidebar pattern: `ctx.webServer.register` claims a
 * prefix route, the handler reads/writes the settings seam in-process
 * (no wire-layer allowlist gate), and the browser reaches it through
 * `fetch('/interpreters/api/<method>')`.
 *
 * Route shape:
 *   POST /interpreters/api/get  → { ok: true, value: { config: ResolvedConfig } }
 *   POST /interpreters/api/set  body: { patch: Partial<Config> }
 *                                → { ok: true, value: { config: ResolvedConfig } }
 * Errors carry { ok: false, error: { code, message } }.
 *
 * @module dsh-interpreters/gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Settings } from '@deepseek-ai/dsh-settings';
import { type Config as ConfigType, type ResolvedConfig } from './config.js';
import { type InterpretersSettingsBridge } from './settings.js';
/** Wire view returned by both `get` and `set`: the fully-resolved config. */
export interface InterpretersConfigView {
    config: ResolvedConfig;
}
/** Patch shape the `set` endpoint accepts (every field optional, null = clear). */
export type InterpretersConfigPatch = Partial<ConfigType>;
/**
 * Register the `/interpreters/api` HTTP route on the host's web server.
 *
 * The route reads/writes the `interpreters` settings namespace in-process
 * through the bridge + `ctx.settings`. The settings service is optional:
 * when absent, `get` degrades to the entry source and `set` returns a
 * clear error.
 * @param ctx - host context carrying `webServer`.
 * @param bridge - the settings bridge the route reads through.
 */
export declare function registerHttpGateway(ctx: Context, bridge: InterpretersSettingsBridge): void;
/**
 * Handle the `set` method: validate the patch, write the user layer, return
 * the new resolved config.
 * @param body - the parsed JSON body from the request.
 * @param settings - the live settings service (undefined when unavailable).
 * @param bridge - the settings bridge for reading the source.
 * @returns the new resolved config view.
 * @throws when the settings service is unavailable.
 */
export declare function handleSet(body: unknown, settings: Settings | undefined, bridge: InterpretersSettingsBridge): Promise<InterpretersConfigView>;
/**
 * Extract and validate the patch from the request body.
 *
 * JSON wire boundary: null = "delete" (filtered), undefined never crosses
 * JSON. Unknown keys are dropped (the settings service is non-strict and
 * would otherwise store them). Light type guards constrain paths to
 * strings and timeout to a finite number.
 * @param body - the parsed JSON body.
 * @returns the normalized patch (only known, well-typed keys).
 */
export declare function extractPatch(body: unknown): Record<string, unknown>;
