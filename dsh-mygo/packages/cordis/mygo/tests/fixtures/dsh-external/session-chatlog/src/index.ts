/**
 * Model-facing session chat-log read tools for dsh.
 *
 * Reads the chat transcript of ANY persisted DSH session — including sessions
 * of other agents/processes sharing the same `~/.dsh/sessions` store — through
 * the `ctx.sessionPersistence` service (`inspect` is non-mutating, so reading
 * a foreign session never repairs or alters it).
 *
 * Tools:
 * - `session_list` — enumerate persisted sessions (id, cwd, createdAt, revision)
 * - `session_read_chat` — extract the user/steering/assistant transcript of one
 *   session, oldest first, with optional tail limit and optional reasoning text
 *
 * @module @dsh-external/session-chatlog
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { loadSessionSnapshot, readSessionTranscript } from './operations.js'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'session-chatlog'

/** Capability services required by the model-facing consumer. */
export const inject = ['tools', 'systemPrompt', 'sessionPersistence']

/** Default maximum number of transcript messages returned by one call. */
export const DEFAULT_MAX_MESSAGES = 200

/** Default: omit reasoning text from transcripts (transcript = chat, not thought). */
export const DEFAULT_INCLUDE_REASONING = false

/** Deployment-owned bounds for transcript reads. */
export interface Config {
  /** Maximum messages returned by one `session_read_chat` call. Defaults to 200. */
  maxMessages?: number
  /** Include reasoning blocks in `session_read_chat` output. Defaults to false. */
  includeReasoning?: boolean
}

/** Schemastery config for Loader defaults and generated configuration docs. */
export const Config: z<Config> = z.object({
  maxMessages: z.number().step(1).min(1).max(10_000).default(DEFAULT_MAX_MESSAGES),
  includeReasoning: z.boolean().default(DEFAULT_INCLUDE_REASONING),
})

interface ResolvedConfig {
  readonly maxMessages: number
  readonly includeReasoning: boolean
}

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

const PROMPT_TEXT =
  'Use session_list to enumerate persisted sessions, then session_read_chat to read the '
  + 'chat transcript of any session — including sessions of other agents. Transcripts are '
  + 'chronological (user/steering/assistant); pass a tail limit to read the most recent messages.'

/** Register the session chat-log tools and their shared model guidance. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)

  ctx.systemPrompt.section({
    name: 'tool:session-chatlog',
    order: 114,
    text: PROMPT_TEXT,
  })

  ctx.tools.register(defineTool({
    name: 'session_list',
    description: 'List all persisted DSH sessions on this machine (id, cwd, createdAt, preview of the first user message), including sessions of other agents.',
    parameters: {},
    output: TEXT_OUTPUT,
    execute: async () => JSON.stringify(await loadSessionSnapshot(ctx), null, 2),
  }))

  ctx.tools.register(defineTool({
    name: 'session_read_chat',
    description: 'Read the chat transcript of any persisted DSH session (including other agents\' sessions). Returns user/steering/assistant messages with text, oldest first.',
    parameters: {
      id: { type: 'string', required: true, description: 'Session id, e.g. session-8e822f27-8614-4f5a-b9cc-e2326897e76d' },
      limit: { type: 'number', description: 'Optional: return only the most recent N messages (default: all, capped by maxMessages)' },
      includeReasoning: { type: 'boolean', description: 'Optional: include reasoning blocks after each assistant message' },
    },
    output: TEXT_OUTPUT,
    execute: async (args) => {
      const id = typeof args.id === 'string' ? args.id : ''
      const limit = typeof args.limit === 'number' && Number.isSafeInteger(args.limit) && args.limit > 0
        ? Math.min(args.limit, resolved.maxMessages)
        : resolved.maxMessages
      const includeReasoning = typeof args.includeReasoning === 'boolean'
        ? args.includeReasoning
        : resolved.includeReasoning
      const { meta, events } = await readSessionTranscript(ctx, id)
      return JSON.stringify({
        sessionId: meta.id,
        cwd: meta.cwd ?? null,
        createdAt: meta.createdAt,
        messages: renderTranscript(events, limit, includeReasoning),
      }, null, 2)
    },
  }))
}

/** Resolve config defaults into plain values used by the tool bodies. */
function resolveConfig(config: Config): ResolvedConfig {
  return {
    maxMessages: config.maxMessages ?? DEFAULT_MAX_MESSAGES,
    includeReasoning: config.includeReasoning ?? DEFAULT_INCLUDE_REASONING,
  }
}

/** Chat-transcript event types, in chronological order of the log. */
const CHAT_TYPES = new Set(['user/message', 'steering/message', 'assistant/message'])

/** Map a chat event type to a model-facing role label. */
function roleOf(type: string): string {
  switch (type) {
    case 'user/message': return 'user'
    case 'steering/message': return 'user(steering)'
    case 'assistant/message': return 'assistant'
    default: return type
  }
}

/**
 * Extract the chat-relevant content of a message event. User/steering events
 * carry `data.content[]`; assistant events carry `data.message.content[]`.
 * Text blocks form the transcript; reasoning blocks are returned separately.
 * @param event - the session event to project.
 * @returns the transcript text and optional reasoning text.
 */
function messageContent(event: SessionEvent): { text: string; reasoning: string | undefined } {
  const data = event.data as Record<string, unknown> | undefined
  let content: Array<Record<string, unknown>>
  if (Array.isArray(data?.content)) {
    content = data.content as Array<Record<string, unknown>>
  } else {
    const message = data?.message as Record<string, unknown> | undefined
    content = Array.isArray(message?.content)
      ? message.content as Array<Record<string, unknown>>
      : []
  }
  const text = content.filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string).join('\n')
  const reasoning = content.filter(b => b.type === 'reasoning' && typeof b.text === 'string')
    .map(b => b.text as string).join('\n')
  return { text, reasoning: reasoning.length > 0 ? reasoning : undefined }
}

/**
 * Project a session's events onto a model-facing transcript. Only chat events
 * survive; reasoning text is included per configuration.
 * @param events - the session's event log (any order; sorted here by seq).
 * @param limit - maximum number of messages to return (tail of the transcript).
 * @param includeReasoning - whether to attach reasoning blocks.
 * @returns the transcript messages, oldest first.
 */
function renderTranscript(
  events: readonly SessionEvent[],
  limit: number,
  includeReasoning: boolean,
): Array<Record<string, unknown>> {
  const messages = events
    .filter(event => CHAT_TYPES.has(event.type))
    .sort((a, b) => a.seq - b.seq)
    .map((event) => {
      const { text, reasoning } = messageContent(event)
      return {
        seq: event.seq,
        time: event.time,
        role: roleOf(event.type),
        text,
        ...includeReasoning && reasoning !== undefined ? { reasoning } : {},
      }
    })
  return messages.slice(-limit)
}
