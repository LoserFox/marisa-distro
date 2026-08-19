/**
 * P2 — candidate synthesis + deterministic refinement (v2-design §2 stages ④⑤).
 *
 * Each EvidenceSpan that survived intent layering becomes a TaskCandidate.
 * The LLM synthesizes the title/description/acceptance criteria from the
 * span's requests (schema-constrained JSON); the deterministic refiner then
 * validates evidence, strips unsupported claims, lints the title, and marks
 * inferred AC as proposed. Rule-only fallback produces a plain candidate when
 * no LLM is available (downgrade path).
 * @module @fakechris/dsh-track/sync/candidate
 */
import { getLlm, llmJson } from "./llm.js";
/** Candidate synthesis system prompt (Linear Method criteria + evidence discipline). */
const CANDIDATE_SYSTEM = `You turn a slice of an AI coding session into ONE task candidate.

Rules:
- Title: short, scan-friendly, states the task directly. Never "Hello"/greeting-only. 动词开头, ≤ 80 chars.
- Title MUST be self-sufficient: carry the work's object — the repo, component, file, package, or issue/PR number the task acts on. "更新 issue 514" alone is NOT self-sufficient (which issue? which repo?); prefer "更新 dsh-external/issues 的 issue 514 表述并补验证评论". If the object is missing, pull it from the evidence requests.
- Description fields: goal (what must be achieved), deliverable (independently verifiable output), scope, non-goals, constraints.
- Acceptance criteria: testable items. Mark source: explicit_user (user stated it), inferred (you derived it), test_derived (a test exists as verifier). Unconfirmed inferred AC are authority=proposed.
- evidenceRefs: the user request lines you used (verbatim).
- confidence: 0-1 how sure you are this is a real task.
- kind: investigation | bug | implementation | refactor | docs | ops | decision | question | follow_up | non_task.

Output ONLY a JSON object:
{"kind": "...", "title": "...", "goal": "...", "deliverable": "...", "scope": ["..."], "nonGoals": ["..."], "constraints": ["..."], "acceptanceCriteria": [{"text": "...", "source": "explicit_user|inferred|test_derived", "authority": "proposed|confirmed", "required": true}], "confidence": 0.0, "reason": "one sentence"}`;
/** Deterministic refiner (v2-design §2 stage ⑤): validate + strip unsupported fields. */
export function refineCandidate(candidate) {
    const c = {
        ...candidate,
        title: candidate.title.trim().slice(0, 80),
        acceptanceCriteria: candidate.acceptanceCriteria
            .filter((ac) => ac.text && ac.text.trim().length > 0)
            .map((ac) => ({
            ...ac,
            text: ac.text.trim().slice(0, 300),
            // Inferred AC default to proposed unless marked confirmed by the user.
            authority: ac.source === 'explicit_user' && ac.authority === 'confirmed' ? 'confirmed' : 'proposed',
        })),
        // Title lint: greeting-only / no-object titles are non_task.
        ...(isGenericTitle(candidate.title) ? { kind: 'non_task', confidence: Math.min(candidate.confidence, 0.2) } : {}),
    };
    // Title self-sufficiency (P1): a title without a work object ("更新 issue 514",
    // "分析一下", "调研") is not self-sufficient. When the candidate is
    // rule-derived (no LLM), try to backfill the object from the evidence
    // requests; if none is found, drop confidence so the title is de-ranked
    // instead of surfacing as a confident task.
    if (c.kind !== 'non_task' && !titleHasObject(c.title)) {
        const backfilled = backfillObjectFromRequests(c.title, c.requests);
        if (backfilled) {
            c.title = backfilled.slice(0, 80);
        }
        else {
            c.confidence = Math.min(c.confidence, 0.25);
        }
    }
    return c;
}
/**
 * Does the title carry a work object — a repo/component/file/package name or
 * an issue/PR number? Conservative: anything with an explicit object wins.
 * Bare verb phrases ("调研一下", "更新 issue 514", "分析看看") fail, so the
 * rule layer de-ranks them instead of surfacing as confident tasks.
 */
