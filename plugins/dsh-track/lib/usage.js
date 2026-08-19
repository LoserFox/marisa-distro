/**
 * Track LLM usage ledger — store-backed recorder, aggregation, and cost
 * accounting for every LLM call the track engine makes (2026-08-11).
 *
 * The recorder hooks into the single LLM funnel in `sync/llm.ts`
 * (`setUsageRecorder`); aggregation and cost live here so the same functions
 * serve the `track_usage` tool and the `/api/track/usage` route.
 *
 * Cost accounting uses a small per-million-token USD price table. Pricing is
 * configuration-shaped on purpose: providers change rates, and the table is
 * one constant to edit (plus the README documents the source). Unknown
 * models report `costUsd: null` (tokens still counted) instead of guessing.
 * @module @fakechris/dsh-track/usage
 */
import { makeId } from "./store.js";
/** Store-backed recorder: append one ledger record, fire-and-forget. */
export function createUsageRecorder(store) {
    return (record) => {
        void store.appendUsage({ ...record, id: makeId('usage') })
            .catch((e) => console.error('[dsh-track] usage record failed:', e));
    };
}
/**
 * Price table, keyed provider → model.
 *
 * deepseek-official (verified 2026-08-01, DeepSeek API pricing page):
 * - deepseek-v4-flash: input $0.14 / 1M (cache hit $0.0028 = 1/50), output
 *   $0.28 / 1M. DeepSeek publishes no separate cache-write tier — cache-write
 *   prompts are billed at the cache-miss input rate.
 * - deepseek-v4-pro: input $0.435 / 1M (cache hit $0.003625), output $0.87 /
 *   1M (permanent 75% discount, effective 2026-05-24).
 * Peak-hour surcharge (~2×, 09:00–12:00 & 14:00–18:00 Beijing) was announced
 * but NOT activated as of 2026-08-01 — flat rates are used until it lands.
 */
export const PRICING = {
    'deepseek-official': {
        'deepseek-v4-flash': { inputPerM: 0.14, outputPerM: 0.28, cacheReadPerM: 0.0028 },
        'deepseek-v4-pro': { inputPerM: 0.435, outputPerM: 0.87, cacheReadPerM: 0.003625 },
    },
};
/** Resolve the price entry for a provider/model route, if known. */
export function priceFor(provider, model) {
    return PRICING[provider]?.[model];
}
/** Fold one record into a totals accumulator. */
export function sumUsage(records) {
    const t = {
        calls: 0, ok: 0, fail: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
        reasoningTokens: 0, billedTokens: 0, durationMs: 0,
    };
    for (const r of records) {
        t.calls += 1;
        if (r.ok)
            t.ok += 1;
        else
            t.fail += 1;
        t.inputTokens += r.inputTokens;
        t.outputTokens += r.outputTokens;
        t.cacheReadTokens += r.cacheReadTokens ?? 0;
        t.cacheWriteTokens += r.cacheWriteTokens ?? 0;
        t.reasoningTokens += r.reasoningTokens ?? 0;
        t.billedTokens += r.inputTokens + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0) + r.outputTokens;
        t.durationMs += r.durationMs;
    }
    return t;
}
/**
 * Estimate USD cost for a set of records on one model route.
 * Returns null when the route is not in the price table (tokens are still
 * counted — the caller surfaces the "unpriced" status).
 */
