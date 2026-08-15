/**
 * T1 (plan llm-fallbacks-settings-gateway) — host-side `fallbacks` config
 * gateway: the `/api/fallbacks/get` + `/api/fallbacks/set` +
 * `/api/fallbacks/reset` endpoints.
 *
 * Transport: the typertGateway `/api` interceptor is the single host-wide RPC
 * slot (a plugin must NOT `connection.rpc.intercept('/api')` again — it would
 * throw). The service declares a typertGateway binding (via the
 * `TypertRemoteService` base — kept ONLY for its `typertRemote` binding, which
 * dispatch's `validateBinding` requires on the live service) and the
 * endpoints are registered EXPLICITLY through
 * `ctx.typert.register(fallbacksTypertContribution())` (see `apply` in
 * `src/index.ts`) — NOT via `@Remote` SRC markers: SRC discovery reads
 * `remoteMethods()`, a module-private WeakMap in `@deepseek-ai/dsh-typert-protocol`,
 * so a locally-linked plugin whose peers resolve outside the host
 * installation never shares that table with the host typertGateway (zero
 * claimed endpoints, `/api/fallbacks/*` 404). The explicit
 * `TypertRegistry.register` path writes the invocation descriptors into
 * `ctx.typert.local`, which `claimsEndpoint` checks FIRST, so claim +
 * dispatch work regardless of module identity. The payload contract is
 * exactly one plain-object `args` field whose keys are the method parameter
 * names (`get()` → `{ args: {} }`; `set(patch)` → `{ args: { patch } }`;
 * `reset()` → `{ args: {} }`).
 *
 * Data: `get` reads the `FallbacksSettingsBridge` source — the same live
 * composed config the runtime reads (schema defaults → plugin-row base →
 * settings user layer). There is NO hard-gate resolver (unlike advisor's
 * `resolveAdvisorConfig`): the fallbacks decision path runs at
 * `agent/request` time in `src/index.ts`, so the gateway returns the raw
 * composed config — `enabled` is a plain config field, not a gate output.
 * `set` validates the patch against the `Config` schema first (unknown-key
 * rejection unchanged — the settings service itself is non-strict and would
 * merge the unknown key through), then writes the USER layer in-process via
 * `ctx.settings.update` (no exposed-namespace gate on the in-process write —
 * the wire-level `exposedNamespaces()` check only guards the apiproxy path),
 * and returns the new composed value. `reset` (fallbacks-specific third
 * method — advisor has only get/set) clears the user layer via
 * `ctx.settings.replace(ns, {})`: `set` is merge-only and cannot express
 * "reset to composition defaults" (sending default VALUES as a patch would
 * pin stale defaults into the user layer).
 *
 * The settings service is OPTIONAL (no settings service → the bridge source
 * stays the entry, `get` still works; `set`/`reset` fail with a clear
 * error — KD-G5 fallback). The gateway captures the service through a
 * conditional `ctx.inject(['settings'], ...)` child (the same activation
 * pattern as `installSettingsSection`), because `ctx.settings` is only
 * resolvable from a fiber that declares it.
 *
 * The returned config is normalized to the typertGateway JSON wire boundary:
 * only schema-declared keys cross the wire, and absent values are OMITTED,
 * never present-as-undefined (the gateway's result validation rejects
 * undefined values).
 *
 * @module dsh-llm-fallbacks/gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { FallbacksConfig } from './config';
/** The `fallbacks` settings namespace (registered when a settings service exists). */
export declare const FALLBACKS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/**
 * The live configuration source for the gateway (guide §7 — the same bridge
 * shape the runtime reads through). `source()` returns the live composed
 * config (schema defaults → plugin-row base → settings user layer). The
 * gateway reads it LIVE on every call, so no change notification is needed
 * (the bridge stays minimal: source + the settings write channel; the dead
 * `onChange` fan-out was removed in the QC fix wave — nothing subscribed).
 */
export interface FallbacksSettingsBridge {
    source(): FallbacksConfig;
}
/** Patch shape accepted by `fallbacks.set` — any subset of the config keys. */
export type FallbacksConfigPatch = Partial<FallbacksConfig>;
/**
 * The host-side `fallbacks` config gateway (`/api/fallbacks/get` +
 * `/api/fallbacks/set` + `/api/fallbacks/reset`). Registered as the cordis
 * service key `'fallbacks'` (namespace defaults to the service key). The
 * `TypertRemoteService` base is kept ONLY for its `typertRemote` binding —
 * the typertGateway's dispatch `validateBinding` requires the visible binding
 * on the live service (a pure instance property, no module-private state).
 * Endpoints are registered EXPLICITLY through
 * `ctx.typert.register(fallbacksTypertContribution())` (see `apply` in
 * `src/index.ts`) instead of `@Remote` SRC markers (see the module docblock
 * for why).
 */
