/**
 * P2 — LLM facade over the harness `ctx.llm` service.
 *
 * All semantic judgement in the v2 pipeline (intent layering, segmentation
 * boundary decisions, candidate synthesis) funnels through this module. It
 * provides a single JSON-output call that:
 * - streams via `ctx.llm.stream(GenerateOptions)` and assembles text blocks
 *   through the harness BlockAssembler,
 * - requests JSON via a `system` instruction + structural validation,
 * - degrades gracefully when the llm service is unavailable or a call fails
 *   (returns `undefined` so callers fall back to rule-only behavior).
 *
 * Keyless-safe: `getLlm` returns undefined without the service; every caller
 * must handle the undefined path (v2-design §3.2 downgrade policy).
 *
 * Usage metering (2026-08-11): every streamed call is metered here, at the
 * single funnel point, so the ledger covers ANY future caller without extra
 * wiring. The BlockAssembler already captures the stream's `usage` chunk and
 * terminal `finish` reason (the global token-meter cannot see plugin-direct
 * `ctx.llm` calls — they never surface as session events). Records are
 * emitted through the injected recorder (see `setUsageRecorder`); metering is
 * fire-and-forget and must never affect the call's result.
 * @module @fakechris/dsh-track/sync/llm
 */

import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { LlmUsageRecord } from '../types.ts'

/** Minimal surface of the harness llm service we consume. */
export interface LlmLike {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

/** Recorder callback: one ledger record per real LLM request. */
export type UsageRecorder = (record: Omit<LlmUsageRecord, 'id'>) => void | Promise<void>

let usageRecorder: UsageRecorder | undefined

/** Inject the usage ledger writer (host wiring; store-backed in index.ts). */
export function setUsageRecorder(recorder: UsageRecorder | undefined): void {
  usageRecorder = recorder
}

/** Read the injected recorder (tests, tooling). */
export function getUsageRecorder(): UsageRecorder | undefined {
  return usageRecorder
}

/** Per-call metadata the caller attaches for the usage ledger. */
export interface CallMeta {
  /** Call site label recorded with the usage record (e.g. intent | synthesize). */
  label?: string
  /** 1-based retry attempt; each attempt is one real HTTP request. */
  attempt?: number
}

/**
 * Meter one finished stream call. Fire-and-forget: a recorder failure must
 * never propagate into (or delay) the sync pipeline — metering is
 * observability, not the critical path.
 */
function meter(
  fields: {
    ok: boolean
    finishKind: string
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    reasoningTokens?: number
  },
  meta: CallMeta,
  options: GenerateOptions,
  durationMs: number,
): void {
  if (!usageRecorder) return
  const record: Omit<LlmUsageRecord, 'id'> = {
    at: Date.now(),
    label: meta.label ?? 'llm',
    provider: options.provider,
    model: options.model,
    attempt: meta.attempt ?? 1,
    durationMs,
    ok: fields.ok,
    finishKind: fields.finishKind,
    inputTokens: fields.inputTokens ?? 0,
    outputTokens: fields.outputTokens ?? 0,
    cacheReadTokens: fields.cacheReadTokens,
    cacheWriteTokens: fields.cacheWriteTokens,
    reasoningTokens: fields.reasoningTokens,
  }
  void Promise.resolve(usageRecorder(record)).catch(() => { /* best-effort */ })
}

/** Resolve the llm service non-throwingly (same pattern as sessionQuery). */
export function getLlm(ctx: Context | undefined): LlmLike | undefined {
  if (!ctx) return undefined
  const reflect = (ctx as unknown as { reflect?: { get: (name: string, strict?: boolean) => unknown } }).reflect
  return reflect?.get('llm', false) as LlmLike | undefined
}

/** Build a user message from text (source: plugin). */
export function userMessage(text: string): Message {
  return {
    id: `p2-${Math.random().toString(36).slice(2, 10)}` as Message['id'],
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: '@fakechris/dsh-track' },
  }
}

