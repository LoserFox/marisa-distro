/**
 * Role-seeds domain module (plan fallbacks-role-seeds Task 1).
 *
 * A companion plugin declares `[{ id, persona }]` seeds; this module
 * validates each id AS DECLARED (`ROLE_ID_PATTERN`, reserved `inherit`),
 * merges the declarations into the role taxonomy with immutable-id /
 * override / revert semantics, and writes through a narrow IO seam
 * (`SeedsIo`). It is free of `@deepseek-ai/*` value imports (bundle
 * purity gate) — the client may type-only import from here.
 *
 * State model (spec §9.2) — two stores, strictly separated:
 * 1. operator config rows (persisted; a seeded role is a plain
 *    `roles.list` row `{ id, persona }`), and
 * 2. an in-memory per-apply seed registry (`Map<id, seedPersona>`),
 *    declare = replacement (the batch is the companion's full current set).
 * `seeded` / `personaOverridden` are DERIVED at read time, never stored —
 * a config round-trip cannot orphan an override (AC-3).
 *
 * Materialization (spec §9.2): append `{ id, persona }` (two keys only,
 * R4) / attach row untouched / at-default tracking / override preserved +
 * `'persona-source'` conflict / omitted id drops from the registry while
 * the row stays (R2). No delta → no settings write (idempotent, AC-1).
 * Compute → write → commit registry: a failed write throws and leaves the
 * registry unchanged (retry-safe).
 *
 * @module dsh-llm-fallbacks/seeds
 */
import { type FallbackStrategy, type FallbacksConfig, type FallbacksConfigLogger, type FallbacksRoles } from './config.ts';
/** A seed declaration from a companion plugin (spec §9.1). */
export interface SeedDeclaration {
    id: string;
    persona: string;
}
/**
 * Why one declared id was skipped (spec §9.1). Per-id skip + warn, never
 * coercion — valid siblings in the same batch still apply (AC-5).
 */
export type SeedSkipReason = 'invalid-id' | 'reserved-id' | 'duplicate-in-batch';
/**
 * A loud, non-destructive conflict (AC-2): never silently duplicated or
 * merged.
 */
export interface SeedConflict {
    id: string;
    /** Existing row persona differs from the seed default — operator override retained, never overwritten. */
    kind: 'persona-source';
}
/** Structured result of one `declare()` (spec §9.1) — the readable status channel. */
export interface SeedDeclareOutcome {
    applied: string[];
    skipped: Array<{
        id: string;
        reason: SeedSkipReason;
    }>;
    conflicts: SeedConflict[];
}
/** Effective role readback entry (spec §9.1) — `chain`/`fallback` passthrough (R4). */
export interface EffectiveRole {
    /** The config row id (raw declared form). */
    id: string;
    /** Effective row persona. */
    persona: string;
    /** Passthrough — never touched by seeds (R4). */
    chain?: string[];
    /** Passthrough — never touched by seeds (R4). */
    fallback?: FallbackStrategy;
    /** Id is in the live declaration set (trimmed row-id match). */
    seeded: boolean;
    /** `seeded` && row persona !== current seed default. */
    personaOverridden: boolean;
    /** Present iff seeded. */
    seedPersona?: string;
}
/** Service readback (b): effective taxonomy with seed annotations. */
export interface EffectiveRolesReadback {
    roles: EffectiveRole[];
}
export type SeedRevertFailReason = 'not-seeded' | 'row-absent' | 'settings-unavailable';
export interface SeedRevertOutcome {
    reverted: boolean;
    /** Restored current seed default — present iff reverted. */
    persona?: string;
    reason?: SeedRevertFailReason;
}
/** Gateway wire entry (card badge state, spec §9.4). */
export interface SeedsWireStatus {
    id: string;
    overridden: boolean;
}
/**
 * The narrow IO seam this module writes through — keeps `src/seeds.ts`
 * free of `@deepseek-ai/*` value imports (bundle purity gate).
 */
export interface SeedsIo {
    /** Fresh composed config read (the same source the gateway reads). */
    read(): FallbacksConfig;
    /** Persist a full `{ list, rules }` to the settings user layer. */
    writeRoles(roles: FallbacksRoles): Promise<void>;
}
/**
 * In-memory per-apply seed manager (spec §9.2): declare / readback /
 * revert over the operator config through a `SeedsIo` seam. Created in
 * `apply()` (per-apply, no module-level global) with a structured logger;
 * warn messages carry the `llm-fallbacks: seeds:` prefix (spec §9.7).
 */
export declare class FallbacksSeedManager {
    private readonly logger;
    private registry;
    constructor(logger: FallbacksConfigLogger);
    /**
     * Declare seeds with replacement semantics — the batch is the
     * companion's FULL current declaration set; ids omitted from the batch
     * drop out of the registry while their rows remain (R2).
     *
     * Per-id validation AS DECLARED (spec §9.3): non-string / pattern miss /
     * reserved `inherit` / duplicate-in-batch → skip + warn; valid siblings
     * still apply (AC-5). Materializes per spec §9.2, writes only when the
     * computed `{ list, rules }` differs from the current composed roles
     * (idempotent, AC-1), and commits the registry only after a successful
     * write (compute → write → commit; retry-safe).
     */
    declare(seeds: readonly SeedDeclaration[], io: SeedsIo): Promise<SeedDeclareOutcome>;
    /**
     * Readback (b) — sync, derived: every config row annotated with
     * `seeded` / `personaOverridden` / `seedPersona` (trimmed row-id
     * membership in the live declaration set; persona inequality). Nothing
     * override-shaped is stored, so a config round-trip cannot orphan state.
     */
    effectiveRoles(io: SeedsIo): EffectiveRolesReadback;
    /** Card badge state (spec §9.4): seeded rows, with the override flag. */
    wireStatus(io: SeedsIo): SeedsWireStatus[];
    /**
     * Revert one id to the CURRENT declared seed default (AC-3). Writes
     * persona only — the row is otherwise copied verbatim (R4). Ids absent
     * from the registry (`not-seeded`) or with a deleted row (`row-absent`)
     * return a non-reverted outcome without throwing; a failed settings
     * write propagates loudly (spec §9.1).
     */
    revert(id: string, io: SeedsIo): Promise<SeedRevertOutcome>;
    private warnSkip;
}
