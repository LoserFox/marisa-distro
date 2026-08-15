/**
 * The A2A command surface (0.3 realtime chat): `/a2a` subcommands for the
 * hub, projects, connecting a presence, the roster, and history queries.
 * Every delivery path is passive — replies arrive as injected turns, never
 * by polling after send.
 * @module @dpskh/a2a/commands
 */

import type { Context } from '@deepseek-ai/cordis'
import type { A2aMeshService } from './mesh.ts'
import { materializeAttachments, type A2aAttachmentReference } from './attachments.ts'

/** One registered command's outcome; the UI renders `text` directly. */
export type A2aCommandResult = { readonly kind: 'success'; readonly text: string } | { readonly kind: 'error'; readonly text: string }

/** Parse `--flag` / `--flag=value` / `--flag value` style arguments. */
function parseArgs(raw: string): { positional: string[]; flags: Record<string, string | true> } {
  const tokens = raw.trim().length === 0 ? [] : raw.trim().split(/\s+/)
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    /* v8 ignore next 1 -- defensive: split never yields undefined elements */
    if (token === undefined) break
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const equals = token.indexOf('=')
    if (equals > 2) {
      flags[token.slice(2, equals)] = token.slice(equals + 1)
      continue
    }
    const key = token.slice(2)
    const next = tokens[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      index++
    } else {
      flags[key] = true
    }
  }
  return { positional, flags }
}

