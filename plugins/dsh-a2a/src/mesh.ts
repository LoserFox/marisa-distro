/**
 * The mesh client service (`ctx.a2aMesh`): one workspace's realtime
 * presences. Each joined agent owns one WebSocket presence (project +
 * roster name); inbound messages are pushed serially and injected into the
 * owning agent's session (follow-up turn when idle, plain context when
 * busy); unexpected drops auto-reconnect with backoff while the connection
 * is desired. There is no polling, no durable membership, and no offline
 * delivery — a presence exists if and only if its socket is alive.
 * @module @dpskh/a2a/mesh
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { A2aActivityTracker } from './activity.ts'
import { materializeAttachments, snapshotAttachments, type A2aAttachmentReference } from './attachments.ts'
import { A2aError } from './error.ts'
import { A2aHubClient, probeHub } from './hub/client.ts'
import { A2aConnection } from './hub/connection.ts'
import { decodeBinaryPayload, decodeTextPayload } from './hub/payload.ts'
import type {
  A2aDeliveryEvent,
  A2aHistoryQuery,
  A2aMessageRequestTarget,
  A2aPeer,
  A2aProject,
  A2aRealtimeMessage,
} from './hub/types.ts'
import type { A2aPeerActivity } from './view.ts'

/** Browser-facing snapshot invalidation scope. */
export type A2aChange =
  | { readonly scope: 'session'; readonly agentId: string }
  | { readonly scope: 'all' }

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A local presence changed (connect or disconnect).
     * @param payload - project, local agent id, roster name, presence id,
     * and the new connected state.
     * @mode emit
     */
    'a2a/presence-changed'(payload: {
      project: string
      agentId: string
      name: string
      presenceId: string
      joined: boolean
    }): void
    /**
     * An A2A status view became stale.
     * @param change - one owning session, or every session after a project change.
     * @mode emit
     */
    'a2a/change'(change: A2aChange): void
    /**
     * A delivery outcome for one of this workspace's sends.
     * @param payload - the delivery event as reported by the hub.
     * @mode emit
     */
    'a2a/delivery'(payload: A2aDeliveryEvent): void
  }
}

/** Mesh client configuration. */
export interface MeshConfig {
  /** Hub base URL, e.g. `http://127.0.0.1:4173`; omit to follow the
   * in-process hub host's bound address. */
  readonly hubUrl?: string
  /** Project to connect to; defaults to `main`. */
  readonly project?: string
  /** Default roster name; defaults to the agent id. */
  readonly name?: string
  /** The local agent this mesh presence belongs to (injection target and
   * the default for agent-relative calls). */
  readonly agentId?: string
  /**
   * Whether the configured agent auto-connects when it registers. Defaults
   * to true; fresh presences never join uninvited.
   */
  readonly autoConnect?: boolean
  /**
   * Remember each agent's last successful connection under its session id
   * and reconnect it when the agent registers — the GUI path, where session
   * ids are dynamic and no static `agentId` is configured. Records live in
   * the `a2a-connections` settings namespace; an explicit disconnect forgets
   * its record. Requires a mounted settings service. Defaults to false.
   */
  readonly persistConnections?: boolean
  /** Initial reconnect delay in ms (doubles to a 10 s cap). */
  readonly reconnectMs?: number
}

/** One persisted per-session connection: the project and roster name. */
export interface StoredConnection {
  readonly project: string
  readonly name: string
}

/** Settings schema for the per-session connection records (agent id → connection). */
const ConnectionsSchema = z.object({
  connections: z.dict(z.object({
    project: z.string(),
    name: z.string(),
  })).default({}),
})

/** Default project when the config omits one. */
export const DEFAULT_PROJECT = 'main'

/** The outbound reply guidance shared by the message tool and commands. */
export const ASYNC_REPLY_GUIDANCE =
  'Replies arrive automatically. After sending, continue independent work; '
  + 'if blocked, end the current turn. Never wait, sleep, or poll a2a_history for a reply.'

/** One decoded message view (payload and attachment bytes decoded). */
export type A2aMessageView = Omit<A2aRealtimeMessage, 'payload' | 'attachments'> & {
  readonly text: string
  readonly attachments: readonly { name: string; bytes: Buffer }[]
}

