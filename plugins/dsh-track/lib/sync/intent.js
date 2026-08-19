/**
 * P2 — request intent layering (v2-design §3.5).
 *
 * Decides whether a user request is a task candidate (requirement), an
 * execution step (directive), or a correction (interruption). This is a
 * SEMANTIC judgement — the LLM judges it few-shot using workspace context;
 * rules only provide cheap pre-filters (verb/object heuristics) that the LLM
 * can override. Without an LLM, the rule pre-filter is the downgrade path.
 *
 * The golden proto's intentLayering block is the few-shot exemplar set.
 * @module @fakechris/dsh-track/sync/intent
 */
import { getLlm, llmJson } from "./llm.js";
/** Cheap rule pre-filter: verbs/objects that lean directive. */
const DIRECTIVE_HINTS = [
    /\b(fork|restart|commit|push|pull|pr|clone|install|configure|build|submit)\b/i,
    /(帮我|你来|试一?下|继续|接着)/,
    /^cd\b|\bls\b|\bgit\b/,
];
/** Objects that lean environment-domain (only used as a pre-filter hint; the LLM decides). */
const ENV_OBJECT_HINTS = /\b(pnpm|npm|yarn|node|brew|pip|cargo|docker|git|redis|postgres|mysql)\b/i;
/** Rule-only pre-filter. Never authoritative alone — the LLM can override. */
export function ruleIntentPrefilter(text) {
    if (DIRECTIVE_HINTS.some((re) => re.test(text))) {
        return { intent: 'directive', confidence: 0.4, reason: 'directive verb/object hint' };
    }
    if (ENV_OBJECT_HINTS.test(text) && /(装|安装|配置|setup|install)/i.test(text)) {
        return { intent: 'directive', confidence: 0.5, reason: 'environment-domain install hint' };
    }
    return { intent: 'requirement', confidence: 0.3, reason: 'no directive hint' };
}
/** System prompt for the intent judge. */
const INTENT_SYSTEM = `You classify whether a user request in an AI coding session is a TASK (requirement), an EXECUTION STEP (directive), or a CORRECTION (interruption).

- requirement: a high-level goal, problem/bug report, or investigation with an independently verifiable deliverable. Creates an issue.
- directive: a detail-level execution instruction (fork/restart/commit/pr/push/install/configure/build/clone/submit/continue). A step toward some requirement — does NOT create an issue by itself.
- interruption: a correction or acceptance feedback ("you messed up", "no, that's wrong"). Only creates an issue if it articulates a new independently verifiable goal.

Key nuance — object-domain relevance: "install/configure X" is a directive if X is generic dev tooling (pnpm, git, node, brew), but a requirement if X is a product-domain object (a component of the product being built, e.g. installing/configuring the product's own TUI client). Judge from the workspace context: what is the product?

Important: an imperative sentence that asks for a DELIVERABLE (a plan, an investigation result, a fix, a report) is a requirement even if it uses a command verb ("请你计划一下" = "please plan this" → requirement, the plan is the deliverable). A pure operation ("commit these changes", "restart the server") is a directive.

Examples:
1. "帮我安装配置turtle-ui，dsh plugin --profile tui add" → requirement (turtle-ui is the product's TUI client — product-domain object; installing it advances the product goal)
2. "帮我安装配置 pnpm" → directive (pnpm is generic dev tooling)
3. "回到我们的目标，现在track和 epic/issue 捕捉差的很远，请你计划一下" → requirement (planning a product fix, deliverable = plan)
4. "你来试一次重启会完整执行（kill + 启动确认）" → directive (pure operation)
5. "你刚才是不是搞砸了？DSH Web 退出了" → interruption (acceptance feedback; issue only if a new goal is stated)
6. "帮我 commit 这些改动" → directive
7. "研究官方有没有 branch from this 这样的能力" → requirement (investigation with deliverable)
8. "死锁在 dsh SDK 内部？是固有问题吗" → requirement (bug report)

Output ONLY a JSON object:
{"intent": "requirement"|"directive"|"interruption", "objectDomainRelevant": true|false, "confidence": 0.0-1.0, "reason": "one short sentence"}`;
/** LLM intent verdict for one request. Returns undefined on failure (downgrade). */
export async function judgeIntent(ctx, opts) {
    const llm = getLlm(ctx);
    if (!llm)
        return undefined;
    const context = opts.workspaceContext
        ? `Workspace context (what the product is):\n${opts.workspaceContext.slice(0, 2000)}\n\n`
        : '';
    const json = await llmJson(llm, {
        provider: opts.provider,
        model: opts.model,
        system: INTENT_SYSTEM,
        prompt: `${context}User request:\n${opts.requestText.slice(0, 1500)}\n\nClassify it.`,
        requiredKeys: ['intent', 'confidence'],
        maxTokens: 2000,
        temperature: 0,
        purpose: 'session-title', // closed enum; the value is metadata only
        label: 'intent',
    });
    if (!json)
        return undefined;
    const intent = json.intent;
    if (intent !== 'requirement' && intent !== 'directive' && intent !== 'interruption')
        return undefined;
    const confidence = typeof json.confidence === 'number' ? Math.min(1, Math.max(0, json.confidence)) : 0.5;
    return {
        intent,
        objectDomainRelevant: typeof json.objectDomainRelevant === 'boolean' ? json.objectDomainRelevant : undefined,
        confidence,
        decidedBy: 'model',
        reason: typeof json.reason === 'string' ? json.reason : 'model judgement',
    };
}
/**
 * Segment-level intent judgement: classify a whole EvidenceSpan (its ordered
 * requests) rather than one isolated message. A single request may read as an
 * interruption ("回到我们的目标…") while the span as a whole is a clear
 * requirement ("…请你计划一下") — the span view resolves that. Returns
 * undefined on failure (downgrade to the rule pre-filter per span lead).
 */
