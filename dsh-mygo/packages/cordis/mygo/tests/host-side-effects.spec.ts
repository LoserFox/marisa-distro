/**
 * Host side-effect lifecycle: registration-class host method disposers
 * (`env.hostEffect`) execute on release AND on disable; disable keeps
 * ordinary effect disposers (registration is preserved for "stopped"
 * interception), and enable remounts through the HMR replace protocol.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginDefinition, PluginEnv } from '@r05en1cu/dsh-mygo-api'
import {
  DispatchMachine,
  InMemoryRegistryStore,
  LifecycleEngine,
  resolvePluginManagerConfig,
} from '@r05en1cu/dsh-mygo'

function hostEffectPlugin(
  id: string,
  activate: (env: PluginEnv) => void,
  activated: () => void,
  version = '1.0.0',
): PluginDefinition {
  return {
    id,
    version,
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: {
      activate(env) {
        activated()
        activate(env)
      },
    },
  }
}

function harness(): LifecycleEngine {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  return new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    resolveSource: async () => {
      throw new Error('unused')
    },
  })
}

describe('host side-effect lifecycle', () => {
  it('executes host effect disposers on uninstall', async () => {
    const engine = harness()
    const calls: string[] = []
    await engine.adoptStatic(hostEffectPlugin('alpha', env => {
      env.hostEffect(() => { calls.push('host-disposed') }, 'alpha:skills.registerProvider')
    }, () => { calls.push('activated') }), {})
    await engine.uninstall('alpha')
    expect(calls).toEqual(['activated', 'host-disposed'])
  })

  it('revokes host effects on disable but keeps ordinary effect disposers', async () => {
    const engine = harness()
    const calls: string[] = []
    await engine.adoptStatic(hostEffectPlugin('alpha', env => {
      env.hostEffect(() => { calls.push('host-disposed') }, 'alpha:host')
      env.effect(() => { calls.push('plain-disposed') }, 'alpha:plain')
    }, () => { calls.push('activated') }), {})
    await engine.disable('alpha')
    expect(calls).toEqual(['activated', 'host-disposed'])
    expect(engine.plugins().find(plugin => plugin.id === 'alpha')?.status).toBe('disabled')
  })

  it('remounts host effects on enable through the replace protocol', async () => {
    const engine = harness()
    const calls: string[] = []
    let hostDisposed = 0
    let activates = 0
    await engine.adoptStatic(hostEffectPlugin('alpha', env => {
      env.hostEffect(() => { hostDisposed += 1 }, 'alpha:host')
    }, () => { activates += 1 }), {})
    const firstGen = engine.plugins().find(plugin => plugin.id === 'alpha')?.generation
    await engine.disable('alpha')
    expect(hostDisposed).toBe(1)
    await engine.enable('alpha')
    expect(activates).toBe(2)
    expect(hostDisposed).toBe(1)
    const enabled = engine.plugins().find(plugin => plugin.id === 'alpha')
    expect(enabled?.status).toBe('enabled')
    expect(enabled?.generation).toBe((firstGen ?? 0) + 1)
    // The remounted generation's host effect is revocable again.
    await engine.disable('alpha')
    expect(hostDisposed).toBe(2)
    void calls
  })

  it('executes host effect disposers on replace (generation release)', async () => {
    const engine = harness()
    const hostDisposed: string[] = []
    await engine.adoptStatic(hostEffectPlugin('alpha', env => {
      env.hostEffect(() => { hostDisposed.push('g1') }, 'alpha:host')
    }, () => {}), {})
    const next = hostEffectPlugin('alpha', env => {
      env.hostEffect(() => { hostDisposed.push('g2') }, 'alpha:host')
    }, () => {}, '2.0.0')
    await engine.adoptStatic(next, {})
    expect(hostDisposed).toEqual(['g1'])
    await engine.uninstall('alpha')
    expect(hostDisposed).toEqual(['g1', 'g2'])
  })

  it('is idempotent for repeated static adoption of the same live generation', async () => {
    const engine = harness()
    let activates = 0
    const definition = hostEffectPlugin('alpha', env => {
      env.hostEffect(() => {}, 'alpha:host')
    }, () => { activates += 1 })
    await engine.adoptStatic(definition, {})
    // Loader hot-reload and the panel live adopt can reach the same row twice;
    // the second adoption must not re-run apply (host side effects are not
    // double-registrable).
    const second = await engine.adoptStatic(definition, {})
    expect(activates).toBe(1)
    expect(second.generation).toBe(1)
    expect(engine.plugins().find(plugin => plugin.id === 'alpha')?.generation).toBe(1)
  })
})
