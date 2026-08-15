/**
 * Mesh client over a real hub: connect/disconnect, roster views, direct and
 * broadcast sends, serial inbound injection into the owning agent (with
 * attachment materialization), delivery events, presence-changed events,
 * auto-connect, and reconnect after an unexpected drop.
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import Settings, { type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { a2aHubDomainSpec } from '../src/hub/spec.ts'
import { A2aHubRegistry } from '../src/hub/registry.ts'
import { A2aHubMessages } from '../src/hub/messages.ts'
import { A2aHubServer } from '../src/hub/server.ts'
import { A2aMeshService } from '../src/mesh.ts'
import type { A2aChange } from '../src/mesh.ts'

const settingsDocuments = new Map<string, Record<string, unknown>>()

class TestSettings extends Settings {
  override readonly writable = true

  constructor(ctx: Context, private readonly config: { path: string }) {
    super(ctx)
  }

  protected override load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(settingsDocuments.get(this.config.path) ?? {}))
  }

  protected override persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    const document = structuredClone(settingsDocuments.get(this.config.path) ?? {})
    document[ns] = structuredClone(section)
    settingsDocuments.set(this.config.path, document)
    return Promise.resolve()
  }
}

/** Agent stub with observable delivery verbs. */
function agentStub(id: string, status = 'idle') {
  return {
    id,
    status,
    followup: vi.fn(),
    inject: vi.fn(),
  }
}

