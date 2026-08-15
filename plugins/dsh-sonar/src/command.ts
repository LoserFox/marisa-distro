import type { Context } from 'cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const VIEW_COMMAND_HINT = '描述项目应该如何被看见、记住、协作或改进'

/** Keep the user's language intact; the system prompt and model own interpretation. */
export function viewRequestMessage(rawInput: string): string | undefined {
  const request = rawInput.trim()
  return request.length > 0 ? `/view ${request}` : undefined
}

export function executeViewCommand(invocation: CommandInvocation): CommandResult {
  const text = viewRequestMessage(invocation.rawInput)
  if (text === undefined) {
    return { kind: 'error', text: `请描述你希望 View 如何工作。例如：/view ${VIEW_COMMAND_HINT}` }
  }
  invocation.agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
  return { kind: 'success', text: 'View 请求已交给 LLM 决策。任何写入仍需用户确认。' }
}

/** Register the natural-language entry point without interpreting it in the Host. */
export function registerViewCommand(ctx: Context): void {
  ctx.commands.register({
    name: 'view',
    description: '用自然语言读取或配置项目 View',
    input: { hint: `<${VIEW_COMMAND_HINT}>` },
    recordInput: false,
    handler: executeViewCommand,
  })
}
