/**
 * Invariant companion contract: `dsh-track-invariant` registers with the host
 * invariants registry, and its installer fails loud when the plugin's
 * declared services (tools / storage) are absent from the composition.
 * @module tests/invariant.spec
 */

import { describe, expect, it } from 'vitest'
import type { Context } from 'cordis'
import { apply, name } from '../src/invariant.ts'

interface FakeRegistry {
  registrations: Array<{ pkg: string; installer: (ctx: unknown, fail: (m: string) => never) => void }>
  register(pkg: string, installer: (ctx: unknown, fail: (m: string) => never) => void): () => void
}

function makeRegistry(): FakeRegistry {
  const registrations: FakeRegistry['registrations'] = []
  return {
    registrations,
    register(pkg, installer) {
      registrations.push({ pkg, installer })
      return () => undefined
    },
  }
}

function ctxWith(entries: Record<string, unknown>): Context {
  return { get: (key: string) => entries[key] } as unknown as Context
}

/** Apply the companion against a fresh fake registry and return it. */
async function applyCompanion(): Promise<FakeRegistry> {
  const registry = makeRegistry()
  await apply(ctxWith({ invariants: registry }))
  return registry
}

describe('dsh-track invariant companion', () => {
  it('registers the package with the host invariants registry', async () => {
    const registry = await applyCompanion()
    expect(registry.registrations).toHaveLength(1)
    expect(registry.registrations[0]!.pkg).toBe('@fakechris/dsh-track')
    expect(name).toBe('dsh-track-invariant')
  })

  it('fails loud when tools or storage are missing from the composition', async () => {
    const registry = await applyCompanion()
    const installer = registry.registrations[0]!.installer
    const fails: string[] = []
    installer(ctxWith({}), (m) => { fails.push(m) })
    expect(fails.join(' ')).toContain('tools')
    expect(fails.join(' ')).toContain('storage')
  })

  it('passes when the full service chain is present with the tools registered', async () => {
    const registry = await applyCompanion()
    const installer = registry.registrations[0]!.installer
    const toolRegistry = {
      get: (n: string) => (['capture_thought', 'report_decision_point', 'track_create_issue', 'track_sync_history'].includes(n) ? {} : undefined),
    }
    let failed = ''
    installer(ctxWith({ tools: toolRegistry, storage: {} }), (m) => { failed = m; throw new Error(m) })
    expect(failed).toBe('')
  })
})
