/**
 * Pure plan previews (#13, §15.3/PO:242): accepted plans carry displaced
 * bystanders with the displacing edge, rejected plans preview the exact code,
 * and installs shadowed by static entries report `wouldShadow`.
 */

import { describe, expect, it } from 'vitest'
import { planOperation, type PlanState } from '@r05en1cu/dsh-mygo'
import { plugin, SLOT_KINDS } from './derivation-fixtures.ts'

function state(plugins: PlanState['plugins']): PlanState {
  return { plugins, slotKinds: SLOT_KINDS }
}

describe('planOperation install', () => {
  it('names the displaced bystander and the displacing edge (PO:111 sample)', () => {
    const current = state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
    ])
    const plan = planOperation({
      op: 'install',
      plugin: plugin('c', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    }, current)
    expect(plan.accepted).toBe(true)
    expect(plan.wouldShadow).toBe(false)
    expect(plan.displaced).toEqual([{
      id: 'b',
      edge: { from: 'c', to: 'a', property: 'agent/request.config' },
    }])
    expect(plan.error).toBeUndefined()
  })

  it('leaves an unchanged-relative-rank survivor unlisted', () => {
    const plan = planOperation({
      op: 'install',
      plugin: plugin('c', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('d'),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([{
      id: 'b',
      edge: { from: 'c', to: 'a', property: 'agent/request.config' },
    }])
  })

  it('handles a brand-new scope key created by the installed plugin', () => {
    const plan = planOperation({
      op: 'install',
      plugin: plugin('scoped', {
        scopes: ['agent-new'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([])
  })

  it('reports a bystander once when displaced in several scopes (first scope wins)', () => {
    const plan = planOperation({
      op: 'install',
      plugin: plugin('z', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    }, state([
      plugin('p', {
        transform: [
          { event: 'agent/request', reads: ['config'] },
          { event: 'agent/request', reads: ['q'] },
        ],
      }),
      plugin('k', { transform: [{ event: 'agent/request', writes: ['q'] }] }),
      plugin('r'),
      plugin('s', { scopes: ['agent-k'] }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([
      { id: 'r', edge: { from: 'z', to: 'p', property: 'agent/request.config' } },
      { id: 's', edge: { from: 'z', to: 'p', property: 'agent/request.config' } },
    ])
  })

  it('previews the first relationship conflict with its template message', () => {
    const plan = planOperation({
      op: 'install',
      plugin: plugin('c', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    }, state([
      plugin('a', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ]))
    expect(plan.accepted).toBe(false)
    expect(plan.displaced).toEqual([])
    expect(plan.error?.code).toBe('write-conflict')
    expect(plan.error?.message).toContain('agent/request.config')
    expect(plan.error?.message).toContain('a')
    expect(plan.error?.message).toContain('c')
  })

  it('rejects an install onto an existing dynamic id and shadows a static incumbent', () => {
    const dynamic = planOperation({
      op: 'install',
      plugin: plugin('a'),
    }, state([plugin('a')]))
    expect(dynamic.accepted).toBe(false)
    expect(dynamic.error?.code).toBe('concurrent-operation')
    expect(dynamic.error?.message).toContain('a')
    expect(dynamic.displaced).toEqual([])

    const staticPlan = planOperation({
      op: 'install',
      plugin: plugin('a', { origin: 'runtime-api' }),
    }, state([plugin('a', { origin: 'static' })]))
    expect(staticPlan).toEqual({
      accepted: true,
      displaced: [],
      wouldShadow: true,
    })
  })
})

describe('planOperation uninstall', () => {
  it('is idempotent for an unknown id', () => {
    expect(planOperation({ op: 'uninstall', id: 'missing' }, state([]))).toEqual({
      accepted: true,
      displaced: [],
    })
  })

  it('rejects when dependents require a provided service', () => {
    const plan = planOperation({ op: 'uninstall', id: 'provider' }, state([
      plugin('provider', { provides: ['svc'] }),
      plugin('consumer', { requires: ['svc'] }),
    ]))
    expect(plan.accepted).toBe(false)
    expect(plan.error?.code).toBe('dependent-exists')
    expect(plan.error?.message).toContain('consumer')
  })

  it('names bystanders displaced by the removed plugin edge (fallback old edge)', () => {
    const plan = planOperation({ op: 'uninstall', id: 'c' }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('c', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([{
      id: 'b',
      edge: { from: 'c', to: 'a', property: 'agent/request.config' },
    }])
  })

  it('handles a scope key disappearing with its last scoped plugin', () => {
    const plan = planOperation({ op: 'uninstall', id: 'scoped' }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('scoped', {
        scopes: ['agent-old'],
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([])
  })
})

describe('planOperation replace', () => {
  it('re-evaluates conflicts without force and skips them with force', () => {
    const current = state([
      plugin('a', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
      plugin('b', { transform: [{ event: 'tools/post-execute', writes: ['value'] }] }),
    ])
    const candidate = plugin('a', {
      transform: [
        { event: 'agent/request', writes: ['config'] },
        { event: 'tools/post-execute', appends: ['value'] },
      ],
    })
    const rejected = planOperation({ op: 'replace', id: 'a', plugin: candidate }, current)
    expect(rejected.accepted).toBe(false)
    expect(rejected.error?.code).toBe('write-conflict')

    const forced = planOperation({ op: 'replace', id: 'a', plugin: candidate, force: true }, current)
    expect(forced.accepted).toBe(true)
    expect(forced.displaced).toEqual([])
  })

  it('rejects when the replacement drops a provided service dependents require', () => {
    const plan = planOperation({
      op: 'replace',
      id: 'provider',
      plugin: plugin('provider'),
    }, state([
      plugin('provider', { provides: ['svc'] }),
      plugin('consumer', { requires: ['svc'] }),
    ]))
    expect(plan.accepted).toBe(false)
    expect(plan.error?.code).toBe('dependent-exists')
    expect(plan.error?.message).toContain('consumer')
  })

  it('previews plugin-not-found for an unknown id and throws on id mismatch', () => {
    const unknown = planOperation({
      op: 'replace',
      id: 'missing',
      plugin: plugin('missing'),
    }, state([]))
    expect(unknown.accepted).toBe(false)
    expect(unknown.error?.code).toBe('plugin-not-found')
    expect(unknown.error?.message).toContain('replace')
    expect(unknown.error?.message).toContain('caller bug')

    expect(() => planOperation({
      op: 'replace',
      id: 'a',
      plugin: plugin('b'),
    }, state([plugin('a')]))).toThrow(/target mismatch/)
  })

  it('uses the first new edge as the displacing edge when no single edge restores', () => {
    const plan = planOperation({
      op: 'replace',
      id: 'x',
      plugin: plugin('x', { transform: [{ event: 'agent/request', writes: ['retry'] }] }),
    }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b', { transform: [{ event: 'agent/request', reads: ['retry'] }] }),
      plugin('x', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ]))
    // Old order [b, x, a] becomes [a, x, b]; the reversal needs the new
    // x→b edge, but removing it alone leaves [a, b] which still differs from
    // the old [b, a] survivor order — the fallback names the first new edge.
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([{
      id: 'a',
      edge: { from: 'x', to: 'b', property: 'agent/request.retry' },
    }])
  })

  it('falls back to the removed edge when the replacement declares no transform', () => {
    const plan = planOperation({
      op: 'replace',
      id: 'x',
      plugin: plugin('x'),
    }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('x', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([
      { id: 'a', edge: { from: 'x', to: 'a', property: 'agent/request.config' } },
      { id: 'b', edge: { from: 'x', to: 'a', property: 'agent/request.config' } },
    ])
  })
})

describe('planOperation enable/disable', () => {
  it('previews plugin-not-found for an unknown id and no-ops on already-applied state', () => {
    const unknown = planOperation({ op: 'enable', id: 'missing' }, state([]))
    expect(unknown.accepted).toBe(false)
    expect(unknown.error?.code).toBe('plugin-not-found')
    expect(unknown.error?.message).toContain('enable')
    expect(unknown.error?.message).toContain('missing')
    expect(unknown.error?.message).toContain('caller bug')

    const noOpEnable = planOperation({ op: 'enable', id: 'a' }, state([plugin('a')]))
    expect(noOpEnable).toEqual({ accepted: true, displaced: [] })
    const noOpDisable = planOperation(
      { op: 'disable', id: 'a' },
      state([plugin('a', { enabled: false })]),
    )
    expect(noOpDisable).toEqual({ accepted: true, displaced: [] })
  })

  it('names bystanders displaced when enabling adds edges', () => {
    const plan = planOperation({ op: 'enable', id: 'c' }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b'),
      plugin('c', {
        enabled: false,
        transform: [{ event: 'agent/request', writes: ['config'] }],
      }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([{
      id: 'b',
      edge: { from: 'c', to: 'a', property: 'agent/request.config' },
    }])
  })

  it('names bystanders displaced when disabling removes edges', () => {
    const plan = planOperation({ op: 'disable', id: 'd' }, state([
      plugin('a', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('b', { transform: [{ event: 'agent/request', reads: ['config'] }] }),
      plugin('c'),
      plugin('d', { transform: [{ event: 'agent/request', writes: ['config'] }] }),
    ]))
    expect(plan.accepted).toBe(true)
    expect(plan.displaced).toEqual([{
      id: 'c',
      edge: { from: 'd', to: 'a', property: 'agent/request.config' },
    }])
  })
})

describe('planOperation input contract', () => {
  it('rejects duplicate plugin ids in the managed set', () => {
    expect(() => planOperation({ op: 'uninstall', id: 'a' }, state([
      plugin('a'),
      plugin('a'),
    ]))).toThrow(/duplicate plugin id/)
  })
})
