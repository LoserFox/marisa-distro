/**
 * P3 — cross-session identity resolution (v2-design §3.7).
 *
 * Determines when two candidates (or sessions) are the SAME work line, so a
 * sync pass does not create duplicates for fork copies or continuation
 * sessions. Pipeline:
 *  1. fork-copy detection by event-content overlap (deterministic, rules):
 *     two sessions whose normalized event-id sets overlap heavily are the
 *     same logical session (fork copies) → their spans never duplicate.
 *  2. candidate recall: candidates sharing a session or a normalized title
 *     become merge candidates (blocking).
 *  3. relation classification: LLM judges SAME_TASK / CONTINUATION_OF /
 *     RELATED_TO / NEW_TASK; without an LLM, rules decide conservatively.
 *  4. merge: SAME_TASK (high confidence, no conflicts) merges into one
 *     canonical candidate; everything else stays separate with a relation
 *     note (never over-merge — v2-design §3.7).
 * @module @fakechris/dsh-track/sync/identity
 */
import { getLlm, llmJson } from "./llm.js";
import { normalizeTitle } from "./cluster.js";
/** Jaccard overlap of two event-id sets. */
export function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
        return 1;
    let inter = 0;
    for (const x of a)
        if (b.has(x))
            inter += 1;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
/**
 * Detect fork-copy session pairs: two sessions whose event CONTENT overlaps
 * above a high threshold are the same logical session (fork copies). Uses the
 * session-independent content key (seq:payloadHash) — deterministic and
 * replay-stable, and identical across fork copies living under different
 * session ids.
 */
export function detectForkCopies(profiles, threshold = 0.9) {
    const pairs = [];
    for (let i = 0; i < profiles.length; i++) {
        for (let j = i + 1; j < profiles.length; j++) {
            const a = profiles[i];
            const b = profiles[j];
            if (a.sessionId === b.sessionId)
                continue;
            // Direct parent/child fork also counts.
            const isParent = a.parentSession === b.sessionId || b.parentSession === a.sessionId;
            const overlap = jaccard(a.contentKeys, b.contentKeys);
            if (overlap >= threshold || (isParent && overlap >= 0.5)) {
                pairs.push([a.sessionId, b.sessionId]);
            }
        }
    }
    return pairs;
}
/** Union-find over fork pairs → fork groups. */
export function forkGroups(pairs) {
    const parent = new Map();
    const find = (x) => {
        let root = x;
        while (parent.has(root) && parent.get(root) !== root)
            root = parent.get(root);
        // path compression
        let cur = x;
        while (parent.has(cur) && parent.get(cur) !== cur) {
            const next = parent.get(cur);
            parent.set(cur, root);
            cur = next;
        }
        return root;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb)
            parent.set(rb, ra);
    };
    for (const [a, b] of pairs)
        union(a, b);
    const groups = new Map();
    for (const [a, b] of pairs) {
        const root = find(a);
        groups.set(root, Array.from(new Set([...(groups.get(root) ?? []), a, b])));
    }
    return [...groups.values()];
}
/** Relation-judgement system prompt (few-shot). */
const RELATION_SYSTEM = `You decide whether two work-item candidates from AI coding sessions describe the SAME task.

- SAME_TASK: identical deliverable and outcome — same goal, same verifier, continuous lifecycle. e.g. "fix OAuth callback" in session A and "修复 OAuth 回调" in session B.
- CONTINUATION_OF: candidate B continues work started by A (explicit "继续之前那个", same goal, later session).
- RELATED_TO: same topic area but different deliverables (e.g. "调查 refresh-token" vs "修复 OAuth callback").
- DUPLICATES: the two sessions are literal copies (fork) of the same work.
- NEW_TASK: unrelated.

Decide conservatively: only SAME_TASK/CONTINUATION_OF/DUPLICATES merge; anything else stays separate. Never merge when deliverables, verifiers, or authority boundaries differ.

Output ONLY a JSON object:
{"relation": "SAME_TASK"|"CONTINUATION_OF"|"SUBTASK_OF"|"BLOCKS"|"RELATED_TO"|"DUPLICATES"|"NEW_TASK", "confidence": 0.0-1.0, "reason": "one short sentence"}`;
/** LLM relation classification between two candidates. */
export async function classifyRelation(ctx, opts) {
    const llm = getLlm(ctx);
    if (!llm)
        return undefined;
    const aText = `${opts.a.title}\n${opts.a.goal ?? ''}\n${opts.a.requests.slice(0, 3).join(' | ')}`;
    const bText = `${opts.b.title}\n${opts.b.goal ?? ''}\n${opts.b.requests.slice(0, 3).join(' | ')}`;
    const json = await llmJson(llm, {
        provider: opts.provider,
        model: opts.model,
        system: RELATION_SYSTEM,
        prompt: `Candidate A:\n${aText.slice(0, 1200)}\n\nCandidate B:\n${bText.slice(0, 1200)}\n\nClassify the relation.`,
        requiredKeys: ['relation', 'confidence'],
        maxTokens: 2000,
        temperature: 0,
        purpose: 'session-title',
        label: 'relation',
    });
    if (!json)
        return undefined;
    const relation = json.relation;
    if (typeof relation !== 'string' || !['SAME_TASK', 'CONTINUATION_OF', 'SUBTASK_OF', 'BLOCKS', 'RELATED_TO', 'DUPLICATES', 'NEW_TASK'].includes(relation)) {
        return undefined;
    }
    const confidence = typeof json.confidence === 'number' ? Math.min(1, Math.max(0, json.confidence)) : 0.5;
    return {
        relation: relation,
        confidence,
        reason: typeof json.reason === 'string' ? json.reason : 'model judgement',
        decidedBy: 'model',
    };
}
/** Rule-only relation fallback: normalized-title equality → SAME_TASK; else NEW_TASK. */
export function ruleRelation(a, b) {
    const ta = normalizeTitle(a.title);
    const tb = normalizeTitle(b.title);
    // Exact normalized-title equality is a strong signal — rule-path confidence
    // must clear the default merge threshold (0.7) for rule-only merges to work.
    if (ta && ta === tb)
        return { relation: 'SAME_TASK', confidence: 0.85, reason: 'normalized-title equality' };
    if (ta.includes(tb) || tb.includes(ta))
        return { relation: 'CONTINUATION_OF', confidence: 0.4, reason: 'title containment' };
    return { relation: 'NEW_TASK', confidence: 0.3, reason: 'no title overlap' };
}
/**
 * Merge a list of candidates into canonical groups.
 *
 * Pairwise classification (LLM, fallback rules); pairs classified
 * SAME_TASK / CONTINUATION_OF / DUPLICATES with confidence ≥ mergeThreshold
 * are merged; RELATED_TO stays separate with a relation note. A candidate is
 * the canonical of its group if it has the most evidence requests.
 */