/** One membership: one local agent's presence on one hub. */
interface Membership {
  readonly agentId: string
  readonly project: string
  readonly name: string
  connection: A2aConnection | undefined
  /** Whether an unexpected drop should reconnect. */
  desired: boolean
  reconnectTimer: ReturnType<typeof setTimeout> | undefined
  reconnectDelayMs: number
  /** Conversation-activity ledger driving the graph animations. */
  readonly activity: A2aActivityTracker
}

/** One agent's current status. */
export type A2aMeshStatus =
  | {
    readonly connected: false
    readonly peers: readonly []
    readonly projects: readonly A2aProject[]
  }
  | {
    readonly connected: true
    readonly project: string
    readonly name: string
    readonly presenceId: string
    readonly peers: readonly A2aPeer[]
    readonly projects: readonly A2aProject[]
    /** Local conversation activity: self plus per-peer (keyed by presence id). */
    readonly activity: {
      readonly self: A2aPeerActivity
      readonly peers: Readonly<Record<string, A2aPeerActivity>>
    }
  }

/**
 * The mesh client. Presence and delivery ride the hub over one WebSocket
 * per agent; this service owns the connections, the reconnect timers, and
 * the injection pipeline. Every operation addresses one agent id — the
 * default resolves through the configured `agentId`, and callers that know
 * their session (commands, tools, the web domain) pass it explicitly.
 */
export class A2aMeshService extends Service {
  static inject = ['agents']

  private readonly config: MeshConfig
  private client: A2aHubClient | undefined
  private readonly memberships = new Map<string, Membership>()
  private lifecycleListening = false
  /** Persisted per-session connections, when `persistConnections` and settings are mounted. */
  private connectionScope: SettingsScope<{ connections: Record<string, StoredConnection> }> | undefined

  /**
   * @param ctx - Cordis context with the agent registry.
   * @param config - mesh membership configuration.
   */
  constructor(ctx: Context, config: MeshConfig) {
    super(ctx, 'a2aMesh')
    this.config = config
    if (config.persistConnections) {
      // The settings service is optional: without it, connection memory is
      // simply unavailable and the mesh behaves exactly as composed.
      ctx.inject(['settings'], (sctx) => {
        this.connectionScope = sctx.settings.register(settingsNamespace('a2a-connections'), ConnectionsSchema)
        sctx.effect(() => () => {
          this.connectionScope = undefined
        })
      })
    }
    // The lifecycle listeners must be live from service activation, not from
    // the first connect: a cold start (web restart, GUI opening) creates
    // agents before any presence exists, so an auto-connect that only
    // listened after the first join would miss every `agent/created`.
    this.ensureLifecycleListener()
    this.ctx.effect(() => {
      return async () => {
        for (const membership of this.memberships.values()) {
          membership.desired = false
          this.clearReconnect(membership)
          membership.activity.dispose()
        }
        await Promise.all(Array.from(this.memberships.values(), membership => this.closeConnection(membership)))
      }
    }, 'a2aMesh.lifetime')
  }

  /**
   * The hub client, created on first use: `hubUrl` may be omitted to follow
   * an in-process hub host, whose port is only known after its async bind —
   * hence the lazy resolution instead of a constructor-time client.
   */
  private async hubClient(): Promise<A2aHubClient> {
    const configured = this.config.hubUrl
    if (configured === undefined) {
      const hub = this.ctx.get('a2aHub')
      const url = hub?.url
      if (url === undefined) {
        throw new A2aError('mesh has no hubUrl and no in-process hub is listening', 'A2A_CLIENT_CONNECT')
      }
      if (this.client === undefined || this.client.url !== url) {
        this.client = new A2aHubClient({ baseUrl: url })
      }
    } else if (this.client === undefined || this.client.url !== configured) {
      this.client = new A2aHubClient({ baseUrl: configured })
    }
    await probeHub(this.client.url)
    return this.client
  }

