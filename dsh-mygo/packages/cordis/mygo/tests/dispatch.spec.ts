/**
 * Link ownership and containerized dispatch (#14): the `internal/listener`
 * bail takeover, two real registrations per managed event, mode-specific
 * containment and return discipline, own-time CPU quota with auto-disable,
 * single-generation dispatch (PO:244), and dispose/fiber-teardown without
 * residue (PO:245).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { PluginError } from '@r05en1cu/dsh-mygo-api'
import {
  DispatchMachine,
  managedListenerOptions,
  type DispatchViolation,
  type EventDispatchMode,
  type ManagedListenerMetadata,
} from '@r05en1cu/dsh-mygo'

declare module 'cordis' {
  interface Events {
    'test/emit'(payload: { readonly n: number }): void | Promise<void>
    'test/parallel'(payload: { readonly n: number }): void | Promise<void>
    'test/serial'(payload: { readonly n: number }): unknown
    'test/waterfall'(payload: { readonly n: number }, next: () => unknown): unknown
  }
}

const VOCABULARY = new Map<string, EventDispatchMode>([
  ['test/emit', 'emit'],
  ['test/parallel', 'parallel'],
  ['test/serial', 'serial'],
  ['test/waterfall', 'waterfall'],
])

interface Harness {
  readonly ctx: Context
  readonly machine: DispatchMachine
  readonly violations: DispatchViolation[]
  readonly autoDisabled: string[]
  readonly hooks: (event: string) => unknown[]
}

function setup(options: Partial<ConstructorParameters<typeof DispatchMachine>[1]> = {}): Harness {
  const ctx = new Context()
  const violations: DispatchViolation[] = []
  const autoDisabled: string[] = []
  const machine = new DispatchMachine(ctx, {
    vocabulary: VOCABULARY,
    onViolation: violation => violations.push(violation),
    onAutoDisable: id => autoDisabled.push(id),
    ...options,
  })
  machine.start()
  machine.setOrders(new Map([['*', ['a', 'b', 'c']]]))
  return {
    ctx,
    machine,
    violations,
    autoDisabled,
    hooks: (event: string) => (ctx.events as unknown as { _hooks: Record<string, unknown[]> })._hooks[event] ?? [],
  }
}

function meta(overrides: Partial<ManagedListenerMetadata> = {}): ManagedListenerMetadata {
  return {
    pluginId: 'a',
    mode: 'observe',
    position: 'derived',
    ...overrides,
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe('DispatchMachine takeover', () => {
  it('registers the bail handler and two real listeners per managed event', () => {
    const { hooks } = setup()
    // Framework diversion handler + the machine's takeover handler.
    expect(hooks('internal/listener')).toHaveLength(2)
    expect(hooks('test/emit')).toHaveLength(2)
    expect(hooks('test/waterfall')).toHaveLength(2)
  })

  it('diverts managed registrations through the internal/listener bail', () => {
    const { ctx, hooks } = setup()
    const received: number[] = []
    const disposer = ctx.on('test/emit', (payload: { readonly n: number }) => {
      received.push(payload.n)
    }, managedListenerOptions(meta()))
    expect(typeof disposer).toBe('function')
    expect(hooks('test/emit')).toHaveLength(2)
    ctx.emit('test/emit', { n: 1 })
    expect(received).toEqual([1])
    disposer()
    ctx.emit('test/emit', { n: 2 })
    expect(received).toEqual([1])
  })

  it('rejects direct EventOptions on managed registrations', () => {
    const { ctx } = setup()
    let caught: unknown
    try {
      ctx.on('test/emit', () => {}, {
        ...managedListenerOptions(meta()),
        prepend: true,
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PluginError)
    expect((caught as PluginError).code).toBe('unsupported-event-option')
    expect((caught as PluginError).details).toEqual({ option: 'prepend' })
    expect((caught as PluginError).pluginId).toBe('a')

    let globalCaught: unknown
    try {
      ctx.on('test/emit', () => {}, {
        ...managedListenerOptions(meta()),
        global: true,
      })
    } catch (error) {
      globalCaught = error
    }
    expect(globalCaught).toBeInstanceOf(PluginError)
    expect((globalCaught as PluginError).details).toEqual({ option: 'global' })
  })

  it('lets raw registrations on managed events pass through untouched', () => {
    const { ctx, hooks } = setup()
    const received: number[] = []
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      received.push(payload.n)
    })
    expect(hooks('test/emit')).toHaveLength(3)
    ctx.emit('test/emit', { n: 1 })
    expect(received).toEqual([1])
  })

  it('lets registrations on non-managed events pass through untouched', () => {
    const { ctx, hooks } = setup()
    const before = hooks('internal/plugin').length
    ctx.on('internal/plugin', () => {})
    expect(hooks('internal/plugin').length).toBe(before + 1)
  })

  it('disposes a diverted entry idempotently and drops empty plugin maps', () => {
    const { ctx } = setup()
    const received: number[] = []
    const first = ctx.on('test/emit', (payload: { readonly n: number }) => {
      received.push(payload.n)
    }, managedListenerOptions(meta()))
    const second = ctx.on('test/emit', (payload: { readonly n: number }) => {
      received.push(payload.n * 10)
    }, managedListenerOptions(meta()))
    first()
    first()
    ctx.emit('test/emit', { n: 1 })
    expect(received).toEqual([10])
    second()
    ctx.emit('test/emit', { n: 2 })
    expect(received).toEqual([10])

    const only = ctx.on('test/emit', () => {}, managedListenerOptions(meta({ pluginId: 'solo' })))
    only()
    only()
    ctx.emit('test/emit', { n: 3 })
    expect(received).toEqual([10])
  })

  it('applies the default generated vocabulary when options omit it', () => {
    const ctx = new Context()
    const machine = new DispatchMachine(ctx)
    machine.start()
    const hooks = (ctx.events as unknown as { _hooks: Record<string, unknown[]> })._hooks
    expect(hooks['agent/status']).toHaveLength(2)
    expect(hooks['internal/listener']).toHaveLength(2)
  })

  it('applies default violation and auto-disable sinks', async () => {
    const ctx = new Context()
    const machine = new DispatchMachine(ctx, { vocabulary: VOCABULARY })
    machine.start()
    machine.setOrders(new Map([['*', ['a']]]))
    ctx.on('test/emit', () => {
      throw new Error('default sink')
    }, managedListenerOptions(meta()))
    ctx.emit('test/emit', { n: 1 })
    ctx.on('test/serial', async () => {
      await sleep(150)
      return null
    }, managedListenerOptions(meta({ pluginId: 'slow' })))
    machine.setOrders(new Map([['*', ['slow']]]))
    for (let i = 0; i < 5; i += 1) await ctx.serial('test/serial', { n: 1 })
  })

  it('rejects registrations outside the vocabulary', () => {
    const { machine } = setup()
    let caught: unknown
    try {
      machine.register('test/nope', {
        pluginId: 'a',
        mode: 'observe',
        position: 'derived',
        listener: () => {},
      })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PluginError)
    expect((caught as PluginError).code).toBe('event-not-mountable')
  })
})

describe('DispatchMachine emit/parallel containment', () => {
  it('delivers emit payloads and contains sync throws once per listener', () => {
    const { ctx, violations } = setup()
    const received: number[] = []
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      received.push(payload.n)
      throw new Error('boom')
    }, managedListenerOptions(meta()))
    ctx.emit('test/emit', { n: 1 })
    ctx.emit('test/emit', { n: 2 })
    expect(received).toEqual([1, 2])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.code).toBe('veto-suppressed')
    expect(violations[0]?.message).toContain('§23.2 step 1')
    expect(violations[0]?.details).toEqual({ plugin: 'a', event: 'test/emit' })
  })

  it('contains async emit rejections', async () => {
    const { ctx, violations } = setup()
    ctx.on('test/emit', async () => {
      throw new Error('async boom')
    }, managedListenerOptions(meta()))
    ctx.emit('test/emit', { n: 1 })
    await sleep(10)
    expect(violations.map(violation => violation.code)).toEqual(['veto-suppressed'])
  })

  it('awaits parallel listeners and contains rejections', async () => {
    const { ctx, violations } = setup()
    const order: string[] = []
    ctx.on('test/parallel', async () => {
      order.push('slow')
      await sleep(20)
      order.push('slow-done')
    }, managedListenerOptions(meta({ pluginId: 'b' })))
    ctx.on('test/parallel', async () => {
      order.push('fast')
      throw new Error('parallel boom')
    }, managedListenerOptions(meta({ pluginId: 'c' })))
    await ctx.parallel('test/parallel', { n: 1 })
    expect(order).toEqual(['slow', 'fast', 'slow-done'])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.code).toBe('veto-suppressed')
  })
})

describe('DispatchMachine serial', () => {
  it('runs in order and surfaces an undeclared serial bail', async () => {
    const { ctx, violations } = setup()
    const order: string[] = []
    ctx.on('test/serial', () => {
      order.push('a')
      return null
    }, managedListenerOptions(meta()))
    ctx.on('test/serial', () => {
      order.push('b')
      return 'bailed'
    }, managedListenerOptions(meta({ pluginId: 'b' })))
    ctx.on('test/serial', () => {
      order.push('c')
      return null
    }, managedListenerOptions(meta({ pluginId: 'c' })))
    const result = await ctx.serial('test/serial', { n: 1 })
    expect(result).toBe('bailed')
    expect(order).toEqual(['a', 'b'])
    expect(violations[0]?.code).toBe('undeclared-veto')
    expect(violations[0]?.details).toEqual({ plugin: 'b', event: 'test/serial' })
    expect(violations[0]?.message).toContain('undeclared veto')
  })
})

describe('DispatchMachine waterfall', () => {
  it('contains sync throws with downstream fallback', async () => {
    const { ctx, violations } = setup()
    let downstreamCalled = false
    ctx.on('test/waterfall', () => {
      throw new Error('sync boom')
    }, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => {
      downstreamCalled = true
      return 99
    })
    expect(result).toBe(99)
    expect(downstreamCalled).toBe(true)
    expect(violations[0]?.code).toBe('veto-suppressed')
  })

  it('contains async waterfall rejections with downstream fallback', async () => {
    const { ctx, violations } = setup()
    let downstreamCalled = false
    ctx.on('test/waterfall', async () => {
      throw new Error('async boom')
    }, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => {
      downstreamCalled = true
      return 99
    })
    expect(result).toBe(99)
    expect(downstreamCalled).toBe(true)
    expect(violations[0]?.code).toBe('veto-suppressed')
  })

  it('allows repeated next() calls without double-counting own time', async () => {
    const { ctx, violations } = setup({ cpuBudgetMs: 5 })
    ctx.on('test/waterfall', async (_payload, next) => {
      next()
      next()
      return 'done'
    }, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, async () => {
      await sleep(20)
      return 99
    })
    expect(result).toBe('done')
    expect(violations).toEqual([])
  })

  it('excludes an unawaited next window from own-time', async () => {
    const { ctx, violations } = setup({ cpuBudgetMs: 5 })
    ctx.on('test/waterfall', async (_payload, next) => {
      next()
      return 'x'
    }, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, async () => {
      await sleep(40)
      return 3
    })
    expect(result).toBe('x')
    expect(violations).toEqual([])
  })

  it('surfaces undeclared-branch when an interceptor omits its returns list', async () => {
    const { ctx, violations } = setup()
    ctx.on('test/waterfall', () => ({ kind: 'deny' }), managedListenerOptions(meta({ mode: 'intercept' })))
    await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(violations[0]?.code).toBe('undeclared-branch')
  })

  it('treats a non-string interceptor kind as an undeclared veto', async () => {
    const { ctx, violations } = setup()
    ctx.on('test/waterfall', () => ({ kind: 42 }), managedListenerOptions(meta({
      mode: 'intercept',
      returns: ['deny'],
    })))
    await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(violations[0]?.code).toBe('undeclared-veto')
  })

  it('composes observe and transform listeners with the derived order', async () => {
    const { ctx, machine } = setup()
    const seen: number[] = []
    machine.setOrders(new Map([['*', ['a', 'b']]]))
    ctx.on('test/waterfall', (payload: { readonly n: number }, next) => {
      seen.push(payload.n)
      return next()
    }, managedListenerOptions(meta({ pluginId: 'a' })))
    ctx.on('test/waterfall', (payload: { readonly n: number }, next) => {
      seen.push(payload.n)
      return next()
    }, managedListenerOptions(meta({ pluginId: 'b', mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => 41)
    expect(seen).toEqual([1, 1])
    expect(result).toBe(41)
  })

  it('surfaces next-missing when a transform returns without next()', async () => {
    const { ctx, violations } = setup()
    let downstreamCalled = false
    ctx.on('test/waterfall', () => 7, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => {
      downstreamCalled = true
      return 99
    })
    expect(result).toBe(7)
    expect(downstreamCalled).toBe(false)
    expect(violations[0]?.code).toBe('next-missing')
    expect(violations[0]?.details).toEqual({ plugin: 'a', event: 'test/waterfall' })
  })

  it('accepts a declared intercept veto without a violation', async () => {
    const { ctx, violations } = setup()
    let downstreamCalled = false
    ctx.on('test/waterfall', () => ({ kind: 'deny' }), managedListenerOptions(meta({
      mode: 'intercept',
      returns: ['deny'],
    })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => {
      downstreamCalled = true
      return 99
    })
    expect(result).toEqual({ kind: 'deny' })
    expect(downstreamCalled).toBe(false)
    expect(violations).toEqual([])
  })

  it('surfaces undeclared-branch and undeclared-veto for interceptors', async () => {
    const { ctx, violations } = setup()
    ctx.on('test/waterfall', () => ({ kind: 'maybe' }), managedListenerOptions(meta({
      mode: 'intercept',
      returns: ['deny'],
    })))
    await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(violations[0]?.code).toBe('undeclared-branch')
    expect(violations[0]?.details).toEqual({ plugin: 'a', event: 'test/waterfall', branch: 'maybe' })

    const second = setup()
    second.ctx.on('test/waterfall', () => 'not-an-object', managedListenerOptions(meta({
      mode: 'intercept',
      returns: ['deny'],
    })))
    await second.ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(second.violations[0]?.code).toBe('undeclared-veto')
  })

  it('surfaces undeclared-veto when an observe listener returns without next()', async () => {
    const { ctx, violations } = setup()
    ctx.on('test/waterfall', () => 5, managedListenerOptions(meta()))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(result).toBe(5)
    expect(violations[0]?.code).toBe('undeclared-veto')
  })

  it('runs the outermost band before the middle band', async () => {
    const { ctx, machine } = setup()
    const order: string[] = []
    machine.setOrders(new Map([['*', ['a', 'b', 'c']]]))
    ctx.on('test/waterfall', (_payload, next) => {
      order.push('outermost-before')
      return Promise.resolve(next()).then((value) => {
        order.push(`outermost-sees-${String(value)}`)
        return value
      })
    }, managedListenerOptions(meta({ pluginId: 'a', position: 'outermost' })))
    ctx.on('test/waterfall', () => {
      order.push('middle')
      return 42
    }, managedListenerOptions(meta({ pluginId: 'b', mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => 1)
    expect(result).toBe(42)
    expect(order).toEqual(['outermost-before', 'middle', 'outermost-sees-42'])
  })
})

describe('DispatchMachine scope routing', () => {
  it('routes dispatches to per-scope arrays', () => {
    const { ctx, machine } = setup({
      scopeKeyOf: thisArg => thisArg === null || thisArg === undefined
        ? undefined
        : (thisArg as { scope?: string }).scope,
    })
    machine.setOrders(new Map([['*', ['a']], ['agent-1', ['a', 's']]]))
    const unscoped: number[] = []
    const scoped: number[] = []
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      unscoped.push(payload.n)
    }, managedListenerOptions(meta()))
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      scoped.push(payload.n)
    }, managedListenerOptions(meta({ pluginId: 's', scope: 'agent-1' })))

    ctx.emit('test/emit', { n: 1 })
    expect(unscoped).toEqual([1])
    expect(scoped).toEqual([])

    ctx.emit({ scope: 'agent-1' }, 'test/emit', { n: 2 })
    expect(unscoped).toEqual([1, 2])
    expect(scoped).toEqual([2])

    ctx.emit({ scope: 'agent-2' }, 'test/emit', { n: 3 })
    expect(unscoped).toEqual([1, 2, 3])
    expect(scoped).toEqual([2])
  })

  it('handles an empty orders set with the unscoped fallback', () => {
    const { ctx, machine } = setup()
    const called: number[] = []
    machine.setOrders(new Map())
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      called.push(payload.n)
    }, managedListenerOptions(meta()))
    ctx.emit('test/emit', { n: 1 })
    expect(called).toEqual([])
  })

  it('excludes scoped entries from scope orders that do not contain them', () => {
    const { ctx, machine } = setup()
    const called: number[] = []
    machine.setOrders(new Map([['*', ['s']]]))
    ctx.on('test/emit', (payload: { readonly n: number }) => {
      called.push(payload.n)
    }, managedListenerOptions(meta({ pluginId: 's', scope: 'agent-1' })))
    ctx.emit('test/emit', { n: 1 })
    expect(called).toEqual([])
  })
})

describe('DispatchMachine single generation and disposal', () => {
  it('tracks in-flight counts and notifies idle subscribers once', async () => {
    const { ctx, machine } = setup()
    let idles = 0
    ctx.on('test/parallel', async () => {
      await sleep(20)
    }, managedListenerOptions(meta()))
    const disposer = machine.onIdle('test/parallel', () => { idles += 1 })
    const secondDisposer = machine.onIdle('test/parallel', () => {})
    const first = ctx.parallel('test/parallel', { n: 1 })
    // One logical dispatch walks both real registrations (outermost + middle).
    expect(machine.inFlightCount('test/parallel')).toBe(2)
    await first
    expect(idles).toBe(1)
    secondDisposer()
    disposer()
    const second = ctx.parallel('test/parallel', { n: 1 })
    await second
    expect(idles).toBe(1)
    expect(machine.inFlightCount('test/parallel')).toBe(0)
  })

  it('notifies idle even without subscribers and reports zero in-flight', async () => {
    const { ctx, machine } = setup()
    ctx.on('test/parallel', async () => {
      await sleep(10)
    }, managedListenerOptions(meta()))
    await ctx.parallel('test/parallel', { n: 1 })
    expect(machine.inFlightCount('test/parallel')).toBe(0)
  })

  it('walks one immutable array generation per dispatch (PO:244)', async () => {
    const { ctx, machine } = setup()
    const called: string[] = []
    ctx.on('test/parallel', async () => {
      called.push('a')
      await sleep(30)
      called.push('a-done')
    }, managedListenerOptions(meta()))
    const dispatch = ctx.parallel('test/parallel', { n: 1 })
    await sleep(5)
    machine.register('test/parallel', {
      pluginId: 'late',
      mode: 'observe',
      position: 'derived',
      listener: () => { called.push('late') },
    })
    machine.setOrders(new Map([['*', ['a', 'late']]]))
    await dispatch
    expect(called).toEqual(['a', 'a-done'])
    await ctx.parallel('test/parallel', { n: 2 })
    expect(called).toEqual(['a', 'a-done', 'a', 'late', 'a-done'])
  })

  it('leaves no residue after dispose (PO:245)', async () => {
    const { ctx, machine, hooks } = setup()
    const called: string[] = []
    ctx.on('test/emit', () => { called.push('a') }, managedListenerOptions(meta()))
    machine.dispose()
    expect(hooks('test/emit')).toHaveLength(0)
    expect(hooks('internal/listener')).toHaveLength(1)
    ctx.emit('test/emit', { n: 1 })
    expect(called).toEqual([])
  })

  it('removes diverted entries when the owning fiber unloads', async () => {
    const { ctx, machine } = setup()
    const called: string[] = []
    const fiber = await ctx.plugin(function (pluginCtx: Context) {
      pluginCtx.on('test/emit', () => { called.push('plugin') }, managedListenerOptions(meta({ pluginId: 'p' })))
    })
    machine.setOrders(new Map([['*', ['p']]]))
    ctx.emit('test/emit', { n: 1 })
    expect(called).toEqual(['plugin'])
    await fiber.dispose()
    ctx.emit('test/emit', { n: 2 })
    expect(called).toEqual(['plugin'])
  })
})

describe('DispatchMachine CPU quota', () => {
  it('skips quota-exceeded transforms with identity passthrough and auto-disables after five', async () => {
    const { ctx, machine, violations, autoDisabled } = setup({ cpuBudgetMs: 0 })
    machine.setOrders(new Map([['*', ['a']]]))
    ctx.on('test/waterfall', async () => {
      await sleep(5)
      return 7
    }, managedListenerOptions(meta({ mode: 'transform' })))
    for (let i = 0; i < 5; i += 1) {
      const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
      expect(result).toBe(99)
    }
    expect(violations.filter(violation => violation.code === 'quota-cpu-exceeded')).toHaveLength(5)
    expect(autoDisabled).toEqual(['a'])
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(result).toBe(99)
    expect(violations).toHaveLength(6)
  })

  it('surfaces intercept-skipped for a skipped intercept/outermost listener', async () => {
    const { ctx, machine, violations } = setup({ cpuBudgetMs: 0 })
    machine.setOrders(new Map([['*', ['a']]]))
    ctx.on('test/waterfall', async () => {
      await sleep(5)
      return { kind: 'deny' }
    }, managedListenerOptions(meta({ mode: 'intercept', returns: ['deny'] })))
    await ctx.waterfall('test/waterfall', { n: 1 }, () => 99)
    expect(violations.map(violation => violation.code)).toEqual([
      'quota-cpu-exceeded',
      'intercept-skipped',
    ])
  })

  it('surfaces intercept-skipped for a skipped outermost serial listener', async () => {
    const { ctx, machine, violations } = setup({ cpuBudgetMs: 0 })
    machine.setOrders(new Map([['*', ['a']]]))
    ctx.on('test/serial', async () => {
      await sleep(5)
      return null
    }, managedListenerOptions(meta({ position: 'outermost' })))
    await ctx.serial('test/serial', { n: 1 })
    expect(violations.map(violation => violation.code)).toEqual([
      'quota-cpu-exceeded',
      'intercept-skipped',
    ])
  })

  it('excludes awaited next windows from own-time', async () => {
    const { ctx, machine, violations } = setup({ cpuBudgetMs: 5 })
    machine.setOrders(new Map([['*', ['a']]]))
    ctx.on('test/waterfall', async (_payload, next) => {
      const value = await (next() as Promise<unknown>)
      return value
    }, managedListenerOptions(meta({ mode: 'transform' })))
    const result = await ctx.waterfall('test/waterfall', { n: 1 }, async () => {
      await sleep(40)
      return 3
    })
    expect(result).toBe(3)
    expect(violations).toEqual([])
  })

  it('resets the consecutive quota counter on a compliant call', async () => {
    const { ctx, machine, autoDisabled } = setup({ cpuBudgetMs: 2 })
    machine.setOrders(new Map([['*', ['a']]]))
    let slow = true
    ctx.on('test/serial', async () => {
      if (slow) await sleep(10)
      return null
    }, managedListenerOptions(meta()))
    for (let i = 0; i < 4; i += 1) await ctx.serial('test/serial', { n: 1 })
    slow = false
    await ctx.serial('test/serial', { n: 1 })
    slow = true
    for (let i = 0; i < 4; i += 1) await ctx.serial('test/serial', { n: 1 })
    expect(autoDisabled).toEqual([])
    await ctx.serial('test/serial', { n: 1 })
    expect(autoDisabled).toEqual(['a'])
  })
})
