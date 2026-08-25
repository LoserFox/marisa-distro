/**
 * dsh-model-proxy — route DSH model/web requests through a local proxy.
 *
 * The harness's LLM adapter (and web search, file uploads) call the global
 * `fetch`, which in Node 18+ is undici and honors the undici global
 * dispatcher (7.x: `Symbol.for('undici.globalDispatcher.2')`; `.1` is
 * legacy). This plugin swaps that dispatcher for an `undici.Agent` whose
 * custom `connect` (callback contract) opens a SOCKS5 or HTTP(S) CONNECT
 * tunnel to the upstream proxy — completing TLS itself for https targets —
 * so every global fetch goes through the proxy transparently: no
 * `DEEPSEEK_BASE_URL` redirect, no separate relay process. Loopback hosts
 * and `NO_PROXY` entries always connect directly.
 *
 * Proxy resolution: `config.proxy` (plugin config) → `$HTTP_PROXY` →
 * `$HTTPS_PROXY` → `$ALL_PROXY` → the Marisa desktop default. The resolved
 * proxy is also published as `HTTP_PROXY` for model-invoked shell children;
 * the model API endpoint itself is never rewritten.
 * @module dsh-model-proxy
 */
import { type Dispatcher } from 'undici';
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export * from './tunnel.js';
export declare const name = "dsh-model-proxy";
/** Host/client pairing key for the Web settings card. */
export declare const MODEL_PROXY_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Marisa's local HTTP proxy endpoint when the launch environment has none. */
export declare const DEFAULT_PROXY_URL = "http://127.0.0.1:10808";
export declare const Config: Schema<Schemastery.ObjectS<{
    proxy: Schema<string, string>;
    noProxy: Schema<string[], string[]>;
}>, Schemastery.ObjectT<{
    proxy: Schema<string, string>;
    noProxy: Schema<string[], string[]>;
}>>;
/** Validated plugin config. */
export interface Config {
    proxy?: string;
    noProxy?: string[];
}
/**
 * Browser-served settings must be both usable and safe to return in a
 * settings snapshot. Authenticated proxy URLs remain supported through the
 * standard proxy environment variables, which never cross the settings RPC.
 */
export declare function validateSettingsConfig(config: Config): void;
/**
 * Build a dispatcher whose connections go through `proxyUrl` (or directly
 * when `NO_PROXY`/`noProxyExtra` matches), install it as the undici global
 * dispatcher (v2 + legacy symbols), and return a `dispose` that restores the
 * previous dispatchers and closes the agent.
 * @throws when `proxyUrl` is not a valid proxy URL.
 */
export declare function createProxyDispatcher(proxyUrl: string, noProxyExtra?: readonly string[]): {
    dispatcher: Dispatcher;
    display: string;
    dispose: () => Promise<void>;
};
/**
 * Install the proxy dispatcher and expose its two fields through the Host
 * settings namespace. Saved Web settings reconfigure both fetch and shell
 * inheritance immediately; the model API endpoint remains outside this
 * namespace and cannot be rewritten by the card.
 */
export declare function apply(ctx: Context, config: Config): void;