  /**
   * Connect one agent as one presence. Idempotent per (agent, project,
   * name): an identical live presence returns its status; a rename drops
   * the old socket and claims the new name.
   * @param agentId - the local session agent id; defaults to the configured
   * `agentId`.
   * @param project - the project; defaults to the configured one, else `main`.
   * @param name - the roster name; defaults to the configured one, else the
   * agent id.
   * @returns the membership status.
   */
  async connect(agentId?: string, project?: string, name?: string): Promise<A2aMeshStatus> {
    const resolved = this.resolveAgentId(agentId)
    const resolvedProject = project ?? this.config.project ?? DEFAULT_PROJECT
    const resolvedName = name ?? this.config.name ?? resolved
    const existing = this.memberships.get(resolved)
    if (existing !== undefined) {
      if (existing.project === resolvedProject && existing.name === resolvedName && existing.connection !== undefined) {
        existing.desired = true
        return this.status(resolved)
      }
      await this.disconnect(resolved)
    }
    const membership: Membership = {
      agentId: resolved,
      project: resolvedProject,
      name: resolvedName,
      connection: undefined,
      desired: true,
      reconnectTimer: undefined,
      reconnectDelayMs: this.config.reconnectMs ?? 500,
      activity: new A2aActivityTracker(() => {
        this.ctx.emit('a2a/change', { scope: 'session', agentId: resolved })
      }),
    }
    this.memberships.set(resolved, membership)
    try {
      await this.openConnection(membership)
    } catch (error) {
      // A failed first connect keeps the membership desired: the reconnect
      // timer retries until the hub (or the project) is reachable.
      this.scheduleReconnect(membership)
      throw error
    }
    if (this.config.persistConnections) {
      await this.storeConnection(resolved, resolvedProject, resolvedName)
    }
    return this.status(resolved)
  }

  /**
   * Disconnect one agent's presence (no reconnect is scheduled).
   * @param agentId - the agent id; defaults to the configured `agentId`.
   * @returns true when a presence was dropped.
   */
  async disconnect(agentId?: string): Promise<boolean> {
    const resolved = this.resolveOptionalAgentId(agentId)
    const membership = resolved === undefined ? undefined : this.memberships.get(resolved)
    if (membership === undefined) return false
    if (resolved !== undefined) this.memberships.delete(resolved)
    membership.desired = false
    this.clearReconnect(membership)
    membership.activity.dispose()
    const presenceId = membership.connection?.self.presenceId
    await this.closeConnection(membership)
    if (presenceId !== undefined) {
      this.ctx.emit('a2a/presence-changed', {
        project: membership.project,
        agentId: membership.agentId,
        name: membership.name,
        presenceId,
        joined: false,
      })
    }
    if (this.config.persistConnections) {
      await this.forgetConnection(membership.agentId)
    }
    this.ctx.emit('a2a/change', { scope: 'session', agentId: membership.agentId })
    return true
  }

  /**
   * The current roster of one agent's presence.
   * @param agentId - the agent id; defaults to the configured `agentId`.
   * @returns peers sorted by name.
   * @throws {A2aError} when the agent is not connected.
   */
  peers(agentId?: string): A2aPeer[] {
    return this.resolveConnection(agentId).peers()
  }

  /**
   * Send one message from one agent's presence. The reply is delivered
   * passively — never wait or poll after send.
   * @param options - target, text, optional sender (defaults to the
   * configured agent id), attachments (sender-local file paths), the raw
   * message id being replied to, and an optional idempotency messageId.
   * @returns the accepted message and the recipient names.
   */
  async message(options: {
    from?: string
    target: A2aMessageRequestTarget
    text: string
    attachments?: readonly string[]
    replyTo?: string
    messageId?: string
  }): Promise<{ message: A2aMessageView; recipients: readonly string[] }> {
    const membership = this.resolveMembership(options.from)
    const connection = membership.connection
    if (connection === undefined) {
      throw new A2aError('not connected: run /a2a connect <project> --as <name> first', 'A2A_CLIENT_CONNECT')
    }
    const encoded = await snapshotAttachments(options.attachments ?? [])
    const accepted = await connection.send({
      target: options.target,
      text: options.text,
      attachments: encoded,
      ...(options.replyTo === undefined ? {} : { replyTo: options.replyTo }),
      ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
    })
    membership.activity.noteSent(accepted.recipients)
    return {
      message: this.decodeMessage(accepted.message),
      recipients: accepted.recipients,
    }
  }

  /**
   * Query the history of one agent's connected project.
   * @param agentId - the agent id; defaults to the configured `agentId`.
   * @param query - cursors, sender filter, and limit (project is implied).
   * @returns the decoded messages in ascending sequence order.
   */
  async history(agentId: string | undefined, query?: Omit<A2aHistoryQuery, 'project'>): Promise<A2aMessageView[]> {
    const connection = this.resolveConnection(agentId)
    const page = await (await this.hubClient()).history({
      project: connection.project,
      ...query,
    })
    return page.messages.map(message => this.decodeMessage(message))
  }

