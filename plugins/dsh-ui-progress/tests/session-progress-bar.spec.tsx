// @vitest-environment jsdom
/**
 * Component-level smoke tests for SessionProgressBar: the resident strip
 * renders the live token-rate chip while the model streams (and only then),
 * computed as a sliding-window average that changes at most once per second.
 * Every @deepseek-ai face is stubbed — icons via vi.mock, session/projection
 * seats via props — so the suite needs no resolution into the harness
 * snapshot's sources; CSS Modules stub to empty objects under vitest's
 * default css handling. The pure rate math itself is pinned by
 * tests/token-rate.spec.ts; this suite proves the wiring (anchor hook +
 * sliding-window clock + render gates).
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { SessionProgressBar, type SessionProgressBarProps } from '../src/client/SessionProgressBar.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconLoadingOutline16: () => null,
  IconSparkle16: () => null,
  IconWarningOutline16: () => null,
}))

afterEach(cleanup)
afterEach(() => vi.useRealTimers())

/** Translate stub over the zh dictionary with {param} interpolation. */
function makeT(): SessionProgressBarProps['t'] {
  const t = (key: string, params?: Record<string, string | number>): string => {
    const template = (zh as Record<string, string>)[key] ?? key
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
  }
  return t as unknown as SessionProgressBarProps['t']
}

const useProjection = (() => undefined) as unknown as SessionProgressBarProps['useProjection']
const useSessions = (() => ({ byId: {} })) as unknown as SessionProgressBarProps['useSessions']

type BarOverrides = {
  running?: boolean
  partial?: ConversationSnapshot['partial']
  pending?: ConversationSnapshot['pending']
  nodes?: ConversationSnapshot['nodes']
}

function makeSnapshot(overrides: BarOverrides = {}): ConversationSnapshot {
  return {
    sessionId: 'session-1' as SessionId,
    views: { get: () => undefined },
    chat: {} as ConversationSnapshot['chat'],
    nodes: overrides.nodes ?? [],
    turnTimings: new Map([[1, { startTime: 1_000 }]]),
    turnEnds: new Map(),
    partial: overrides.partial ?? null,
    runningCalls: [],
    pending: overrides.pending ?? [],
    queue: [],
    running: overrides.running ?? false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  }
}

/** Full streaming partial: 4 CJK-wide chars -> 4 estimated tokens. */
const STREAMING_PARTIAL = {
  turn: 1,
  step: 1,
  blocks: [{ kind: 'text' as const, text: '你好世界' }],
}

/** Half of it: 2 estimated tokens, used to simulate tokens arriving over time. */
const PARTIAL_START = {
  turn: 1,
  step: 1,
  blocks: [{ kind: 'text' as const, text: '你好' }],
}

function barElement(overrides: BarOverrides = {}): ReactElement {
  const session = makeSnapshot(overrides)
  return (
    <SessionProgressBar
      session={session}
      // The dock owner share includes the live input state and the standard
      // session kit; the strip reads none of them (it consumes the session
      // snapshot and projection seats directly), minimal stubs suffice.
      input={{ draft: '', imageIds: [], draftRev: 0, phase: 'plain', occurrences: [], queue: [] }}
      sessionId={session.sessionId}
      useSession={(() => undefined) as unknown as SessionProgressBarProps['useSession']}
      useInput={(() => undefined) as unknown as SessionProgressBarProps['useInput']}
      inputActions={{} as unknown as SessionProgressBarProps['inputActions']}
      t={makeT()}
      useProjection={useProjection}
      useSessions={useSessions}
      useWorkspaces={(() => []) as unknown as SessionProgressBarProps['useWorkspaces']}
    />
  )
}

/** Render the strip and return a rerender that swaps the snapshot (streaming simulation). */
function renderBar(overrides: BarOverrides = {}): { rerender: (next: BarOverrides) => void } {
  const view = render(barElement(overrides))
  return { rerender: (next: BarOverrides) => view.rerender(barElement(next)) }
}

/** A settled step priced 8 real output tokens over 4 weighted chars -> density 2. */
const CALIBRATED_NODES = [{
  kind: 'assistant',
  seq: 1,
  time: 1_000,
  turn: 1,
  step: 1,
  blocks: STREAMING_PARTIAL.blocks,
  usage: { outputTokens: 8 },
}] as unknown as ConversationSnapshot['nodes']

describe('SessionProgressBar live token rate', () => {
  it('mounts and renders the running state from the zh dictionary', () => {
    renderBar({ running: true, partial: STREAMING_PARTIAL })
    expect(screen.getByText('正在执行')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('shows a sliding-window token rate that updates at most once per second', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const bar = renderBar({ running: true, partial: PARTIAL_START })
    // Two more tokens arrive 300ms into the first window.
    act(() => {
      vi.advanceTimersByTime(300)
    })
    bar.rerender({ running: true, partial: STREAMING_PARTIAL })
    // First window completes at 11_000: gained 4-2 = 2 tokens over 1s.
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(screen.getByText('2 tok/s')).toBeTruthy()
    // A window with no new tokens keeps the previous reading (no 0-flicker).
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(screen.getByText('2 tok/s')).toBeTruthy()
  })

  it('scales the live estimate by the calibrated density of a settled step', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    // Density 2: 2 weighted chars -> 4 estimated tokens, 4 -> 8.
    const bar = renderBar({ running: true, partial: PARTIAL_START, nodes: CALIBRATED_NODES })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    bar.rerender({ running: true, partial: STREAMING_PARTIAL, nodes: CALIBRATED_NODES })
    act(() => {
      vi.advanceTimersByTime(700)
    })
    // Gained 8-4 = 4 tokens over 1s -> 4 tok/s.
    expect(screen.getByText('4 tok/s')).toBeTruthy()
  })

  it('hides the chip while a human interaction waits (paused stream)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const pending = [{ id: 'p1', kind: 'approval' as const }] as unknown as ConversationSnapshot['pending']
    renderBar({ running: true, partial: STREAMING_PARTIAL, pending })
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    expect(screen.queryByText(/tok\/s/)).toBeNull()
    expect(screen.getByText('等待审批')).toBeTruthy()
  })

  it('hides the chip until the partial carries visible tokens', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    renderBar({ running: true, partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: '' }] } })
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    expect(screen.queryByText(/tok\/s/)).toBeNull()
  })

  it('renders no chip when idle', () => {
    renderBar()
    expect(screen.queryByText(/tok\/s/)).toBeNull()
    expect(screen.getByText('会话就绪')).toBeTruthy()
  })
})
