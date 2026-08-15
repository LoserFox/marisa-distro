/** @vitest-environment jsdom */
/** Interaction and RPC lifecycle tests for draft-only candidate bubbles. */
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { SuggestionBubbles, type SuggestionBubblesProps } from '../src/client/SuggestionBubbles.tsx'
import type { SuggestedRepliesStateResponse } from '../src/rpc.ts'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

const generating = (revision = 1, turn = 1): SuggestedRepliesStateResponse => ({
  lifecycle: { createdAt: 1, cwd: '/work' },
  revision,
  turn,
  phase: 'generating',
  suggestions: [],
})

const ready = (
  suggestions: readonly string[],
  revision = 2,
  turn = 1,
): SuggestedRepliesStateResponse => ({
  lifecycle: { createdAt: 1, cwd: '/work' },
  revision,
  turn,
  phase: 'ready',
  suggestions,
})

const cleared = (revision = 0, turn = 0): SuggestedRepliesStateResponse => ({
  lifecycle: { createdAt: 1, cwd: '/work' },
  revision,
  turn,
  phase: 'cleared',
  suggestions: [],
})

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

/** Build the complete slot prop face around one RPC caller and input phase. */
function props(rpc: ClientConnectionRpc, sessionId = 'session-1', phase = 'plain') {
  const setDraft = vi.fn()
  const submit = vi.fn()
  const value = {
    rpc,
    sessionId,
    useInput: (selector: (state: { phase: string }) => unknown) => selector({ phase }),
    inputActions: { setDraft, submit, addImages: () => true, removeImage: () => undefined, pruneImages: () => undefined },
    t: (key: string) => ({ title: '下一步建议', hint: '点击填入输入框', loading: '生成中' })[key] ?? key,
  } as unknown as SuggestionBubblesProps
  return { value, setDraft, submit }
}

function rpcReturning(initial: SuggestedRepliesStateResponse) {
  const watch = deferred<{ ok: true; value: SuggestedRepliesStateResponse }>()
  let nextWatch = watch.promise
  const call = vi.fn((
    _channel: string,
    endpoint: string,
    _payload: unknown,
    _signal?: AbortSignal,
  ) => {
    if (endpoint === 'state.get') return Promise.resolve({ ok: true, value: initial })
    const response = nextWatch
    nextWatch = new Promise(() => {})
    return response
  })
  return { rpc: { call } as unknown as ClientConnectionRpc, call, watch }
}

describe('SuggestionBubbles', () => {
  it('loads state.get, watches from its revision, and renders updates without projections', async () => {
    const kit = rpcReturning(generating(4, 7))
    const component = props(kit.rpc, 'session-a')
    const { getByRole } = render(<SuggestionBubbles {...component.value} />)

    expect((await waitFor(() => getByRole('status'))).textContent).toBe('生成中')
    await waitFor(() => expect(kit.call).toHaveBeenCalledTimes(2))
    expect(kit.call).toHaveBeenNthCalledWith(
      1,
      '/suggested-replies',
      'state.get',
      { sessionId: 'session-a' },
      expect.any(AbortSignal),
    )
    expect(kit.call).toHaveBeenNthCalledWith(
      2,
      '/suggested-replies',
      'state.watch',
      { sessionId: 'session-a', lifecycle: { createdAt: 1, cwd: '/work' }, revision: 4 },
      expect.any(AbortSignal),
    )

    await act(async () => kit.watch.resolve({ ok: true, value: ready(['继续实现'], 5, 7) }))
    expect(await waitFor(() => getByRole('button', { name: '继续实现' }))).toBeDefined()
  })

  it('renders nothing while state.get is pending or when state is cleared', async () => {
    const initial = deferred<{ ok: true; value: SuggestedRepliesStateResponse }>()
    let nextResponse = initial.promise
    const call = vi.fn(() => {
      const response = nextResponse
      nextResponse = new Promise(() => {})
      return response
    })
    const rpc = { call } as unknown as ClientConnectionRpc
    const { container } = render(<SuggestionBubbles {...props(rpc).value} />)

    expect(container.innerHTML).toBe('')
    await act(async () => initial.resolve({ ok: true, value: cleared(3, 2) }))
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2))
    expect(container.innerHTML).toBe('')
  })

  it('clicks only setDraft and never submits', async () => {
    const rpcKit = rpcReturning(ready(['继续实现', '运行测试']))
    const kit = props(rpcKit.rpc)
    const { getByRole } = render(<SuggestionBubbles {...kit.value} />)

    fireEvent.click(await waitFor(() => getByRole('button', { name: '继续实现' })))
    expect(kit.setDraft).toHaveBeenCalledWith('继续实现')
    expect(kit.submit).not.toHaveBeenCalled()
  })

  it('disables candidate clicks outside the plain input phase', async () => {
    const rpcKit = rpcReturning(ready(['继续实现']))
    const kit = props(rpcKit.rpc, 'session-1', 'submitting')
    const { getByRole } = render(<SuggestionBubbles {...kit.value} />)
    const button = await waitFor(() => getByRole('button', { name: '继续实现' })) as HTMLButtonElement

    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(kit.setDraft).not.toHaveBeenCalled()
  })

  it('aborts the active watch on unmount', async () => {
    const kit = rpcReturning(ready(['继续实现'], 6))
    const { unmount } = render(<SuggestionBubbles {...props(kit.rpc).value} />)
    await waitFor(() => expect(kit.call).toHaveBeenCalledTimes(2))
    const signal = kit.call.mock.calls[1]?.[3]

    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('aborts the old Session watch and cannot publish its stale response after a Session change', async () => {
    const oldWatch = deferred<{ ok: true; value: SuggestedRepliesStateResponse }>()
    const newWatch = deferred<{ ok: true; value: SuggestedRepliesStateResponse }>()
    const call = vi.fn((
      _channel: string,
      endpoint: string,
      payload: unknown,
      _signal?: AbortSignal,
    ) => {
      const { sessionId } = payload as { sessionId: string }
      if (endpoint === 'state.get') {
        return Promise.resolve({ ok: true, value: ready([sessionId], sessionId === 'old' ? 1 : 10) })
      }
      return sessionId === 'old' ? oldWatch.promise : newWatch.promise
    })
    const rpc = { call } as unknown as ClientConnectionRpc
    const first = props(rpc, 'old')
    const { getByRole, queryByRole, rerender } = render(<SuggestionBubbles {...first.value} />)
    expect(await waitFor(() => getByRole('button', { name: 'old' }))).toBeDefined()
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2))
    const oldSignal = call.mock.calls[1]?.[3]

    rerender(<SuggestionBubbles {...props(rpc, 'new').value} />)
    expect(oldSignal?.aborted).toBe(true)
    expect(await waitFor(() => getByRole('button', { name: 'new' }))).toBeDefined()

    await act(async () => oldWatch.resolve({ ok: true, value: ready(['stale'], 2) }))
    expect(queryByRole('button', { name: 'stale' })).toBeNull()
    expect(getByRole('button', { name: 'new' })).toBeDefined()
  })

  it('keeps one style tag for multiple mounts and removes it after the last unmount', () => {
    const first = render(<SuggestionBubbles {...props(rpcReturning(ready(['a'])).rpc, 'first').value} />)
    const second = render(<SuggestionBubbles {...props(rpcReturning(ready(['b'])).rpc, 'second').value} />)
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('flex-wrap: nowrap')
    expect(document.getElementById('dsh-suggested-replies-style')?.textContent).toContain('overflow-x: auto')
    first.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(1)
    second.unmount()
    expect(document.querySelectorAll('#dsh-suggested-replies-style')).toHaveLength(0)
  })
})
