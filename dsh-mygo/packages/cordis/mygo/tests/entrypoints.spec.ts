/**
 * Entrypoints v1: the `ctx.entrypoints` aggregation table plus generation
 * lifecycle integration (register on activation, withdraw on dispose/replace/
 * uninstall, adapt-failure attribution).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginDefinition } from '@r05en1cu/dsh-mygo-api'
import {
  DispatchMachine,
  EntrypointsTable,
  InMemoryRegistryStore,
  LifecycleEngine,
  resolvePluginManagerConfig,
} from '@r05en1cu/dsh-mygo'

function plugin(
  id: string,
  entrypoints: PluginDefinition['entrypoints'],
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
    ...(entrypoints === undefined ? {} : { entrypoints }),
    hooks: { activate: () => {} },
  }
}

interface Harness {
  readonly ctx: Context
  readonly table: EntrypointsTable
  readonly engine: LifecycleEngine
}

function harness(): Harness {
  const ctx = new Context()
  const table = new EntrypointsTable(ctx)
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    entrypoints: table,
    resolveSource: async () => {
      throw new Error('unused')
    },
  })
  return { ctx, table, engine }
}

describe('EntrypointsTable', () => {
  it('keeps contributions under an undefined key inert and inspectable', () => {
    const { table } = harness()
    table.add('alpha', 'skill:roots', './skills')
    expect(table.keys()).toEqual(['skill:roots'])
    expect(table.get('skill:roots')).toEqual([{ value: './skills', raw: './skills', provider: 'alpha' }])
  })

  it('adapts pending contributions when the owner defines the key', () => {
    const { table } = harness()
    table.add('alpha', 'skill:roots', './skills')
    table.add('beta', 'skill:roots', { value: './more' })
    table.define('skill:roots', (raw) => {
      const text = typeof raw === 'string' ? raw : String((raw as { value: unknown }).value)
      return { root: text }
    })
    expect(table.get('skill:roots').map(entry => entry.value)).toEqual([
      { root: './skills' },
      { root: './more' },
    ])
    expect(table.get('skill:roots').map(entry => entry.provider)).toEqual(['alpha', 'beta'])
  })

  it('withdraws exactly one contribution per token', () => {
    const { table } = harness()
    const tokenA = table.add('alpha', 'skill:roots', './a')
    const tokenB = table.add('beta', 'skill:roots', './b')
    table.removeToken(tokenA)
    expect(table.get('skill:roots').map(entry => entry.provider)).toEqual(['beta'])
    table.removeToken(tokenB)
    expect(table.get('skill:roots')).toEqual([])
    expect(table.keys()).toEqual([])
  })

  it('rolls a failing redefine back and re-adapts with the previous adapter', () => {
    const { table } = harness()
    table.add('alpha', 'skill:roots', './a')
    table.define('skill:roots', raw => String(raw))
    expect(() => table.define('skill:roots', () => {
      throw new Error('boom')
    })).toThrow(/boom/)
    expect(table.get('skill:roots')).toEqual([{ value: './a', raw: './a', provider: 'alpha' }])
  })

  it('attributes a failing adapt to the contributing provider', () => {
    const { table } = harness()
    table.define('skill:roots', () => {
      throw new Error('boom')
    })
    expect(() => table.add('alpha', 'skill:roots', './a')).toThrow(/alpha/)
    expect(() => table.add('alpha', 'skill:roots', './a')).toThrow(/boom/)
    expect(table.get('skill:roots')).toEqual([])
  })
})

describe('entrypoints lifecycle integration', () => {
  it('registers manifest contributions on adoption', async () => {
    const { table, engine } = harness()
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./skills'] }), {})
    expect(table.get('skill:roots')).toEqual([{ value: './skills', raw: './skills', provider: 'alpha' }])
  })

  it('withdraws old contributions when the same provider is re-adopted', async () => {
    const { table, engine } = harness()
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./v1'] }), {})
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./v2'] }, '2.0.0'), {})
    expect(table.get('skill:roots')).toEqual([{ value: './v2', raw: './v2', provider: 'alpha' }])
  })

  it('withdraws contributions on uninstall', async () => {
    const { table, engine } = harness()
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./skills'] }), {})
    await engine.uninstall('alpha')
    expect(table.get('skill:roots')).toEqual([])
  })

  it('keeps a replaced generation from stealing the new generation contributions', async () => {
    const { table, engine } = harness()
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./v1', './v1b'] }), {})
    await engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./v2'] }, '2.0.0'), {})
    expect(table.get('skill:roots').map(entry => entry.value)).toEqual(['./v2'])
  })

  it('fails activation loudly when an adapt throws, with stage attribution', async () => {
    const { table, engine } = harness()
    table.define('skill:roots', () => {
      throw new Error('boom')
    })
    await expect(engine.adoptStatic(plugin('alpha', { 'skill:roots': ['./skills'] }), {}))
      .rejects.toThrow(/entrypoint:skill:roots/)
    expect(table.get('skill:roots')).toEqual([])
  })
})