export function estimateCost(provider, model, totals) {
    const price = priceFor(provider, model);
    if (!price)
        return null;
    const cacheWritePerM = price.cacheWritePerM ?? price.inputPerM;
    return (totals.inputTokens * price.inputPerM
        + totals.cacheReadTokens * (price.cacheReadPerM ?? 0)
        + totals.cacheWriteTokens * cacheWritePerM
        + totals.outputTokens * price.outputPerM) / 1_000_000;
}
/** Aggregate ledger records, optionally from `since` (epoch ms) onward. */
export function summarizeUsage(records, since) {
    const scoped = since === undefined ? records : records.filter((r) => r.at >= since);
    const byModel = new Map();
    const byLabel = new Map();
    for (const r of scoped) {
        const key = `${r.provider}/${r.model}`;
        let line = byModel.get(key);
        if (!line) {
            line = { provider: r.provider, model: r.model, totals: sumUsage([]), costUsd: null };
            byModel.set(key, line);
        }
        // Fold by hand (sumUsage over a growing array is O(n²)).
        const t = line.totals;
        t.calls += 1;
        if (r.ok)
            t.ok += 1;
        else
            t.fail += 1;
        t.inputTokens += r.inputTokens;
        t.outputTokens += r.outputTokens;
        t.cacheReadTokens += r.cacheReadTokens ?? 0;
        t.cacheWriteTokens += r.cacheWriteTokens ?? 0;
        t.reasoningTokens += r.reasoningTokens ?? 0;
        t.billedTokens += r.inputTokens + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0) + r.outputTokens;
        t.durationMs += r.durationMs;
        const labelTotals = byLabel.get(r.label) ?? sumUsage([]);
        labelTotals.calls += 1;
        if (r.ok)
            labelTotals.ok += 1;
        else
            labelTotals.fail += 1;
        labelTotals.inputTokens += r.inputTokens;
        labelTotals.outputTokens += r.outputTokens;
        labelTotals.cacheReadTokens += r.cacheReadTokens ?? 0;
        labelTotals.cacheWriteTokens += r.cacheWriteTokens ?? 0;
        labelTotals.reasoningTokens += r.reasoningTokens ?? 0;
        labelTotals.billedTokens += r.inputTokens + (r.cacheReadTokens ?? 0) + (r.cacheWriteTokens ?? 0) + r.outputTokens;
        labelTotals.durationMs += r.durationMs;
        byLabel.set(r.label, labelTotals);
    }
    const total = sumUsage(scoped);
    let unpriced = false;
    const lines = [];
    let totalCost = 0;
    let priced = true;
    for (const line of byModel.values()) {
        line.costUsd = estimateCost(line.provider, line.model, line.totals);
        if (line.costUsd === null) {
            unpriced = true;
            priced = false;
        }
        else
            totalCost += line.costUsd;
        lines.push(line);
    }
    lines.sort((a, b) => b.totals.billedTokens - a.totals.billedTokens);
    return {
        since,
        total: { ...total, costUsd: total.calls === 0 ? 0 : (priced ? totalCost : null) },
        unpriced,
        byModel: lines,
        byLabel: Object.fromEntries([...byLabel.entries()].sort((a, b) => b[1].billedTokens - a[1].billedTokens)),
    };
}
/** Format a summary as the `track_usage` tool's text result. */
export function formatUsageReport(summary) {
    const t = summary.total;
    const cost = t.costUsd === null ? 'unpriced (add route to PRICING)' : `$${t.costUsd.toFixed(4)}`;
    const sinceLabel = summary.since ? ` since ${new Date(summary.since).toISOString()}` : ' (all time)';
    const lines = [
        `Track LLM usage${sinceLabel}`,
        `  calls: ${t.calls} (ok ${t.ok} / fail ${t.fail})`,
        `  tokens: input ${t.inputTokens}${t.cacheReadTokens ? ` (cache read ${t.cacheReadTokens})` : ''}${t.cacheWriteTokens ? ` (cache write ${t.cacheWriteTokens})` : ''} / output ${t.outputTokens} / billed ${t.billedTokens}`,
        `  wall time: ${(t.durationMs / 1000).toFixed(1)}s total, ${t.calls ? `${Math.round(t.durationMs / t.calls)}ms/call` : '-'}`,
        `  est. cost: ${cost}`,
    ];
    if (summary.byModel.length > 0) {
        lines.push('  by model:');
        for (const line of summary.byModel) {
            const lineCost = line.costUsd === null ? 'unpriced' : `$${line.costUsd.toFixed(4)}`;
            lines.push(`    ${line.provider}/${line.model}: ${line.totals.calls} calls, ${line.totals.billedTokens} billed tokens, ${lineCost}`);
        }
    }
    const labels = Object.entries(summary.byLabel);
    if (labels.length > 0) {
        lines.push(`  by label: ${labels.map(([l, u]) => `${l} ${u.calls}`).join(' / ')}`);
    }
    if (summary.unpriced) {
        lines.push('  note: some routes are outside the price table — add them to PRICING in src/usage.ts for full cost.');
    }
    return lines.join('\n');
}
