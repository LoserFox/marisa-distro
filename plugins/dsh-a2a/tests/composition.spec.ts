/**
 * Real composition: the entry plugin over the storage stack, with a hub
 * host, mesh clients, and the tool/command surfaces — one connected
 * workspace receiving an injected message end to end.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { apply as a2aApply, A2aHubHostService, decodeTextPayload } from '../src/index.ts'
import { A2aMeshService } from '../src/index.ts'

/** Mount the storage stack manually (the workspace-spec pattern). */
async function mountStorage(ctx: Context): Promise<void> {
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: ':memory:', journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
}

async function harness(options: { mesh?: boolean } = {}) {
  const ctx = new Context()
  await mountStorage(ctx)
  await ctx.plugin(a2aApply, {
    hub: { host: '127.0.0.1', port: 0 },
    ...(options.mesh === false
      ? {}
      : {
        mesh: { hubUrl: 'http://127.0.0.1:0', project: 'mesh', agentId: 'agent-a' },
      }),
  })
  const hub = ctx.get('a2aHub')
  // The hub binds on an ephemeral port asynchronously; wait for it.
  if (hub !== undefined) {
    await vi.waitFor(() => {
      if (hub.port === undefined) throw new Error('hub not listening yet')
    }, { timeout: 2000 })
  }
  const port = hub?.port
  return { ctx, hub, port }
}

