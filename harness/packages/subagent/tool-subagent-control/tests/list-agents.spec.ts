import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentService from '@deepseek-ai/dsh-subagent'
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as tool from '../src/list-agents.ts'

const testToolSignal = new AbortController().signal

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  const root = mkdtempSync(join(tmpdir(), 'dsh-tool-list-agents-'))
  roots.push(root)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SubagentService)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  await ctx.plugin(tool)
  ctx.llm.registerAdapter(['mock'], new MockAdapter(script))
  const parent = ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { ctx, parent }
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

let calls = 0
function callTool(
  ctx: Context,
  name: string,
  args: unknown,
  agent?: unknown,
  signal: AbortSignal = testToolSignal,
) {
  return ctx.tools.execute({
    signal,
    callId: CallId(`call-${++calls}`),
    name,
    arguments: args,
    ...agent !== undefined ? { agent: agent as never } : {},
  })
}

/** Wait until a continuable child released its current Activation. */
async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => {
    expect(ctx.agents.get(childId)).toBeUndefined()
  }, { timeout: 5_000 })
}

describe('dsh-tool-subagent-control/list-agents', () => {
  it('registers list_agents once, globally, with no parameters', async () => {
    const { ctx } = await setup([])
    const schemas = ctx.tools.schemas().filter(schema => schema.name === 'list_agents')
    expect(schemas).toHaveLength(1)
    const props = (schemas[0]!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props)).toEqual([])
    expect(schemas[0]!.description).toContain('send_message')
  })

  it('renders the empty result as (no subagents)', async () => {
    const { ctx, parent } = await setup([])
    await ctx.sessions.flush(parent.session)
    const result = await callTool(ctx, 'list_agents', {}, parent)
    expect(result.isError).toBe(false)
    expect(text(result)).toBe('(no subagents)')
  })

  it('renders children and diagnostics in array order with the fixed text forms', async () => {
    const { ctx, parent } = await setup([textResponse('done')])
    const started = await ctx.subagents.startContinuable({
      provider: 'spawn',
      label: 'real child',
      request: { prompt: [{ type: 'text', text: 'child task' }], parent },
      signal: testToolSignal,
    })
    await waitNoActivation(ctx, started.childId)
    // Pin the render deterministically past the service: the tool is a thin
    // adapter, so its fixed text forms are what this test pins.
    const entries: SubagentListEntry[] = [
      {
        kind: 'child',
        id: SessionId('one-shot-child'),
        label: 'finished once',
        mode: 'one-shot',
        activity: 'inactive',
        hasChildren: false,
      },
      {
        kind: 'child',
        id: started.childId,
        label: 'real child',
        mode: 'continuable',
        activity: 'inactive',
        hasChildren: false,
      },
      {
        kind: 'child',
        id: SessionId('running-child'),
        label: 'still working',
        mode: 'continuable',
        activity: 'running',
        hasChildren: true,
      },
      { kind: 'diagnostic', id: SessionId('broken-child'), reason: 'corrupt' },
    ]
    ctx.subagents.listChildren = () => { return Promise.resolve(entries) }
    const result = await callTool(ctx, 'list_agents', {}, parent)
    expect(result.isError).toBe(false)
    expect(text(result)).toBe(
      `${started.childId} [complete] — real child\n`
      + 'running-child [running] — still working\n'
      + 'broken-child [diagnostic: corrupt]',
    )
  })

  it('forwards the tool cancellation signal to child enumeration', async () => {
    const { ctx, parent } = await setup([])
    const signal = new AbortController().signal
    const listChildren = vi.spyOn(ctx.subagents, 'listChildren').mockResolvedValue([])

    const result = await callTool(ctx, 'list_agents', {}, parent, signal)

    expect(result.isError).toBe(false)
    expect(listChildren).toHaveBeenCalledWith(parent.id, signal)
  })

  it('lists a real settled continuable child and omits a real one-shot sibling', async () => {
    const { ctx, parent } = await setup([textResponse('once'), textResponse('done')])
    const oneShot = await ctx.subagents.start('spawn', {
      label: 'finished once',
      prompt: [{ type: 'text', text: 'one-shot task' }],
      parent,
      signal: new AbortController().signal,
    })
    await oneShot.result
    await oneShot.dispose()
    const started = await ctx.subagents.startContinuable({
      provider: 'spawn',
      label: 'summarize the doc',
      request: { prompt: [{ type: 'text', text: 'child task' }], parent },
      signal: testToolSignal,
    })
    await waitNoActivation(ctx, started.childId)
    const result = await callTool(ctx, 'list_agents', {}, parent)
    expect(result.isError).toBe(false)
    expect(text(result)).toBe(`${started.childId} [complete] — summarize the doc`)
  })

  it('fails loud when invoked without a calling agent', async () => {
    const { ctx } = await setup([])
    const result = await callTool(ctx, 'list_agents', {})
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('requires a calling agent')
  })

  it('unregisters with its plugin fiber (HMR safety)', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(SubagentService)
    const fiber = await ctx.plugin(tool)
    expect(ctx.tools.schemas().some(schema => schema.name === 'list_agents')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(schema => schema.name === 'list_agents')).toBe(false)
  })

  it('has the namespace-plugin export shape', () => {
    expect('default' in tool).toBe(false)
    expect(tool.name).toBe('tool-subagent-list-agents')
    expect(tool.inject).toEqual(['tools', 'subagents'])
    expect(typeof tool.apply).toBe('function')
  })
})