/** One string flag or `undefined`. */
function flagValue(flags: Record<string, string | true>, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

function usage(): string {
  return [
    'A2A anonymous realtime Agent chat:',
    '/a2a hub',
    '/a2a project create <name> [--display <text>] [--desc <text>]',
    '/a2a project list',
    '/a2a project delete <name>',
    '/a2a connect <project> [--as <name>]',
    '/a2a disconnect',
    '/a2a status',
    '/a2a peers',
    '/a2a history [--before <ref>] [--after <ref>] [--limit <n>] [--from <name>]',
    '/a2a help',
  ].join('\n')
}

/** Format one history message's attachments. */
function formatAttachments(attachments: readonly A2aAttachmentReference[]): string {
  if (attachments.length === 0) return ''
  return `\nAttachments:\n${attachments
    .map(attachment => `- ${attachment.name} (${attachment.uncompressedBytes} bytes): ${attachment.path}`)
    .join('\n')}`
}

/** Format one history message. */
function formatMessage(
  message: { messageRef: string; from: { name: string }; target: { type: string; name?: string }; replyTo?: string; text: string },
  attachments: readonly A2aAttachmentReference[],
): string {
  const target = message.target.type === 'project' ? 'project' : message.target.name
  return `[${message.messageRef}] ${message.from.name} -> ${target}${message.replyTo ? ` replyTo=${message.replyTo}` : ''}\n${message.text}${formatAttachments(attachments)}`
}

/**
 * Handle one `/a2a` invocation against the mesh service.
 * @param mesh - the mesh client service.
 * @param agentId - the invoking agent's session id.
 * @param rawInput - the subcommand line.
 * @returns the command outcome.
 */
export async function handleA2a(mesh: A2aMeshService, agentId: string, rawInput: string): Promise<A2aCommandResult> {
  const { positional, flags } = parseArgs(rawInput)
  const command = positional[0] ?? ''
  try {
    switch (command) {
      case 'hub': {
        if (positional[1] === 'status') {
          const status = await mesh.status(agentId)
          return {
            kind: 'success',
            text: status.connected
              ? `Project: ${status.project}\nName: ${status.name}\nConnection: connected\nPeers: ${status.peers.length}`
              : 'Connection: disconnected',
          }
        }
        return { kind: 'error', text: usage() }
      }
      case 'project': {
        const name = positional[2]
        if (positional[1] === 'create') {
          if (name === undefined) return { kind: 'error', text: 'usage: /a2a project create <name>' }
          const displayName = flagValue(flags, 'display')
          const description = flagValue(flags, 'desc')
          const project = await mesh.createProject(name, {
            ...(displayName === undefined ? {} : { displayName }),
            ...(description === undefined ? {} : { description }),
            createdByCwd: process.cwd(),
          })
          return { kind: 'success', text: `Created Project ${project.name}` }
        }
        if (positional[1] === 'delete') {
          if (name === undefined) return { kind: 'error', text: 'usage: /a2a project delete <name>' }
          const deleted = await mesh.deleteProject(name)
          return { kind: 'success', text: deleted ? `Deleted Project ${name}` : `Project ${name} does not exist` }
        }
        if (positional[1] === 'list') {
          const projects = await mesh.listProjects()
          return { kind: 'success', text: projects.length === 0 ? 'No Projects.' : projects.map(project => `- ${project.name}`).join('\n') }
        }
        return { kind: 'error', text: usage() }
      }
      case 'connect': {
        const project = positional[1]
        if (project === undefined) return { kind: 'error', text: 'usage: /a2a connect <project> [--as <name>]' }
        const status = await mesh.connect(agentId, project, flagValue(flags, 'as'))
        if (!status.connected) throw new Error('a2a connect resolved without a live presence')
        return {
          kind: 'success',
          text: `Connected to ${status.project} as ${status.name}\n${status.peers.length === 0 ? 'No other Agents.' : status.peers.map(peer => peer.name).join('\n')}`,
        }
      }
      case 'disconnect': {
        const removed = await mesh.disconnect(agentId)
        return { kind: 'success', text: removed ? 'Disconnected.' : 'A2A is not connected.' }
      }
      case 'status': {
        const status = await mesh.status(agentId)
        return {
          kind: 'success',
          text: status.connected
            ? `Project: ${status.project}\nName: ${status.name}\nConnection: connected\nPeers: ${status.peers.length}`
            : 'Connection: disconnected',
        }
      }
      case 'peers': {
        const peers = mesh.peers(agentId)
        return {
          kind: 'success',
          text: peers.length === 0 ? 'No other Agents.' : peers.map(peer => peer.name).join('\n'),
        }
      }
      case 'history': {
        const limit = flags.limit === undefined ? undefined : Number(flags.limit)
        const messages = await mesh.history(agentId, {
          ...(flagValue(flags, 'before') === undefined ? {} : { before: flagValue(flags, 'before') as string }),
          ...(flagValue(flags, 'after') === undefined ? {} : { after: flagValue(flags, 'after') as string }),
          ...(flagValue(flags, 'from') === undefined ? {} : { from: flagValue(flags, 'from') as string }),
          ...(limit === undefined ? {} : { limit }),
        })
        if (messages.length === 0) return { kind: 'success', text: 'No messages.' }
        const formatted: string[] = []
        for (const message of messages) {
          const references = await materializeAttachments(message.project, message.messageRef, message.attachments)
          formatted.push(formatMessage(message, references))
        }
        return { kind: 'success', text: formatted.join('\n\n') }
      }
      case 'help':
      case '--help':
      case '-h':
        return { kind: 'success', text: usage() }
      default:
        return { kind: 'error', text: usage() }
    }
  } catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
  }
}

/** Cordis plugin name of the command surface. */
export const name = 'a2a-commands'

/** The mesh service and command registry must be present before activation. */
export const inject = ['a2aMesh', 'commands']

/**
 * Register `/a2a` on `ctx.commands`. Cordis activates this plugin only after
 * both the mesh service and the command registry exist.
 * @param ctx - Cordis context carrying the command registry and mesh service.
 */
export function apply(ctx: Context): void {
  const commands = ctx.get('commands') as { register(definition: {
    name: string
    description: string
    input?: { hint: string }
    handler: (invocation: { agent: { id: string }; rawInput: string }) => unknown
  }): () => void }
  const mesh = ctx.get('a2aMesh') as A2aMeshService
  const dispose = commands.register({
    name: 'a2a',
    description: 'A2A realtime chat: hub, projects, presence, roster, and history',
    input: { hint: '<subcommand>' },
    handler: (invocation: { agent: { id: string }; rawInput: string }) => {
      return handleA2a(mesh, invocation.agent.id, invocation.rawInput)
    },
  })
  ctx.effect(() => () => { dispose() }, 'a2a-commands.disposer')
}