  /**
   * One agent's current status: its presence, the roster, and the hub
   * projects.
   * @param agentId - the agent to report; defaults to the configured
   * `agentId`.
   * @returns the status view.
   */
  async status(agentId?: string): Promise<A2aMeshStatus> {
    const resolved = this.resolveOptionalAgentId(agentId)
    const membership = resolved === undefined ? undefined : this.memberships.get(resolved)
    if (membership === undefined || membership.connection === undefined) {
      return { connected: false, peers: [], projects: await (await this.hubClient()).listProjects() }
    }
    const [projects] = await Promise.all([(await this.hubClient()).listProjects()])
    const connection = membership.connection
    const peers = connection.peers()
    const agent = this.owningAgent(membership.agentId)
    const peerActivities: Record<string, A2aPeerActivity> = {}
    for (const peer of peers) peerActivities[peer.presenceId] = membership.activity.peerActivity(peer.name)
    return {
      connected: true,
      project: membership.project,
      name: membership.name,
      presenceId: connection.self.presenceId,
      peers,
      projects,
      activity: {
        self: membership.activity.selfActivity(agent?.status === 'running'),
        peers: peerActivities,
      },
    }
  }

  /**
   * Create one project on the hub.
   * @param name - project name.
   * @param meta - display name, description, and creating cwd.
   * @returns the created project.
   */
  async createProject(name: string, meta: { displayName?: string; description?: string; createdByCwd?: string } = {}): Promise<A2aProject> {
    const project = await (await this.hubClient()).createProject(name, meta)
    this.ctx.emit('a2a/change', { scope: 'all' })
    return project
  }

  /**
   * Delete one project and its history (refused while presences are active).
   * @param name - project name.
   * @returns true when the project existed.
   */
  async deleteProject(name: string): Promise<boolean> {
    return (await this.hubClient()).deleteProject(name)
  }

  /**
   * List hub projects.
   * @returns projects sorted by name.
   */
  async listProjects(): Promise<A2aProject[]> {
    return (await this.hubClient()).listProjects()
  }

  /**
   * Register the agent-lifecycle listeners once: a disposed agent's
   * presence drops, and — when `autoConnect` is enabled — the configured
   * agent auto-connects when it registers. The listeners live on the root
   * context (agent lifecycle emits through the agent's own scope) and are
   * unregistered with this service's fiber.
   */
  private ensureLifecycleListener(): void {
    if (this.lifecycleListening) return
    this.lifecycleListening = true
    this.ctx.effect(() => {
      const offDisposed = this.ctx.root.on('agent/disposed', ({ agent }) => {
        this.handleAgentDisposed(agent.id)
      })
      const offCreated = this.ctx.root.on('agent/created', ({ agent }) => {
        this.handleAgentCreated(agent.id)
      })
      // The local working indicator ends when the owning agent returns to
      // idle; `agent/status` is agent-scoped and reaches this root listener
      // through the scope chain (same shape as agent/created above).
      const offStatus = this.ctx.root.on('agent/status', ({ agent, status }) => {
        if (status === 'idle') this.memberships.get(agent.id)?.activity.noteIdle()
      })
      return () => {
        offDisposed()
        offCreated()
        offStatus()
      }
    })
  }

  /** Drop the presence of a disposed agent, if any. */
  private handleAgentDisposed(agentId: string): void {
    const membership = this.memberships.get(agentId)
    if (membership === undefined) return
    // Defensive: disconnect() tolerates a vanished hub itself; this guards
    // its remaining surface so the lifecycle listener never rejects.
    /* v8 ignore next 4 -- defensive: see above, the listener never rejects */
    void this.disconnect(agentId).catch((error: unknown) => {
      this.ctx.logger.warn(`a2a mesh: failed to disconnect disposed member "${agentId}": ${String(error)}`)
    })
  }

  /**
   * Auto-connect on agent registration: the configured agent always joins;
   * with `persistConnections`, any agent with a stored record rejoins its
   * last project and name. Failures degrade to the reconnect timer: a
   * transient hub or an unknown project must not block session startup.
   */
  private handleAgentCreated(agentId: string): void {
    if (this.config.autoConnect === false) return
    if (this.memberships.has(agentId)) return
    const fail = (error: unknown): void => {
      this.ctx.logger.warn(`a2a mesh: auto-connect failed for "${agentId}": ${String(error)}`)
    }
    if (agentId === this.config.agentId) {
      void this.connect(agentId).catch(fail)
      return
    }
    const stored = this.config.persistConnections ? this.storedConnection(agentId) : undefined
    if (stored === undefined) return
    void this.connect(agentId, stored.project, stored.name).catch(fail)
  }

