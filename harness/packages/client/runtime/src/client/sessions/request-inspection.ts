// Request-centric inspection read model. Ordinary generation and compaction
// calls share one chronological projection; presentation-specific grouping
// remains in the trajectory consumer.

import type { ContentBlock, TokenUsage, ToolSchema } from '@deepseek-ai/dsh-llm/types'
import type { HistoryEntry } from '@deepseek-ai/dsh-client-connection/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  AssistantProvenanceView, AssistantRequestConfig,
} from './conversation.ts'
import { displayFailureMessage } from './failure-display.ts'

export type {
  AssistantProvenanceView, AssistantRequestConfig,
} from './conversation.ts'

/** Complete model-visible request header in force for an ordinary generation. */
export interface ConversationPromptSnapshot {
  /** Provider/model and sampling configuration from the effective request header. */
  config: AssistantRequestConfig
  /** Rendered system prompt text; empty when the request had no system prompt. */
  system: string
  /** Complete tool catalog sent with the request, including tools that were never called. */
  tools: readonly ToolSchema[]
}

/** System/tool change introduced while preparing one ordinary request. */
export interface RequestPromptChange {
  /** Sequence of the request/header event that introduced this state. */
  seq: number
  /** Unix epoch ms from the request/header event. */
  time: number
  /** How the model-visible prompt differs from the previous recorded state. */
  kind: 'initial' | 'system' | 'tools' | 'system-and-tools'
  /** State immediately before this change; absent for the initial header. */
  previous?: ConversationPromptSnapshot
}

/** Lifecycle fields shared by ordinary generation and compaction requests. */
interface RequestViewBase {
  /** Sequence that opened the operation represented by this request. */
  startSeq: number
  startedAt: number
  completedAt: number | null
  status: 'running' | 'complete' | 'error'
  error?: string
  provenance?: AssistantProvenanceView
  requestConfig?: AssistantRequestConfig
  usage?: unknown
  /** Assistant message or compaction summary sequence produced by this request. */
  resultSeq?: number
}

/** One ordinary assistant generation reconstructed from durable request events. */
interface AssistantRequestView extends RequestViewBase {
  purpose: 'assistant'
  turn: number
  /** Agent-loop step that issued this request. */
  step: number
  /** Effective ordinary request input, inherited until a later header changes it. */
  prompt?: ConversationPromptSnapshot
  /** Prompt change logged while preparing this request. */
  promptChange?: RequestPromptChange
  /** Retry ordinal scheduled after a failed ordinary request. */
  retry?: number
  maxRetries?: number
  retryDelayMs?: number
}

/** One compaction provider request, either turn-owned or standalone between turns. */
interface CompactionRequestView extends RequestViewBase {
  purpose: 'compaction'
  /** Owning turn, or `null` when manual compaction ran between turns. */
  turn: number | null
  /** Direct compaction requests do not consume an agent-loop step. */
  step: 0
  /** Compaction replacement message sequence, when one was committed. */
  replacementSeq?: number
  /** Safe compaction summary projection. */
  summary?: readonly ContentBlock[]
  /** Complete compaction provider output before the safe projection. */
  rawOutput?: readonly ContentBlock[]
}

/** One provider request reconstructed from durable request lifecycle events. */
export type RequestView = AssistantRequestView | CompactionRequestView

/** Immutable request-centric projection derived from one history window. */
export interface RequestInspectionSnapshot {
  requests: readonly RequestView[]
  callSchemas: ReadonlyMap<string, ToolSchema>
}

/**
 * Derive the request-centric read model from one immutable history window.
 * Compaction participates as a request purpose rather than a parallel
 * top-level collection. A leading resume/change header exposes its prompt but
 * cannot project a change until the preceding header enters the window.
 * @param entries - Contiguous raw session history.
 * @returns Requests and call-time schemas derived from that history.
 */
export function inspectRequests(
  entries: readonly HistoryEntry[],
): RequestInspectionSnapshot {
  const events = entries.map(entry => entry.event)
  return {
    requests: deriveRequests(events),
    callSchemas: deriveCallSchemas(events),
  }
}

interface RetryEvent {
  type: 'llm/retry'
  seq: number
  time: number
  data: {
    turn: number
    step: number
    retry: number
    maxRetries: number
    delayMs: number
    failure: { message: string }
  }
}

interface CompactionStartEvent {
  type: 'compact/start'
  seq: number
  time: number
  data: { turn: number | null }
}

interface CompactionSummaryEvent {
  type: 'compact/summary'
  seq: number
  time: number
  data: {
    summary: readonly ContentBlock[]
    rawOutput?: readonly ContentBlock[]
    provider: string
    model: string
    maxTokens?: number
    usage?: unknown
  }
}

interface CompactionEndEvent {
  type: 'compact/end'
  seq: number
  time: number
  data: { turn: number | null; error?: string }
}

function requestKey(turn: number, step: number): string {
  return `${turn}\u0000${step}`
}

