/**
 * The model-facing a2a tool family (0.3 realtime chat): `a2a_peers` lists
 * the current roster, `a2a_message` sends to one peer or broadcasts to the
 * project, and `a2a_history` reviews earlier project messages. Replies are
 * delivered passively — the tools never wait or poll.
 * @module @dpskh/a2a/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { A2aMeshService } from './mesh.ts'
import { ASYNC_REPLY_GUIDANCE } from './mesh.ts'
import type { A2aAttachmentReference } from './attachments.ts'
import { materializeAttachments } from './attachments.ts'
import type { A2aMessageView } from './mesh.ts'

/** Render one tool result as plain text. */
function textRender(_args: object, value: { text: string }): ContentBlock[] {
  return [{ type: 'text', text: value.text }]
}

/** Format one message's attachments as model-visible lines. */
function formatAttachments(attachments: readonly A2aAttachmentReference[]): string {
  if (attachments.length === 0) return ''
  return `\nAttachments:\n${attachments
    .map(attachment => `- ${attachment.name} (${attachment.uncompressedBytes} bytes): ${attachment.path}`)
    .join('\n')}`
}

/** Format one history message like the injected inbound shape. */
function formatMessage(message: A2aMessageView, attachments: readonly A2aAttachmentReference[]): string {
  const target = message.target.type === 'project' ? 'project' : message.target.name
  return `[${message.messageRef}] ${message.from.name} -> ${target}${message.replyTo ? ` replyTo=${message.replyTo}` : ''}\n${message.text}${formatAttachments(attachments)}`
}

/**
 * Build the tool definitions over one mesh service.
 * @param mesh - the mesh client service.
 * @returns the tool definitions.
 */
export function buildTools(mesh: A2aMeshService): ToolDefinition[] {
  return [
    defineTool({
      name: 'a2a_peers',
      description: 'List the exact A2A roster names currently present in this Project. Use only a returned name for target.type=agent.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
          },
        },
        render: textRender,
      },
      // oxlint-disable-next-line typescript/require-await -- the execute contract is async; peers() is synchronous.
      execute: async (_args, exec) => {
        const peers = mesh.peers(exec.agent?.id)
        return {
          text: peers.length === 0
            ? 'No other Agents are present.'
            : peers.map(peer => peer.name).join('\n'),
        }
      },
    }),
    defineTool({
      name: 'a2a_message',
      description: 'Send to one current peer or all current peers. Use target.type=agent with a name from a2a_peers, or target.type=project for all current peers. Set replyTo to reply to an earlier Project message. Attachments must be current-session file paths (absolute). '
        + ASYNC_REPLY_GUIDANCE,
      parameters: {
        target: {
          type: 'object',
          required: true,
          description: 'The message target: one current peer name, or the whole project.',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['agent', 'project'], required: true },
            name: { type: 'string', description: 'Peer roster name, from a2a_peers (required when type=agent).' },
          },
        },
        text: { type: 'string', required: true, description: 'The message text.' },
        attachments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional absolute file paths to attach; their bytes are snapshotted before sending.',
        },
        reply_to: { type: 'string', description: 'Optional Project message reference to reply to (e.g. demo:12).' },
        message_id: { type: 'string', description: 'Optional idempotency key; retrying the same id and body returns the original message.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
          },
        },
        render: textRender,
      },
      execute: async (args, exec) => {
        const target = args.target
        const attachmentCount = args.attachments?.length ?? 0
        const accepted = await mesh.message({
          ...(exec.agent === undefined ? {} : { from: String(exec.agent.id) }),
          target: target.type === 'project'
            ? { type: 'project' }
            : { type: 'agent', name: target.name as string },
          text: args.text,
          ...(args.attachments === undefined ? {} : { attachments: args.attachments }),
          ...(args.reply_to === undefined ? {} : { replyTo: args.reply_to }),
          ...(args.message_id === undefined ? {} : { messageId: args.message_id }),
        })
        const targetLabel = target.type === 'project'
          ? `${accepted.recipients.length} Agents`
          : target.name
        return {
          text: `Sent to ${targetLabel} ref=${accepted.message.messageRef} attachments=${attachmentCount}\n${ASYNC_REPLY_GUIDANCE}`,
        }
      },
    }),
    defineTool({
      name: 'a2a_history',
      description: 'Review earlier Project messages using before, after, limit, or from. Returned attachment links are valid in the current session. Use only for past context; never wait or poll for new replies.',
      parameters: {
        before: { type: 'string', description: 'Only messages before this Project reference (exclusive).' },
        after: { type: 'string', description: 'Only messages after this Project reference (exclusive).' },
        limit: { type: 'number', description: 'Maximum messages (1–500, default 50).' },
        from: { type: 'string', description: 'Only messages from one roster name.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', required: true },
          },
        },
        render: textRender,
      },
      execute: async (args, exec) => {
        const messages = await mesh.history(exec.agent?.id, {
          ...(args.before === undefined ? {} : { before: args.before }),
          ...(args.after === undefined ? {} : { after: args.after }),
          ...(args.limit === undefined ? {} : { limit: args.limit }),
          ...(args.from === undefined ? {} : { from: args.from }),
        })
        if (messages.length === 0) return { text: 'No messages.' }
        const formatted: string[] = []
        for (const message of messages) {
          const references = await materializeAttachments(message.project, message.messageRef, message.attachments)
          formatted.push(formatMessage(message, references))
        }
        return { text: formatted.join('\n\n') }
      },
    }),
  ]
}

/** Cordis plugin name of the tool family. */
export const name = 'a2a-tools'

/** The mesh service and tool registry must be present before activation. */
export const inject = ['a2aMesh', 'tools']

/**
 * Register the a2a tool family on `ctx.tools`. Cordis activates this plugin
 * only after both the mesh service and the tool registry exist, so the
 * registration is timing-free.
 * @param ctx - Cordis context carrying the tool registry and mesh service.
 */
export function apply(ctx: Context): void {
  const tools = ctx.get('tools') as { register(definition: ToolDefinition): () => void }
  const mesh = ctx.get('a2aMesh') as A2aMeshService
  const disposers = buildTools(mesh).map(definition => tools.register(definition))
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'a2a-tools.disposers')
}
