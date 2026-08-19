/**
 * Pure ordering derivation (#13, §9/§11): lexicographically smallest linear
 * extension per scope, id-order tie-breaks, end-position bands, per-plugin
 * order-neutrality (PO:53), cycle reporting, and the two acceptance
 * properties — order is a pure function of the installed set (PO:239-240)
 * and order-neutrality survives renames except on chain-ordered slots
 * (PO:241).
 */

import { describe, expect, it } from 'vitest'
import { deriveOrders, deriveScopeOrder } from '@r05en1cu/dsh-mygo'
import { plugin, SLOT_KINDS } from './derivation-fixtures.ts'

function ordersFor(plugins: Parameters<typeof deriveOrders>[0]['plugins']): {
  readonly orders: Record<string, readonly string[]>
  readonly neutral: Record<string, boolean>
  readonly cycles: { scope: string; cycle: string[] }[]
} {
  const result = deriveOrders({ plugins, slotKinds: SLOT_KINDS })
  return {
    orders: Object.fromEntries(result.orders),
    neutral: Object.fromEntries(result.orderNeutral),
    cycles: result.cycles.map(entry => ({ scope: entry.scope, cycle: [...entry.cycle] })),
  }
}

describe('deriveOrders', () => {
  it('orders a pure appender set by plugin id (no edges)', () => {
    const result = ordersFor([
      plugin('c', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('a', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('b', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
    ])
    expect(result.orders['*']).toEqual(['a', 'b', 'c'])
  })

  it('places derived readers after every producer of the slot', () => {
    const result = ordersFor([
      plugin('reader', { transform: [{ event: 'agent/pre-step', reads: ['messages'] }] }),
      plugin('writer', { transform: [{ event: 'agent/pre-step', writes: ['messages'] }] }),
      plugin('appender', { transform: [{ event: 'agent/pre-step', appends: ['messages'] }] }),
    ])
    expect(result.orders['*']).toEqual(['appender', 'writer', 'reader'])
  })

  it('computes the lexicographically smallest linear extension (PO:111 example)', () => {
    const result = ordersFor([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('c', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ])
    // The edge c → a forces the order [b, c, a]; without it the id order
    // would be [a, b, c] (PO:111's bystander b moves).
    expect(result.orders['*']).toEqual(['b', 'c', 'a'])
  })

  it('keeps scoped arrays per scope and tolerates a union-only cycle (PO:171)', () => {
    const plugins = [
      plugin('u1', {
        transform: [
          { event: 'agent/request', writes: ['p'] },
          { event: 'tools/post-execute', reads: ['w'] },
        ],
      }),
      plugin('u2', {
        transform: [
          { event: 'agent/request', reads: ['y'] },
          { event: 'tools/post-execute', writes: ['z'] },
        ],
      }),
      plugin('s', {
        scopes: ['agent-s'],
        transform: [
          { event: 'agent/request', reads: ['p'] },
          { event: 'agent/request', writes: ['y'] },
        ],
      }),
      plugin('t', {
        scopes: ['agent-t'],
        transform: [
          { event: 'tools/post-execute', reads: ['z'] },
          { event: 'tools/post-execute', writes: ['w'] },
        ],
      }),
    ]
    const result = ordersFor(plugins)
    expect(result.cycles).toEqual([])
    expect(result.orders['*']).toEqual(['u1', 'u2'])
    expect(result.orders['agent-s']).toEqual(['u1', 's', 'u2'])
    expect(result.orders['agent-t']).toEqual(['u2', 't', 'u1'])
  })

  it('reports cycles per scope and omits cyclic scopes from orders', () => {
    const cyclic = ordersFor([
      plugin('x', {
        transform: [
          { event: 'agent/request', writes: ['config'] },
          { event: 'tools/post-execute', reads: ['value'] },
        ],
      }),
      plugin('y', {
        transform: [
          { event: 'agent/request', reads: ['config'] },
          { event: 'tools/post-execute', writes: ['value'] },
        ],
      }),
    ])
    expect(cyclic.orders['*']).toBeUndefined()
    expect(cyclic.cycles).toEqual([{ scope: '*', cycle: ['x', 'y'] }])
  })

  it('places end-position bands at the chain ends in id order', () => {
    const result = ordersFor([
      plugin('middle', { position: 'derived' }),
      plugin('head', { position: 'outermost' }),
      plugin('tail', { position: 'innermost' }),
      plugin('head-b', { position: 'outermost' }),
      plugin('tail-b', { position: 'innermost' }),
    ])
    expect(result.orders['*']).toEqual(['head', 'head-b', 'middle', 'tail', 'tail-b'])
  })

  it('excludes disabled plugins from orders but keeps their neutrality flag', () => {
    const result = ordersFor([
      plugin('a', { enabled: true }),
      plugin('b', { enabled: false }),
    ])
    expect(result.orders['*']).toEqual(['a'])
    expect(result.neutral).toEqual({ a: true, b: true })
  })

  it('derives order neutrality from intercept and the slot kind (PO:53)', () => {
    const result = ordersFor([
      plugin('observe-only'),
      plugin('host-appender', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('chain-appender', { transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }] }),
      plugin('deny-interceptor', { intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }] }),
      plugin('non-deny-interceptor', { intercept: [{ event: 'tools/pre-execute', returns: ['allow'] }] }),
    ])
    expect(result.neutral).toEqual({
      'observe-only': true,
      'host-appender': true,
      'chain-appender': false,
      'deny-interceptor': false,
      'non-deny-interceptor': false,
    })
  })

  it('flags a plugin non-neutral when any append lands on a chain-ordered slot', () => {
    const result = ordersFor([
      plugin('mixed-appender', {
        transform: [
          { event: 'system-prompt/assemble', appends: ['sections'] },
          { event: 'tools/post-execute', appends: ['additionalContexts'] },
        ],
      }),
    ])
    expect(result.neutral).toEqual({ 'mixed-appender': false })
  })

  it('is a pure function of the installed set under input permutation (PO:239-240)', () => {
    const set = [
      plugin('c', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('producer', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('a'),
      plugin('b'),
      plugin('s1', {
        scopes: ['agent-s'],
        transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }],
      }),
    ]
    const baseline = ordersFor(set)
    const permutations: typeof set[] = [
      [...set].reverse(),
      [set[3]!, set[0]!, set[2]!, set[4]!, set[1]!],
      [set[4]!, set[3]!, set[2]!, set[1]!, set[0]!],
    ]
    for (const permuted of permutations) {
      expect(ordersFor(permuted)).toEqual(baseline)
    }
  })

  it('reports order neutrality across renames (PO:241 live counter-example)', () => {
    const hostSorted = [
      plugin('a', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('b', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
    ]
    const renamedHost = [
      plugin('a', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('z', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
    ]
    const hostBefore = ordersFor(hostSorted)
    const hostAfter = ordersFor(renamedHost)
    expect(hostBefore.orders['*']).toEqual(['a', 'b'])
    expect(hostAfter.orders['*']).toEqual(['a', 'z'])
    expect(hostBefore.neutral).toEqual({ a: true, b: true })
    expect(hostAfter.neutral).toEqual({ a: true, z: true })

    const chainSorted = [
      plugin('a', { transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }] }),
      plugin('b', { transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }] }),
    ]
    const chainRenamed = [
      plugin('a', { transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }] }),
      plugin('z', { transform: [{ event: 'tools/post-execute', appends: ['additionalContexts'] }] }),
    ]
    expect(ordersFor(chainSorted).neutral).toEqual({ a: false, b: false })
    expect(ordersFor(chainRenamed).neutral).toEqual({ a: false, z: false })
  })

  it('returns an empty unscoped order for an empty set', () => {
    expect(ordersFor([]).orders).toEqual({ '*': [] })
  })

  it('ignores edges outside the scope and self-edges in the derived order', () => {
    const member = plugin('a')
    const order = deriveScopeOrder(
      [member],
      [
        { from: 'a', to: 'missing', property: 'agent/request.config' },
        { from: 'a', to: 'a', property: 'agent/request.config' },
      ],
    )
    expect(order).toEqual(['a'])
  })

  it('sorts parallel edges between one producer/reader pair by property', () => {
    const result = ordersFor([
      plugin('a', {
        transform: [
          { event: 'agent/request', writes: ['p'] },
          { event: 'agent/request', writes: ['q'] },
        ],
      }),
      plugin('b', {
        transform: [
          { event: 'agent/request', reads: ['p'] },
          { event: 'agent/request', reads: ['q'] },
        ],
      }),
    ])
    expect(result.orders['*']).toEqual(['a', 'b'])
  })

  it('deduplicates repeated touches of one slot from multiple declarations', () => {
    const result = ordersFor([
      plugin('a', {
        transform: [
          { event: 'system-prompt/assemble', appends: ['sections'] },
          { event: 'system-prompt/assemble', appends: ['sections'] },
        ],
      }),
      plugin('b', { transform: [{ event: 'system-prompt/assemble', reads: ['sections'] }] }),
    ])
    expect(result.orders['*']).toEqual(['a', 'b'])
  })

  it('ignores a self-edge from a plugin reading its own produced slot', () => {
    const result = ordersFor([
      plugin('a', {
        transform: [
          { event: 'agent/request', writes: ['config'] },
          { event: 'agent/request', reads: ['config'] },
        ],
      }),
      plugin('b'),
    ])
    expect(result.orders['*']).toEqual(['a', 'b'])
  })
})
