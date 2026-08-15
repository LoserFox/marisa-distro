/**
 * Unit tests for the dsh-sidechain browser half: the jump-target resolver and
 * the slot registration wiring (auto-open of created side conversations).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommandNode } from '@deepseek-ai/dsh-client-runtime/client'
import { apply } from '../src/client/index'
import { observeCreatedChildren, resolveChildSessionId } from '../src/client/SideCommandCard'
import { resetSidechainPanel } from '../src/client/panel-state'

const CHILD_ID = '54c34e5e-1c29-4a6c-a2f7-4b19a3d92914'

function node(partial: Partial<CommandNode> = {}): CommandNode {
  return {
    kind: 'command',
    seq: 1,
    time: 0,
    commandId: 'cmd-1' as CommandNode['commandId'],
    name: 'side',
    args: null,
    outcome: null,
    ...partial,
  }
}

describe('resolveChildSessionId', () => {
  it('resolves /side success text', () => {
    expect(resolveChildSessionId(node({
      name: 'side',
      outcome: { kind: 'success', text: `Side conversation started: ${CHILD_ID}.` },
    }), 'side')).toBe(CHILD_ID)
  })

  it('resolves /btw success text with the started marker', () => {
    expect(resolveChildSessionId(node({
      name: 'btw',
      outcome: { kind: 'success', text: `BTW question started: ${CHILD_ID}.` },
    }), 'btw')).toBe(CHILD_ID)
  })

  it('returns undefined while the command is running', () => {
    expect(resolveChildSessionId(node({ outcome: null }), 'side')).toBeUndefined()
  })

  it('returns undefined on failure', () => {
    expect(resolveChildSessionId(node({ outcome: { kind: 'error', text: 'boom' } }), 'side')).toBeUndefined()
  })

  it('returns undefined on malformed text', () => {
    expect(resolveChildSessionId(node({ outcome: { kind: 'success', text: 'no id here' } }), 'side')).toBeUndefined()
    expect(resolveChildSessionId(node({ outcome: { kind: 'success', text: 'plain answer' } }), 'btw')).toBeUndefined()
  })
})

describe('observeCreatedChildren', () => {
  it('ignores commands already settled when the observer mounts', () => {
    const initial = observeCreatedChildren(undefined, [node({
      time: 20,
      outcome: { kind: 'success', text: `Side conversation started: ${CHILD_ID}.` },
    })], 10)
    expect(initial.children).toEqual([])
  })

  it('reveals a fast command that appears already settled after mount', () => {
    const initial = observeCreatedChildren(undefined, [], 10)
    const settled = observeCreatedChildren(initial.known, [node({
      time: 20,
      name: 'btw',
      outcome: { kind: 'success', text: `BTW question started: ${CHILD_ID}.` },
    })], 10)
    expect(settled.children).toEqual([CHILD_ID])
  })

  it('ignores old replay rows that arrive after an initially empty history snapshot', () => {
    const initial = observeCreatedChildren(undefined, [], 20)
    const replay = observeCreatedChildren(initial.known, [node({
      time: 10,
      outcome: { kind: 'success', text: `Side conversation started: ${CHILD_ID}.` },
    })], 20)
    expect(replay.children).toEqual([])
  })

  it('reveals a command when it transitions from pending to success exactly once', () => {
    const initial = observeCreatedChildren(undefined, [], 10)
    const pending = observeCreatedChildren(initial.known, [node({ time: 20 })], 10)
    expect(pending.children).toEqual([])
    const settled = observeCreatedChildren(pending.known, [node({
      time: 20,
      outcome: { kind: 'success', text: `Side conversation started: ${CHILD_ID}.` },
    })], 10)
    expect(settled.children).toEqual([CHILD_ID])
    expect(observeCreatedChildren(settled.known, [node({
      time: 20,
      outcome: { kind: 'success', text: `Side conversation started: ${CHILD_ID}.` },
    })], 10).children).toEqual([])
  })

  it('does not reveal running, failed, or unrelated commands', () => {
    const initial = observeCreatedChildren(undefined, [], 10)
    const observed = observeCreatedChildren(initial.known, [
      node({ time: 20 }),
      node({ time: 20, commandId: 'cmd-2' as CommandNode['commandId'], outcome: { kind: 'error', text: 'boom' } }),
      node({ time: 20, commandId: 'cmd-3' as CommandNode['commandId'], name: 'compact', outcome: { kind: 'success' } }),
    ], 10)
    expect(observed.children).toEqual([])
  })
})

describe('client apply wiring', () => {
  interface RegisteredSlot {
    options: {
      name: string
      key?: string
      id?: string
      order?: number
      locale?: string
      inject?: (parentSessionId: string) => {
        revealPanel?: (childSessionId: string) => void
        readTranscript?: (address: unknown) => Promise<unknown>
        readActivity?: (address: unknown) => Promise<unknown>
        sendPrompt?: (address: unknown, text: string) => Promise<boolean>
        refresh?: (parentSessionId: string) => void
        setCatalogOpen?: (parentSessionId: string, open: boolean) => void
        openPath?: (path: string) => void
      }
    }
  }

  beforeEach(() => {
    resetSidechainPanel()
  })

  function fakeCtx() {
    const registered: RegisteredSlot[] = []
    const refreshSubagents = vi.fn(() => Promise.resolve())
    const setSubagentCatalogOpen = vi.fn()
    const registerLocale = vi.fn()
    const history = vi.fn(() => Promise.resolve({ result: { ok: true, value: { events: [], hasMore: false } } }))
    const prompt = vi.fn(() => Promise.resolve({ result: { ok: true } }))
    const connection = { api: { sessions: { history }, subagents: { prompt } } }
    const workspaces = { openPath: vi.fn() }
    const ctx = {
      sessions: { refreshSubagents, setSubagentCatalogOpen, binding: vi.fn(() => undefined) },
      locale: { register: registerLocale },
      effect: (fn: () => void) => { fn() },
      get: (name: string) => name === 'connection' ? connection : name === 'workspaces' ? workspaces : undefined,
      slots: {
        register: (options: RegisteredSlot['options'], _component: unknown) => {
          registered.push({ options })
          return () => {}
        },
        // The real runtime waits for the slot declaration before running the
        // register callback; the declaration exists in this test context.
        inject: (_name: string, register: () => () => void) => {
          register()
        },
      },
    }
    return { ctx, registered, history, prompt, refreshSubagents, setSubagentCatalogOpen, workspaces }
  }

  it('registers keyed cards, an always-mounted panel host, and the header toggle', () => {
    const { ctx, registered } = fakeCtx()
    apply(ctx as never)
    expect(registered.map(entry => [entry.options.name, entry.options.key ?? entry.options.id]))
      .toEqual([
        ['conversation.chat.commandview', 'side'],
        ['conversation.chat.commandview', 'btw'],
        ['conversation.input.dock', 'sidechain-panel-host'],
        ['conversation.session.header.actions', 'sidechain-panel-toggle'],
      ])
  })

  it('panel action sits after the subagent catalog in the header', () => {
    const { ctx, registered } = fakeCtx()
    apply(ctx as never)
    const panel = registered.find(entry => entry.options.id === 'sidechain-panel-toggle')!
    expect(panel.options.order).toBe(20)
    expect(panel.options.locale).toBe('sidechain')
  })

  it('panel inject wires the transcript RPC and catalog methods', async () => {
    const { ctx, registered, history, prompt, refreshSubagents, setSubagentCatalogOpen } = fakeCtx()
    apply(ctx as never)
    const entry = registered.find(item => item.options.id === 'sidechain-panel-host')!
    const injected = entry.options.inject!('parent-1')
    const address = { parentSessionId: 'parent-1', childSessionId: CHILD_ID, mode: 'continuable' }
    const transcript = await injected.readTranscript!(address)
    expect(history).toHaveBeenCalledWith({ sessionId: CHILD_ID, maxMessages: 8 })
    expect(transcript).toEqual({ rows: [], produced: [] })
    // The activity line reads a lighter tail page; an empty log yields null.
    const activityLine = await injected.readActivity!(address)
    expect(history).toHaveBeenCalledWith({ sessionId: CHILD_ID, maxMessages: 6 })
    expect(activityLine).toBeNull()
    const accepted = await injected.sendPrompt!(address, '继续')
    expect(prompt).toHaveBeenCalledWith({ ...address, content: [{ type: 'text', text: '继续' }] })
    expect(accepted).toBe(true)
    injected.refresh!('parent-1')
    expect(refreshSubagents).toHaveBeenCalledWith('parent-1')
    injected.setCatalogOpen!('parent-1', true)
    expect(setSubagentCatalogOpen).toHaveBeenCalledWith('parent-1', true)
  })
})
