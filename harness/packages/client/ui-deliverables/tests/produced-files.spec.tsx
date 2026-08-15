// @vitest-environment jsdom
/**
 * ui-deliverables browser half: the derivation contract of
 * `producedForClosing` over finalized snapshot nodes, the row's rendering
 * and opener wiring, and the plugin registrations' fiber-teardown removal
 * (HMR safety) against the real SlotsService.
 */
import { Context } from 'cordis'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotsService } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  AssistantMessageNode, ConversationNode, ToolResultNode, UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale } from '@deepseek-ai/dsh-client-locale/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { ProducedFiles } from '../src/client/ProducedFiles.tsx'
import { producedForClosing, selectProducedFiles } from '../src/client/turn-deliverables.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { apply as applyInvariant } from '../src/invariant.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const user = (seq: number, text: string): UserMessageNode => ({
  kind: 'user',
  seq,
  time: seq * 1000,
  content: [{ type: 'text', text }] as never,
  source: null,
})
const assistant = (seq: number, text: string, turn = 1): AssistantMessageNode => ({
  kind: 'assistant', seq, time: seq * 1_000, turn, step: 1, blocks: [{ kind: 'text', text }],
})
const toolResult = (seq: number, callId: string, name = 'bash'): ToolResultNode => ({
  kind: 'tool-result', seq, time: seq * 1_000, callId,
  call: { name, argsRaw: `{"command":"cmd-${callId}","description":"run ${callId}"}` },
  callTime: seq * 1_000 - 500,
  content: [], isError: false, callView: null, resultView: null, subCalls: [],
})
const wrote = (seq: number, callId: string, ...paths: string[]): ToolResultNode => ({
  ...toolResult(seq, callId, 'write'),
  callView: {
    card: 'diff', title: `Write ${paths[0] ?? ''}`,
    diffs: paths.map(path => ({ path, oldText: null, newText: 'x' })),
    locations: paths.map(path => ({ path })),
  },
})

describe('producedForClosing derivation', () => {
  it('attributes each turn’s written files to the assistant that closes it', () => {
    const nodes: ConversationNode[] = [
      user(1, 'build it'),
      assistant(2, 'writing', 1),
      wrote(3, 'a', 'out/index.html'),
      // Same file touched twice in one turn is one deliverable, in first-seen order.
      wrote(4, 'b', 'out/app.css', 'out/index.html'),
      // A read is not a deliverable; a failed write has no file to open.
      { ...toolResult(5, 'c', 'read'), callView: { card: 'generic', title: 'Read x', locations: [{ path: 'x.ts' }] } },
      { ...wrote(6, 'd', 'out/broken.html'), isError: true },
      assistant(7, 'done', 1),
      user(8, 'again'),
      assistant(9, 'second turn', 2),
    ]
    expect(producedForClosing(nodes, 7)).toEqual(['out/index.html', 'out/app.css'])
    expect(selectProducedFiles({ nodes, seq: 7, openFile: () => {} })).toEqual(['out/index.html', 'out/app.css'])
    expect(selectProducedFiles({ nodes, seq: 9, openFile: () => {} })).toBeNull()
    // A turn that produced nothing yields the empty list, and so does an
    // anchor the window does not contain.
    expect(producedForClosing(nodes, 9)).toEqual([])
    expect(producedForClosing([user(1, 'hi'), assistant(2, 'hello', 1)], 2)).toEqual([])
    expect(producedForClosing(nodes, 999)).toEqual([])
  })


  it('counts a generic edit and never spills across the turn boundary', () => {
    const inserted = (seq: number, callId: string, path: string): ToolResultNode => ({
      ...toolResult(seq, callId, 'str_replace_editor'),
      // str_replace_editor's insert mutates behind a generic card, so the
      // discriminant is the render intent, not the card shape alone.
      callView: { card: 'generic', title: `insert ${path}`, kind: 'edit', locations: [{ path }] },
    })
    const nodes: ConversationNode[] = [
      user(1, 'insert a line'),
      inserted(2, 'i', 'notes.md'),
      assistant(3, 'inserted', 1),
      // Turn 2 mutates and then ends with no content text (interrupted, or its
      // last text preceded the tool): its paths must not ride into turn 3.
      user(4, 'now rewrite it'),
      wrote(5, 'w', 'leaked.txt'),
      user(6, 'and again'),
      wrote(7, 'w2', 'notes.md'),
      assistant(8, 'done', 3),
    ]
    expect(producedForClosing(nodes, 3)).toEqual(['notes.md'])
    // Turn 3 lists only its own file — and the dedup set did not suppress the
    // rewrite of a path an earlier turn already touched.
    expect(producedForClosing(nodes, 8)).toEqual(['notes.md'])
    expect(producedForClosing(nodes, 8)).not.toContain('leaked.txt')
  })

  it('resets on a turn-number change and skips turnless, viewless, and locationless nodes', () => {
    const nodes: ConversationNode[] = [
      user(1, 'go'),
      // A turnless surface node neither tracks nor resets the boundary.
      { kind: 'unknown', seq: 1.5, time: 1_500, type: 'x', data: null },
      wrote(2, 'w', 'turn-one.txt'),
      // A view-less result (window truncation) and cards without locations
      // contribute nothing rather than crashing the walk.
      toolResult(3, 'plain'),
      { ...toolResult(4, 'nl', 'write'), callView: { card: 'diff', title: 'Write', diffs: [] } },
      { ...toolResult(5, 'ge', 'str_replace_editor'), callView: { card: 'generic', title: 'insert', kind: 'edit' } },
      assistant(6, 'mid narration', 1),
      // Turn number advances with no user message in the window (truncated
      // history): the accumulator must reset all the same.
      assistant(7, 'closing', 2),
    ]
    expect(producedForClosing(nodes, 6)).toEqual(['turn-one.txt'])
    expect(producedForClosing(nodes, 7)).toEqual([])
  })
})

