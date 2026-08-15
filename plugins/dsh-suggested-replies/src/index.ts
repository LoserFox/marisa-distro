/** Suggested replies host plugin with plugin-owned sidecar state. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { GenerationGate, type GenerationLease } from './generation-gate.ts'
import { registerSuggestedRepliesRpc } from './rpc.ts'
import { SuggestedRepliesStateStore } from './state.ts'
import {
  generateSuggestedReplies,
  prepareSuggestionRequest,
  resolveConfiguredSuggestionRoute,
  type PreparedSuggestionRequest,
  type SuggestionGenerationConfig,
} from './suggestion-llm.ts'
import type { SuggestedRepliesSettings } from './types.ts'

export type * from './types.ts'
export type { SuggestedRepliesStateSnapshot } from './state.ts'

/** Cordis plugin identity. */
export const name = 'dsh-suggested-replies'
/** Required official extension points. */
export const inject = [
  'agents',
  'connection',
  'sessionPersistence',
  'sessions',
  'storageDomain',
  'systemPrompt',
  'tools',
  'workspaceRegistry',
]

/** User-settings namespace used by the master enable switch. */
export const SETTINGS_NAMESPACE = settingsNamespace('suggested-replies')

/** Configurable runtime parameters for candidate generation. */
export interface Config extends SuggestedRepliesSettings {
  /** Candidate messages requested from the auxiliary model. */
  suggestionCount: number
  /** Trailing visible conversation messages supplied to the auxiliary model. */
  contextMessageCount: number
  /** Maximum retained characters for one candidate message. */
  maxSuggestionChars: number
  /** Maximum response tokens requested from the auxiliary model. */
  maxTokens: number
  /** Maximum lifetime of one auxiliary Agent run. */
  timeoutMs: number
  /** Optional explicit provider for auxiliary calls; omitted means inherit the conversation route. */
  suggestionProvider?: string
  /** Optional explicit model for auxiliary calls; must be paired with `suggestionProvider`. */
  suggestionModel?: string
}

/** Config schema with deployment-adjustable generation limits. */
export const Config = z.object({
  enabled: z.boolean().default(true).description('Enable next-message suggestions after completed turns.'),
  suggestionCount: z.number().step(1).min(2).max(4).default(3).description('Number of candidate replies requested per completed turn.'),
  contextMessageCount: z.number().step(1).min(2).max(6).default(4).description('Trailing visible conversation messages supplied as context.'),
  maxSuggestionChars: z.number().step(1).min(32).max(300).default(160).description('Maximum characters retained for each candidate.'),
  maxTokens: z.number().step(1).min(64).max(1024).default(384).description('Maximum output tokens for the auxiliary model call.'),
  timeoutMs: z.number().step(1).min(1_000).max(30_000).default(15_000).description('Maximum milliseconds an auxiliary model call may run.'),
  suggestionProvider: z.string().required(false).description('Optional explicit provider for auxiliary calls; omitted means inherit the current Session route.'),
  suggestionModel: z.string().required(false).description('Optional explicit model for auxiliary calls; must be paired with suggestionProvider.'),
}) as unknown as z<Config>

/** Settings schema intentionally exposes only the user-facing master switch. */
const SettingsSchema = z.object({
  enabled: z.boolean().default(true).description('Enable suggested replies after completed turns.'),
}) as unknown as z<SuggestedRepliesSettings>

