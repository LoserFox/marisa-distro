/**
 * Alignment — reconcile clustered candidates against the existing Track store
 * so a re-run is idempotent: a session already linked to an issue updates that
 * issue instead of creating a duplicate.
 * @module @fakechris/dsh-track/sync/align
 */
import { normalizeTitle } from "./cluster.js";
/**
 * Reconcile candidates against existing issues.
 *
 * Match rules (v1):
 * - `linkedSessionIds` contains the candidate's session → update (session already tracked).
 * - Otherwise, normalized-title equality → update (same work, new session folded in).
 * - Otherwise, capture-content overlap → the candidate is the concrete form of a
 *   previously captured thought: if the capture was already promoted to an
 *   issue, update that issue (dedup); if it is still open, create the issue and
 *   promote the capture to it (mapping).
 * - Otherwise → create.
 *
 * State evolution: a candidate never downgrades an existing issue's state, and
 * never auto-moves an existing issue to `done` (that stays human-confirmed).
 */
export function alignCandidates(candidates, existingIssues, epicCandidates = [], existingEpicKeys = [], captures = []) {
    const bySession = new Map();
    const byTitle = new Map();
    const byId = new Map();
    for (const issue of existingIssues) {
        for (const sid of issue.linkedSessionIds ?? [])
            bySession.set(sid, issue);
        byTitle.set(normalizeTitle(issue.title), issue);
        byId.set(issue.id, issue);
    }
    // Promoted captures: capture → the issue it was promoted to (dedup path).
    // Open captures: capture → candidate mapping candidate (create+promote path).
    const promotedCaptureIssue = new Map(); // captureId → issueId
    const openCaptures = [];
    for (const capture of captures) {
        if (capture.promotedToIssueId)
            promotedCaptureIssue.set(capture.id, capture.promotedToIssueId);
        else if (capture.status === 'open')
            openCaptures.push(capture);
    }
    const existingEpicKeySet = new Set(existingEpicKeys);
    const actions = candidates.map((candidate) => {
        const sessionMatch = bySession.get(candidate.sessionId);
        if (sessionMatch) {
            const changes = diffChanges(sessionMatch, candidate);
            return {
                kind: 'update',
                candidate,
                existing: sessionMatch,
                changes: changes.length ? changes : ['no field changes'],
            };
        }
        const titleMatch = byTitle.get(normalizeTitle(candidate.title));
        if (titleMatch) {
            const changes = diffChanges(titleMatch, candidate);
            return {
                kind: 'update',
                candidate,
                existing: titleMatch,
                changes: changes.length ? changes : ['no field changes'],
            };
        }
        // Capture-based identity: the candidate is the concrete form of a thought.
        // 1. A promoted capture → update the issue it already became (dedup, so a
        //    later session about the same thought never spawns a duplicate issue).
        const promotedMatch = captures.find((c) => {
            const issueId = promotedCaptureIssue.get(c.id);
            return issueId !== undefined && byId.has(issueId) && captureOverlaps(c, candidate);
        });
        if (promotedMatch) {
            const existing = byId.get(promotedCaptureIssue.get(promotedMatch.id));
            const changes = diffChanges(existing, candidate);
            return {
                kind: 'update',
                candidate,
                existing,
                changes: changes.length ? changes : ['no field changes'],
            };
        }
        // 2. An open capture → create the issue and promote the capture to it.
        const openMatch = openCaptures.find((c) => captureOverlaps(c, candidate));
        if (openMatch) {
            // C3 (motivation grouping): captures sharing the same context are one
            // requirement's fragments ("调研 StreamChunk" + "新建分支 feat/…" +
            // "探索 dsh 仓库结构" all carry the same user intent). When one matches,
            // promote ALL open captures with the same context — no orphans left.
            const sameContext = openMatch.context
                ? openCaptures.filter((c) => c.context && c.context === openMatch.context)
                : [openMatch];
            const ids = Array.from(new Set(sameContext.map((c) => c.id)));
            return {
                kind: 'create',
                candidate,
                promoteCaptureId: ids[0],
                promoteCaptureIds: ids,
            };
        }
        return { kind: 'create', candidate };
    });
    const epicActions = epicCandidates.map((candidate) => {
        if (existingEpicKeySet.has(candidate.key)) {
            return { kind: 'skip', candidate, existingKey: candidate.key };
        }
        return { kind: 'create', candidate, existingKey: undefined };
    });
    return { actions, epicActions };
}
/** Compute the human-readable field changes between an existing issue and its candidate. */
function diffChanges(existing, candidate) {
    const changes = [];
    if (existing.state !== candidate.suggestedState) {
        changes.push(`state ${existing.state} → ${candidate.suggestedState}`);
    }
    const newSessions = candidate.linkedSessionIds.filter((id) => !(existing.linkedSessionIds ?? []).includes(id));
    if (newSessions.length)
        changes.push(`link sessions ${newSessions.join(', ')}`);
    if (existing.title !== candidate.title)
        changes.push(`title "${existing.title}" → "${candidate.title}"`);
    if (!existing.description && candidate.description)
        changes.push('add description');
    return changes;
}
/** Merge an update action's candidate into the existing issue shape. */
export function mergeIntoIssue(existing, candidate) {
    const linkedSessionIds = Array.from(new Set([...(existing.linkedSessionIds ?? []), ...candidate.linkedSessionIds]));
    // State evolution: promote, never demote, and never auto-done.
    const state = promoteState(existing.state, candidate.suggestedState);
    const citation = candidate.span !== undefined && candidate.sessionId !== undefined
        ? { sessionId: candidate.sessionId, seqStart: candidate.span.seqStart, seqEnd: candidate.span.seqEnd, kind: 'span' }
        : undefined;
    const citations = existing.citations ?? [];
    const mergedCitations = citation !== undefined && !citations.some((x) => x.sessionId === citation.sessionId && x.seqStart === citation.seqStart)
        ? [...citations, citation]
        : citations;
    return {
        ...existing,
        state,
        linkedSessionIds,
        description: existing.description || candidate.description,
        labels: Array.from(new Set([...existing.labels, ...candidate.labels])),
        semanticKind: existing.semanticKind ?? candidate.semanticKind,
        citations: mergedCitations,
        sourceSpan: existing.sourceSpan ?? mergedCitations[0],
        updatedAt: new Date().toISOString(),
    };
}
/** next = candidate suggestion; keep existing unless the candidate strictly advances. */
function promoteState(existing, suggested) {
    if (existing === suggested)
        return existing;
    const rank = { todo: 0, in_progress: 1, done: 2, canceled: 3 };
    return rank[suggested] > rank[existing] && suggested !== 'done' ? suggested : existing;
}
/**
 * Does a capture's content overlap a candidate's work line?
 *
 * Conservative token-overlap test (rule layer — the "rules hold invariants"
 * discipline): normalize both sides, then require a minimum number of shared
 * tokens AND a minimum containment ratio. CJK is tokenized as character
 * bigrams so multi-character shared substrings count; Latin tokens are words.
 * Low bar on purpose (open captures are sparse) but never matches on empty
 * content or single shared tokens.
 *
 * C2 (motivation context): the match surface is `content + context` — the
 * capture's own words AND the user intent behind it. A capture like "调研
 * StreamChunk 结构确认是否有 usage/token 字段" alone does not overlap a
 * candidate titled "LLM 用量计量模块", but its context ("做一个模块记录所有
 * llm 数据计算开销") does. If either surface matches, the capture maps.
 */