/** Boot one hub (real sqlite + http) and a mesh-client factory over it. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: ':memory:', journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(a2aHubDomainSpec)
  const registry = new A2aHubRegistry(domain)
  const messages = new A2aHubMessages(domain)
  const server = new A2aHubServer({ port: 0, registry, messages })
  const port = await server.listen()
  const hubUrl = `http://127.0.0.1:${port}`
  return { ctx, server, hubUrl, port, registry }
}

describe('A2aMeshService', () => {
  it('connects one presence per agent and routes injections to each', async () => {
    const { ctx, server, hubUrl, registry } = await harness()
    try {
      await registry.createProject('mesh')
      const agents = new Map([
        ['agent-a', agentStub('agent-a', 'idle')],
        ['agent-b', agentStub('agent-b', 'idle')],
      ])
      const meshCtx = ctx.isolate('a2aMesh').isolate('agents')
      meshCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
      const mesh = new A2aMeshService(meshCtx, { hubUrl, project: 'mesh', reconnectMs: 30 })
      const presenceEvents: Array<{ name: string; joined: boolean }> = []
      meshCtx.on('a2a/presence-changed', payload => presenceEvents.push({ name: payload.name, joined: payload.joined }))

      const statusA = await mesh.connect('agent-a', 'mesh', 'api')
      expect(statusA).toMatchObject({ connected: true, project: 'mesh', name: 'api', peers: [] })
      const statusB = await mesh.connect('agent-b', 'mesh', 'web')
      expect(statusB).toMatchObject({ connected: true, name: 'web' })
      expect(mesh.peers('agent-a').map(peer => peer.name)).toEqual(['web'])
      expect(mesh.peers('agent-b').map(peer => peer.name)).toEqual(['api'])
      expect(presenceEvents).toEqual([
        { name: 'api', joined: true },
        { name: 'web', joined: true },
      ])

      // A direct send reaches the other agent's stub as a follow-up turn.
      const accepted = await mesh.message({
        from: 'agent-a',
        target: { type: 'agent', name: 'web' },
        text: 'check the login contract',
      })
      expect(accepted.message.messageRef).toBe('mesh:1')
      expect(accepted.recipients).toEqual(['web'])
      await vi.waitFor(() => {
        const agent = agents.get('agent-b')
        if (agent === undefined || agent.followup.mock.calls.length === 0) {
          throw new Error('agent-b has not received the message yet')
        }
        const content = agent.followup.mock.calls[0]![0] as { content: Array<{ type: string; text: string }>; source: { kind: string } }
        expect(content.source.kind).toBe('a2a')
        const text = content.content.map(block => block.text).join('')
        expect(text).toContain('[a2a message] ref=mesh:1 from=api project=mesh')
        expect(text).toContain('check the login contract')
      }, { timeout: 5_000 })

      // The delivering side acknowledges; the sender observes the delivery.
      const deliveries: unknown[] = []
      meshCtx.on('a2a/delivery', delivery => deliveries.push(delivery))
      await vi.waitFor(() => {
        if (deliveries.length === 0) throw new Error('no delivery event yet')
      }, { timeout: 5_000 })
      expect(deliveries[0]).toMatchObject({ messageId: accepted.message.messageId, to: 'web', status: 'delivered' })

      // Disconnect drops the presence and emits the leave event.
      await mesh.disconnect('agent-b')
      await vi.waitFor(() => {
        if (mesh.peers('agent-a').length !== 0) throw new Error('peer not removed yet')
      }, { timeout: 5_000 })
      expect(presenceEvents.at(-1)).toEqual({ name: 'web', joined: false })
      expect(await mesh.disconnect('agent-b')).toBe(false)
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })

  it('broadcasts to the current roster and fails direct sends to absent names', async () => {
    const { ctx, server, hubUrl, registry } = await harness()
    try {
      await registry.createProject('mesh')
      const agents = new Map([
        ['agent-a', agentStub('agent-a', 'idle')],
        ['agent-b', agentStub('agent-b', 'idle')],
      ])
      const meshCtx = ctx.isolate('a2aMesh').isolate('agents')
      meshCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
      const mesh = new A2aMeshService(meshCtx, { hubUrl, project: 'mesh' })
      await mesh.connect('agent-a', 'mesh', 'api')
      await mesh.connect('agent-b', 'mesh', 'web')

      const broadcast = await mesh.message({
        from: 'agent-a',
        target: { type: 'project' },
        text: 'freeze the contract',
      })
      expect(broadcast.recipients).toEqual(['web'])
      await vi.waitFor(() => {
        const agent = agents.get('agent-b')
        if (agent === undefined || agent.followup.mock.calls.length === 0) {
          throw new Error('broadcast not delivered yet')
        }
      }, { timeout: 5_000 })

      await expect(mesh.message({
        from: 'agent-a',
        target: { type: 'agent', name: 'nobody' },
        text: 'hello?',
      })).rejects.toThrow(/recipient is not present/)

      await mesh.disconnect('agent-a')
      await mesh.disconnect('agent-b')
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })

  it('materializes inbound attachments and reuses history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'a2a-mesh-'))
    try {
      const { ctx, server, hubUrl, registry } = await harness()
      try {
        await registry.createProject('mesh')
        const source = join(root, 'handoff.md')
        await writeFile(source, '# Handoff\nseed=20\n', 'utf8')
        const agents = new Map([
          ['sender', agentStub('sender', 'idle')],
          ['receiver', agentStub('receiver', 'idle')],
        ])
        const senderCtx = ctx.isolate('a2aMesh').isolate('agents')
        senderCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
        const sender = new A2aMeshService(senderCtx, { hubUrl, project: 'mesh' })
        const receiverCtx = ctx.isolate('a2aMesh').isolate('agents')
        receiverCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
        const receiver = new A2aMeshService(receiverCtx, { hubUrl, project: 'mesh' })
        await sender.connect('sender', 'mesh', 'api')
        await receiver.connect('receiver', 'mesh', 'web')

        const accepted = await sender.message({
          from: 'sender',
          target: { type: 'agent', name: 'web' },
          text: 'training contract',
          attachments: [source],
        })
        expect(accepted.message.attachments).toHaveLength(1)
        expect(accepted.message.attachments[0]?.name).toBe('handoff.md')

        // The receiver's injected message references a materialized copy.
        let materializedPath: string | undefined
        await vi.waitFor(() => {
          const agent = agents.get('receiver')
          if (agent === undefined || agent.followup.mock.calls.length === 0) {
            throw new Error('receiver has not received the message yet')
          }
          const content = agent.followup.mock.calls[0]![0] as { content: Array<{ type: string; text: string }> }
          const text = content.content.map(block => block.text).join('')
          const match = text.match(/Attachments:\n- handoff\.md \(\d+ bytes\): (.+)/)
          if (match === null) throw new Error(`attachment line missing in: ${text}`)
          materializedPath = match[1]
        }, { timeout: 5_000 })
        const materialized = await import('node:fs/promises').then(fs => fs.readFile(materializedPath!, 'utf8'))
        expect(materialized).toBe('# Handoff\nseed=20\n')

        // History decodes the same message with the attachment bytes.
        const history = await receiver.history('receiver', { limit: 10 })
        expect(history).toHaveLength(1)
        expect(history[0]?.text).toBe('training contract')
        expect(history[0]?.attachments[0]?.name).toBe('handoff.md')
        expect(history[0]?.attachments[0]?.bytes.toString('utf8')).toBe('# Handoff\nseed=20\n')

        await sender.disconnect('sender')
        await receiver.disconnect('receiver')
      } finally {
        await server.close()
        await ctx.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('auto-connects the configured agent when it registers', async () => {
    const { ctx, server, hubUrl, registry } = await harness()
    try {
      await registry.createProject('mesh')
      const agent = agentStub('agent-a', 'idle')
      const meshCtx = ctx.isolate('a2aMesh').isolate('agents')
      meshCtx.provide('agents', { get: () => agent } as never)
      const mesh = new A2aMeshService(meshCtx, { hubUrl, project: 'mesh', agentId: 'agent-a', reconnectMs: 30 })
      // The stub registry never emits agent/created on its own; fire the
      // lifecycle event the real agent registry emits on registration.
      meshCtx.emit('agent/created', { agent: { id: 'agent-a' } } as never)
      await vi.waitFor(async () => {
        const status = await mesh.status('agent-a')
        if (!status.connected) throw new Error('not connected yet')
        expect(status.name).toBe('agent-a')
      }, { timeout: 5_000 })

      // An unexpected hub stop drops the presence; the membership stays
      // desired and the reconnect timer keeps retrying.
      await server.close()
      await vi.waitFor(async () => {
        const status = await mesh.status('agent-a')
          .catch(() => ({ connected: false, peers: [], projects: [] }))
        if (status.connected) throw new Error('still connected after hub stop')
      }, { timeout: 5_000 })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('persists per-session connections and rejoins them on registration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'a2a-mesh-'))
    try {
      const { ctx, server, hubUrl, registry } = await harness()
      try {
        await registry.createProject('mesh')
        const settingsFile = join(root, 'settings.yaml')

        // First lifetime: connecting records the session's connection.
        // The mesh and settings ride plugin fibers so the restart below can
        // dispose exactly them: `isolate()` creates no fiber of its own, so
        // disposing the isolated context's `fiber` would restart the whole
        // harness root instead.
        const agents = new Map([['agent-a', agentStub('agent-a', 'idle')]])
        const firstCtx = ctx.isolate('a2aMesh').isolate('agents')
        const firstSettingsFiber = await firstCtx.plugin(TestSettings, { path: settingsFile })
        firstCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
        const firstFiber = await firstCtx.plugin(A2aMeshService, { hubUrl, project: 'main', persistConnections: true })
        const first = firstCtx.a2aMesh
        await first.connect('agent-a', 'mesh', 'api')
        expect(await first.status('agent-a')).toMatchObject({ connected: true, project: 'mesh', name: 'api' })

        // Simulated restart: the mesh fiber goes away without an explicit
        // disconnect, so the persisted record survives.
        await firstFiber.dispose()
        await firstSettingsFiber.dispose()

        // Second lifetime over the same settings file: the session rejoins
        // its stored project and name when its agent registers.
        const secondCtx = ctx.isolate('a2aMesh').isolate('agents')
        await secondCtx.plugin(TestSettings, { path: settingsFile })
        secondCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
        await secondCtx.plugin(A2aMeshService, { hubUrl, project: 'main', persistConnections: true })
        const second = secondCtx.a2aMesh
        secondCtx.emit('agent/created', { agent: { id: 'agent-a' } } as never)
        await vi.waitFor(async () => {
          const status = await second.status('agent-a')
          if (!status.connected) throw new Error('session did not rejoin')
          expect(status).toMatchObject({ project: 'mesh', name: 'api' })
        }, { timeout: 5_000 })

        // An explicit disconnect forgets the record: a later registration
        // stays offline instead of rejoining.
        await second.disconnect('agent-a')
        secondCtx.emit('agent/created', { agent: { id: 'agent-a' } } as never)
        expect(await second.status('agent-a')).toMatchObject({ connected: false })
      } finally {
        await server.close()
        await ctx.fiber.dispose()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not throw on agent/created while the connections document is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'a2a-mesh-'))
    try {
      const ctx = new Context()
      const meshCtx = ctx.isolate('a2aMesh').isolate('agents')
      await meshCtx.plugin(TestSettings, { path: join(root, 'settings.yaml') })
      meshCtx.provide('agents', { get: () => undefined } as never)
      await meshCtx.plugin(A2aMeshService, { project: 'main', persistConnections: true })
      // A fresh settings document resolves `connections` to the schema default,
      // so a registration with no stored record must not index an undefined
      // key (it used to throw inside the agent/created listener).
      expect(() => { meshCtx.emit('agent/created', { agent: { id: 'session-x' } } as never) }).not.toThrow()
      await ctx.fiber.dispose()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('tracks conversation activity in the snapshot and a2a/change events', async () => {
    const { ctx, server, hubUrl, registry } = await harness()
    try {
      await registry.createProject('mesh')
      const agents = new Map([
        ['agent-a', agentStub('agent-a', 'idle')],
        ['agent-b', agentStub('agent-b', 'idle')],
      ])
      const meshCtx = ctx.isolate('a2aMesh').isolate('agents')
      meshCtx.provide('agents', { get: (id: string) => agents.get(id) } as never)
      const mesh = new A2aMeshService(meshCtx, { hubUrl, project: 'mesh', reconnectMs: 30 })
      const changes: A2aChange[] = []
      meshCtx.on('a2a/change', change => changes.push(change))
      const deliveries: unknown[] = []
      meshCtx.on('a2a/delivery', delivery => deliveries.push(delivery))

      await mesh.connect('agent-a', 'mesh', 'api')
      await mesh.connect('agent-b', 'mesh', 'web')

      // Idle baseline: every live presence reports idle.
      const baseline = await mesh.status('agent-a')
      if (!baseline.connected) throw new Error('expected a connected baseline')
      expect(baseline.activity).toMatchObject({ self: 'idle' })
      expect(Object.values(baseline.activity.peers)).toEqual(['idle'])
      changes.length = 0

      // A send makes both sides of the pair conversing.
      await mesh.message({
        from: 'agent-a',
        target: { type: 'agent', name: 'web' },
        text: 'let us talk',
      })
      const afterSend = await mesh.status('agent-a')
      if (!afterSend.connected) throw new Error('expected a connected status')
      const webPresence = afterSend.peers.find(peer => peer.name === 'web')!
      expect(afterSend.activity).toMatchObject({ self: 'conversing' })
      // The delivery ack may race the snapshot on a local hub: the peer is
      // either still conversing or already working, never idle.
      expect(['conversing', 'working']).toContain(afterSend.activity.peers[webPresence.presenceId])
      expect(changes.filter(change => change.scope === 'session' && change.agentId === 'agent-a').length).toBeGreaterThanOrEqual(1)

      // The delivery acknowledgment marks the recipient working.
      await vi.waitFor(() => {
        if (deliveries.length === 0) throw new Error('no delivery event yet')
      }, { timeout: 5_000 })
      const afterDelivery = await mesh.status('agent-a')
      if (!afterDelivery.connected) throw new Error('expected a connected status')
      expect(afterDelivery.activity.peers[webPresence.presenceId]).toBe('working')

      // The receiver works while its agent runs on the inbound message.
      await vi.waitFor(() => {
        const agent = agents.get('agent-b')
        if (agent === undefined || agent.followup.mock.calls.length === 0) {
          throw new Error('agent-b has not received the message yet')
        }
      }, { timeout: 5_000 })
      agents.get('agent-b')!.status = 'running'
      const busyStatus = await mesh.status('agent-b')
      if (!busyStatus.connected) throw new Error('expected a connected status')
      const apiPresence = busyStatus.peers.find(peer => peer.name === 'api')!
      expect(busyStatus.activity).toMatchObject({ self: 'working' })
      expect(busyStatus.activity.peers[apiPresence.presenceId]).toBe('conversing')

      // Idle ends the local working state; the pair keeps conversing.
      agents.get('agent-b')!.status = 'idle'
      meshCtx.emit('agent/status', { agent: { id: 'agent-b' }, status: 'idle' } as never)
      const idleStatus = await mesh.status('agent-b')
      if (!idleStatus.connected) throw new Error('expected a connected status')
      expect(idleStatus.activity).toMatchObject({ self: 'conversing' })
      expect(changes.filter(change => change.scope === 'session' && change.agentId === 'agent-b').length).toBeGreaterThanOrEqual(1)
    } finally {
      await server.close()
      await ctx.fiber.dispose()
    }
  })

  it('fails loud when there is no hub and no in-process host', async () => {
    const ctx = new Context()
    const agent = agentStub('agent-a', 'idle')
    ctx.provide('agents', { get: () => agent } as never)
    const mesh = new A2aMeshService(ctx, { project: 'mesh', agentId: 'agent-a' })
    await expect(mesh.connect('agent-a')).rejects.toThrow(/no hubUrl/)
    await ctx.fiber.dispose()
  })
})
