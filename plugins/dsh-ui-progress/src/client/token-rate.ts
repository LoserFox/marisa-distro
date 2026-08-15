/**
 * Pure live token-rate derivations for the session progress strip. Streaming
 * chunks carry no token counts — the provider only reports usage at step end —
 * so the live rate estimates tokens from the in-flight partial's characters
 * and divides by the decode wall time since the first visible token.
 *
 * The estimate is self-calibrating: once any settled assistant step reports
 * real output tokens (provider usage), the observed tokens-per-weighted-char
 * density of the latest such step is applied to the streaming partial, so the
 * live figure tracks the actual tokenizer density of the model in use instead
 * of a fixed char heuristic. Before the first calibrated step the CJK-aware
 * char density is the fallback. All pure functions: no React, no framework
 * state; the component supplies the partial, the settled nodes, and the
 * first-token observation time.
 */

import type { AssistantBlock, ConversationNode, PartialAssistant } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Wide CJK characters priced at one token each: CJK punctuation/forms,
 * kana, CJK ideographs (incl. extension A and compatibility), and hangul.
 * A single regex alternation so a per-character test is stateless.
 */
const CJK_CHAR = /[\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/

/**
 * Non-CJK density: every 4 chars ≈ 1 token (the core token-meter's fixed
 * CHARS_PER_TOKEN). The CJK half diverges on purpose — the meter's flat
 * density is a conservative context-budget heuristic, while a live
 * throughput readout should track real generation, where one CJK char is
 * typically one token. Calibration replaces this static weighting once real
 * provider usage is available.
 */
const NARROW_TOKEN_WEIGHT = 0.25

/** Read the provider-reported completion-token count from an assistant node. */
function usageOutputTokens(usage: unknown): number | null {
  if (typeof usage !== 'object' || usage === null) return null
  const value = (usage as { outputTokens?: unknown }).outputTokens
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Weighted char measure of assistant content: wide CJK chars count 1.0,
 * remaining chars 0.25 (the fixed non-CJK density). Fractional on purpose —
 * a live estimate must not jump on per-block ceilings, and calibration
 * multiplies this measure by a real tokens-per-weighted-char density.
 * @param blocks - assistant content blocks (text/reasoning bodies, tool-call name + arguments).
 * @returns weighted chars; 0 when nothing is readable.
 */
export function weightedChars(blocks: readonly AssistantBlock[]): number {
  let wide = 0
  let narrow = 0
  for (const block of blocks) {
    const text = block.kind === 'tool-call' ? block.name + block.argsRaw
      : block.kind === 'text' || block.kind === 'reasoning' ? block.text
      : ''
    for (const char of text) {
      if (CJK_CHAR.test(char)) wide += 1
      else narrow += 1
    }
  }
  return wide + narrow * NARROW_TOKEN_WEIGHT
}

/**
 * Weighted chars of the in-flight partial, or 0 when the model is not
 * emitting.
 * @param partial - the live streaming partial.
 * @returns the weighted-char measure {@link weightedChars} applies.
 */
export function weightedPartialChars(partial: PartialAssistant | null): number {
  return partial === null ? 0 : weightedChars(partial.blocks)
}

/**
 * Real tokens-per-weighted-char density of the latest settled assistant step
 * that carries both provider usage and readable content. The density is a
 * property of the model's tokenizer, so any recent completed step in the
 * window calibrates the live estimate (skipping steps without usage or with
 * no measurable content). Nodes are window-scoped and seq-ordered; scanning
 * backwards picks the newest usable sample.
 * @param nodes - settled nodes of the loaded window.
 * @returns tokens per weighted char, or null before any usable step settled.
 */
export function latestTokenDensity(nodes: readonly ConversationNode[]): number | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i]
    if (node === undefined || node.kind !== 'assistant') continue
    const output = usageOutputTokens(node.usage)
    if (output === null || output <= 0) continue
    const weighted = weightedChars(node.blocks)
    if (weighted <= 0) continue
    return output / weighted
  }
  return null
}

/**
 * Estimated tokens streamed so far: weighted chars of the partial scaled by
 * the calibrated density when one is available, else the bare weighted-char
 * heuristic (CJK 1 token, others 1/4). Units are consistent either way, so
 * the displayed rate converges smoothly onto the provider's real usage once
 * a step settles.
 * @param partial - the live streaming partial.
 * @param density - calibration from {@link latestTokenDensity}, or null.
 * @returns estimated streamed tokens; 0 while nothing is emitting.
 */
export function streamedTokenEstimate(partial: PartialAssistant | null, density: number | null): number {
  const weighted = weightedPartialChars(partial)
  if (weighted <= 0) return 0
  return density === null ? weighted : weighted * density
}

/**
 * Live tokens per second over the decode window (first visible token → now).
 * Mirrors the core's settled reading — output tokens over decode wall time —
 * so the running figure is directly comparable to the post-turn value shown
 * by the conversation StatsLine.
 * @param tokens - estimated streamed tokens ({@link streamedTokenEstimate}).
 * @param firstTokenAt - epoch ms when the first visible token was observed.
 * @param now - epoch ms clock reading.
 * @returns tokens/sec, or null while the window is empty or not yet open.
 */
export function liveTokenRate(tokens: number, firstTokenAt: number, now: number): number | null {
  const decodeMs = now - firstTokenAt
  if (tokens <= 0 || decodeMs <= 0) return null
  return tokens / (decodeMs / 1_000)
}

/**
 * Compact rate figure: whole tokens from ten up, one decimal below (same
 * shape as the core's formatTokensPerSecond, which the settled footer uses).
 * @param tps - tokens per second (negatives clamp to zero).
 * @returns display number without unit.
 */
export function formatTokenRate(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}