  /** One agent's persisted connection record, when present. */
  private storedConnection(agentId: string): StoredConnection | undefined {
    return this.connectionScope?.get().connections[agentId]
  }

  /** Persist one successful connection under its agent id. */
  private async storeConnection(agentId: string, project: string, name: string): Promise<void> {
    const scope = this.connectionScope
    if (scope === undefined) return
    await scope.update({ connections: { ...scope.get().connections, [agentId]: { project, name } } })
  }

  /** Forget one agent's persisted connection (an explicit disconnect). */
  private async forgetConnection(agentId: string): Promise<void> {
    const scope = this.connectionScope
    if (scope === undefined) return
    const next = Object.fromEntries(
      Object.entries(scope.get().connections).filter(([id]) => id !== agentId),
    )
    await scope.update({ connections: next })
  }

  /** Open one membership's connection and wire its events. */
  private async openConnection(membership: Membership): Promise<void> {
    const client = await this.hubClient()
    let connection: A2aConnection
    try {
      connection = await A2aConnection.connect({
        baseUrl: client.url,
        project: membership.project,
        name: membership.name,
        events: {
          onPresenceJoined: (peer) => {
            this.ctx.emit('a2a/change', { scope: 'session', agentId: membership.agentId })
            this.ctx.logger.info(`a2a mesh: peer joined ${membership.project}/${peer.name}`)
          },
          onPresenceLeft: (peer, reason) => {
            this.ctx.emit('a2a/change', { scope: 'session', agentId: membership.agentId })
            this.ctx.logger.info(`a2a mesh: peer left ${membership.project}/${peer.name} (${reason})`)
          },
          onMessage: async (raw) => {
            await this.deliverMessage(membership, raw)
          },
          onDelivery: (delivery) => {
            membership.activity.noteDelivery(delivery.to, delivery.status === 'delivered')
            this.ctx.emit('a2a/delivery', delivery)
            this.ctx.logger.info(`a2a mesh: delivery ${delivery.status} to ${delivery.to} (${delivery.messageId})`)
          },
          onError: (error) => {
            this.ctx.logger.warn(`a2a mesh: realtime error: ${error.message}`)
          },
          onClose: ({ manual }) => {
            if (this.memberships.get(membership.agentId) !== membership) return
            membership.connection = undefined
            this.ctx.emit('a2a/change', { scope: 'session', agentId: membership.agentId })
            if (manual || !membership.desired) return
            this.ctx.logger.warn(`a2a mesh: connection lost for "${membership.name}"; reconnecting`)
            this.scheduleReconnect(membership)
          },
        },
      })
    } catch (error) {
      if (
        this.memberships.get(membership.agentId) === membership
        && error instanceof A2aError
        && ['A2A_NAME_IN_USE', 'A2A_UNKNOWN_PROJECT', 'A2A_PROTOCOL_MISMATCH'].includes(error.code)
      ) {
        membership.desired = false
      }
      throw error
    }
    if (this.memberships.get(membership.agentId) !== membership) {
      void connection.close()
      return
    }
    membership.connection = connection
    this.ctx.emit('a2a/change', { scope: 'session', agentId: membership.agentId })
    membership.reconnectDelayMs = this.config.reconnectMs ?? 500
    const self = connection.self
    this.ctx.emit('a2a/presence-changed', {
      project: membership.project,
      agentId: membership.agentId,
      name: self.name,
      presenceId: self.presenceId,
      joined: true,
    })
  }

  /** Deliver one inbound message: materialize, then inject into the owner. */
  private async deliverMessage(membership: Membership, raw: A2aRealtimeMessage): Promise<void> {
    const view = this.decodeMessage(raw)
    const references = await materializeAttachments(view.project, view.messageRef, view.attachments)
    const agent = this.owningAgent(membership.agentId)
    if (agent === undefined) {
      throw new Error(`a2a mesh: no live agent for presence "${membership.name}"`)
    }
    this.injectMessage(agent, view, references)
    membership.activity.noteReceived(raw.from.name)
  }

