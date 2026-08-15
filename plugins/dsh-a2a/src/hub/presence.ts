/**
 * The in-memory presence registry: a presence exists if and only if one
 * WebSocket is alive. Claimed names are unique per project; a same-named
 * later connection is a new presence and inherits nothing from the old
 * socket. Hub restart clears every presence (history survives).
 * @module @dpskh/a2a/hub/presence
 */

import type { WebSocket } from 'ws'
import { AGENT_NAME_RE, PROJECT_NAME_RE } from './message-ref.ts'
import type { A2aPeer } from './types.ts'

/** The claimed name is already taken by a live connection in the project. */
export class NameInUseError extends Error {}

/** One claimed connection. */
export type A2aPresence = A2aPeer & {
  readonly project: string
  readonly socket: WebSocket
  readonly connectedAt: number
}

/** Registry of live presences, keyed by project and by socket. */
export class A2aPresenceRegistry {
  private readonly byProject = new Map<string, Map<string, A2aPresence>>()
  private readonly bySocket = new Map<WebSocket, A2aPresence>()

  /**
   * Claim one name in a project for a socket.
   * @param project - project name.
   * @param name - roster name to claim.
   * @param socket - the live WebSocket.
   * @returns the claimed presence plus the peers present before the claim.
   * @throws {NameInUseError} when the name is already live in the project.
   */
  claim(project: string, name: string, socket: WebSocket): { self: A2aPresence; peers: A2aPeer[] } {
    if (!PROJECT_NAME_RE.test(project)) throw new Error(`invalid project: ${project}`)
    if (!AGENT_NAME_RE.test(name)) throw new Error(`invalid name: ${name}`)
    if (this.bySocket.has(socket)) throw new Error('connection already claimed a name')
    let room = this.byProject.get(project)
    if (!room) {
      room = new Map()
      this.byProject.set(project, room)
    }
    if (room.has(name)) throw new NameInUseError(`name already in use in ${project}: ${name}`)
    const peers = Array.from(room.values(), ({ name: peerName, presenceId }) => ({ name: peerName, presenceId }))
    const self: A2aPresence = {
      project,
      name,
      presenceId: crypto.randomUUID(),
      socket,
      connectedAt: Date.now(),
    }
    room.set(name, self)
    this.bySocket.set(socket, self)
    return { self, peers }
  }

  /**
   * The live presence under a name, when any.
   * @param project - project name.
   * @param name - roster name.
   * @returns the presence, or `null` when not live.
   */
  get(project: string, name: string): A2aPresence | null {
    return this.byProject.get(project)?.get(name) ?? null
  }

  /**
   * The presence owning a socket, when claimed.
   * @param socket - the WebSocket.
   * @returns the presence, or `null` when unclaimed.
   */
  getBySocket(socket: WebSocket): A2aPresence | null {
    return this.bySocket.get(socket) ?? null
  }

  /**
   * All live presences of one project.
   * @param project - project name.
   * @returns the live presences.
   */
  connections(project: string): A2aPresence[] {
    return Array.from(this.byProject.get(project)?.values() ?? [])
  }

  /**
   * Remove the presence of one socket (socket closed).
   * @param socket - the closing socket.
   * @returns the removed presence, or `null` when the socket had none.
   */
  remove(socket: WebSocket): A2aPresence | null {
    const presence = this.bySocket.get(socket)
    if (!presence) return null
    this.bySocket.delete(socket)
    const room = this.byProject.get(presence.project)
    room?.delete(presence.name)
    if (room?.size === 0) this.byProject.delete(presence.project)
    return presence
  }

  /**
   * Present count of one project.
   * @param project - project name.
   * @returns the number of live presences.
   */
  count(project: string): number {
    return this.byProject.get(project)?.size ?? 0
  }

  /**
   * Drain every presence (hub shutdown).
   * @returns the presences to fail deliveries for and close.
   */
  close(): A2aPresence[] {
    const presences = Array.from(this.bySocket.values())
    this.bySocket.clear()
    this.byProject.clear()
    return presences
  }
}