/** Install durable state, internal Agent generation, cancellation, and Web RPC. */
export async function apply(ctx: Context, config: Config): Promise<() => Promise<void>> {
  const store = await SuggestedRepliesStateStore.open(ctx)
  const gate = new GenerationGate()
  const internalSessions = new Set<string>()
  const generationTasks = new Set<Promise<void>>()
  let source: () => SuggestedRepliesSettings = () => ({ enabled: config.enabled })
  let enabledBeforeChange = source().enabled
  let disposing = false

  const cancelSession = (agent: Agent, flushSession: boolean): void => {
    const key = String(agent.id)
    gate.cancel(key)
    void store.clear(agent.session, flushSession).catch((error: unknown) => {
      if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear Session ${key}: ${String(error)}`)
    })
  }

  const clearAll = async (): Promise<void> => {
    gate.cancelAll()
    await store.clearAll()
  }

  installSettingsSection(ctx, SETTINGS_NAMESPACE, SettingsSchema, { enabled: config.enabled }, {
    setSource: next => { source = next },
    onChange: () => {
      const enabled = source().enabled
      if (!enabled && enabledBeforeChange) {
        void clearAll().catch((error: unknown) => {
          if (!disposing) ctx.logger.warn(`dsh-suggested-replies: failed to clear sidecar state: ${String(error)}`)
        })
      }
      enabledBeforeChange = enabled
    },
  })

  const suggestionRoute = resolveConfiguredSuggestionRoute(config.suggestionProvider, config.suggestionModel)
  const generationConfig: SuggestionGenerationConfig = {
    suggestionCount: config.suggestionCount,
    contextMessageCount: config.contextMessageCount,
    maxSuggestionChars: config.maxSuggestionChars,
    maxTokens: config.maxTokens,
    ...suggestionRoute === undefined ? {} : { suggestionRoute },
  }

  ctx.on('session/event', (session, event) => {
    if (internalSessions.has(String(session.id))) return
    if (event.type === 'turn/start') {
      const agent = ctx.agents.get(session.id)
      if (agent?.session === session) cancelSession(agent, true)
      return
    }
    if (event.type !== 'turn/end') return
    if (event.data.reason.kind !== 'completed' && event.data.reason.kind !== 'max-tokens') return
    if (!source().enabled) return
    const agent = ctx.agents.get(session.id)
    if (agent?.session !== session || agent.inbox.hasPending) return

    const lease = gate.start(String(agent.id), config.timeoutMs)
    const request = prepareSuggestionRequest(agent, generationConfig, event.data.turn, lease.signal)
    if (request === null) {
      gate.release(lease)
      return
    }
    const task = runGeneration(
      ctx,
      store,
      internalSessions,
      gate,
      lease,
      agent,
      event.data.turn,
      request,
      generationConfig,
    ).catch((error: unknown) => {
      if (!disposing) {
        ctx.logger.warn(`dsh-suggested-replies: generation for Session ${String(agent.id)} failed: ${String(error)}`)
      }
    })
    generationTasks.add(task)
    void task.finally(() => { generationTasks.delete(task) })
  })

  ctx.on('agent/inbox/inserted', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    cancelSession(agent, true)
  })

  ctx.on('agent/disposed', ({ agent }) => {
    if (internalSessions.has(String(agent.id))) return
    gate.cancel(String(agent.id))
  })

  registerSuggestedRepliesRpc(
    ctx,
    store,
    () => source().enabled,
    async enabled => {
      const settings = ctx.get('settings')
      if (settings === undefined) {
        source = () => ({ enabled })
        if (!enabled) await clearAll()
        enabledBeforeChange = enabled
        return
      }
      await settings.update(SETTINGS_NAMESPACE, { enabled })
      if (!enabled) await clearAll()
      enabledBeforeChange = source().enabled
    },
  )

  return async () => {
    disposing = true
    gate.cancelAll()
    await Promise.all(generationTasks)
    await store.clearAll()
    internalSessions.clear()
    gate.dispose()
    await store.close()
  }
}

/** Run one freshness-owned internal Agent and commit only its current result. */
async function runGeneration(
  ctx: Context,
  store: SuggestedRepliesStateStore,
  internalSessions: Set<string>,
  gate: GenerationGate,
  lease: GenerationLease,
  parent: Agent,
  turn: number,
  request: PreparedSuggestionRequest,
  config: SuggestionGenerationConfig,
): Promise<void> {
  const internalSessionId = SessionId(`session-${randomUUID()}`)
  internalSessions.add(String(internalSessionId))
  try {
    if (!await store.setGenerating(parent.session, turn, internalSessionId, () => gate.isCurrent(lease))) return
    const suggestions = await generateSuggestedReplies(ctx, parent, internalSessionId, request, config, lease.signal)
    if (suggestions === null) {
      await store.clearGeneration(parent.session, internalSessionId)
      return
    }
    await store.setReady(
      parent.session,
      turn,
      internalSessionId,
      suggestions,
      () => gate.isCurrent(lease),
    )
  } catch (error) {
    await store.clearGeneration(parent.session, internalSessionId).catch(() => undefined)
    if (!lease.signal.aborted) throw error
  } finally {
    internalSessions.delete(String(internalSessionId))
    gate.release(lease)
  }
}
