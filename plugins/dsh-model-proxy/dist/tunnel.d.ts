/**
 * Proxy parsing and CONNECT tunneling primitives for dsh-model-proxy.
 *
 * Pure Node stdlib (node:net / node:tls): SOCKS5 (with optional
 * username/password), HTTP(S) proxy CONNECT, direct connections, and
 * NO_PROXY matching. Shared by the plugin entry and its tests.
 * @module dsh-model-proxy/tunnel
 */
import net from 'node:net';
/** Parsed upstream proxy identity. */
export interface ProxyConfig {
    readonly scheme: 'socks5' | 'socks5h' | 'http' | 'https';
    readonly host: string;
    readonly port: number;
    readonly username?: string;
    readonly password?: string;
}
/** First set environment variable, or undefined. */
export declare function firstEnv(...names: string[]): string | undefined;
/**
 * Parse a proxy URL into {@link ProxyConfig}.
 * @param raw - `socks5://`, `socks5h://`, `http://` or `https://` URL,
 *   optionally with `user:pass@`; `direct` / `none` / `off` is rejected by
 *   the caller and means "no proxy".
 * @throws when the URL is malformed or uses an unsupported scheme.
 */
export declare function parseProxy(raw: string): ProxyConfig;
/** Human-readable proxy identity without credentials. */
export declare function displayProxy(proxy: ProxyConfig): string;
/** Default direct-connect exemptions applied by the plugin entry. */
export declare const DEFAULT_NO_PROXY: readonly string[];
/**
 * Whether `host:port` must connect directly, per the `NO_PROXY` environment
 * variable or the configured extra list.
 * @param extra - additional entries (host, `.suffix`, or `host:port`).
 */
export declare function inNoProxy(host: string, port: number, extra?: readonly string[]): boolean;
/**
 * Establish a connection to `host:port`: directly when {@link inNoProxy}
 * matches, otherwise through the configured proxy.
 */
export declare function connectSocket(proxy: ProxyConfig, host: string, port: number, noProxyExtra?: readonly string[]): Promise<net.Socket>;