export async function judgeSpanIntent(ctx, opts) {
    const llm = getLlm(ctx);
    if (!llm)
        return undefined;
    const context = opts.workspaceContext
        ? `Workspace context (what the product is):\n${opts.workspaceContext.slice(0, 2000)}\n\n`
        : '';
    const numbered = opts.requests.map((r, i) => `${i + 1}. ${r.slice(0, 400)}`).join('\n');
    const json = await llmJson(llm, {
        provider: opts.provider,
        model: opts.model,
        system: INTENT_SYSTEM,
        prompt: `${context}Conversation segment (multiple user requests, in order):\n${numbered}\n\nClassify the SEGMENT as a whole.`,
        requiredKeys: ['intent', 'confidence'],
        maxTokens: 2000,
        temperature: 0,
        purpose: 'session-title',
        label: 'span-intent',
    });
    if (!json)
        return undefined;
    const intent = json.intent;
    if (intent !== 'requirement' && intent !== 'directive' && intent !== 'interruption')
        return undefined;
    const confidence = typeof json.confidence === 'number' ? Math.min(1, Math.max(0, json.confidence)) : 0.5;
    return {
        intent,
        objectDomainRelevant: typeof json.objectDomainRelevant === 'boolean' ? json.objectDomainRelevant : undefined,
        confidence,
        decidedBy: 'model',
        reason: typeof json.reason === 'string' ? json.reason : 'model judgement',
    };
}
/** Resolve the final verdict: prefer the LLM, fall back to the rule pre-filter. */
export async function resolveIntent(ctx, opts) {
    const rule = ruleIntentPrefilter(opts.requestText);
    const model = await judgeIntent(ctx, opts);
    if (!model)
        return { ...rule, decidedBy: 'rule' };
    // LLM overrides the rule pre-filter.
    return model;
}
/**
 * Resolve the final span verdict: prefer the LLM segment judgement, fall back
 * to the rule pre-filter on the span lead. Unlike `resolveIntent` (single
 * request), this inspects ALL requests of the span, so a span that mixes a
 * directive with a real requirement keeps the requirement.
 */
export async function resolveSpanIntent(ctx, span, opts) {
    const rule = ruleIntentPrefilter(span.leadRequest);
    const model = await judgeSpanIntent(ctx, {
        provider: opts.provider,
        model: opts.model,
        requests: span.requests,
        workspaceContext: opts.workspaceContext,
    });
    if (!model)
        return { ...rule, decidedBy: 'rule' };
    return model;
}
