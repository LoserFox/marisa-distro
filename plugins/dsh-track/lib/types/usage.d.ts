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
import type { LlmUsageRecord } from './types.ts';
import { TrackStore } from './store.ts';
/** Store-backed recorder: append one ledger record, fire-and-forget. */
export declare function createUsageRecorder(store: TrackStore): (record: Omit<LlmUsageRecord, 'id'>) => void;
/** Per-million-token USD prices for one model route (billing reference). */
export interface ModelPrice {
    /** Cache-miss input price (USD per 1M tokens). */
    inputPerM: number;
    /** Output price (USD per 1M tokens). */
    outputPerM: number;
    /** Cache-hit input price (USD per 1M tokens). */
    cacheReadPerM?: number;
    /** Cache-write input price; defaults to `inputPerM` when omitted. */
    cacheWritePerM?: number;
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
export declare const PRICING: Record<string, Record<string, ModelPrice>>;
/** Resolve the price entry for a provider/model route, if known. */
export declare function priceFor(provider: string, model: string): ModelPrice | undefined;
/** Aggregated token/request counters across a set of ledger records. */
export interface UsageTotals {
    calls: number;
    ok: number;
    fail: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    /** Billed tokens = input + cacheRead + cacheWrite + output (disjoint buckets). */
    billedTokens: number;
    /** Total stream wall time in ms. */
    durationMs: number;
}
/** Fold one record into a totals accumulator. */
export declare function sumUsage(records: readonly LlmUsageRecord[]): UsageTotals;
/**
 * Estimate USD cost for a set of records on one model route.
 * Returns null when the route is not in the price table (tokens are still
 * counted — the caller surfaces the "unpriced" status).
 */
export declare function estimateCost(provider: string, model: string, totals: UsageTotals): number | null;
/** Per-route totals plus its estimated cost. */
export interface ModelUsageLine {
    provider: string;
    model: string;
    totals: UsageTotals;
    costUsd: number | null;
}
/** Full ledger summary: overall totals, per-route lines, per-label counts. */
export interface UsageSummary {
    /** Epoch-ms cutoff applied, when one was given. */
    since?: number;
    total: UsageTotals & {
        costUsd: number | null;
    };
    /** Whether any route fell outside the price table (cost understated). */
    unpriced: boolean;
    byModel: ModelUsageLine[];
    byLabel: Record<string, UsageTotals>;
}
/** Aggregate ledger records, optionally from `since` (epoch ms) onward. */
export declare function summarizeUsage(records: readonly LlmUsageRecord[], since?: number): UsageSummary;
/** Format a summary as the `track_usage` tool's text result. */
export declare function formatUsageReport(summary: UsageSummary): string;
