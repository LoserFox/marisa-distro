/**
 * dsh-artifact: real Cordis composition (SessionStore + SystemPrompt +
 * ToolRuntime + the plugin); asserts the model-visible result and the
 * presentation meta descriptor through the registry, as dsh would call it.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as DshArtifact from '../src/index.ts'

const activeContexts: Context[] = []
const tempDirs: string[] = []
let calls = 0

afterEach(async () => {
  for (const ctx of activeContexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function setup(): Promise<Context> {
  const ctx = new Context()
  activeContexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(DshArtifact)
  return ctx
}

async function tempFile(name: string, content = 'hello'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-artifact-'))
  tempDirs.push(dir)
  const file = join(dir, name)
  await writeFile(file, content)
  return file
}

async function callTool(ctx: Context, args: unknown): Promise<ToolExecutionResult> {
  const caller = ctx.sessions.create(SessionId(`caller-${++calls}`), { meta: { createdAt: 1, cwd: '/work' } })
  caller.append('turn/start', { turn: 1, trigger: { kind: 'message', source: { kind: 'user' } } })
  caller.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  const agent = { id: caller.id, session: caller } as never
  return ctx.tools.execute({
    name: 'send_artifact',
    arguments: args,
    callId: CallId(`call-${++calls}`),
    signal: new AbortController().signal,
    agent,
  })
}

function text(result: ToolExecutionResult): string {
  return result.content.map(block => block.type === 'text' ? block.text : '').join('\n')
}

describe('send_artifact', () => {
  it('delivers a file and carries the descriptor in the presentation meta', async () => {
    const ctx = await setup()
    const file = await tempFile('report.md', '# hi')

    const result = await callTool(ctx, { path: file, caption: 'Weekly report' })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toContain('report.md')
    const meta = (result as { meta?: unknown }).meta as Record<string, unknown>
    expect(meta).toMatchObject({
      kind: 'artifact',
      artifactKind: 'markdown',
      name: 'report.md',
      mimeType: 'text/markdown',
      caption: 'Weekly report',
      sizeBytes: 4,
    })
  })

  it('rejects relative paths and missing files with actionable errors', async () => {
    const ctx = await setup()
    const relative = await callTool(ctx, { path: 'report.md' })
    expect(relative.isError).toBe(true)
    expect(text(relative)).toMatch(/must be absolute/)

    const missing = await callTool(ctx, { path: '/nonexistent/report.md' })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toMatch(/file not found/)
  })

  it('classifies kinds by extension with a safe fallback', () => {
    expect(DshArtifact.describeArtifact('/a/b.png', null, 1).artifactKind).toBe('image')
    expect(DshArtifact.describeArtifact('/a/b.pdf', null, 1).artifactKind).toBe('pdf')
    expect(DshArtifact.describeArtifact('/a/b.xyz', null, 1)).toMatchObject({
      artifactKind: 'other',
      mimeType: 'application/octet-stream',
    })
  })

  it('teaches the model to deliver files via the system prompt', async () => {
    const ctx = await setup()
    const assembly = await ctx.systemPrompt.assemble({ cwd: '/work' } as never)
    const section = assembly.sections.find(s => s.name === 'tool:dsh-artifact')
    expect(String(section?.text)).toMatch(/send_artifact/)
  })
})
