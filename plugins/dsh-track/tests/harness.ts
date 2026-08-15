/**
 * Shared real-Cordis test mount for the track plugin — official
 * plugin-template convention (`tests/harness.ts`): mount the production plugin
 * on a real `Context` with its declared service chain and a temp JSON storage
 * backend, so feature specs don't re-implement the mount.
 * @module tests/harness
 */

import { Context } from 'cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Storage from '@deepseek-ai/dsh-storage'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import { apply as applyStorageJson } from '@deepseek-ai/dsh-storage-json'
import { apply as applyTrack, trackStore, store } from '../src/index.ts'
import type { Config } from '../src/index.ts'

export interface TrackHarness {
  ctx: Context
  store: typeof store
  dir: string
  dispose(): Promise<void>
}

/**
 * Mount the track plugin on a real storage hub → system-prompt → tool
 * registry chain plus a temp json backend. Mirrors the web boot's mount order:
 * track applies BEFORE the json backend registers (resolveKv polls for the
 * backend instead of failing on the first empty check).
 * @param config - plugin config (default teamKey INV).
 * @returns the context, the opened store, and a disposer.
 */
export async function createPluginHarness(config: Config = {}): Promise<TrackHarness> {
  const dir = await mkdtemp(join(tmpdir(), 'track-harness-'))
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRegistry)
  applyTrack(ctx, { teamKey: config.teamKey ?? 'INV' } as never)
  await new Promise((r) => setTimeout(r, 300))
  applyStorageJson(ctx, { root: dir })
  // Let effects (store open) settle.
  const deadline = Date.now() + 5000
  while (!store.isOpen && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50))
  }
  return {
    ctx,
    store,
    dir,
    async dispose(): Promise<void> {
      // Close the store so the next harness reopens a fresh unit on its own
      // temp dir (the module-level store singleton would otherwise keep the
      // first unit and cross-contaminate test cases).
      await store.close().catch(() => {})
      // cordis 4.x contexts have no public dispose on the ctx object; the
      // temp dir is the only owned resource — clean it and let vitest's
      // process teardown reclaim the rest.
      await rm(dir, { recursive: true, force: true })
    },
  }
}