describe('ProducedFiles row', () => {
  const t = makeTranslate(zh)

  it('renders capped chips with the full path reachable and opens one on click', () => {
    // Seven files: six chips plus an explicit remainder — the row bounds what
    // it shows and says so rather than dropping the rest silently.
    const paths = ['deep/a.html', 'b.css', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts']
    const openFile = vi.fn<(path: string) => void>()
    const view = render(<ProducedFiles matched={paths} openFile={openFile} t={t} />)
    expect(view.getByText('产物')).toBeTruthy()
    // Chips carry the basename; the full path stays reachable as the title.
    const chip = view.getByRole('button', { name: '打开 deep/a.html' })
    expect(chip.textContent).toBe('a.html')
    expect(chip.getAttribute('title')).toBe('deep/a.html')
    expect(view.queryByRole('button', { name: '打开 g.ts' })).toBeNull()
    expect(view.getByText('还有 1 个')).toBeTruthy()
    fireEvent.click(chip)
    expect(openFile).toHaveBeenCalledWith('deep/a.html')
  })
})

describe('package shells', () => {
  it('the node half mounts inert and the invariant companion registers ownership', async () => {
    // The node half is deliberately inert; mounting it must simply not throw.
    applyNode()
    const registered: string[] = []
    const ctx = new Context()
    ctx.provide('invariants')
    ctx.set('invariants', {
      register: (pkg: string) => { registered.push(pkg); return () => {} },
    } as never)
    const dispose = await applyInvariant(ctx)
    expect(registered).toEqual(['@deepseek-ai/dsh-client-ui-deliverables'])
    expect(dispose).toBeTypeOf('function')
  })
})

describe('plugin registration', () => {
  it('registers the tail entry and fiber disposal removes it', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotsService).await()
    // The owning view's child declaration, stood up by a bench root entry.
    ctx.slots.register({
      name: 'root',
      children: { 'conversation.chat.turnTail': { kind: 'chain', scope: 'session' } },
    } as never, () => null)
    await ctx.plugin({ inject: ['slots'], apply: applyLocale }).await()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(1)

    await fiber.dispose()
    expect(ctx.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
  })
})