function addTokenUsage(current: unknown, next: TokenUsage): TokenUsage {
  const previous = current as TokenUsage | undefined
  return {
    inputTokens: (previous?.inputTokens ?? 0) + next.inputTokens,
    outputTokens: (previous?.outputTokens ?? 0) + next.outputTokens,
    ...(previous?.cacheReadTokens === undefined && next.cacheReadTokens === undefined
      ? {}
      : {
        cacheReadTokens:
          (previous?.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
      }),
    ...(previous?.cacheWriteTokens === undefined && next.cacheWriteTokens === undefined
      ? {}
      : {
        cacheWriteTokens:
          (previous?.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
      }),
    ...(previous?.reasoningTokens === undefined && next.reasoningTokens === undefined
      ? {}
      : {
        reasoningTokens:
          (previous?.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0),
      }),
  }
}

function deriveCallSchemas(
  events: readonly SessionEvent[],
): ReadonlyMap<string, ToolSchema> {
  let active = new Map<string, ToolSchema>()
  const calls = new Map<string, ToolSchema>()
  const capture = (callId: string, name: string): void => {
    if (calls.has(callId)) return
    const schema = active.get(name)
    if (schema !== undefined) calls.set(callId, schema)
  }
  for (const event of events) {
    if (event.type === 'request/header') {
      const tools: unknown = event.data.header.tools
      active = new Map(
        Array.isArray(tools)
          ? (tools as ToolSchema[]).map(schema => [schema.name, schema])
          : [],
      )
      continue
    }
    if (event.type === 'tool/call') {
      capture(String(event.data.callId), event.data.name)
      continue
    }
    const type = event.type as string
    if (type === 'tool/code-dispatch-start' || type === 'tool/code-dispatch') {
      const data = event.data as unknown as { subCallId: string; name: string }
      capture(data.subCallId, data.name)
    }
  }
  return calls
}

function promptChange(
  previous: ConversationPromptSnapshot | undefined,
  prompt: ConversationPromptSnapshot,
  event: SessionEvent<'request/header'>,
): RequestPromptChange | undefined {
  if (previous === undefined && event.data.reason !== 'initial') return
  const systemChanged = previous !== undefined && previous.system !== prompt.system
  const toolsChanged = previous !== undefined
    && JSON.stringify(previous.tools) !== JSON.stringify(prompt.tools)
  if (previous !== undefined && !systemChanged && !toolsChanged) return
  return {
    seq: event.seq,
    time: event.time,
    kind: previous === undefined
      ? 'initial'
      : systemChanged && toolsChanged
        ? 'system-and-tools'
        : systemChanged
          ? 'system'
          : 'tools',
    ...(previous === undefined ? {} : { previous }),
  }
}

/** Project ordinary and compaction provider calls into one chronological request stream. */
function deriveRequests(events: readonly SessionEvent[]): readonly RequestView[] {
  const requests: RequestView[] = []
  const ordinaryByStep = new Map<string, number>()
  const lastStepByTurn = new Map<number, string>()
  let activeStep: string | undefined
  let activePrompt: ConversationPromptSnapshot | undefined
  let activeCompaction: number | undefined

  const updateAssistant = (
    index: number | undefined,
    change: Partial<Omit<AssistantRequestView, 'purpose'>>,
  ): void => {
    if (index === undefined) return
    const request = requests[index]
    if (request?.purpose === 'assistant') requests[index] = { ...request, ...change }
  }
  const updateCompaction = (
    index: number | undefined,
    change: Partial<Omit<CompactionRequestView, 'purpose'>>,
  ): void => {
    if (index === undefined) return
    const request = requests[index]
    if (request?.purpose === 'compaction') requests[index] = { ...request, ...change }
  }

  for (const sourceEvent of events) {
    if (sourceEvent.type === 'step/start') {
      const { turn, step } = sourceEvent.data
      const key = requestKey(turn, step)
      ordinaryByStep.set(key, requests.length)
      lastStepByTurn.set(turn, key)
      requests.push({
        purpose: 'assistant',
        startSeq: sourceEvent.seq,
        turn,
        step,
        startedAt: sourceEvent.time,
        completedAt: null,
        status: 'running',
        ...(activePrompt === undefined
          ? {}
          : { prompt: activePrompt, requestConfig: activePrompt.config }),
      })
      activeStep = key
      continue
    }
    if (sourceEvent.type === 'request/header') {
      const tools: unknown = sourceEvent.data.header.tools
      const prompt: ConversationPromptSnapshot = {
        config: sourceEvent.data.header.config,
        system: sourceEvent.data.header.system ?? '',
        tools: Array.isArray(tools) ? tools as ToolSchema[] : [],
      }
      const change = promptChange(activePrompt, prompt, sourceEvent)
      activePrompt = prompt
      updateAssistant(activeStep === undefined ? undefined : ordinaryByStep.get(activeStep), {
        prompt,
        requestConfig: prompt.config,
        ...(change === undefined ? {} : { promptChange: change }),
      })
      continue
    }
    if (
      sourceEvent.type === 'assistant/chunk'
      && sourceEvent.data.chunk.type === 'usage'
    ) {
      const index = ordinaryByStep.get(
        requestKey(sourceEvent.data.turn, sourceEvent.data.step),
      )
      const request = index === undefined ? undefined : requests[index]
      updateAssistant(index, {
        usage: addTokenUsage(
          request?.purpose === 'assistant' ? request.usage : undefined,
          sourceEvent.data.chunk.usage,
        ),
      })
      continue
    }
    if (sourceEvent.type === 'assistant/message') {
      const index = ordinaryByStep.get(
        requestKey(sourceEvent.data.turn, sourceEvent.data.step),
      )
      const request = index === undefined ? undefined : requests[index]
      updateAssistant(index, {
        completedAt: sourceEvent.time,
        status: 'complete',
        resultSeq: sourceEvent.seq,
        provenance: {
          provider: sourceEvent.data.message.source.provider,
          model: sourceEvent.data.message.source.model,
        },
        ...(request?.purpose === 'assistant'
          && request.usage !== undefined
          || sourceEvent.data.usage === undefined
          ? {}
          : { usage: sourceEvent.data.usage }),
      })
      continue
    }
    if (sourceEvent.type === 'step/end') {
      const key = requestKey(sourceEvent.data.turn, sourceEvent.data.step)
      const index = ordinaryByStep.get(key)
      const request = index === undefined ? undefined : requests[index]
      if (request?.purpose === 'assistant' && request.status === 'running') {
        updateAssistant(index, {
          completedAt: sourceEvent.time,
          status: 'error',
        })
      }
      if (activeStep === key) activeStep = undefined
      continue
    }
    if ((sourceEvent.type as string) === 'llm/retry') {
      const event = sourceEvent as unknown as RetryEvent
      updateAssistant(ordinaryByStep.get(requestKey(event.data.turn, event.data.step)), {
        status: 'error',
        error: displayFailureMessage(event.data.failure),
        retry: event.data.retry,
        maxRetries: event.data.maxRetries,
        retryDelayMs: event.data.delayMs,
      })
      continue
    }
    if (sourceEvent.type === 'turn/end') {
      const lastStep = lastStepByTurn.get(sourceEvent.data.turn)
      if (sourceEvent.data.reason.kind === 'error') {
        updateAssistant(lastStep === undefined ? undefined : ordinaryByStep.get(lastStep), {
          status: 'error',
          error: displayFailureMessage(sourceEvent.data.reason.error),
        })
      }
      lastStepByTurn.delete(sourceEvent.data.turn)
      continue
    }

    const type = sourceEvent.type as string
    if (type === 'session/end-seed' && activeCompaction !== undefined) {
      updateCompaction(activeCompaction, {
        completedAt: sourceEvent.time,
        status: 'error',
        error: 'Compaction was interrupted before completion.',
      })
      activeCompaction = undefined
      continue
    }
    if (type === 'compact/start') {
      const event = sourceEvent as unknown as CompactionStartEvent
      activeCompaction = requests.length
      requests.push({
        purpose: 'compaction',
        startSeq: event.seq,
        turn: event.data.turn,
        step: 0,
        startedAt: event.time,
        completedAt: null,
        status: 'running',
      })
      continue
    }
    if (type === 'compact/summary' && activeCompaction !== undefined) {
      const event = sourceEvent as unknown as CompactionSummaryEvent
      updateCompaction(activeCompaction, {
        resultSeq: event.seq,
        summary: event.data.summary,
        ...(event.data.rawOutput === undefined ? {} : { rawOutput: event.data.rawOutput }),
        provenance: {
          provider: event.data.provider,
          model: event.data.model,
        },
        requestConfig: {
          provider: event.data.provider,
          model: event.data.model,
          purpose: 'compaction',
          ...(event.data.maxTokens === undefined ? {} : { maxTokens: event.data.maxTokens }),
        },
        ...(event.data.usage === undefined ? {} : { usage: event.data.usage }),
      })
      continue
    }
    if (
      sourceEvent.type === 'user/message'
      && activeCompaction !== undefined
      && isCompactionSource(sourceEvent.data.source)
    ) {
      updateCompaction(activeCompaction, { replacementSeq: sourceEvent.seq })
      continue
    }
    if (type !== 'compact/end' || activeCompaction === undefined) continue
    const event = sourceEvent as unknown as CompactionEndEvent
    updateCompaction(activeCompaction, {
      completedAt: event.time,
      status: event.data.error === undefined ? 'complete' : 'error',
      ...(event.data.error === undefined ? {} : { error: event.data.error }),
    })
    activeCompaction = undefined
  }

  return requests.sort((left, right) => left.startSeq - right.startSeq)
}

function isCompactionSource(source: unknown): boolean {
  return typeof source === 'object'
    && source !== null
    && 'kind' in source
    && source.kind === 'plugin'
    && 'plugin' in source
    && source.plugin === 'compact'
}
