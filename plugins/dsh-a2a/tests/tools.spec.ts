/**
 * a2a tool family: registration and execute over a stub mesh.
 */

// oxlint-disable typescript/unbound-method -- stub recorders are bound vi.fn arrows

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply, buildTools } from '../src/tools.ts'
import type { A2aMeshService, A2aMessageView } from '../src/mesh.ts'
import { ASYNC_REPLY_GUIDANCE } from '../src/mesh.ts'

function messageView(overrides: Partial<A2aMessageView> = {}): A2aMessageView {
  return {
    messageId: 'm1',
    messageRef: 'mesh:1',
    project: 'mesh',
    sequence: 1,
    from: { name: 'b', presenceId: 'p-b' },
    target: { type: 'agent', name: 'a' },
    text: 'hello back',
    attachments: [],
    createdAt: 0,
    ...overrides,
  }
}

function stubMesh(overrides: Partial<A2aMeshService> = {}): A2aMeshService {
  return {
    status: vi.fn(async () => ({
      connected: true, project: 'mesh', name: 'a', presenceId: 'p-a',
      peers: [{ name: 'b', presenceId: 'p-b' }],
      projects: [],
    })),
    peers: vi.fn(() => [{ name: 'b', presenceId: 'p-b' }]),
    message: vi.fn(async (options: { target: { type: 'agent' | 'project'; name?: string }; text: string }) => ({
      message: messageView({
        target: options.target.type === 'project'
          ? { type: 'project' }
          : { type: 'agent', name: options.target.name as string },
      }),
      recipients: options.target.type === 'project' ? ['b'] : [options.target.name as string],
    })),
    history: vi.fn(async () => [messageView()]),
    ...overrides,
  } as unknown as A2aMeshService
}

const exec = { agent: { id: 'session-a' } } as never

describe('a2a tools', () => {
  it('a2a_peers lists the current roster names', async () => {
    const mesh = stubMesh()
    const tools = buildTools(mesh)
    const peers = tools.find(tool => tool.name === 'a2a_peers')!
    const outcome = await (peers.execute as (args: Record<string, never>, e: never) => Promise<{ text: string }>)({}, exec)
    expect(outcome.text).toBe('b')
    expect(mesh.peers).toHaveBeenCalledWith('session-a')
  })

  it('a2a_peers reports an empty roster', async () => {
    const mesh = stubMesh({ peers: vi.fn(() => []) })
    const outcome = await (buildTools(mesh).find(tool => tool.name === 'a2a_peers')!.execute as (args: Record<string, never>, e: never) => Promise<{ text: string }>)({}, exec)
    expect(outcome.text).toBe('No other Agents are present.')
  })

  it('a2a_message sends to one peer and reports the accepted reference', async () => {
    const mesh = stubMesh()
    const tools = buildTools(mesh)
    const message = tools.find(tool => tool.name === 'a2a_message')!
    const outcome = await (message.execute as (args: Record<string, unknown>, e: never) => Promise<{ text: string }>)({
      target: { type: 'agent', name: 'b' },
      text: 'check the login contract',
    }, exec)
    expect(outcome.text).toContain('Sent to b ref=mesh:1 attachments=0')
    expect(outcome.text).toContain(ASYNC_REPLY_GUIDANCE)
    expect(mesh.message).toHaveBeenCalledWith(expect.objectContaining({
      from: 'session-a',
      target: { type: 'agent', name: 'b' },
      text: 'check the login contract',
    }))
  })

  it('a2a_message broadcasts to the project', async () => {
    const mesh = stubMesh()
    const message = buildTools(mesh).find(tool => tool.name === 'a2a_message')!
    const outcome = await (message.execute as (args: Record<string, unknown>, e: never) => Promise<{ text: string }>)({
      target: { type: 'project' },
      text: 'freeze the contract',
    }, exec)
    expect(outcome.text).toContain('Sent to 1 Agents ref=mesh:1')
    expect(mesh.message).toHaveBeenCalledWith(expect.objectContaining({
      target: { type: 'project' },
    }))
  })

  it('a2a_history formats earlier project messages', async () => {
    const mesh = stubMesh({ history: vi.fn(async () => [
      messageView({ messageRef: 'mesh:2', from: { name: 'web', presenceId: 'p-web' }, target: { type: 'project' }, text: 'persisted', replyTo: 'mesh:1' }),
      messageView({ messageRef: 'mesh:1' }),
    ]) })
    const history = buildTools(mesh).find(tool => tool.name === 'a2a_history')!
    const outcome = await (history.execute as (args: Record<string, unknown>, e: never) => Promise<{ text: string }>)({ limit: 10 }, exec)
    expect(outcome.text).toBe('[mesh:2] web -> project replyTo=mesh:1\npersisted\n\n[mesh:1] b -> a\nhello back')
    expect(mesh.history).toHaveBeenCalledWith('session-a', { limit: 10 })
  })

  it('a2a_history reports an empty history', async () => {
    const mesh = stubMesh({ history: vi.fn(async () => []) })
    const history = buildTools(mesh).find(tool => tool.name === 'a2a_history')!
    const outcome = await (history.execute as (args: Record<string, unknown>, e: never) => Promise<{ text: string }>)({}, exec)
    expect(outcome.text).toBe('No messages.')
  })

  it('renders tool results as text blocks', () => {
    const tools = buildTools(stubMesh())
    const peers = tools.find(tool => tool.name === 'a2a_peers')!
    const rendered = peers.output.render({}, { text: 'hello' })
    expect(rendered).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('registers the tool family on ctx.tools and disposes on fiber teardown', async () => {
    const ctx = new Context()
    const registered: Array<{ name: string }> = []
    let disposer: () => void = () => {}
    ctx.provide('tools', {
      register: (definition: { name: string }) => {
        registered.push(definition)
        disposer = vi.fn()
        return disposer
      },
    } as never)
    ctx.provide('a2aMesh', stubMesh() as never)
    await ctx.plugin(apply)
    expect(registered.map(tool => tool.name)).toEqual(['a2a_peers', 'a2a_message', 'a2a_history'])
    await ctx.fiber.dispose()
    expect(disposer).toHaveBeenCalled()
  })
})
