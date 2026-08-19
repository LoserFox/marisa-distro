/**
 * Package-level compatibility (Fabric `depends`/`breaks` 对照): install /
 * adopt / replace / uninstall gating, boot-recovery reconciliation,
 * checkSupport and panel preflight.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginCompatibility, PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import {
  DispatchMachine,
  InMemoryRegistryStore,
  LifecycleEngine,
  compatibilityViolationLines,
  evaluateCompatibility,
  resolvePluginManagerConfig,
  type CompatibilityPlugin,
  type CompatibilitySet,
} from '@r05en1cu/dsh-mygo'

function plugin(
  id: string,
  overrides: {
    readonly version?: string
    readonly compatibility?: PluginCompatibility
    readonly provides?: readonly string[]
  } = {},
): PluginDefinition {
  return {
    id,
    version: overrides.version ?? '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: overrides.provides ?? [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    ...(overrides.compatibility === undefined ? {} : { compatibility: overrides.compatibility }),
    hooks: { activate: () => {} },
  }
}

interface Harness {
  readonly engine: LifecycleEngine
  readonly store: InMemoryRegistryStore
  readonly definitions: Map<string, PluginDefinition>
}

function harness(): Harness {
  const ctx = new Context()
  const store = new InMemoryRegistryStore()
  const definitions = new Map<string, PluginDefinition>()
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store,
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    resolveSource: async (source: PluginSource) => {
      const key = source.type === 'inline' ? source.code : source.package
      const definition = definitions.get(key)
      if (definition === undefined) throw new Error(`source ${key} not resolvable`)
      return definition
    },
  })
  return { engine, store, definitions }
}

function source(id: string): PluginSource {
  return { type: 'inline', code: id }
}

describe('compatibility gating', () => {
  it('rejects an install whose requires target is missing', async () => {
    const { engine, definitions } = harness()
    const a = plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } })
    definitions.set('alpha', a)
    await expect(engine.install(source('alpha'))).rejects.toMatchObject({
      code: 'compatibility-conflict',
      details: { plugin: 'alpha' },
    })
  })

  it('accepts an install whose requires target is installed and version-satisfied', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.2.0' }))
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } }))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    expect(engine.plugins().map(pluginHandle => pluginHandle.id)).toEqual(['alpha', 'beta'])
  })

  it('rejects a version upgrade that breaks a survivor requires', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0 <2.0.0' } } }))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    definitions.set('beta', plugin('beta', { version: '2.0.0' }))
    await expect(engine.replace('beta', source('beta'))).rejects.toMatchObject({
      code: 'compatibility-conflict',
    })
    expect(engine.plugins().find(pluginHandle => pluginHandle.id === 'beta')?.version).toBe('1.0.0')
  })

  it('rejects an incoming plugin a survivor breaks', async () => {
    const { engine, definitions } = harness()
    definitions.set('alpha', plugin('alpha', { compatibility: { breaks: { beta: '>=1.0.0' } } }))
    await engine.install(source('alpha'))
    definitions.set('beta', plugin('beta', { version: '1.2.0' }))
    await expect(engine.install(source('beta'))).rejects.toMatchObject({
      code: 'compatibility-conflict',
    })
  })

  it('blocks uninstall when a survivor requires the victim', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } }))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    await expect(engine.uninstall('beta')).rejects.toMatchObject({
      code: 'compatibility-conflict',
    })
  })

  it('lets plan preview reject with the same code', async () => {
    const { engine, definitions } = harness()
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } }))
    const plan = await engine.plan({ op: 'install', source: source('alpha') })
    expect(plan).toMatchObject({
      accepted: false,
      error: { code: 'compatibility-conflict' },
    })
  })

  it('reports support checks and preflight preflight', async () => {
    const { engine, definitions } = harness()
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } }))
    const raw = { name: 'alpha', apply: () => {} }
    const support = await engine.checkSupport(raw, 'alpha', {
      version: '1.0.0',
      compatibility: { requires: { beta: '>=1.0.0' } },
    })
    expect(support.ok).toBe(false)
    if (!support.ok) expect(support.reason).toContain('beta')

    const preflight = engine.checkCompatibility({
      id: 'gamma',
      version: '1.0.0',
      compatibility: { requires: { beta: '>=1.0.0' } },
    })
    expect(preflight.violations.length).toBeGreaterThan(0)
    expect(compatibilityViolationLines(preflight).join('\n')).toContain('beta')

    const clean = engine.checkCompatibility({ id: 'gamma', version: '1.0.0' })
    expect(clean.violations).toEqual([])
    expect(clean.warnings).toEqual([])
  })
})

describe('compatibility boot recovery', () => {
  it('disables the declaring violator after the set is restored', async () => {
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', { compatibility: { requires: { beta: '>=1.0.0' } } }))
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const first = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const key = source.type === 'inline' ? source.code : source.package
        const definition = definitions.get(key)
        if (definition === undefined) throw new Error(`source ${key} not resolvable`)
        return definition
      },
    })
    await first.install(source('beta'))
    await first.install(source('alpha'))
    // Simulate an external removal (the uninstall path would have blocked it).
    await store.deletePlugin('beta')

    const machine2 = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine2.start()
    const second = new LifecycleEngine({
      ctx,
      dispatch: machine2,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const key = source.type === 'inline' ? source.code : source.package
        const definition = definitions.get(key)
        if (definition === undefined) throw new Error(`source ${key} not resolvable`)
        return definition
      },
    })
    await second.recover()
    const alpha = second.plugins().find(pluginHandle => pluginHandle.id === 'alpha')
    expect(alpha?.status).toBe('disabled')
    expect(alpha?.reason).toBe('compatibility-conflict')
    expect(second.plugins().find(pluginHandle => pluginHandle.id === 'beta')).toBeUndefined()
  })
})

describe('transitive closure and soft vocabulary', () => {
  it('reports the full path of a missing transitive dependency', () => {
    const beta: CompatibilityPlugin = {
      id: 'beta',
      version: '1.2.0',
      compatibility: { depends: { gamma: '>=2.0.0' } },
      enabled: true,
    }
    const set: CompatibilitySet = {
      enabled: [beta],
      installed: [beta],
    }
    const report = evaluateCompatibility(
      { id: 'alpha', version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } },
      set,
      'install',
    )
    expect(report.violations).toHaveLength(1)
    expect(report.violations[0]?.chain).toHaveLength(2)
    expect(report.violations[0]?.chain[0]).toMatchObject({ declarer: 'alpha', target: 'beta' })
    expect(report.violations[0]?.chain[1]).toMatchObject({ declarer: 'beta', target: 'gamma', range: '>=2.0.0' })
    const lines = compatibilityViolationLines(report)
    expect(lines.join('\n')).toContain('约束链 alpha depends beta')
    expect(lines.join('\n')).toContain('beta depends gamma')
  })

  it('accepts a satisfied transitive chain', async () => {
    const { engine, definitions } = harness()
    definitions.set('gamma', plugin('gamma', { version: '2.1.0' }))
    definitions.set('beta', plugin('beta', { version: '1.2.0', compatibility: { depends: { gamma: '>=2.0.0' } } }))
    definitions.set('alpha', plugin('alpha', { version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } }))
    await engine.install(source('gamma'))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    expect(engine.plugins().map(handle => handle.id)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('accepts a satisfied depends cycle without infinite recursion', () => {
    const alpha: CompatibilityPlugin = {
      id: 'alpha',
      version: '1.0.0',
      compatibility: { depends: { beta: '>=1.0.0' } },
      enabled: true,
    }
    const beta: CompatibilityPlugin = {
      id: 'beta',
      version: '1.0.0',
      compatibility: { depends: { alpha: '>=1.0.0' } },
      enabled: true,
    }
    const report = evaluateCompatibility(
      { id: 'alpha', version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } },
      { enabled: [alpha, beta], installed: [alpha, beta] },
      'install',
    )
    expect(report.violations).toEqual([])
  })

  it('reports an installed-but-disabled depends target with a clear state', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', { compatibility: { depends: { beta: '>=1.0.0' } } }))
    await engine.install(source('beta'))
    await engine.disable('beta')
    // 求解器已删除（2026-08-13 范围重塑）：plan 只求值——depends 目标 disabled
    // 即 compatibility-conflict，不再提级联启用动作。
    const plan = await engine.plan({ op: 'install', source: source('alpha') })
    expect(plan.accepted).toBe(false)
    expect(plan.error?.code).toBe('compatibility-conflict')
    await expect(engine.install(source('alpha'))).rejects.toMatchObject({
      code: 'compatibility-conflict',
    })
  })

  it('rejects enabling a plugin whose depends closure is disabled until the target is enabled', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', { version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } }))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    await engine.disable('alpha')
    await engine.disable('beta')
    const plan = await engine.plan({ op: 'enable', id: 'alpha' })
    expect(plan.accepted).toBe(false)
    expect(plan.error?.code).toBe('compatibility-conflict')
    await engine.enable('beta')
    await engine.enable('alpha')
    expect(engine.plugins().find(handle => handle.id === 'alpha')?.status).toBe('enabled')
  })

  it('treats soft edges as warnings, not blockers', async () => {
    const { engine, definitions } = harness()
    definitions.set('beta', plugin('beta', { version: '1.0.0' }))
    definitions.set('alpha', plugin('alpha', {
      version: '1.0.0',
      compatibility: {
        recommends: { gamma: '>=1.0.0' },
        suggests: { delta: '*' },
        conflicts: { beta: '>=1.0.0' },
      },
    }))
    await engine.install(source('beta'))
    const plan = await engine.plan({ op: 'install', source: source('alpha') })
    expect(plan.accepted).toBe(true)
    expect(plan.warnings?.some(line => line.includes('recommends gamma'))).toBe(true)
    expect(plan.warnings?.some(line => line.includes('suggests delta'))).toBe(true)
    expect(plan.warnings?.some(line => line.includes('conflicts beta'))).toBe(true)
    await engine.install(source('alpha'))
    expect(engine.plugins().map(handle => handle.id)).toEqual(['alpha', 'beta'])
  })

  it('blocks uninstall of a transitive dependency', async () => {
    const { engine, definitions } = harness()
    definitions.set('gamma', plugin('gamma', { version: '2.0.0' }))
    definitions.set('beta', plugin('beta', { version: '1.0.0', compatibility: { depends: { gamma: '>=1.0.0' } } }))
    definitions.set('alpha', plugin('alpha', { version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } }))
    await engine.install(source('gamma'))
    await engine.install(source('beta'))
    await engine.install(source('alpha'))
    await expect(engine.uninstall('gamma')).rejects.toMatchObject({
      code: 'compatibility-conflict',
    })
  })

  it('derives a provider-duplicate warning without blocking', async () => {
    const { engine, definitions } = harness()
    definitions.set('alpha', plugin('alpha', { version: '1.0.0', provides: ['sessionPersistence'] }))
    definitions.set('beta', plugin('beta', { version: '1.0.0', provides: ['sessionPersistence'] }))
    await engine.install(source('alpha'))
    const plan = await engine.plan({ op: 'install', source: source('beta') })
    expect(plan.accepted).toBe(true)
    expect(plan.warnings?.some(line => line.includes('derived-conflict'))).toBe(true)
    expect(plan.warnings?.some(line => line.includes('service:sessionPersistence'))).toBe(true)
  })
})

describe('compatibility cascade recovery', () => {
  async function recovered(
    definitions: Map<string, PluginDefinition>,
  ): Promise<LifecycleEngine> {
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const first = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const key = source.type === 'inline' ? source.code : source.package
        const definition = definitions.get(key)
        if (definition === undefined) throw new Error(`source ${key} not resolvable`)
        return definition
      },
    })
    await first.install(source('gamma'))
    await first.install(source('beta'))
    await first.install(source('alpha'))
    await store.deletePlugin('gamma')

    const machine2 = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine2.start()
    const second = new LifecycleEngine({
      ctx,
      dispatch: machine2,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const key = source.type === 'inline' ? source.code : source.package
        const definition = definitions.get(key)
        if (definition === undefined) throw new Error(`source ${key} not resolvable`)
        return definition
      },
    })
    await second.recover()
    return second
  }

  it('cascades disablement along the depends chain', async () => {
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('gamma', plugin('gamma', { version: '2.0.0' }))
    definitions.set('beta', plugin('beta', { version: '1.0.0', compatibility: { depends: { gamma: '>=1.0.0' } } }))
    definitions.set('alpha', plugin('alpha', { version: '1.0.0', compatibility: { depends: { beta: '>=1.0.0' } } }))
    const engine = await recovered(definitions)
    const alpha = engine.plugins().find(handle => handle.id === 'alpha')
    const beta = engine.plugins().find(handle => handle.id === 'beta')
    expect(alpha?.status).toBe('disabled')
    expect(beta?.status).toBe('disabled')
    expect(alpha?.reason).toBe('compatibility-conflict')
    expect(beta?.reason).toBe('compatibility-conflict')
  })
})
