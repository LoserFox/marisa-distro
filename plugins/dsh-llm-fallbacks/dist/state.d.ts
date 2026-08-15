/**
 * Per-agent fallback state machine (spec §5.1; plan Task 3).
 *
 * One `AgentFallbackState` per `agent.id`, held in a `FallbackStateStore`
 * created at plugin apply, removed on `agent/disposed`, defensively pruned on
 * `agent/status` idle, and cleared wholesale on plugin dispose (spec §6:
 * 无残留状态).
 *
 * **pendingSwitch lifecycle** (spec §5.1):
 * 1. **Produce** (decision point — request-error trigger-code or
 *    agent/request always-cap): `writePending` stores the decision and clears
 *    `appliedTurnStep`, so a *fresh* decision is always applicable at the
 *    current (turn, step) — required for chains (decision B→C must apply even
 *    though A→B was already applied at the same (turn, step)).
 * 2. **Apply** (`agent/request`): `applyPending` returns the pending switch
 *    when one exists and has not already been applied at the current
 *    (turn, step), records `appliedTurnStep`, and clears `pendingSwitch`
 *    (anti-replay guard).
 * 3. **Discard**: chain exhaustion / safety valve → the caller delegates
 *    (`next()`) and the pending state dies with the agent.
 *
 * **stepFailures** resets whenever (turn, step) advances (`syncStep`);
 * **cooldown** (`CooldownStore`) is a `provider/model → expiry epoch ms` map
 * with lazy expiry (`revertPolicy: 'never'` = `Infinity` TTL). The time-boxed
 * cooldown deliberately survives idle cleanup so `cooldown-expiry` revert
 * (US-4 / T4 integration) works across turns.
 *
 * @module dsh-llm-fallbacks/state
 */
import type { FallbackSwitchReason } from './events.ts';
import { CooldownStore, StepFailureSet } from './cooldown.ts';
/** Decision awaiting application at the next `agent/request` boundary (spec §5.1). */
export interface PendingSwitch {
    from: {
        provider: string;
        model: string;
    };
    to: {
        provider: string;
        model: string;
    };
    role: string;
    reason: FallbackSwitchReason;
}
/** The current (turn, step)'s failed-model set and switch budget (spec §5.1). */
export interface StepFailures {
    turn: number;
    step: number;
    /** `${provider}/${model}` keys failed in this step (double suppression with cooldown). */
    failed: StepFailureSet;
    /** Switches committed in this step; the caller judges it against `maxSwitchesPerStep`. */
    switchCount: number;
}
/** One agent's whole fallback runtime state (spec §5.1). */
export interface AgentFallbackState {
    /** Decision produced but not yet applied at an `agent/request` boundary. */
    pendingSwitch?: PendingSwitch;
    /** The (turn, step) the last pending switch was applied to — anti-replay. */
    appliedTurnStep?: {
        turn: number;
        step: number;
    };
    /** Current (turn, step)'s failure bookkeeping. */
    stepFailures: StepFailures;
    /** `provider/model → expiry epoch ms`; lazily expired on read. */
    cooldown: CooldownStore;
}
/**
 * The `Map<agent.id, AgentFallbackState>` store plus the state-machine
 * operations (spec §5.1).
 */
export declare class FallbackStateStore {
    private readonly states;
    /** Number of tracked agents. */
    get size(): number;
    has(agentId: string): boolean;
    /** Read without creating; `undefined` for unknown agents. */
    peek(agentId: string): AgentFallbackState | undefined;
    /** Read, creating an empty state on first sight. */
    get(agentId: string): AgentFallbackState;
    /** Remove one agent's state (`agent/disposed`). */
    delete(agentId: string): void;
    /** Remove every agent's state (plugin dispose — no residual state). */
    clear(): void;
    /** Reset step-scoped bookkeeping when (turn, step) advances (spec §5.1). */
    syncStep(state: AgentFallbackState, turn: number, step: number): void;
    /** Record the current model as failed in this step (spec §5.1). */
    recordFailure(state: AgentFallbackState, key: string): void;
    /** Bump the step's switch budget (spec §5.1). */
    recordSwitch(state: AgentFallbackState): void;
    /**
     * Produce a pending switch. A fresh decision always supersedes a previous
     * one and must be applicable at the current (turn, step), so the applied
     * marker is cleared here (see module doc — chains).
     */
    writePending(state: AgentFallbackState, pending: PendingSwitch): void;
    /**
     * Apply the pending switch at (turn, step) when one exists and has not
     * already been applied there; records the applied marker and clears the
     * pending switch (spec §5.1 lifecycle step 2).
     */
    applyPending(state: AgentFallbackState, turn: number, step: number): PendingSwitch | undefined;
    /**
     * Defensive `agent/status` idle cleanup: drop per-step state. The time-boxed
     * cooldown survives so `cooldown-expiry` revert works across turns (US-4).
     */
    clearStepState(state: AgentFallbackState): void;
    /** Suppress `key` until `untilEpochMs` (`Infinity` for `revertPolicy: 'never'`). */
    suppress(state: AgentFallbackState, key: string, untilEpochMs: number): void;
    /** Lazy cooldown read: expired entries are dropped on read (spec §5.1). */
    isSuppressed(state: AgentFallbackState, key: string, now?: number): boolean;
}