export declare class FallbacksConfigGateway extends TypertRemoteService {
    private readonly bridge;
    /** The live settings service once the optional inject child activates. */
    private settings;
    /**
     * @param ctx - owning context (the plugin fiber's ctx inside `apply`).
     * @param bridge - the same `FallbacksSettingsBridge` the runtime reads, so
     *   get/set/reset always operate on the live composed config.
     */
    constructor(ctx: Context, bridge: FallbacksSettingsBridge);
    /**
     * Read the current composed config (schema defaults → entry base → settings
     * user layer). No hard-gate resolver (ADR-2): the raw composed config is
     * the wire value — `enabled` is a plain field, not a gate output.
     * @returns the wire-normalized composed config plus `legacyKeys` — legacy
     *   two-block-era fields (`chains` / `roles.default` / undeclared rule
     *   role refs) detected on the composed source (schemastery retains them,
     *   plan Task 1 Step 1), so the client can show a migration banner (spec
     *   §9, incremental field — old clients ignore it).
     */
    get(): {
        config: FallbacksConfig;
        legacyKeys: string[];
    };
    /**
     * Validate a config patch and write it to the settings USER layer (live —
     * the runtime re-reads the same bridge source; no restart needed).
     * @param patch - any subset of the config keys; unknown keys (top-level
     *   and nested under `roles`) are rejected before anything is written.
     * @returns the NEW composed config plus `legacyKeys` detected on the
     *   POST-WRITE composed source (W-1/F-1): `set` is a settings MERGE, so a
     *   legacy user layer (`chains` / `roles.default`) survives a new-shape
     *   save — the response must keep reporting it, or the client banner
     *   would clear against server truth. Same shape as `get`.
     * @throws when the patch fails `Config` validation, or when no settings
     *   service is composed (KD-G5: the write channel is unavailable).
     */
    set(patch: FallbacksConfigPatch): Promise<{
        config: FallbacksConfig;
        legacyKeys: string[];
    }>;
    /**
     * Clear the fallbacks settings USER layer so the composition defaults
     * reapply (`settings.replace(ns, {})` — the in-process removal path a
     * merge-only `set` cannot express).
     * @returns the new composed config plus `legacyKeys` on the post-write
     *   source — `replace` drops the user layer, but legacy keys carried by
     *   the entry base survive and are correctly re-reported (W-1/F-1).
     * @throws when no settings service is composed (KD-G5: the write channel
     *   is unavailable).
     */
    reset(): Promise<{
        config: FallbacksConfig;
        legacyKeys: string[];
    }>;
    /**
     * Read the live composed config and normalize it to the typertGateway JSON
     * wire boundary. Containment (guide §10): a malformed stored user layer
     * that the non-strict settings schema let through (e.g. an unknown key)
     * must never fail the RPC — only schema-declared keys cross the wire, and
     * absent values are omitted, never present-as-undefined (the result
     * validator rejects undefined values). The `roles` object is additionally
     * normalized to its declared `list`/`rules` fields: legacy nested keys
     * (e.g. `roles.default`) that schemastery retains on the composed source
     * never leak past the wire boundary (reviewer finding T1 Important #1 —
     * a consumer like Task 2's parseFallbacksConfig would misread them),
     * even though `legacyKeys` still reports them.
     */
    private readConfig;
    /**
     * The wire response of every read (get/set/reset — W-1/F-1): the
     * normalized config plus `legacyKeys` detected on the live composed
     * source. set/reset must report the POST-WRITE source: the settings
     * merge retains legacy user-layer keys, so a save cannot clear them —
     * the honest response keeps the migration banner until a get agrees.
     */
    private readResult;
}
/**
 * The explicit typert contribution for the `fallbacks` gateway endpoints —
 * registered via `ctx.typert.register(...)` (see `apply` in `src/index.ts`).
 * The descriptors mirror exactly what the former SRC discovery derived from
 * the `@Remote` markers (`src:<ns>#<endpoint>` identity shape, direct
 * receiver, JSON wire params with `src-json` codec), so the host
 * typertGateway claim + dispatch behavior is the same — the only difference
 * is the registration does not depend on the module-private `remoteMethods`
 * marker table, which a locally-linked plugin can never share with the host
 * installation (see the module docblock).
 */
export declare function fallbacksTypertContribution(): TypertContribution;
