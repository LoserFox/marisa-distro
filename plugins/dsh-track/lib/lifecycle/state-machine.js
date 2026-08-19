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
/** Positive signals: support forward progress (weights 0..1, independent). */
export const SIGNAL_WEIGHT = {
    'user-confirm': 1.0, // explicit user "可以了/完成/验收通过" — strongest
    'todo-all-done': 0.6, // todo snapshot completed === total > 0
    'turn-completed': 0.3, // turn/end reason.kind === 'completed'
    'commit-observed': 0.55, // an implements/landed-in commit link landed in the window (P0: Output-first)
    activity: 0.2, // file write/edit / shell heartbeat
    'user-delete': -1.0, // user deleted the issue — absolute negation
    'turn-error': -0.4, // penalty
    'turn-blocked': -0.4, // penalty
    'tool-error': -0.2, // penalty
    timeout: -0.5, // penalty
};
/** Model proposals are strong for reversible targets, nothing for done. */
export function modelProposeWeight(target) {
    switch (target) {
        case 'in_progress': return 0.6;
        case 'canceled': return 0.5;
        case 'todo': return 0.3;
        case 'done': return 0.0; // never via model propose alone — needs the user
    }
}
/** Abandonment window: no progress for this long → propose canceled. */
export const ABANDON_MS = 14 * 24 * 60 * 60 * 1000;
/** Sweep window (ms): how old completion evidence may be before the periodic
 *  sweep stops proposing done for it (7 days — longer than the live 24h window,
 *  because sync-created issues are only ever re-evaluated by the sweep). */
export const SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Review threshold (ms): an in_progress issue with no progress for this long
 *  (and no completion evidence) gets a REVIEW proposal — the machine asks the
 *  user to judge done vs canceled instead of guessing. Shorter than the
 *  abandonment window because sync-created issues carry no lifecycle data at
 *  all; without this they would never surface for resolution. */
export const STALE_REVIEW_MS = 2 * 24 * 60 * 60 * 1000;
/** Evidence kept per issue (rolling window — newest last). */
export const MAX_EVIDENCE = 20;
/** Evidence window (ms): signals older than this don't support NEW proposals. */
export const EVIDENCE_WINDOW_MS = 24 * 60 * 60 * 1000;
export function evidenceWeight(signal, proposeTarget) {
    return signal === 'model-propose'
        ? modelProposeWeight(proposeTarget ?? 'in_progress')
        : SIGNAL_WEIGHT[signal];
}
/**
 * Composite confidence over a signal window: independent positive signals
 * combine as 1 − Π(1 − w_i); penalties subtract directly (clamped to [0,1]).
 */
export function compositeConfidence(signals) {
    let pos = 1;
    let neg = 0;
    for (const s of signals) {
        if (s.weight > 0)
            pos *= 1 - s.weight;
        else
            neg += -s.weight;
    }
    const conf = 1 - pos - neg;
    return Math.max(0, Math.min(1, conf));
}
/** Only consider signals inside the evidence window (freshness guard). */
export function freshSignals(signals, now, windowMs = EVIDENCE_WINDOW_MS) {
    return signals.filter((s) => now - s.at <= windowMs);
}
/** Human-readable summary of what the evidence says (for the confirm prompt). */
export function describeEvidence(signals) {
    const counts = new Map();
    for (const s of signals)
        counts.set(s.signal, (counts.get(s.signal) ?? 0) + 1);
    return [...counts.entries()]
        .map(([k, n]) => `${k}${n > 1 ? `×${n}` : ''}`)
        .join(', ');
}
/**
 * Evaluate one evidence window against an issue. Pure — the caller decides
 * whether to commit `state` (auto-commit only for todo → in_progress).
 */