/** System message from text. */
export function systemMessage(text: string): Message {
  return {
    id: `p2s-${Math.random().toString(36).slice(2, 10)}` as Message['id'],
    role: 'system',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: '@fakechris/dsh-track' },
  }
}

/**
 * Assemble a text-only completion from a stream.
 *
 * Meters the call through the injected recorder: one record per invocation
 * (success or failure), using the assembler's captured `usage` chunk and
 * terminal finish reason. `meta.label` distinguishes the call site; `attempt`
 * is the 1-based retry index (each attempt is a separate real request).
 */
export async function assembleText(
  llm: LlmLike,
  options: GenerateOptions,
  meta: CallMeta = {},
): Promise<string | undefined> {
  const start = Date.now()
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of llm.stream(options)) {
      assembler.push(chunk)
    }
    const blocks = assembler.blocks()
    const finish = assembler.finish
    if (blocks.some((b) => b.type === 'tool-call')) {
      meter({ ok: false, finishKind: finish.kind }, meta, options, Date.now() - start)
      return undefined
    }
    const text = blocks
      .filter((b): b is Extract<typeof blocks[number], { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
    const usage = assembler.usage
    meter(
      {
        ok: Boolean(text),
        finishKind: finish.kind,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens,
        cacheWriteTokens: usage?.cacheWriteTokens,
        reasoningTokens: usage?.reasoningTokens,
      },
      meta,
      options,
      Date.now() - start,
    )
    return text || undefined
  } catch {
    // Stream threw: no terminal finish chunk — report the failure as an
    // error-kind call so the ledger still counts the request.
    meter({ ok: false, finishKind: 'error' }, meta, options, Date.now() - start)
    return undefined
  }
}

/**
 * Request one JSON object from the model.
 *
 * The system prompt instructs "output ONLY a JSON object, no markdown fence";
 * we also strip a surrounding ```json fence if the model adds one. Structural
 * check: result is an object and every key in `requiredKeys` is present (extra
 * keys allowed). No schema library — keep the dependency surface zero.
 *
 * `label` is ledger metadata identifying the call site; every retry attempt
 * is metered separately (one record per real request).
 */
export async function llmJson(
  llm: LlmLike,
  opts: {
    provider: string
    model: string
    system: string
    prompt: string
    requiredKeys: string[]
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
    purpose?: string
    label?: string
  },
): Promise<Record<string, unknown> | undefined> {
  // Root-cause fix for truncated JSON (verified 2026-08-11): deepseek-v4-flash
  // is a reasoning model — reasoning tokens share the maxTokens budget with the
  // output, so a long JSON candidate gets cut by finish=length and fails parse.
  // JSON extraction is a pure formatting task: disable reasoning and give the
  // output 4000 tokens (7/8 valid vs 5/8 before). A bounded retry on top covers
  // residual provider flakiness (empty/partial responses) — not truncation.
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await assembleText(llm, {
      provider: opts.provider,
      model: opts.model,
      system: opts.system,
      messages: [userMessage(opts.prompt)],
      maxTokens: opts.maxTokens ?? 4000,
      temperature: opts.temperature ?? 0.2,
      reasoningEffort: 'off' as GenerateOptions['reasoningEffort'],
      signal: opts.signal,
      purpose: opts.purpose as GenerateOptions['purpose'],
    }, { label: opts.label, attempt: attempt + 1 })
    if (text) {
      let body = text.trim()
      const fence = body.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
      if (fence) body = fence[1]!.trim()
      try {
        const parsed = JSON.parse(body)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
        let allKeys = true
        for (const key of opts.requiredKeys) {
          if (!(key in parsed)) { allKeys = false; break }
        }
        if (allKeys) return parsed as Record<string, unknown>
      } catch {
        // fall through to retry
      }
    }
  }
  return undefined
}