export function titleHasObject(title) {
    const t = title.trim();
    if (!t)
        return false;
    // issue/PR number, kebab scope, dotted package, repo@ref
    if (/[A-Za-z0-9]+-\d+/.test(t))
        return true;
    if (/[a-z][a-z0-9]*[-/][a-z0-9-]+/.test(t))
        return true;
    if (/[a-z][a-z0-9]*\.[a-z]{2,}/.test(t))
        return true;
    // English tech/object tokens (≥3 letters) — "update OAuth callback"
    if (/[a-z]{3,}/i.test(t))
        return true;
    // CJK-only titles: strip a leading verb + filler; the remainder is the
    // object phrase. "调研一下" → "" (fail); "调研任务管理产品" → "任务管理产品"
    // (pass, ≥3 chars); "更新 issue 514" already passed via the number branch.
    const stripped = t
        .replace(/^(调研|研究|分析|实现|修复|安装|确认|调查|解释|验证|更新|解决|整理|同步|设计|完善|优化|支持|测试|排查|解析|恢复|提交|补充|梳理|归纳|提炼|构建|接入|迁移|发布|回顾|检查|审查|评估|对比|归总|跟进|记录|起草|协调|整合|清理|拆除|替换|简化|重构)/, '')
        .replace(/^(一下|一遍|了|些|点|个|看看|下)/, '');
    return stripped.length >= 3;
}
/** Pull a work-object phrase from the evidence requests to backfill a title. */
export function backfillObjectFromRequests(title, requests) {
    const full = requests.join('\n');
    // Prefer explicit issue/PR numbers or repo scopes mentioned in evidence.
    // Accepts "issue 514", "issues/514", "#514" separators.
    const issue = full.match(/(?:issue|issues?|#)\s*[/#]?\s*([A-Za-z0-9]+-\d+|\d+)/i);
    if (issue) {
        const num = issue[1];
        return /[A-Za-z]/.test(num) ? `更新 ${num} 相关任务（${title}）` : `更新 issue ${num}（${title}）`;
    }
    // Repo scopes: org/repo, but exclude URL host paths like github.com/...
    const repo = full.match(/(?:github\.com\/|gitlab\.com\/)?([a-z0-9][-a-z0-9]*\/[a-z0-9][-a-z0-9]*)/i);
    if (repo) {
        const name = repo[1];
        // Skip when the "repo" is actually a URL host path (e.g. com/dsh-external).
        if (name.split('/')[0].length >= 3 && !name.startsWith('www.')) {
            return `${title}（对象：${name}）`;
        }
    }
    return null;
}
/** Greeting / no-object / placeholder titles are not tasks (defect #1 fix). */
export function isGenericTitle(title) {
    const t = title.trim().toLowerCase();
    if (!t)
        return true;
    if (/^(hi|hello|你好|嗯|ok|好的|谢谢|thanks|bye|测试|test)$/i.test(t))
        return true;
    // Pure pronoun / filler without an action or object.
    if (/^(这个|那个|它|他|她|我们|你们|我|你)$/.test(t))
        return true;
    return false;
}
/** Rule-only fallback candidate from a span (no LLM). */
export function candidateFromSpan(span) {
    const title = span.leadRequest.split('\n')[0]?.slice(0, 80) || '(untitled)';
    return refineCandidate({
        id: `cand_${span.sessionId}_${span.seqStart}`,
        sessionId: span.sessionId,
        span: { seqStart: span.seqStart, seqEnd: span.seqEnd },
        kind: 'investigation',
        authority: 'system_inferred',
        title,
        scope: [],
        nonGoals: [],
        constraints: [],
        acceptanceCriteria: [],
        evidenceRefs: span.requests.map((_, i) => `span.request[${i}]`),
        confidence: 0.3,
        decidedBy: 'rule',
        requests: span.requests,
    });
}
/** LLM synthesis for one span. Returns undefined on failure (downgrade to rule). */
export async function synthesizeCandidate(ctx, opts) {
    const llm = getLlm(ctx);
    if (!llm)
        return undefined;
    const context = opts.workspaceContext
        ? `Workspace context:\n${opts.workspaceContext.slice(0, 1500)}\n\n`
        : '';
    const motivation = opts.motivationContext
        ? `Captured work context for this session (user intent behind the work):\n${opts.motivationContext.slice(0, 1500)}\n\n`
        : '';
    const requests = opts.span.requests.map((r, i) => `${i + 1}. ${r.slice(0, 400)}`).join('\n');
    const json = await llmJson(llm, {
        provider: opts.provider,
        model: opts.model,
        system: CANDIDATE_SYSTEM,
        prompt: `${context}${motivation}Session evidence span (${opts.span.seqStart}..${opts.span.seqEnd}):\n${requests}\n\nSynthesize ONE task candidate.`,
        requiredKeys: ['kind', 'title'],
        maxTokens: 2000,
        temperature: 0.2,
        purpose: 'session-title',
        label: 'synthesize',
    });
    if (!json)
        return undefined;
    const kind = json.kind;
    if (typeof kind !== 'string' || !['investigation', 'bug', 'implementation', 'refactor', 'docs', 'ops', 'decision', 'question', 'follow_up', 'non_task'].includes(kind)) {
        return undefined;
    }
    const title = typeof json.title === 'string' ? json.title : opts.span.leadRequest.slice(0, 80);
    const asStringArray = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    const acs = Array.isArray(json.acceptanceCriteria)
        ? json.acceptanceCriteria
            .filter((a) => typeof a === 'object' && a !== null && typeof a.text === 'string')
            .map((a) => ({
            text: a.text,
            source: (['explicit_user', 'inferred', 'test_derived'].includes(a.source) ? a.source : 'inferred'),
            authority: a.authority === 'confirmed' ? 'confirmed' : 'proposed',
            required: a.required !== false,
        }))
        : [];
    const confidence = typeof json.confidence === 'number' ? Math.min(1, Math.max(0, json.confidence)) : 0.5;
    return refineCandidate({
        id: `cand_${opts.span.sessionId}_${opts.span.seqStart}`,
        sessionId: opts.span.sessionId,
        span: { seqStart: opts.span.seqStart, seqEnd: opts.span.seqEnd },
        kind: kind,
        authority: 'system_inferred',
        title,
        goal: typeof json.goal === 'string' ? json.goal : undefined,
        deliverable: typeof json.deliverable === 'string' ? json.deliverable : undefined,
        scope: asStringArray(json.scope),
        nonGoals: asStringArray(json.nonGoals),
        constraints: asStringArray(json.constraints),
        acceptanceCriteria: acs,
        evidenceRefs: opts.span.requests.map((_, i) => `span.request[${i}]`),
        confidence,
        decidedBy: 'model',
        requests: opts.span.requests,
    });
}
/**
 * Project a TaskCandidate to the v1 IssueCandidate shape (v2-design §2 stage ⑦).
 *
 * The projection is lossy by design: it flattens the v2 candidate (kind,
 * goal, deliverable, AC list) into the store's Linear-compatible Issue shape.
 * `suggestedState` derives from kind: non_task candidates should never reach
 * the store, and bug/implementation candidates lean in_progress while pure
 * investigations stay todo unless tool evidence exists.
 */
/** Candidate kind → genealogy semantic node kind (Layer 1). */
/** Candidate authority → Issue source authority (invariant #3). */
const ORIGIN_FROM_AUTHORITY = {
    explicit_user: 'user_explicit',
    agent_proposed: 'agent_proposed',
    system_inferred: 'system_inferred',
};
const SEMANTIC_KIND = {
    implementation: 'requirement',
    refactor: 'requirement',
    docs: 'task',
    ops: 'task',
    bug: 'problem',
    investigation: 'investigation',
    decision: 'decision',
    question: 'investigation',
    follow_up: 'task',
    non_task: 'task',
};
export function projectToIssueCandidate(c, teamKey = 'INV') {
    const goal = c.goal ? `目标：${c.goal}\n` : '';
    const deliverable = c.deliverable ? `交付物：${c.deliverable}\n` : '';
    const ac = c.acceptanceCriteria.length
        ? `验收：\n${c.acceptanceCriteria.map((a, i) => `${i + 1}. [${a.source}/${a.authority}] ${a.text}`).join('\n')}`
        : '';
    const description = [goal, deliverable, ac].filter(Boolean).join('\n') || c.requests.join('\n');
    const suggestedState = c.kind === 'non_task' ? 'canceled'
        : c.kind === 'bug' || c.kind === 'implementation' ? 'in_progress'
            : 'todo';
    return {
        key: c.id,
        sessionId: c.sessionId,
        title: c.title,
        description,
        priority: 2,
        suggestedState,
        labels: [c.kind, `confidence-${Math.round(c.confidence * 100)}`],
        linkedSessionIds: [c.sessionId],
        span: c.span,
        semanticKind: SEMANTIC_KIND[c.kind] ?? 'task',
        origin: ORIGIN_FROM_AUTHORITY[c.authority] ?? 'system_inferred',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        epicKey: `theme_${c.sessionId}`,
    };
}