export function nextInferred(current, signals, now = Date.now()) {
    const fresh = freshSignals(signals, now).slice(-MAX_EVIDENCE);
    const conf = compositeConfidence(fresh);
    const has = (s) => fresh.some((x) => x.signal === s);
    const base = { evidence: fresh, at: now };
    // 1. Abandonment → cancel proposal (needs user nod; never auto-cancel).
    if (current.state !== 'done' && current.state !== 'canceled') {
        const last = current.lastProgressAt ?? 0;
        if (last > 0 && now - last > ABANDON_MS) {
            const days = Math.max(1, Math.round((now - last) / 86_400_000));
            return {
                inferred: { ...base, state: 'canceled', confidence: Math.max(conf, 0.6), by: 'auto' },
                confirm: { to: 'canceled', reason: `no progress for ${days}d` },
            };
        }
    }
    // 2. Done proposal — only from an in-progress issue, and only gated.
    //    P0 (Output-first, 2026-08-18): process-completion evidence alone
    //    (todo-all-done + turn-completed) no longer proposes done — a
    //    commit-observed signal (an implements/landed-in link in the window)
    //    is required, or the user must explicitly confirm completion (which is
    //    the panel's "确认无代码产出" nod when no commit evidence exists).
    if (current.state === 'in_progress') {
        const userSaidDone = has('user-confirm') && conf >= 0.85;
        const evidenceSaysDone = has('todo-all-done') && has('turn-completed') && has('commit-observed') && conf >= 0.7;
        if (userSaidDone || evidenceSaysDone) {
            const noCommit = !has('commit-observed');
            const reason = userSaidDone && noCommit
                ? `${describeEvidence(fresh)} — 无 commit 证据（确认无代码产出？）`
                : describeEvidence(fresh);
            return {
                inferred: { ...base, state: 'done', confidence: conf, by: 'auto' },
                confirm: { to: 'done', reason },
            };
        }
    }
    // 3. todo → in_progress: auto-committable (reversible, mirrors reality).
    if (current.state === 'todo' && conf >= 0.5 && (has('activity') || has('todo-all-done') || has('turn-completed') || has('model-propose'))) {
        return { inferred: { ...base, state: 'in_progress', confidence: conf, by: 'auto' } };
    }
    // 4. No change — mirror the current state (confidence still updated).
    return { inferred: { ...base, state: current.state, confidence: conf, by: 'auto' } };
}
/**
 * Periodic-sweep evaluation (no live events needed): every in_progress issue
 * is re-checked on a timer, because the observer only records signals for the
 * ATTACHED session — sync-created issues would otherwise never surface a
 * done/canceled proposal. Same gates as `nextInferred` but with a wider
 * evidence window for stale-completion evidence. Returns a proposal only;
 * confirmation stays user-gated (the caller writes `pendingConfirm`).
 */
export function sweepProposal(current, now = Date.now()) {
    if (current.state !== 'in_progress')
        return undefined;
    const fresh = freshSignals(current.inferred?.evidence ?? [], now, SWEEP_WINDOW_MS);
    const conf = compositeConfidence(fresh);
    const has = (s) => fresh.some((x) => x.signal === s);
    // Completion evidence (stale allowed up to the sweep window) → propose done.
    // P0: requires commit-observed (Output-first) unless the user confirmed.
    const userSaidDone = has('user-confirm') && conf >= 0.85;
    const evidenceSaysDone = has('todo-all-done') && has('turn-completed') && has('commit-observed') && conf >= 0.7;
    if (userSaidDone || evidenceSaysDone) {
        return { to: 'done', reason: describeEvidence(fresh) };
    }
    // Progress anchor: live heartbeat when present, else the issue's own
    // timestamps — sync-created issues carry neither evidence nor lastProgressAt,
    // and without this proxy they would never be re-evaluated.
    const lastActivity = current.lastProgressAt ?? Date.parse(current.updatedAt);
    if (Number.isFinite(lastActivity) && lastActivity > 0) {
        const idleMs = now - lastActivity;
        // Abandonment: no progress for the full window → propose canceled.
        if (idleMs > ABANDON_MS) {
            const days = Math.max(1, Math.round(idleMs / 86_400_000));
            return { to: 'canceled', reason: `no progress for ${days}d` };
        }
        // Stale review: idle long enough that the machine cannot tell done from
        // abandoned → ask the user (the zombie-task case: sync-created issues).
        if (idleMs > STALE_REVIEW_MS) {
            const days = Math.max(1, Math.round(idleMs / 86_400_000));
            return { to: 'review', reason: `no progress for ${days}d — 确认完成还是取消？` };
        }
    }
    return undefined;
}
/** Should the caller auto-commit `state` for this transition? (safe/reversible only.) */
export function isAutoCommit(next, current) {
    return next.inferred.state === 'in_progress' && current.state === 'todo';
}
