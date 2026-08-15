/**
 * Harness smoke: createPluginHarness mounts the real plugin on the real
 * service chain + temp json backend; assert the store opens and the four
 * tools are registered (keyless — no model calls).
 * @module tests/harness.spec
 */

import { describe, expect, it } from 'vitest'
import { createPluginHarness } from './harness.ts'

describe('createPluginHarness', () => {
  it('opens the store and registers the four tools', async () => {
    const h = await createPluginHarness({ teamKey: 'INV' })
    try {
      expect(h.store.isOpen).toBe(true)
      const tools = h.ctx.get('tools') as { get?: (name: string) => unknown }
      for (const name of ['capture_thought', 'report_decision_point', 'track_create_issue', 'track_sync_history']) {
        expect(tools.get?.(name), `${name} registered`).toBeDefined()
      }
    } finally {
      await h.dispose()
    }
  })
})
