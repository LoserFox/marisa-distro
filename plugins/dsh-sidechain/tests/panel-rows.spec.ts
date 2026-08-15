/**
 * Unit tests for the sidechain panel's row derivation helpers.
 */

import { describe, expect, it } from 'vitest'
import type { SessionId, SubagentCatalogSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { SubagentCatalog } from '@deepseek-ai/dsh-client-connection/client'
import { runningCount, sidechainRows } from '../src/client/SidechainPanel'

const PARENT = 'parent-1' as SessionId
const CHILD_A = '11111111-1111-4111-8111-111111111111' as SessionId
const CHILD_B = '22222222-2222-4222-8222-222222222222' as SessionId

function snapshot(entries: SubagentCatalog['entries']): SubagentCatalogSnapshot & SubagentCatalog {
  return { entries, parentAvailable: true, state: 'ready', error: null }
}

describe('sidechainRows', () => {
  it('returns [] for an absent catalog', () => {
    expect(sidechainRows(undefined, {})).toEqual([])
  })

  it('resolves child labels: entry label, then summary title, then id', () => {
    const rows = sidechainRows(snapshot([
      { kind: 'child', id: CHILD_A, activity: 'running', hasChildren: false, mode: 'continuable', label: '调研 X' },
      { kind: 'child', id: CHILD_B, activity: 'inactive', hasChildren: false, mode: 'one-shot' },
    ]), {
      [CHILD_B]: {
        id: CHILD_B, title: '问答标题', displayTitle: '问答标题', running: false, blank: false, updatedAt: 0,
      },
    })
    expect(rows).toEqual([
      { kind: 'child', id: CHILD_A, mode: 'continuable', activity: 'running', label: '调研 X' },
      { kind: 'child', id: CHILD_B, mode: 'one-shot', activity: 'inactive', label: '问答标题' },
    ])
  })

  it('falls back to the session id without any title source', () => {
    const rows = sidechainRows(snapshot([
      { kind: 'child', id: CHILD_A, activity: 'inactive', hasChildren: false, mode: 'one-shot' },
    ]), {})
    expect(rows[0]).toEqual({ kind: 'child', id: CHILD_A, mode: 'one-shot', activity: 'inactive', label: CHILD_A })
  })

  it('passes diagnostics through', () => {
    const rows = sidechainRows(snapshot([
      { kind: 'diagnostic', id: CHILD_A, reason: 'corrupt' },
    ]), {})
    expect(rows).toEqual([{ kind: 'diagnostic', id: CHILD_A, reason: 'corrupt' }])
  })
})

describe('runningCount', () => {
  it('counts only running child rows', () => {
    const rows = sidechainRows(snapshot([
      { kind: 'child', id: CHILD_A, activity: 'running', hasChildren: false, mode: 'continuable', label: 'a' },
      { kind: 'child', id: CHILD_B, activity: 'inactive', hasChildren: false, mode: 'one-shot' },
      { kind: 'diagnostic', id: PARENT, reason: 'unavailable' },
    ]), {})
    expect(runningCount(rows)).toBe(1)
  })
})