describe('a2a composition', () => {
  it('mounts the hub host and opens the registry/messages over sqlite', async () => {
    const { ctx, hub, port } = await harness({ mesh: false })
    expect(hub).toBeDefined()
    expect(port).toBeGreaterThan(0)
    expect(hub!.registryService.listProjects()).toEqual([])
    await ctx.fiber.dispose()
  })

  it('mounts the mesh client with the tool and command surfaces', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    const tools: unknown[] = []
    ctx.provide('tools', { register: (definition: unknown) => {
      tools.push(definition)
      return () => {}
    } } as never)
    type CommandDef = { name: string; handler: (invocation: { agent: { id: string }; rawInput: string }) => Promise<unknown> }
    const commands: Array<{ definition: CommandDef }> = []
    ctx.provide('commands', { register: (definition: CommandDef) => {
      commands.push({ definition })
      return () => {}
    } } as never)
    const agent = { id: 'agent-a', status: 'idle', followup: vi.fn(), inject: vi.fn() }
    ctx.provide('agents', { get: () => agent } as never)
    await ctx.plugin(a2aApply, {
      hub: { host: '127.0.0.1', port: 0 },
      mesh: { hubUrl: 'http://127.0.0.1:1', project: 'mesh', agentId: 'agent-a' },
    })
    const mesh = ctx.get('a2aMesh') as A2aMeshService
    expect(mesh).toBeDefined()
    await vi.waitFor(() => {
      expect(tools).toHaveLength(3)
    }, { timeout: 2000 })
    expect(tools.map(t => (t as { name: string }).name)).toEqual(['a2a_peers', 'a2a_message', 'a2a_history'])
    expect(commands).toHaveLength(1)
    expect(commands[0]!.definition.name).toBe('a2a')
    // The registered handler routes through the mesh service (the fake hub
    // URL makes the call fail into a command error rather than throwing).
    const outcome = await commands[0]!.definition.handler({ agent: { id: 'agent-a' }, rawInput: 'hub status' }) as { kind: string }
    expect(['success', 'error']).toContain(outcome.kind)
    await ctx.fiber.dispose()
  })

  it('mounts the hub service without a server config', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    await ctx.plugin(A2aHubHostService)
    const hub = ctx.get('a2aHub') as A2aHubHostService
    expect(hub.port).toBeUndefined()
    expect(hub.url).toBeUndefined()
    await vi.waitFor(() => {
      expect(hub.registryService.listProjects()).toEqual([])
    })
    await ctx.fiber.dispose()
  })

  it('mounts the hub server with a default host', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    await ctx.plugin(a2aApply, { hub: { port: 0 } })
    const hub = ctx.get('a2aHub') as A2aHubHostService
    await vi.waitFor(() => {
      if (hub.port === undefined) throw new Error('hub not listening')
    }, { timeout: 2000 })
    expect(hub.port).toBeGreaterThan(0)
    expect(hub.url).toBe(`http://127.0.0.1:${hub.port}`)
    await ctx.fiber.dispose()
  })

  it('mounts the hub with a maxPort range', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    await ctx.plugin(a2aApply, { hub: { host: '127.0.0.1', port: 0, maxPort: 65535 } })
    const hub = ctx.get('a2aHub') as A2aHubHostService
    await vi.waitFor(() => {
      if (hub.port === undefined) throw new Error('hub not listening')
    }, { timeout: 2000 })
    expect(hub.port).toBeGreaterThan(0)
    expect(hub.url).toBe(`http://127.0.0.1:${hub.port}`)
    await ctx.fiber.dispose()
  })

  it('mounts the mesh client without a hub host', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    const agent = { id: 'agent-a', status: 'idle', followup: vi.fn(), inject: vi.fn() }
    ctx.provide('agents', { get: () => agent } as never)
    await ctx.plugin(a2aApply, {
      mesh: { hubUrl: 'http://127.0.0.1:1', project: 'mesh', agentId: 'agent-a' },
    })
    expect(ctx.get('a2aHub')).toBeUndefined()
    expect(ctx.get('a2aMesh')).toBeDefined()
    await ctx.fiber.dispose()
  })

  it('follows the in-process hub when the mesh omits hubUrl', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    const agent = { id: 'agent-a', status: 'idle', followup: vi.fn(), inject: vi.fn() }
    ctx.provide('agents', { get: () => agent } as never)
    await ctx.plugin(a2aApply, {
      hub: { host: '127.0.0.1', port: 0 },
      mesh: { project: 'mesh', agentId: 'agent-a' },
    })
    const hub = ctx.get('a2aHub') as A2aHubHostService
    await vi.waitFor(() => {
      if (hub.port === undefined) throw new Error('hub not listening yet')
    }, { timeout: 2000 })
    await hub.registryService.createProject('mesh')
    const mesh = ctx.get('a2aMesh') as A2aMeshService
    const status = await mesh.connect('agent-a')
    expect(status.connected).toBe(true)
    if (!status.connected) throw new Error('expected a live mesh connection')
    expect(status.project).toBe('mesh')
    await mesh.disconnect()
    await ctx.fiber.dispose()
  })

  it('fails loud when the mesh omits hubUrl and no hub is mounted', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    const agent = { id: 'agent-a', status: 'idle', followup: vi.fn(), inject: vi.fn() }
    ctx.provide('agents', { get: () => agent } as never)
    await ctx.plugin(a2aApply, {
      mesh: { project: 'mesh', agentId: 'agent-a' },
    })
    const mesh = ctx.get('a2aMesh') as A2aMeshService
    await expect(mesh.connect('agent-a')).rejects.toThrow(/no hubUrl/)
    await ctx.fiber.dispose()
  })

  it('ignores legacy 0.2 mesh config fields at load', async () => {
    const ctx = new Context()
    await mountStorage(ctx)
    // 0.2 fields name behaviors that no longer exist; they are ignored so a
    // copied old cordis.yml keeps loading without a breaking error.
    await expect(ctx.plugin(a2aApply, {
      mesh: {
        hubUrl: 'http://127.0.0.1:1',
        project: 'mesh',
        agentId: 'agent-a',
        persistBindings: true,
        autoRejoin: true,
        pollIntervalMs: 1000,
        heartbeatMs: 5000,
        caps: ['api'],
      } as never,
    })).resolves.toBeTruthy()
    await ctx.fiber.dispose()
  })

  it('drives a full round trip through the composed services', async () => {
    const { ctx, port } = await harness({ mesh: false })
    try {
      const hub = ctx.get('a2aHub') as A2aHubHostService
      await hub.registryService.createProject('mesh')
      const senderAgent = { id: 'sender', status: 'idle', followup: vi.fn(), inject: vi.fn() }
      const sender = new Context()
      sender.provide('agents', { get: () => senderAgent } as never)
      const senderMesh = new A2aMeshService(sender, {
        hubUrl: `http://127.0.0.1:${port}`,
        project: 'mesh',
      })
      await senderMesh.connect('sender', 'mesh', 'api')
      // Sending to an absent name fails immediately — no latent work.
      await expect(senderMesh.message({
        from: 'sender',
        target: { type: 'agent', name: 'nobody' },
        text: 'hello',
      })).rejects.toThrow(/recipient is not present/)
      // Broadcasts land in the message store even with no recipients.
      const accepted = await senderMesh.message({
        from: 'sender',
        target: { type: 'project' },
        text: 'hello',
      })
      expect(accepted.message.messageRef).toBe('mesh:1')
      const stored = hub.messagesService.get('mesh:1')
      expect(stored).not.toBeNull()
      expect(decodeTextPayload(stored!.payload)).toBe('hello')
      await senderMesh.disconnect('sender')
      await sender.fiber.dispose()
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

it('logs the domain-open failure loud when the hub cannot start', async () => {
  const ctx = new Context()
  const errors: unknown[] = []
  ctx.logger.error = ((message: unknown) => { errors.push(message) }) as typeof ctx.logger.error
  // The storage service is present but its open refuses (a version-
  // mismatched medium): the hub's activation failure surfaces as an
  // explicit error instead of a silent hub-less mesh.
  ctx.provide('storageDomain', {
    open: async () => { throw new Error('version mismatch: medium stamped 2, spec 3') },
  } as never)
  await ctx.plugin(a2aApply, { hub: { host: '127.0.0.1', port: 0 } })
  await vi.waitFor(() => {
    expect(errors.some(message => String(message).includes('a2aHub: failed to open'))).toBe(true)
  }, { timeout: 2000 })
  await ctx.fiber.dispose()
})
