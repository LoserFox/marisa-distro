/**
 * Integration smoke: mount a real storage hub + json backend + tools registry,
 * apply the track plugin, and assert the four tools register and the
 * store round-trips through an actual json unit on disk.
 * @module tests/integration.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import Storage from '@deepseek-ai/dsh-storage'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { apply as applyStorageJson } from '@deepseek-ai/dsh-storage-json'
import { apply as applyTrack } from '../src/index.ts'
import { trackStore, store } from '../src/index.ts'

describe('track integration with real storage', () => {
  let ctx: Context
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'track-int-'))
    ctx = new Context()
    // Mount the service chain: storage hub → system-prompt → tool registry.
    // Apply track BEFORE the json backend registers — the web boot mounts
    // storage-json concurrently with this plugin, and resolveKv must poll for
    // the backend instead of failing on the first (empty) check.
    await ctx.plugin(Storage)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRegistry)
    applyTrack(ctx, { teamKey: 'INV' } as never)
    await new Promise((r) => setTimeout(r, 300))
    expect(store.isOpen).toBe(false)
    applyStorageJson(ctx, { root: dir })
    // Let effects (store open) settle.
    await new Promise((r) => setTimeout(r, 1000))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('opens the track kv unit on the json backend', async () => {
    // The plugin polls for the backend on a 200ms tick, so wait for the open
    // instead of a fixed sleep.
    const deadline = Date.now() + 5000
    while (!store.isOpen && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(store.isOpen).toBe(true)
  })

  it('registers the four track tools on ctx.tools', () => {
    const registry = ctx.tools as unknown as { get: (name: string) => unknown }
    for (const name of ['capture_thought', 'report_decision_point', 'track_create_issue', 'track_list_issues']) {
      expect(registry.get(name), `tool ${name} should be registered`).toBeDefined()
    }
  })

  it('round-trips a capture and mints an identifier through the real unit', async () => {
    const id = await trackStore.nextIdentifier('INV')
    expect(id).toMatch(/^INV-\d+$/)
  })

  it('writes a capture to the real json unit on disk and reads it back', async () => {
    const id = 'track_capture_e2e_check'
    await trackStore.upsertCapture({
      id,
      content: 'end-to-end check',
      source: 'user',
      status: 'open',
      tags: [],
      createdAt: new Date().toISOString(),
    })
    const caps = await trackStore.listCaptures()
    expect(caps.some((c) => c.id === id)).toBe(true)
    expect(store.isOpen).toBe(true)
  })

  it('deletes a capture from the real unit', async () => {
    const id = 'track_capture_delete_check'
    await trackStore.upsertCapture({
      id,
      content: 'to be deleted',
      source: 'user',
      status: 'open',
      tags: [],
      createdAt: new Date().toISOString(),
    })
    expect((await trackStore.listCaptures()).some((c) => c.id === id)).toBe(true)
    await trackStore.deleteCapture(id)
    expect((await trackStore.listCaptures()).some((c) => c.id === id)).toBe(false)
  })

  it('promotes a capture into an issue and flips the capture to promoted', async () => {
    const id = 'track_capture_promote_check'
    await trackStore.upsertCapture({
      id,
      content: 'promote me into a task',
      source: 'user',
      status: 'open',
      tags: ['future'],
      createdAt: new Date().toISOString(),
    })
    const issue = await trackStore.promoteCaptureToIssue(id, 'INV')
    expect(issue.title).toBe('promote me into a task')
    expect(issue.identifier).toMatch(/^INV-\d+$/)
    expect(issue.labels).toContain('future')
    const after = await trackStore.getCapture(id)
    expect(after?.status).toBe('promoted')
    expect(after?.promotedToIssueId).toBe(issue.id)
  })

  it('promoting an already-promoted capture returns the existing issue (dedup)', async () => {
    const id = 'track_capture_promote_dedup'
    await trackStore.upsertCapture({
      id,
      content: 'dedup promote',
      source: 'user',
      status: 'open',
      tags: [],
      createdAt: new Date().toISOString(),
    })
    const first = await trackStore.promoteCaptureToIssue(id, 'INV')
    const second = await trackStore.promoteCaptureToIssue(id, 'INV')
    expect(second.id).toBe(first.id)
  })

  it('appends audit entries and summarizes a funnel from the real unit', async () => {
    await trackStore.appendAudit({
      id: 'track_audit_a1',
      tool: 'capture_thought',
      ts: Date.now(),
      sessionId: 'session-x',
      ok: true,
      detail: 'track_capture_x',
    })
    await trackStore.appendAudit({
      id: 'track_audit_a2',
      tool: 'track_create_issue',
      ts: Date.now(),
      ok: false,
      detail: 'boom',
    })
    const audit = await trackStore.listAudit()
    expect(audit.some((a) => a.id === 'track_audit_a1' && a.ok)).toBe(true)

    const funnel = await trackStore.funnel()
    expect(funnel.tools['capture_thought']?.calls).toBe(1)
    expect(funnel.tools['track_create_issue']?.fail).toBe(1)
    expect(typeof funnel.captures.open).toBe('number')
    expect(typeof funnel.issues.total).toBe('number')
  })

  it('round-trips LLM usage records through the real unit', async () => {
    await trackStore.appendUsage({
      id: 'track_usage_e2e_1',
      at: Date.now(),
      label: 'intent',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      ok: true,
      finishKind: 'stop',
      durationMs: 42,
      attempt: 1,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 10,
    })
    const usage = await trackStore.listUsage()
    const found = usage.find((u) => u.id === 'track_usage_e2e_1')
    expect(found?.inputTokens).toBe(100)
    expect(found?.label).toBe('intent')
  })

  it('metered llm calls flow into the store through the injected recorder', async () => {
    // The plugin wires setUsageRecorder(createUsageRecorder(store)) on store
    // open, so a streamed call through the llm facade lands in the ledger.
    const { assembleText } = await import('../src/sync/llm.ts')
    const before = (await trackStore.listUsage()).length
    await assembleText(
      {
        stream: async function* () {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text: '{"ok":true}' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: '{"ok":true}' } }
          yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      } as never,
      { provider: 'deepseek-official', model: 'deepseek-v4-flash' } as never,
      { label: 'synthesize', attempt: 1 },
    )
    const after = await trackStore.listUsage()
    expect(after.length).toBe(before + 1)
    const last = after[after.length - 1]!
    expect(last.label).toBe('synthesize')
    expect(last.inputTokens).toBe(7)
    expect(last.outputTokens).toBe(3)
    // The recorder write is fire-and-forget; give the atomic write a moment
    // to land so afterAll's temp-dir cleanup never races a pending rename.
    await new Promise((r) => setTimeout(r, 100))
  })
})
