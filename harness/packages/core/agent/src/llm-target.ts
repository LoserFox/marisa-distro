/**
 * Agent-scoped LLM target snapshot shared by interactive front doors.
 * @module @deepseek-ai/dsh-agent/llm-target
 */

import type { Context } from 'cordis'
import type { LlmCallConfig, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/** Complete provider/model route and optional reasoning effort selected for one live agent. */
export interface AgentLlmTarget {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: ReasoningEffortId
}

/** Mutable selection plus the target captured for the current step. */
export interface AgentLlmTargetRef {
  /** Target selected for the next step that enters prompt assembly. */
  current: AgentLlmTarget | undefined
  /** Target captured when the current step entered prompt assembly. */
  assembled: AgentLlmTarget | undefined
}

/**
 * Couple one mutable target to agent-scoped prompt assembly and request routing.
 * Prompt assembly snapshots the selected target before delegating, then applies
 * its route to prompt variables and its route/effort to request config so a
 * concurrent switch takes effect on a later step instead of splitting the two
 * surfaces. An absent selected effort clears any inherited effort so a model
 * switch can restore that target's provider/default behavior.
 *
 * @param agentCtx - The target agent's scoped context.
 * @param target - Mutable selection owned by the calling front door.
 * @returns Disposer for both scoped waterfall listeners.
 */
export function installAgentLlmTarget(agentCtx: Context, target: AgentLlmTargetRef): () => void {
  const disposeAssembly = agentCtx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const selected = target.current
    const assembled = await next()
    target.assembled = selected
    if (selected === undefined) { return assembled }
    return {
      ...assembled,
      variables: {
        ...assembled.variables,
        provider: selected.provider,
        model: selected.model,
      },
    }
  })
  const disposeRequest = agentCtx.on(
    'agent/request',
    async (_payload, next): Promise<LlmCallConfig> => {
      const resolved = await next()
      const selected = target.assembled
      if (selected === undefined) return resolved
      const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved
      return {
        ...withoutInheritedEffort,
        provider: selected.provider,
        model: selected.model,
        ...selected.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selected.reasoningEffort },
      }
    },
  )
  return () => {
    disposeAssembly()
    disposeRequest()
  }
}