export function captureOverlaps(capture, candidate) {
    // Content surface: the capture's own words vs the candidate (conservative
    // threshold — low bar but never matches on 1 shared token).
    const contentHit = overlap(capture.content, `${candidate.title} ${candidate.description}`, 0.5);
    if (contentHit)
        return true;
    // Context surface (C2): the capture's context is the user's explicit
    // request — a strong signal, so a LOWER containment bar than the content
    // rule is right (context is verbatim user intent, not a paraphrase whose
    // density varies). But the bar must NOT be zero: long contexts share
    // generic bigrams (e.g. “分析”, “dsh”) with many unrelated candidates, and a
    // 2-token/no-containment match promoted one capture to 15+ issues in the
    // 2026-08-14 explorer sync dry-run. 0.25 containment keeps verbatim-request
    // matches while dropping incidental-token hits.
    if (capture.context) {
        return overlap(capture.context, `${candidate.title} ${candidate.description}`, 0.25);
    }
    return false;
}
/** Shared-token test: ≥2 shared tokens AND containment ≥ threshold. */
function overlap(a, b, containmentThreshold) {
    const ta = contentTokens(a);
    const tb = contentTokens(b);
    if (ta.size === 0 || tb.size === 0)
        return false;
    let shared = 0;
    for (const token of tb) {
        if (ta.has(token))
            shared += 1;
    }
    if (shared < 2)
        return false;
    const containment = shared / Math.min(ta.size, tb.size);
    return containment >= containmentThreshold;
}
/** Normalize content into comparable tokens: CJK bigrams + latin words. */
export function contentTokens(text) {
    const tokens = new Set();
    const lower = text.toLowerCase();
    for (const word of lower.match(/[a-z][a-z0-9-]*/g) ?? []) {
        if (word.length >= 2)
            tokens.add(word);
    }
    // CJK has no word boundaries — character bigrams from each contiguous run.
    for (const run of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
        for (let i = 0; i < run.length - 1; i++)
            tokens.add(run.slice(i, i + 2));
    }
    return tokens;
}
