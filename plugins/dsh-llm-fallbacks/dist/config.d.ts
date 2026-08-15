/**
 * The `fallbacks` settings namespace: plugin config schema + defaults.
 *
 * Two-block config model (plan fallbacks-role-config-model): block 1
 * `rootChain` — the root agent's single fallback chain (empty = no
 * degradation) — plus block 2 declared role entities: `roles.list`
 * (id/label/description/prompt?/permissions?/chain?/fallback) and
 * `roles.rules` enum references into the declared ids (or the built-in
 * `'inherit'` role). The legacy `chains` / `roles.default` keys are gone
 * from the schema and type (zero residual, migration table excepted); the
 * runtime consumes the new shape directly and flags surviving legacy keys
 * at startup via `detectLegacyKeys` (see `src/index.ts` apply()).
 *
 * Spec §4 is authoritative for field names and default values — notably
 * `triggerCodes` defaults to dsh's stable failure codes `['AUTH', 'QUOTA',
 * 'RATE_LIMIT']` (there is no `QUOTA_EXCEEDED` code in dsh), and an
 * unconfigured install (`enabled: false`, empty `rootChain`, empty roles)
 * is a no-op pass-through exactly like an uninstalled plugin (AC-8).
 *
 * This module is pure logic: it must not import any `@deepseek-ai/*` package
 * (types included) — `FallbacksConfig` is the plugin's own type. Task 3
 * registers this schema with `installSettingsSection` under the `fallbacks`
 * settings namespace.
 *
 * @module dsh-llm-fallbacks/config
 */
import z from 'schemastery';
/** How a cooled-down model comes back (spec §4). */
export type RevertPolicy = 'cooldown-expiry' | 'never';
/** A single role rule: match on origin/provider/model patterns (spec §3). */
export interface FallbacksRoleRule {
    origin?: 'root' | 'subagent';
    provider?: string;
    model?: string;
    role: string;
}
/**
 * Chain-append strategy of a declared role entity: `inherit-root` (the
 * default) runs the role's own chain and then appends `rootChain`;
 * `none` uses only the role's own chain.
 */
export type FallbackStrategy = 'inherit-root' | 'none';
/**
 * A declared role entity (plan fallbacks-role-config-model Task 1).
 *
 * `prompt` / `permissions` are schema-reserved for the next iteration
 * (fallbacks-explicit-role-tool) — no consumer this round, and writing them
 * does NOT change this round's degradation behavior.
 */
export interface FallbacksRole {
    id: string;
    label: string;
    description: string;
    /** Reserved for next iteration — no consumer this round. */
    prompt?: string;
    /** Reserved for next iteration — no consumer this round. */
    permissions?: {
        allow?: string[];
        deny?: string[];
    };
    chain?: string[];
    fallback?: FallbackStrategy;
}
/** Role grouping for fallback chains: declared entities + enum references. */
export interface FallbacksRoles {
    list: FallbacksRole[];
    rules: FallbacksRoleRule[];
}
/**
 * The full `fallbacks` settings shape (two-block config model, verbatim
 * field names).
 */
export interface FallbacksConfig {
    enabled: boolean;
    triggerCodes: string[];
    rootChain: string[];
    roles: FallbacksRoles;
    cooldownMs: number;
    revertPolicy: RevertPolicy;
    maxSwitchesPerStep: number;
    alwaysModeRetryCap: number;
}
/**
 * Spec §4 defaults — `Config({})` must equal this (no-op install).
 * `enabled` defaults to `false` (readme-settings spec §1.2): the feature
 * switch is off until the user turns it on in the settings page; an
 * unconfigured install (`enabled: false`, empty rootChain, empty roles)
 * behaves exactly like an uninstalled plugin (AC-3 / no-op invariant).
 */
export declare const defaultFallbacksConfig: FallbacksConfig;
/**
 * Reserved role id: legal as a rule target (`roles.rules[].role`) and as
 * the no-rule-match fallback, but FORBIDDEN in `roles.list[].id`.
 */
export declare const INHERIT_ROLE_ID = "inherit";
/** Role id format (aligned with yet-another-subagent `isValidProfileId`). */
export declare const ROLE_ID_PATTERN: RegExp;
/**
 * Minimal logger surface {@link validateFallbacksConfig} warns through —
 * keeps this module free of `@deepseek-ai/*` imports (a cordis Logger is
 * structurally compatible).
 */
export interface FallbacksConfigLogger {
    warn(message: string): void;
}
/**
 * Validate a fallbacks config (pure, warn-only — never throws, never
 * mutates): role id format/uniqueness/reserved word, rule role references
 * (declared ids + the built-in `'inherit'`), the `fallback` enum, and
 * `rootChain`/role-chain selector legality. `label`/`description` are free
 * text and are deliberately not validated. Each violation emits one
 * `llm-fallbacks: ...` warn and "does not take effect" — the config stays
 * usable (spec §4 / AC-4 warn-not-crash semantics).
 */
export declare function validateFallbacksConfig(config: FallbacksConfig, logger: FallbacksConfigLogger): void;
/**
 * Detect legacy (two-block-era) leftovers in a config SOURCE — the composed
 * object `source()` returns, or a raw settings document. Recognizes the
 * removed `chains` key, the removed `roles.default` field, and
 * `roles.rules[].role` values that reference no declared `roles.list` id
 * and are not the built-in `'inherit'`. Returns descriptive key/role names;
 * the gateway attaches them as `get().legacyKeys` so the client can show a
 * migration banner (spec §9 — the source is read directly because
 * schemastery retains unknown keys, verified plan Task 1 Step 1).
 */
export declare function detectLegacyKeys(source: Record<string, unknown>): string[];
/**
 * Plugin Config schema (schemastery), mirroring {@link FallbacksConfig}.
 * Object fields are optional by default in schemastery; `.default()` fills
 * the spec defaults, `.required()` keeps mandatory fields. Unknown keys are
 * RETAINED by the composition (verified plan Task 1 Step 1) — that is what
 * lets `detectLegacyKeys` flag two-block-era leftovers (`chains` /
 * `roles.default`) on the composed object at startup (warn + gateway
 * `legacyKeys`, see `src/index.ts` apply()).
 */
export declare const Config: z<FallbacksConfig>;
