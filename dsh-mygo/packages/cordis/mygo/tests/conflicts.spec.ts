/**
 * Pure conflict evaluation (#13, §10-§12): the five rules are scope-relative,
 * claims follow the three branches, and every verdict is deterministic.
 */

import { describe, expect, it } from 'vitest'
import { evaluateConflicts } from '@r05en1cu/dsh-mygo'
import { plugin, SLOT_KINDS } from './derivation-fixtures.ts'

function issues(plugins: Parameters<typeof evaluateConflicts>[0]['plugins'], heldOutsideManager?: string[]) {
  return evaluateConflicts(heldOutsideManager === undefined
    ? { plugins, slotKinds: SLOT_KINDS }
    : { plugins, slotKinds: SLOT_KINDS, heldOutsideManager }).map(issue => ({
    code: issue.code,
    details: issue.details,
  }))
}

describe('evaluateConflicts', () => {
  it('rejects two writers of one slot with the intersecting scope named', () => {
    const result = issues([
      plugin('a', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('b', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ])
    expect(result).toEqual([{
      code: 'write-conflict',
      details: { a: 'a', b: 'b', property: 'agent/request.config', scope: '*' },
    }])
  })

  it('allows writers on disjoint scopes and rejects writer-vs-appender on shared ones', () => {
    const disjoint = issues([
      plugin('a', {
        scopes: ['agent-1'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
      plugin('b', {
        scopes: ['agent-2'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    ])
    expect(disjoint).toEqual([])

    const writerAppender = issues([
      plugin('a', {
        scopes: ['agent-1'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
      plugin('b', {
        transform: [{ event: 'agent/request', appends: ['config'] }],
      }),
    ])
    expect(writerAppender).toEqual([{
      code: 'write-conflict',
      details: { a: 'a', b: 'b', property: 'agent/request.config', scope: 'agent-1' },
    }])

    const sameScope = issues([
      plugin('a', {
        scopes: ['agent-1'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
      plugin('b', {
        scopes: ['agent-1'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    ])
    expect(sameScope).toEqual([{
      code: 'write-conflict',
      details: { a: 'a', b: 'b', property: 'agent/request.config', scope: 'agent-1' },
    }])
  })

  it('allows two appenders on one slot', () => {
    const result = issues([
      plugin('a', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
      plugin('b', { transform: [{ event: 'system-prompt/assemble', appends: ['sections'] }] }),
    ])
    expect(result).toEqual([])
  })

  it('rejects intercept pairs where either may return a non-deny branch', () => {
    const result = issues([
      plugin('a', { intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }] }),
      plugin('b', { intercept: [{ event: 'tools/pre-execute', returns: ['deny', 'ask'] }] }),
    ])
    expect(result).toEqual([{
      code: 'intercept-branch-conflict',
      details: { a: 'a', b: 'b', event: 'tools/pre-execute', branch: 'ask' },
    }])

    const denyOnly = issues([
      plugin('a', { intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }] }),
      plugin('b', { intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }] }),
    ])
    expect(denyOnly).toEqual([])

    const disjointScopes = issues([
      plugin('a', {
        scopes: ['agent-1'],
        intercept: [{ event: 'tools/pre-execute', returns: ['ask'] }],
      }),
      plugin('b', {
        scopes: ['agent-2'],
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
    ])
    expect(disjointScopes).toEqual([])
  })

  it('rejects two end-position interceptors of the same event and position', () => {
    const outermost = issues([
      plugin('a', {
        position: 'outermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
      plugin('b', {
        position: 'outermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
    ])
    expect(outermost).toEqual([{
      code: 'veto-position-conflict',
      details: { a: 'a', b: 'b', event: 'tools/pre-execute' },
    }])

    const mixedEnds = issues([
      plugin('a', {
        position: 'outermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
      plugin('b', {
        position: 'innermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
    ])
    expect(mixedEnds).toEqual([])

    const disjointScopes = issues([
      plugin('a', {
        scopes: ['agent-1'],
        position: 'outermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
      plugin('b', {
        scopes: ['agent-2'],
        position: 'outermost',
        intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }],
      }),
    ])
    expect(disjointScopes).toEqual([])
  })

  it('allows unbounded delegating end-position claimants', () => {
    const result = issues([
      plugin('a', { position: 'outermost' }),
      plugin('b', { position: 'outermost' }),
    ])
    expect(result).toEqual([])
  })

  it('rejects derived-edge cycles with the cycle and scope named', () => {
    const result = issues([
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
    expect(result).toEqual([{
      code: 'ordering-cycle',
      details: { cycle: ['x', 'y'], scope: '*' },
    }])
  })

  it('does not reject a cycle present only in the union of scopes (PO:171)', () => {
    const result = issues([
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
    ])
    expect(result).toEqual([])
  })

  it('evaluates the claims three branches for unscoped plugins', () => {
    const eviction = issues([
      plugin('incumbent', { provides: ['memory'] }),
      plugin('claimant', { claims: ['service:memory'] }),
    ])
    expect(eviction).toEqual([])

    const selfReplace = issues([
      plugin('owner', { provides: ['memory'], claims: ['service:memory'] }),
    ])
    expect(selfReplace).toEqual([])

    const unmanaged = issues(
      [plugin('claimant', { claims: ['service:memory'] })],
      ['memory'],
    )
    expect(unmanaged).toEqual([{
      code: 'claims-unmanaged-incumbent',
      details: { slot: 'service:memory' },
    }])

    const emptySlot = issues([plugin('claimant', { claims: ['service:memory'] })])
    expect(emptySlot).toEqual([])
  })

  it('ignores tool claims at plan time (runtime registration boundary)', () => {
    const result = issues([plugin('claimant', { claims: ['tool:bash'] })])
    expect(result).toEqual([])
  })

  it('rejects two claimants of the same slot on intersecting scopes (claims-conflict)', () => {
    const bothUnscoped = issues([
      plugin('a', { claims: ['service:memory'] }),
      plugin('b', { claims: ['service:memory'] }),
    ])
    expect(bothUnscoped).toEqual([{
      code: 'claims-conflict',
      details: { a: 'a', b: 'b', slot: 'service:memory', scope: '*' },
    }])

    const mixedScope = issues([
      plugin('a', { claims: ['service:memory'] }),
      plugin('b', {
        scopes: ['agent-1'],
        claims: ['service:memory'],
      }),
    ])
    expect(mixedScope).toEqual([{
      code: 'claims-conflict',
      details: { a: 'a', b: 'b', slot: 'service:memory', scope: 'agent-1' },
    }])

    const disjointScopes = issues([
      plugin('a', { scopes: ['agent-1'], claims: ['service:memory'] }),
      plugin('b', { scopes: ['agent-2'], claims: ['service:memory'] }),
    ])
    expect(disjointScopes).toEqual([])

    const singleClaimant = issues([plugin('a', { claims: ['service:memory'] })])
    expect(singleClaimant).toEqual([])
  })

  it('rejects undeclared scoped shadowing and accepts the declared form', () => {
    const undeclared = issues([
      plugin('global', { provides: ['memory'] }),
      plugin('scoped', { scopes: ['agent-1'], provides: ['memory'] }),
    ])
    expect(undeclared).toEqual([{
      code: 'shadow-undeclared',
      details: { tool: 'service:memory', holder: 'global' },
    }])

    const declared = issues([
      plugin('global', { provides: ['memory'] }),
      plugin('scoped', {
        scopes: ['agent-1'],
        provides: ['memory'],
        claims: ['service:memory'],
      }),
    ])
    expect(declared).toEqual([])

    const noGlobalHolder = issues([
      plugin('scoped', { scopes: ['agent-1'], provides: ['memory'] }),
    ])
    expect(noGlobalHolder).toEqual([])
  })

  it('names an unmanaged layer when the shadowed name is held outside the manager', () => {
    const result = issues(
      [plugin('scoped', { scopes: ['agent-1'], provides: ['memory'] })],
      ['memory'],
    )
    expect(result).toEqual([{
      code: 'shadow-undeclared',
      details: { tool: 'service:memory', holder: 'unmanaged-layer' },
    }])
  })

  it('produces a deterministic issue order across equal inputs', () => {
    const plugins = [
      plugin('a', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('b', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('c', { intercept: [{ event: 'tools/pre-execute', returns: ['ask'] }] }),
      plugin('d', { intercept: [{ event: 'tools/pre-execute', returns: ['deny'] }] }),
    ]
    const first = issues(plugins)
    const second = issues([...plugins].reverse())
    expect(first).toEqual(second)
    expect(first.map(entry => entry.code)).toEqual([
      'intercept-branch-conflict',
      'write-conflict',
    ])
  })

  it('orders same-code issues by their details', () => {
    const result = issues([
      plugin('a', { transform: [{ event: 'agent/request', writes: ['z'] }] }),
      plugin('b', { transform: [{ event: 'agent/request', writes: ['z'] }] }),
      plugin('c', { transform: [{ event: 'tools/post-execute', writes: ['a'] }] }),
      plugin('d', { transform: [{ event: 'tools/post-execute', writes: ['a'] }] }),
    ])
    expect(result.map(entry => entry.details.property)).toEqual([
      'agent/request.z',
      'tools/post-execute.a',
    ])
  })

  it('rejects an unscoped writer against a scoped writer on the scoped key', () => {
    const result = issues([
      plugin('a', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('b', {
        scopes: ['agent-1'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    ])
    expect(result).toEqual([{
      code: 'write-conflict',
      details: { a: 'a', b: 'b', property: 'agent/request.config', scope: 'agent-1' },
    }])
  })

  it('deduplicates one plugin writing the same slot twice', () => {
    const result = issues([
      plugin('a', {
        transform: [
          { event: 'agent/request', writes: ['config'] },
          { event: 'agent/request', writes: ['config'] },
        ],
      }),
    ])
    expect(result).toEqual([])
  })
})
