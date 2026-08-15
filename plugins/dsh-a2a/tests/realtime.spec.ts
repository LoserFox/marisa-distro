/**
 * Realtime hub protocol: presence over WebSocket (claim, duplicate names,
 * join/leave announcements), direct and broadcast delivery with
 * delivered/failed/disconnected outcomes, idempotent appends, and history
 * surviving a hub restart while presence does not.
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { a2aHubDomainSpec } from '../src/hub/spec.ts'
import { A2aHubRegistry } from '../src/hub/registry.ts'
import { A2aHubMessages } from '../src/hub/messages.ts'
import { A2aHubServer } from '../src/hub/server.ts'
import { A2aHubClient } from '../src/hub/client.ts'
import { A2A_PROTOCOL_VERSION, type A2aServerFrame } from '../src/hub/realtime-types.ts'
import { decodeTextPayload, encodeBinaryPayload, encodeTextPayload } from '../src/hub/payload.ts'

/** One frame queue over a raw test socket. */
class FrameQueue {
  private frames: A2aServerFrame[] = []
  private waiters: Array<(frame: A2aServerFrame) => void> = []

  push(frame: A2aServerFrame): void {
    const waiter = this.waiters.shift()
    if (waiter) waiter(frame)
    else this.frames.push(frame)
  }

  next(): Promise<A2aServerFrame> {
    const frame = this.frames.shift()
    if (frame) return Promise.resolve(frame)
    return new Promise<A2aServerFrame>(resolve => this.waiters.push(resolve))
  }
}

/** Open a raw test socket and send the hello. */
async function connect(
  baseUrl: string,
  project: string,
  name: string,
): Promise<{ socket: WebSocket; frames: FrameQueue }> {
  const socket = new WebSocket(`${baseUrl.replace(/^http/, 'ws')}/v1/connect`)
  const frames = new FrameQueue()
  socket.on('message', (data) => { frames.push(JSON.parse(Buffer.from(new Uint8Array(data as Buffer)).toString('utf8')) as A2aServerFrame) })
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  socket.send(JSON.stringify({
    type: 'hello',
    protocolVersion: A2A_PROTOCOL_VERSION,
    project,
    name,
  }))
  return { socket, frames }
}

async function bootHub(options?: { path?: string }) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: options?.path ?? ':memory:', journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(a2aHubDomainSpec)
  const registry = new A2aHubRegistry(domain)
  const messages = new A2aHubMessages(domain)
  const server = new A2aHubServer({ host: '127.0.0.1', port: 0, registry, messages })
  const port = await server.listen()
  const client = new A2aHubClient({ baseUrl: `http://127.0.0.1:${port}` })
  return { ctx, server, client, registry, messages }
}

