/**
 * `/a2a` command surface over a stub mesh.
 */

// oxlint-disable typescript/unbound-method -- stub recorders are bound vi.fn arrows

import { describe, expect, it, vi } from 'vitest'
import { handleA2a } from '../src/commands.ts'
import type { A2aMeshService } from '../src/mesh.ts'

function stubMesh(overrides: Partial<A2aMeshService> = {}): A2aMeshService {
  return {
    status: vi.fn(async () => ({
      connected: true, project: 'mesh', name: 'a', presenceId: 'p-a',
      peers: [{ name: 'b', presenceId: 'p-b' }],
      projects: [],
    })),
    peers: vi.fn(() => [{ name: 'b', presenceId: 'p-b' }]),
    connect: vi.fn(async (agentId: string, project: string, name?: string) => ({
      connected: true, project, name: name ?? agentId, presenceId: 'p-new',
      peers: [], projects: [],
    })),
    disconnect: vi.fn(async () => true),
    message: vi.fn(async () => ({
      message: {
        messageId: 'm1', messageRef: 'mesh:1', project: 'mesh', sequence: 1,
        from: { name: 'a', presenceId: 'p-a' }, target: { type: 'agent', name: 'b' },
        text: 'hi', attachments: [], createdAt: 0,
      },
      recipients: ['b'],
    })),
    history: vi.fn(async () => []),
    createProject: vi.fn(async (name: string) => ({ name, createdAt: 0 })),
    listProjects: vi.fn(async () => [{ name: 'mesh', createdAt: 0 }]),
    deleteProject: vi.fn(async () => true),
    ...overrides,
  } as unknown as A2aMeshService
}

const AGENT = 'session-a'

describe('/a2a command surface', () => {
  it('shows hub status', async () => {
    const outcome = await handleA2a(stubMesh(), AGENT, 'hub status')
    expect(outcome.kind).toBe('success')
    expect(outcome.text).toContain('Project: mesh')
    expect(outcome.text).toContain('Name: a')
    expect(outcome.text).toContain('Peers: 1')
  })

  it('creates, lists, and deletes projects', async () => {
    const mesh = stubMesh()
    expect(await handleA2a(mesh, AGENT, 'project create billing')).toEqual({
      kind: 'success',
      text: 'Created Project billing',
    })
    expect(mesh.createProject).toHaveBeenCalledWith('billing', expect.objectContaining({}))
    expect(await handleA2a(mesh, AGENT, 'project list')).toEqual({
      kind: 'success',
      text: '- mesh',
    })
    expect(await handleA2a(mesh, AGENT, 'project delete mesh')).toEqual({
      kind: 'success',
      text: 'Deleted Project mesh',
    })
    const missing = stubMesh({ deleteProject: vi.fn(async () => false) })
    expect(await handleA2a(missing, AGENT, 'project delete nope')).toEqual({
      kind: 'success',
      text: 'Project nope does not exist',
    })
  })

  it('connects and disconnects a presence', async () => {
    const mesh = stubMesh()
    expect(await handleA2a(mesh, AGENT, 'connect demo --as api')).toEqual({
      kind: 'success',
      text: 'Connected to demo as api\nNo other Agents.',
    })
    expect(mesh.connect).toHaveBeenCalledWith('session-a', 'demo', 'api')
    expect(await handleA2a(mesh, AGENT, 'disconnect')).toEqual({
      kind: 'success',
      text: 'Disconnected.',
    })
    const notConnected = stubMesh({ disconnect: vi.fn(async () => false) })
    expect(await handleA2a(notConnected, AGENT, 'disconnect')).toEqual({
      kind: 'success',
      text: 'A2A is not connected.',
    })
  })

  it('lists the roster and queries history', async () => {
    const mesh = stubMesh()
    expect(await handleA2a(mesh, AGENT, 'peers')).toEqual({ kind: 'success', text: 'b' })
    const history = stubMesh({ history: vi.fn(async () => [{
      messageId: 'm1', messageRef: 'mesh:1', project: 'mesh', sequence: 1,
      from: { name: 'b', presenceId: 'p-b' }, target: { type: 'project' as const },
      text: 'earlier', attachments: [], createdAt: 0,
    }]) })
    const outcome = await handleA2a(history, AGENT, 'history --limit 5')
    expect(outcome.kind).toBe('success')
    expect(outcome.text).toBe('[mesh:1] b -> project\nearlier')
    expect(history.history).toHaveBeenCalledWith('session-a', { limit: 5 })
    const empty = stubMesh({ history: vi.fn(async () => []) })
    expect(await handleA2a(empty, AGENT, 'history')).toEqual({ kind: 'success', text: 'No messages.' })
  })

  it('shows usage for unknown or malformed subcommands', async () => {
    const mesh = stubMesh()
    const unknown = await handleA2a(mesh, AGENT, 'frobnicate')
    expect(unknown.kind).toBe('error')
    expect(unknown.text).toContain('/a2a connect')
    expect((await handleA2a(mesh, AGENT, 'help')).kind).toBe('success')
    expect((await handleA2a(mesh, AGENT, 'project create')).kind).toBe('error')
    expect((await handleA2a(mesh, AGENT, 'connect')).kind).toBe('error')
  })

  it('folds mesh failures into error outcomes', async () => {
    const mesh = stubMesh({ peers: vi.fn(() => { throw new Error('not connected: run /a2a connect first') }) })
    const outcome = await handleA2a(mesh, AGENT, 'peers')
    expect(outcome).toEqual({ kind: 'error', text: 'not connected: run /a2a connect first' })
  })
})