export async function mergeCandidates(ctx, candidates, opts) {
    const threshold = opts.mergeThreshold ?? 0.7;
    const adjacentOnly = opts.adjacentOnly ?? false;
    // Sort by span position so "adjacent" is meaningful (same session: seqStart;
    // cross-session: stable by sessionId then seqStart).
    const sorted = [...candidates].sort((a, b) => a.sessionId === b.sessionId ? a.span.seqStart - b.span.seqStart : a.sessionId.localeCompare(b.sessionId));
    const merged = new Set();
    const groups = [];
    const relations = [];
    for (let i = 0; i < sorted.length; i++) {
        if (merged.has(i))
            continue;
        const group = [sorted[i]];
        merged.add(i);
        const candidatesToCheck = [];
        if (adjacentOnly) {
            // Only the immediate next un-merged candidate (same session) — O(n) calls.
            for (let j = i + 1; j < sorted.length; j++) {
                if (merged.has(j))
                    continue;
                if (sorted[j].sessionId !== sorted[i].sessionId)
                    break; // cross-session boundary
                candidatesToCheck.push(j);
                break;
            }
        }
        else {
            for (let j = i + 1; j < sorted.length; j++) {
                if (!merged.has(j))
                    candidatesToCheck.push(j);
            }
        }
        for (const j of candidatesToCheck) {
            const verdict = ctx
                ? await classifyRelation(ctx, { provider: opts.provider, model: opts.model, a: sorted[i], b: sorted[j] })
                : undefined;
            const relation = verdict ?? ruleRelation(sorted[i], sorted[j]);
            if (relation.confidence >= threshold && ['SAME_TASK', 'CONTINUATION_OF', 'DUPLICATES'].includes(relation.relation)) {
                group.push(sorted[j]);
                merged.add(j);
            }
            else {
                relations.push({ from: sorted[i].id, to: sorted[j].id, kind: relation.relation });
            }
        }
        const canonical = [...group].sort((a, b) => b.requests.length - a.requests.length)[0];
        groups.push({ canonical, members: group, relations: relations.filter((r) => r.from === canonical.id || r.to === canonical.id) });
    }
    const standalone = groups.filter((g) => g.members.length === 1);
    const multi = groups.filter((g) => g.members.length > 1);
    return { groups: multi, standalone: standalone.map((g) => g.canonical) };
}