  /** Schedule one membership's reconnect with backoff (idempotent). */
  private scheduleReconnect(membership: Membership): void {
    if (membership.reconnectTimer !== undefined || !membership.desired) return
    membership.reconnectTimer = setTimeout(() => {
      membership.reconnectTimer = undefined
      if (!membership.desired || this.memberships.get(membership.agentId) !== membership) return
      void this.openConnection(membership).catch((error: unknown) => {
        this.ctx.logger.warn(`a2a mesh: reconnect failed for "${membership.name}": ${String(error)}`)
      })
    }, membership.reconnectDelayMs)
    membership.reconnectDelayMs = Math.min(membership.reconnectDelayMs * 2, 10_000)
  }

  /** Cancel one membership's pending reconnect. */
  private clearReconnect(membership: Membership): void {
    if (membership.reconnectTimer !== undefined) {
      clearTimeout(membership.reconnectTimer)
      membership.reconnectTimer = undefined
    }
  }

  /** Close one membership's socket, if open. */
  private async closeConnection(membership: Membership): Promise<void> {
    const connection = membership.connection
    membership.connection = undefined
    if (connection !== undefined) await connection.close()
  }

  /** Decode one wire message into its view (text and attachment bytes). */
  private decodeMessage(message: A2aRealtimeMessage): A2aMessageView {
    const { payload, attachments, ...metadata } = message
    return {
      ...metadata,
      text: decodeTextPayload(payload),
      attachments: attachments.map(attachment => ({
        name: attachment.name,
        bytes: decodeBinaryPayload(attachment.payload),
      })),
    }
  }

  /** Inject one decoded message into its owning agent, idle-aware. */
  private injectMessage(agent: Agent, message: A2aMessageView, attachments: A2aAttachmentReference[]): void {
    const attachmentText = attachments.length === 0
      ? ''
      : `\nAttachments:\n${attachments
        .map(attachment => `- ${attachment.name} (${attachment.uncompressedBytes} bytes): ${attachment.path}`)
        .join('\n')}`
    const text = `[a2a message] ref=${message.messageRef} from=${message.from.name} project=${message.project} at=${new Date(message.createdAt).toISOString()} replyTo=${message.replyTo ?? '-'}\n${message.text}${attachmentText}`
    const userMessage = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'a2a', msgId: message.messageId, messageRef: message.messageRef },
    })
    if (agent.status === 'idle') {
      // A follow-up turn wakes the driver and processes the message now.
      agent.followup(userMessage)
    } else {
      // Plain context injection: the running turn keeps the floor.
      agent.inject(userMessage)
    }
  }

  /** The owning agent for injection, when registered. */
  private owningAgent(agentId: string): Agent | undefined {
    return this.ctx.agents.get(SessionId(agentId))
  }

  /** The membership agent id: the caller's, else config. */
  private resolveAgentId(fallback: string | undefined): string {
    const agentId = fallback ?? this.config.agentId
    if (agentId === undefined) {
      throw new A2aError('mesh connect needs an agentId (the owning session agent id)', 'A2A_CLIENT_CONNECT')
    }
    return agentId
  }

  /** The caller's agent id: the argument, else config, else the sole member. */
  private resolveOptionalAgentId(fallback: string | undefined): string | undefined {
    if (fallback !== undefined) return fallback
    if (this.config.agentId !== undefined) return this.config.agentId
    // Single-member convenience: a service configured without agentId falls
    // back to its only membership, so legacy callers without an explicit id
    // still address the one connected agent.
    if (this.memberships.size === 1) {
      return this.memberships.keys().next().value
    }
    return undefined
  }

  /** Resolve the membership of an agent that must be connected. */
  private resolveMembership(fallback: string | undefined): Membership {
    const resolved = this.resolveOptionalAgentId(fallback)
    const membership = resolved === undefined ? undefined : this.memberships.get(resolved)
    if (membership === undefined) {
      throw new A2aError('not connected: run /a2a connect <project> --as <name> first', 'A2A_CLIENT_CONNECT')
    }
    return membership
  }

  /** Resolve the connection of an agent that must be connected. */
  private resolveConnection(fallback: string | undefined): A2aConnection {
    const membership = this.resolveMembership(fallback)
    const connection = membership.connection
    if (connection === undefined) {
      throw new A2aError('not connected: run /a2a connect <project> --as <name> first', 'A2A_CLIENT_CONNECT')
    }
    return connection
  }
}