describe('realtime hub', () => {
  it('treats the WebSocket lifetime as the complete presence lifetime', async () => {
    const { ctx, server, client } = await bootHub()
    try {
      await client.createProject('room')

      const api = await connect(client.url, 'room', 'api')
      expect(await api.frames.next()).toMatchObject({
        type: 'claimed',
        project: 'room',
        self: { name: 'api' },
        peers: [],
      })

      const duplicate = await connect(client.url, 'room', 'api')
      expect(await duplicate.frames.next()).toMatchObject({
        type: 'error',
        code: 'name_in_use',
      })
      duplicate.socket.terminate()

      const web = await connect(client.url, 'room', 'web')
      const webClaimed = await web.frames.next()
      expect(webClaimed).toMatchObject({
        type: 'claimed',
        self: { name: 'web' },
        peers: [{ name: 'api' }],
      })
      expect(await api.frames.next()).toMatchObject({
        type: 'presence_joined',
        peer: { name: 'web' },
      })

      web.socket.close()
      expect(await api.frames.next()).toMatchObject({
        type: 'presence_left',
        peer: { name: 'web' },
      })

      // A same-named later connection is a new presence with a new id.
      const replacement = await connect(client.url, 'room', 'web')
      const replacementClaimed = await replacement.frames.next()
      expect(replacementClaimed).toMatchObject({ type: 'claimed', self: { name: 'web' } })
      if (webClaimed.type !== 'claimed' || replacementClaimed.type !== 'claimed') {
        throw new Error('expected claimed frames')
      }
      expect(replacementClaimed.self.presenceId).not.toBe(webClaimed.self.presenceId)

      api.socket.close()
      replacement.socket.close()
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })

  it('resolves direct targets and freezes broadcast snapshots at accept time', async () => {
    const { ctx, server, client } = await bootHub()
    try {
      await client.createProject('chat')
      const api = await connect(client.url, 'chat', 'api')
      await api.frames.next()
      const web = await connect(client.url, 'chat', 'web')
      await web.frames.next()
      await api.frames.next()
      const testPeer = await connect(client.url, 'chat', 'test')
      await testPeer.frames.next()
      await api.frames.next()
      await web.frames.next()

      api.socket.send(JSON.stringify({
        type: 'message',
        requestId: 'request-direct',
        messageId: 'direct-1',
        target: { type: 'agent', name: 'web' },
        payload: encodeTextPayload('check login'),
        attachments: [],
      }))
      const direct = await web.frames.next()
      expect(direct).toMatchObject({
        type: 'message',
        message: { messageId: 'direct-1', messageRef: 'chat:1', from: { name: 'api' } },
      })
      if (direct.type !== 'message') throw new Error('expected message frame')
      expect(decodeTextPayload(direct.message.payload)).toBe('check login')
      expect(await api.frames.next()).toMatchObject({
        type: 'accepted',
        requestId: 'request-direct',
        recipients: ['web'],
      })
      web.socket.send(JSON.stringify({ type: 'delivered', messageId: 'direct-1' }))
      expect(await api.frames.next()).toEqual({
        type: 'delivery',
        messageId: 'direct-1',
        to: 'web',
        status: 'delivered',
      })

      // A direct send to a name that is not present fails immediately.
      api.socket.send(JSON.stringify({
        type: 'message',
        requestId: 'request-gone',
        messageId: 'gone-1',
        target: { type: 'agent', name: 'absent' },
        payload: encodeTextPayload('hello?'),
        attachments: [],
      }))
      expect(await api.frames.next()).toMatchObject({
        type: 'error',
        code: 'recipient_not_present',
        requestId: 'request-gone',
      })

      // Broadcasts exclude the sender and never backfill later joiners.
      api.socket.send(JSON.stringify({
        type: 'message',
        requestId: 'request-broadcast',
        messageId: 'broadcast-1',
        target: { type: 'project' },
        payload: encodeTextPayload('freeze contract'),
        attachments: [],
      }))
      expect(await web.frames.next()).toMatchObject({ type: 'message', message: { messageId: 'broadcast-1' } })
      expect(await testPeer.frames.next()).toMatchObject({ type: 'message', message: { messageId: 'broadcast-1' } })
      expect(await api.frames.next()).toMatchObject({
        type: 'accepted',
        requestId: 'request-broadcast',
        message: { messageRef: 'chat:2', target: { type: 'project' } },
        recipients: ['web', 'test'],
      })
      web.socket.send(JSON.stringify({ type: 'delivered', messageId: 'broadcast-1' }))
      testPeer.socket.send(JSON.stringify({ type: 'delivered', messageId: 'broadcast-1' }))
      const deliveries = [await api.frames.next(), await api.frames.next()]
      expect(deliveries.map(frame => frame.type === 'delivery' ? `${frame.to}:${frame.status}` : frame.type).sort())
        .toEqual(['test:delivered', 'web:delivered'])

      // A closing recipient fails its pending delivery as disconnected.
      api.socket.send(JSON.stringify({
        type: 'message',
        requestId: 'request-disconnect',
        messageId: 'disconnect-1',
        target: { type: 'agent', name: 'web' },
        payload: encodeTextPayload('still there?'),
        attachments: [],
      }))
      expect(await web.frames.next()).toMatchObject({ type: 'message', message: { messageId: 'disconnect-1' } })
      expect(await api.frames.next()).toMatchObject({ type: 'accepted', requestId: 'request-disconnect' })
      web.socket.close()
      expect(await api.frames.next()).toEqual({
        type: 'delivery',
        messageId: 'disconnect-1',
        to: 'web',
        status: 'disconnected',
      })
      expect(await api.frames.next()).toMatchObject({ type: 'presence_left', peer: { name: 'web' } })

      api.socket.close()
      testPeer.socket.close()
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })

  it('keeps history across a hub restart while presence does not survive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'a2a-realtime-'))
    try {
      const first = await bootHub({ path: join(root, 'hub.sqlite') })
      await first.client.createProject('durable-chat')
      const api = await connect(first.client.url, 'durable-chat', 'api')
      await api.frames.next()
      const web = await connect(first.client.url, 'durable-chat', 'web')
      await web.frames.next()
      await api.frames.next()
      const attachmentBytes = Buffer.from('# Training handoff\nseed=20\n', 'utf8')
      const attachment = {
        name: 'training-handoff.md',
        payload: encodeBinaryPayload(attachmentBytes),
      }
      api.socket.send(JSON.stringify({
        type: 'message',
        requestId: 'request-history',
        messageId: 'history-1',
        target: { type: 'agent', name: 'web' },
        payload: encodeTextPayload('persist this'),
        attachments: [attachment],
      }))
      const inbound = await web.frames.next()
      if (inbound.type !== 'message') throw new Error('expected message frame')
      expect(inbound.message.attachments).toEqual([attachment])
      await api.frames.next()
      await first.server.close()
      await first.ctx.fiber.dispose()

      const second = await bootHub({ path: join(root, 'hub.sqlite') })
      try {
        const history = await second.client.history({ project: 'durable-chat', limit: 10 })
        expect(history.messages).toHaveLength(1)
        expect(history.messages[0]).toMatchObject({ messageId: 'history-1', messageRef: 'durable-chat:1' })
        const [persisted] = history.messages
        if (!persisted) throw new Error('expected persisted history')
        expect(decodeTextPayload(persisted.payload)).toBe('persist this')
        expect(persisted.attachments).toEqual([attachment])

        // Presence does not survive: the replacement claims an empty roster.
        const replacement = await connect(second.client.url, 'durable-chat', 'web')
        expect(await replacement.frames.next()).toMatchObject({ type: 'claimed', peers: [] })
        replacement.socket.close()
      } finally {
        await second.server.close()
        await second.ctx.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses project deletion while presences are active', async () => {
    const { ctx, server, client } = await bootHub()
    try {
      await client.createProject('busy')
      const api = await connect(client.url, 'busy', 'api')
      await api.frames.next()
      await expect(client.deleteProject('busy')).rejects.toThrow(/active presences/)
      api.socket.close()
      // The server removes the presence when the close lands.
      await vi.waitFor(() => {
        if (server.count('busy') !== 0) throw new Error('presence still active')
      }, { timeout: 5_000 })
      expect(await client.deleteProject('busy')).toBe(true)
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })
})
