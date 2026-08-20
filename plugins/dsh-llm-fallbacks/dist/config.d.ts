/**
 * The `fallbacks` settings namespace: config types + defaults (the
 * schemastery `Config` schema lives in `./schema.ts`, host-only — this
 * module must stay free of `@deepseek-ai/*` value imports so the client
 * bundle never reaches schemastery).
 *
 * Two-block config model (plan fallbacks-role-config-model): block 1
 * `rootChain` — the root agent's single fallback chain (empty = no
 * degradation) — plus block 2 declared role entities: `roles.list`
 * (id/persona/prompt?/permissions?/chain?/fallback) and
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
 * registers the schemastery schema (see `./schema.ts`) with
 * `installSettingsSection` under the `fallbacks` settings namespace.
 *
 * @module dsh-llm-fallbacks/config
 */
import type { SlotRowConfig } from './time-slots.ts';
/** How a cooled-down model comes back (spec §4). */
export type RevertPolicy = 'cooldown-expiry' | 'never';
/** A single role rule: match on provider/model patterns (spec §3). */
export interface FallbacksRoleRule {
    /**
     * Legacy persisted wire field (PR #62 feedback): rules are subagent-only,
     * so this constraint is IGNORED at match time — root requests never
     * match rules. Kept in the type/schema so pre-feedback `settings.yaml`
     * files that carry `origin` still parse, validate, and save unchanged.
     */
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
    /** Personality hint (人格提示) — free text, never validated. */
    persona: string;
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
    /**
     * Preset-role injection switch: `'bundled'` declares the 7 preset roles
     * (spec §9.2) as seed rows on apply; `'none'` disables declaration.
     * Optional on purpose — a required field would break library consumers
     * that construct `FallbacksConfig` literals with the existing 8 keys
     * (additive, non-breaking). The value domain is guarded by the schema
     * (`Config` in `src/schema.ts`), NOT by `validateFallbacksConfig`, and
     * every resolved config carries a value via the schema default.
     */
    presets?: 'bundled' | 'none';
    /**
     * Dispatch-time LLM role auto-match switch (plan fallbacks-role-automatch
     * Task 1): when `true` (default), a subagent-origin request with no
     * explicit/rules-resolved role may have the best-fit declared role picked
     * by the LLM; `false` reproduces today's behavior exactly. Optional on
     * purpose, mirroring `presets` — a required field would break library
     * consumers that construct `FallbacksConfig` literals with the existing
     * keys (additive, non-breaking). The value domain is guarded by the
     * schema (`z.boolean().default(true)` in `src/schema.ts`), and the
     * runtime reads it defensively as `config.roleAutoMatch ?? true` (safe
     * for direct constructors that omit it).
     */
    roleAutoMatch?: boolean;
    /**
     * Extra time-slot rows (plan fallbacks-timeslots Task 1, P5): the FIRST
     * matching row's chain becomes the effective root chain at request time;
     * `rootChain` (the all-day chain) is always the last row.
     * Optional on purpose, mirroring `presets` — additive, non-breaking for
     * library consumers. Malformed rows warn once and are skipped by the
     * resolver; the gateway rejects them on save (Task 3).
     */
    timeSlots?: SlotRowConfig[];
    /**
     * Config-level timezone for slot matching (default `Asia/Shanghai`,
     * UTC+8). Not per-slot.
     */
    tz?: string;
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
 * (declared ids + the built-in `'inherit'`), the `fallback` enum,
 * `rootChain`/role-chain selector legality, and the role model-config
 * requirement (a declared role with a missing/empty chain warns — a role
 * without a model config is meaningless, plan fallbacks-feedback-round
 * T2). `persona` is free text and is deliberately not
 * validated. Each violation emits one `llm-fallbacks: ...` warn and "does
 * not take effect" — the config stays usable (spec §4 / AC-4
 * warn-not-crash semantics).
 */
export declare function validateFallbacksConfig(config: FallbacksConfig, logger: FallbacksConfigLogger): void;
/**
 * Detect legacy (two-block-era) leftovers in a config SOURCE — the composed
 * object `source()` returns, or a raw settings document. Recognizes the
 * removed `chains` key, the removed `roles.default` field, the removed
 * role-entity fields `roles.list[].label` / `roles.list[].description`
 * (renamed to `persona`), and `roles.rules[].role` values that reference no
 * declared `roles.list` id and are not the built-in `'inherit'`. Returns
 * descriptive key/role names; the gateway attaches them as `get().legacyKeys`
 * so the client can show a migration banner (spec §9 — the source is read
 * directly because schemastery retains unknown keys, verified plan Task 1
 * Step 1).
 */
export declare function detectLegacyKeys(source: Record<string, unknown>): string[];
