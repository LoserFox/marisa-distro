/**
 * Issue lifecycle state machine — evidence-driven, confirmation-gated.
 *
 * Part B of the lifecycle design (2026-08-12): `inferred` (machine proposal)
 * vs `state` (committed truth). Only safe/reversible transitions auto-commit
 * (todo → in_progress); `done` and `canceled` ALWAYS require a user nod
 * (panel confirm or a confirmed_by_user tool call) — the local runtime has no
 * CI/deploy signals strong enough to auto-claim done (external-research Q3).
 *
 * Pure functions over Issue + EvidenceRef[] — testable without a live harness.
 * @module @fakechris/dsh-track/lifecycle/state-machine
 */
import type { EvidenceRef, Issue, IssueState, LifecycleSignal } from '../types.ts';
/** Positive signals: support forward progress (weights 0..1, independent). */
export declare const SIGNAL_WEIGHT: Record<Exclude<LifecycleSignal, 'model-propose'>, number>;
/** Model proposals are strong for reversible targets, nothing for done. */
export declare function modelProposeWeight(target: IssueState): number;
/** Abandonment window: no progress for this long → propose canceled. */
export declare const ABANDON_MS: number;
/** Sweep window (ms): how old completion evidence may be before the periodic
 *  sweep stops proposing done for it (7 days — longer than the live 24h window,
 *  because sync-created issues are only ever re-evaluated by the sweep). */
export declare const SWEEP_WINDOW_MS: number;
/** Review threshold (ms): an in_progress issue with no progress for this long
 *  (and no completion evidence) gets a REVIEW proposal — the machine asks the
 *  user to judge done vs canceled instead of guessing. Shorter than the
 *  abandonment window because sync-created issues carry no lifecycle data at
 *  all; without this they would never surface for resolution. */
export declare const STALE_REVIEW_MS: number;
/** Evidence kept per issue (rolling window — newest last). */
export declare const MAX_EVIDENCE = 20;
/** Evidence window (ms): signals older than this don't support NEW proposals. */
export declare const EVIDENCE_WINDOW_MS: number;
export declare function evidenceWeight(signal: LifecycleSignal, proposeTarget?: IssueState): number;
/**
 * Composite confidence over a signal window: independent positive signals
 * combine as 1 − Π(1 − w_i); penalties subtract directly (clamped to [0,1]).
 */
export declare function compositeConfidence(signals: readonly EvidenceRef[]): number;
/** Only consider signals inside the evidence window (freshness guard). */
export declare function freshSignals(signals: readonly EvidenceRef[], now: number, windowMs?: number): EvidenceRef[];
/** Result of one state-machine evaluation. */
export interface NextInferred {
    /** Machine proposal — always safe to write to `issue.inferred`. */
    inferred: {
        state: IssueState;
        confidence: number;
        evidence: EvidenceRef[];
        at: number;
        by: 'auto' | 'model' | 'user';
    };
    /**
     * When set, the machine believes `state` should change but the target is
     * confirmation-gated (done / canceled) — surface it for a user nod; do NOT
     * write `state` until confirmed.
     */
    confirm?: {
        to: IssueState;
        reason: string;
    };
}
/** Human-readable summary of what the evidence says (for the confirm prompt). */
export declare function describeEvidence(signals: readonly EvidenceRef[]): string;
/**
 * Evaluate one evidence window against an issue. Pure — the caller decides
 * whether to commit `state` (auto-commit only for todo → in_progress).
 */
export declare function nextInferred(current: Issue, signals: readonly EvidenceRef[], now?: number): NextInferred;
/**
 * Periodic-sweep evaluation (no live events needed): every in_progress issue
 * is re-checked on a timer, because the observer only records signals for the
 * ATTACHED session — sync-created issues would otherwise never surface a
 * done/canceled proposal. Same gates as `nextInferred` but with a wider
 * evidence window for stale-completion evidence. Returns a proposal only;
 * confirmation stays user-gated (the caller writes `pendingConfirm`).
 */
export declare function sweepProposal(current: Issue, now?: number): {
    to: 'done' | 'canceled' | 'review';
    reason: string;
} | undefined;
/** Should the caller auto-commit `state` for this transition? (safe/reversible only.) */
export declare function isAutoCommit(next: NextInferred, current: Issue): boolean;
