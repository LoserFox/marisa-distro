/**
 * TranscriptAdapter over the raw append-only window: log-ordered projection of
 * append-origin events, one marker per landed compaction, replacement copies
 * hidden, command-lifecycle folding, node/array identity, call pairing, and
 * host-provided wire views.
 */

import { createUserMessage, CallId, createMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { TranscriptAdapter } from '../src/client/sessions/transcript-adapter.ts'
import { ev, plainTurn } from './event-script.ts'

const at = (seq: number, e: Record<string, unknown>): SessionEvent =>
  ({ seq, time: 1_700_000_000_000 + seq, ...e }) as unknown as SessionEvent

/** A `compact/summary` provenance event (log-only, no surfaceOp). */
function compactSummary(seq: number, summary: unknown = [{ type: 'text', text: '# 摘要\n\n保留事实' }]): SessionEvent {
  return at(seq, {
    type: 'compact/summary',
    data: {
      summary,
      shadowedRange: { start: 1, end: 3 },
      shadowedSeqs: [1, 3],
      shadowedTokenCount: 100,
      provider: 'fake',
      model: 'compact-1',
    },
  })
}

/** The replacement user message a compaction backend lands (the checkpoint). */
function checkpoint(
  seq: number,
  summarySeq: number,
  { start = 1, end = 3, sourceEventSeqs = [summarySeq, start, end] }: {
    start?: number
    end?: number
    sourceEventSeqs?: number[]
  } = {},
): SessionEvent {
  return at(seq, {
    type: 'user/message',
    surfaceOp: { op: 'replace', start, end },
    sourceEventSeqs,
    data: createUserMessage({
      content: [{ type: 'text', text: '<context_checkpoint>model only</context_checkpoint>' }],
      source: { kind: 'plugin', plugin: 'compact' },
    }),
  })
}

describe('TranscriptAdapter', () => {
  it('projects a window starting past seq 0 at its own log positions', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset(plainTurn(100, 5, '偏移问', '偏移答'))
    expect(adapter.nodes().map(n => [n.kind, n.seq])).toEqual([['user', 101], ['assistant', 103]])
  })

  it('appends incrementally keeping old node references (materialize-once identity)', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset(plainTurn(0, 0, 'a', 'b'))
    const first = adapter.nodes()
    adapter.append(ev.user(6, '追加'))
    const second = adapter.nodes()
    expect(second).toHaveLength(3)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second).not.toBe(first) // a real change swaps the array
  })

  it('keeps the array reference across a chunk storm and swaps it when a node lands', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset(plainTurn(0, 0, 'a', 'b'))
    const settled = adapter.nodes()
    adapter.append(ev.chunkStart(6, 1))
    expect(adapter.nodes()).toBe(settled)
    adapter.append(ev.chunkText(7, 1, '流式'))
    expect(adapter.nodes()).toBe(settled)
    adapter.append(ev.assistant(8, 1, '流式完成'))
    const finalized = adapter.nodes()
    expect(finalized).not.toBe(settled)
    expect(finalized.at(-1)).toMatchObject({ kind: 'assistant', seq: 8 })
  })

  it('materializes every append-origin variant with field mapping', () => {
    const adapter = new TranscriptAdapter()
    const steering = createUserMessage({
      content: [{ type: 'text', text: '插话' }],
      source: { kind: 'user' },
    })
    adapter.reset([
      ev.user(0, '用户'),
      ev.assistant(1, 0, '助手'),
      at(2, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, inserted: [steering],
      } }),
      at(3, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, removedCount: 1, inserted: [],
      } }),
      at(4, { type: 'user/message', surfaceOp: 'append', data: steering }),
      at(5, { type: 'user/message', surfaceOp: 'append', data: createUserMessage({
        content: [{ type: 'text', text: '上下文' }], source: { kind: 'plugin', plugin: 'p' },
      }) }),
      ev.toolCall(6, 0, 'c1', 'echo', '{"x":1}'),
      ev.toolResult(7, 0, 'c1', '结果'),
    ])
    const nodes = adapter.nodes()
    expect(nodes.map(n => n.kind)).toEqual(['user', 'assistant', 'steering', 'context', 'tool-result'])
    expect(nodes.find(n => n.kind === 'steering')).toMatchObject({ messageId: steering.id })
    expect(nodes.find(n => n.kind === 'tool-result')).toMatchObject({
      callId: 'c1', call: { name: 'echo', argsRaw: '{"x":1}' }, isError: false,
    })
  })

  it('identifies steering on the live append path', () => {
    const adapter = new TranscriptAdapter()
    const steering = createUserMessage({
      content: [{ type: 'text', text: 'live steer' }],
      source: { kind: 'user' },
    })
    adapter.reset([])
    adapter.append(at(0, { type: 'agent/inbox/spliced', data: {
      target: 'next-step', start: 0, inserted: [steering],
    } }))
    adapter.append(at(1, { type: 'agent/inbox/spliced', data: {
      target: 'next-step', start: 0, removedCount: 1, inserted: [],
    } }))
    adapter.append(at(2, { type: 'user/message', surfaceOp: 'append', data: steering }))
    expect(adapter.nodes()).toMatchObject([{ kind: 'steering', messageId: steering.id }])
  })

  it('does not mark queued, canceled, or non-user next-step messages as steering', () => {
    const adapter = new TranscriptAdapter()
    const queued = createUserMessage({ content: [{ type: 'text', text: 'queued' }], source: { kind: 'user' } })
    const canceled = createUserMessage({ content: [{ type: 'text', text: 'canceled' }], source: { kind: 'user' } })
    const context = createUserMessage({
      content: [{ type: 'text', text: 'context' }],
      source: { kind: 'plugin', plugin: 'test' },
    })
    adapter.reset([
      at(0, { type: 'agent/inbox/spliced', data: {
        target: 'next-turn', start: 0, inserted: [queued],
      } }),
      at(1, { type: 'agent/inbox/spliced', data: {
        target: 'next-turn', start: 0, removedCount: 1, inserted: [],
      } }),
      at(2, { type: 'user/message', surfaceOp: 'append', data: queued }),
      at(3, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, inserted: [canceled],
      } }),
      at(4, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, removedCount: 1, inserted: [], outcome: 'canceled',
      } }),
      at(5, { type: 'user/message', surfaceOp: 'append', data: canceled }),
      at(6, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, inserted: [context],
      } }),
      at(7, { type: 'agent/inbox/spliced', data: {
        target: 'next-step', start: 0, removedCount: 1, inserted: [],
      } }),
      at(8, { type: 'user/message', surfaceOp: 'append', data: context }),
    ])
    expect(adapter.nodes().map(node => node.kind)).toEqual(['user', 'user', 'context'])
  })

  it('materializes a skill-invocation injection as a named instructions context', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset([
      at(0, { type: 'user/message', surfaceOp: 'append', data: createUserMessage({
        content: [{ type: 'text', text: '/hidden-demo check the fixture' }],
        source: { kind: 'user' },
      }) }),
      at(1, { type: 'user/message', surfaceOp: 'append', data: createUserMessage({
        content: [{ type: 'text', text: '<skill_content name="hidden-demo">body</skill_content>' }],
        source: { kind: 'skill-invocation', name: 'hidden-demo', form: 'instructions' } as never,
      }) }),
    ])
    const nodes = adapter.nodes()
    // The gesture stays a user bubble; the injected body folds to a context
    // row named after the skill, presented as instructions.
    expect(nodes.map(node => node.kind)).toEqual(['user', 'context'])
    expect(nodes[1]).toMatchObject({
      provenance: { role: 'inject', label: 'hidden-demo' },
      form: 'instructions',
    })
  })

  it('skips events core does not call surface-eligible, marker or not', () => {
    // The transcript is the append-origin surface, so log-only events (a chunk,
    // a turn boundary, a compact/* provenance record) and a future type core
    // has not admitted contribute no node.
    const adapter = new TranscriptAdapter()
    adapter.reset([
      ev.turnStart(0, 1),
      at(1, { type: 'notice/message', surfaceOp: 'append', data: { note: 1 } }),
      compactSummary(2),
      ev.user(3, '唯一的一条'),
      ev.turnEnd(4, 1),
    ])
    expect(adapter.nodes().map(n => [n.kind, n.seq])).toEqual([['user', 3]])
  })

  describe('compaction markers', () => {
    it('keeps the original messages and full tool output, hiding replacement copies', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, '原始问题'),
        ev.assistant(1, 0, '原始回答'),
        ev.toolCall(4, 0, 'c1', 'echo', '{}'),
        ev.toolResult(5, 0, 'c1', '完整工具输出'),
        // A pruned tool/result copy: rewrites one node for the model, marks nothing.
        at(6, { type: 'tool/result', surfaceOp: { op: 'replace', start: 5, end: 5 }, sourceEventSeqs: [5], data: {
          turn: 0, step: 0,
          message: createToolResultMessage({ callId: CallId('c1'), content: [{ type: 'text', text: '已裁剪' }], isError: false }),
        } }),
        compactSummary(7),
        checkpoint(8, 7, { start: 1, end: 5, sourceEventSeqs: [7, 1, 5] }),
        // A regenerated assistant/message: also a silent model-only rewrite.
        at(9, { type: 'assistant/message', surfaceOp: { op: 'replace', start: 8, end: 8 }, sourceEventSeqs: [8], data: {
          turn: 0, step: 0,
          message: createMessage({
            role: 'assistant',
            content: [{ type: 'text', text: '通用 replacement 副本' }],
            source: { kind: 'model', ...{ provider: 'x', model: 'copy' } },
          }),
        } }),
      ])
      const nodes = adapter.nodes()
      expect(nodes.map(n => [n.kind, n.seq])).toEqual([
        ['user', 0], ['assistant', 1], ['tool-result', 5], ['compaction', 8],
      ])
      expect(nodes[2]).toMatchObject({ kind: 'tool-result', content: [{ type: 'text', text: '完整工具输出' }] })
      expect(nodes[3]).toMatchObject({ kind: 'compaction', summary: '# 摘要\n\n保留事实' })
    })

    it('adds one marker per landed compaction, in log order', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, 'a'),
        compactSummary(1, [{ type: 'text', text: 'first' }]),
        checkpoint(2, 1, { start: 0, end: 0, sourceEventSeqs: [1, 0] }),
        ev.user(3, 'b'),
        compactSummary(4, [{ type: 'text', text: 'second' }]),
        checkpoint(5, 4, { start: 2, end: 3, sourceEventSeqs: [4, 2, 3] }),
      ])
      expect(adapter.nodes().filter(n => n.kind === 'compaction')).toEqual([
        {
          kind: 'compaction', seq: 2, time: 1_700_000_000_002, summary: 'first',
          summaryEventSeq: 1, shadowedItemCount: 2, shadowedTokenCount: 100,
        },
        {
          kind: 'compaction', seq: 5, time: 1_700_000_000_005, summary: 'second',
          summaryEventSeq: 4, shadowedItemCount: 2, shadowedTokenCount: 100,
        },
      ])
    })

    it('renders the marker when the shadowed range is outside the window and logs nothing', () => {
      // The pagination hole A1 left open: quota is no longer spent on
      // replacement copies, so a page can carry a checkpoint whose
      // surfaceOp.start lies below the window head. The old surface fold threw
      // on the missing range and degraded with a console error; a log-ordered
      // projection has no range to resolve.
      const adapter = new TranscriptAdapter()
      const noise = { error: console.error, warn: console.warn }
      const logged: unknown[] = []
      console.error = (...args: unknown[]) => logged.push(args)
      console.warn = (...args: unknown[]) => logged.push(args)
      try {
        adapter.reset([
          compactSummary(80, [{ type: 'text', text: '窗外范围' }]),
          checkpoint(81, 80, { start: 3, end: 40, sourceEventSeqs: [80, 3, 40] }),
          ev.user(82, '压缩后的新问题'),
        ])
        expect(adapter.nodes().map(n => [n.kind, n.seq])).toEqual([['compaction', 81], ['user', 82]])
        expect(adapter.nodes()[0]).toMatchObject({ summary: '窗外范围' })
      } finally {
        console.error = noise.error
        console.warn = noise.warn
      }
      expect(logged).toEqual([])
    })

    it('treats an APPENDING plugin-sourced user/message as injected context, not a compaction', () => {
      // A session-reference card carries the same plugin source shape; only the
      // replacement marker makes an event a checkpoint.
      const adapter = new TranscriptAdapter()
      adapter.reset([
        at(0, { type: 'user/message', surfaceOp: 'append', data: createUserMessage({
          content: [{ type: 'text', text: '注入的上下文' }],
          source: { kind: 'plugin', plugin: 'compact', form: 'instructions' },
        }) }),
      ])
      expect(adapter.nodes()).toMatchObject([{
        kind: 'context',
        seq: 0,
        provenance: { role: 'inject', label: 'compact' },
        form: 'instructions',
      }])
    })

    it('ignores a foreign plugin s replacement user/message', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, '保留'),
        at(1, { type: 'user/message', surfaceOp: { op: 'replace', start: 0, end: 0 }, sourceEventSeqs: [0], data: createUserMessage({
          content: [{ type: 'text', text: '别的插件重写' }],
          source: { kind: 'plugin', plugin: 'not-compact' },
        }) }),
      ])
      expect(adapter.nodes().map(n => [n.kind, n.seq])).toEqual([['user', 0]])
    })

    it.each([
      ['absent provenance', undefined],
      ['text-less summary blocks', compactSummary(1, [{ type: 'image', data: 'nope' }])],
      ['a whitespace-only summary', compactSummary(1, [{ type: 'text', text: '   ' }])],
      ['an empty summary array', compactSummary(1, [])],
      ['a non-array summary', compactSummary(1, 'plain string')],
    ])('degrades %s to a non-expandable marker', (_label, summary) => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ...(summary === undefined ? [] : [summary]),
        checkpoint(2, 1, { start: 0, end: 0, sourceEventSeqs: [1, 0] }),
      ])
      expect(adapter.nodes()).toMatchObject([
        { kind: 'compaction', seq: 2, time: 1_700_000_000_002, summary: null },
      ])
    })

    it('keeps the text of a mixed-block summary, skipping the blocks it cannot render', () => {
      // ContentBlock is merge-extensible and the payload type is ContentBlock[],
      // so a non-text block must not discard recoverable text beside it.
      const adapter = new TranscriptAdapter()
      adapter.reset([
        compactSummary(1, [{ type: 'text', text: '可用摘要' }, { type: 'image', data: 'nope' }]),
        checkpoint(2, 1, { start: 0, end: 0, sourceEventSeqs: [1, 0] }),
      ])
      expect(adapter.nodes()).toEqual([
        {
          kind: 'compaction', seq: 2, time: 1_700_000_000_002, summary: '可用摘要',
          summaryEventSeq: 1, shadowedItemCount: 2, shadowedTokenCount: 100,
        },
      ])
    })

    it('leaves the summary null when the checkpoint records no provenance at all', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([at(2, {
        type: 'user/message',
        surfaceOp: { op: 'replace', start: 0, end: 0 },
        data: createUserMessage({
          content: [{ type: 'text', text: '<context_checkpoint>x</context_checkpoint>' }],
          source: { kind: 'plugin', plugin: 'compact' },
        }),
      })])
      expect(adapter.nodes()).toEqual([{
        kind: 'compaction', seq: 2, time: 1_700_000_000_002, summary: null,
        summaryEventSeq: null, shadowedItemCount: null, shadowedTokenCount: null,
      }])
    })

    it('skips a non-summary provenance seq before reaching the real one', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, '被压缩的问题'),
        at(1, { type: 'compact/start', data: { turn: 0 } }),
        compactSummary(2, [{ type: 'text', text: '第三个来源才是摘要' }]),
        checkpoint(3, 2, { start: 0, end: 0, sourceEventSeqs: [1, 2, 0] }),
      ])
      expect(adapter.nodes().at(-1)).toMatchObject({ kind: 'compaction', summary: '第三个来源才是摘要' })
    })

    it('resolves the summary once an older page supplies the provenance', () => {
      const adapter = new TranscriptAdapter()
      const landed = checkpoint(8, 7, { start: 0, end: 0, sourceEventSeqs: [7, 0] })
      adapter.reset([landed])
      expect(adapter.nodes()[0]).toMatchObject({ kind: 'compaction', summary: null })
      adapter.reset([compactSummary(7, [{ type: 'text', text: '分页补齐的摘要' }]), landed])
      expect(adapter.nodes()[0]).toMatchObject({ kind: 'compaction', summary: '分页补齐的摘要' })
    })

    it('creates the marker on the live append path', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset(plainTurn(0, 0, 'a', 'b'))
      adapter.append(compactSummary(6, [{ type: 'text', text: '直播摘要' }]))
      adapter.append(checkpoint(7, 6, { start: 1, end: 3, sourceEventSeqs: [6, 1, 3] }))
      const nodes = adapter.nodes()
      // The compacted history is still there; the marker is one more row after it.
      expect(nodes.map(n => [n.kind, n.seq])).toEqual([['user', 1], ['assistant', 3], ['compaction', 7]])
      expect(nodes.at(-1)).toMatchObject({ kind: 'compaction', seq: 7, summary: '直播摘要' })
    })
  })

  it('returns call:null for a tool-result whose call fell outside the window', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset([ev.toolResult(50, 3, 'outside-call', '孤儿结果')])
    expect(adapter.nodes()[0]).toMatchObject({ kind: 'tool-result', callId: 'outside-call', call: null })
  })

  it('materializes a tool-result error field when present', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset([
      at(0, { type: 'tool/result', surfaceOp: 'append', data: {
        turn: 0, step: 0,
        message: createToolResultMessage({ callId: CallId('c1'), content: [], isError: true }),
        error: { name: 'Boom', code: 'boom' },
      } }),
    ])
    expect(adapter.nodes()[0]).toMatchObject({ kind: 'tool-result', isError: true, error: { code: 'boom' } })
  })

  it('attaches wire views to the materialized result node', () => {
    const adapter = new TranscriptAdapter()
    const callView = { for: 'call' as const, view: { card: 'terminal' as const, command: 'ls' } }
    const resultView = { for: 'result' as const, view: { card: 'generic' as const, title: '完成' } }
    adapter.reset([
      ev.toolCall(0, 1, 'c1', 'bash', '{"cmd":"ls"}'),
      ev.toolResult(1, 1, 'c1', 'listing'),
    ], [callView, resultView] as never)
    expect(adapter.nodes().find(n => n.kind === 'tool-result')).toMatchObject({
      callView: { card: 'terminal' }, resultView: { card: 'generic', title: '完成' },
    })
  })

  it('attaches views on the live append path and defaults to null without views', () => {
    const adapter = new TranscriptAdapter()
    adapter.reset(plainTurn(0, 0, 'a', 'b')) // no views argument
    adapter.append(ev.toolCall(6, 1, 'c2', 'echo', '{}'), { for: 'call', view: { card: 'generic', title: '回声' } } as never)
    adapter.append(ev.toolResult(7, 1, 'c2', 'ok')) // no view on the result
    expect(adapter.nodes().find(n => n.kind === 'tool-result')).toMatchObject({
      callView: { title: '回声' }, resultView: null,
    })
  })

  it('leaves callView null when the paired call fell outside the window (cross-page break)', () => {
    const adapter = new TranscriptAdapter()
    const resultView = { for: 'result' as const, view: { card: 'generic' as const, title: '孤儿' } }
    adapter.reset([ev.toolResult(50, 3, 'outside', '窗外配对')], [resultView] as never)
    expect(adapter.nodes()[0]).toMatchObject({
      kind: 'tool-result', call: null, callView: null, resultView: { title: '孤儿' },
    })
  })

  describe('command lifecycle nodes', () => {
    it('folds a run/done pair into one settled node merged into flow order by seq', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, '先说话'),
        ev.commandRun(1, 'cmd-1', 'plan'),
        ev.commandDone(2, 'cmd-1', 'success', '已进入 plan mode'),
        ev.assistant(3, 0, '然后回答'),
      ])
      const nodes = adapter.nodes()
      expect(nodes.map(n => [n.kind, n.seq])).toEqual([['user', 0], ['command', 1], ['assistant', 3]])
      expect(nodes[1]).toMatchObject({
        kind: 'command', commandId: 'cmd-1', name: 'plan', args: '',
        outcome: { kind: 'success', text: '已进入 plan mode' },
      })
    })

    it('renders a run with no done as still executing (outcome null)', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.commandRun(0, 'cmd-2', 'goal', ' ship it')])
      expect(adapter.nodes()[0]).toMatchObject({ kind: 'command', name: 'goal', args: ' ship it', outcome: null })
    })

    it('represents command input omitted by the host as null', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.commandRunWithoutInput(0, 'cmd-private', 'feedback')])
      expect(adapter.nodes()[0]).toMatchObject({
        kind: 'command', name: 'feedback', args: null, outcome: null,
      })
    })

    it('soft-falls a done-only window into a node built from the done (cross-window cut)', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.commandDone(80, 'cmd-3', 'error', '失败了')])
      expect(adapter.nodes()[0]).toMatchObject({
        kind: 'command', seq: 80, commandId: 'cmd-3', name: null, args: null,
        outcome: { kind: 'error', text: '失败了' },
      })
    })

    it('settles a live-appended done in place, keeping the node at the run seq', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset(plainTurn(0, 0, 'q', 'a'))
      adapter.append(ev.commandRun(6, 'cmd-4', 'clear'))
      const running = adapter.nodes().find(n => n.kind === 'command')
      expect(running).toMatchObject({ outcome: null })
      adapter.append(ev.commandDone(7, 'cmd-4'))
      const settled = adapter.nodes().find(n => n.kind === 'command')
      expect(settled).toMatchObject({ seq: 6, outcome: { kind: 'success' } })
      // Settlement replaced the node object rather than mutating the published one.
      expect(settled).not.toBe(running)
    })

    it('tails command nodes whose seq is past every transcript node', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.user(0, '问'), ev.commandRun(1, 'cmd-tail', 'plan')])
      expect(adapter.nodes().map(n => n.kind)).toEqual(['user', 'command'])
    })

    it('preserves the domain-event link for the UI to fold a /compact row into its marker', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.user(0, '压缩前的问题'),
        ev.commandRun(1, 'cmd-compact', 'compact'),
        compactSummary(2, [{ type: 'text', text: '手动压缩摘要' }]),
        checkpoint(3, 2, { start: 0, end: 0, sourceEventSeqs: [2, 0] }),
        ev.commandDone(4, 'cmd-compact', 'success', '已压缩', 2),
      ])
      const nodes = adapter.nodes()
      expect(nodes.map(n => [n.kind, n.seq])).toEqual([['user', 0], ['command', 1], ['compaction', 3]])
      expect(nodes[1]).toMatchObject({
        name: 'compact',
        outcome: { kind: 'success', text: '已压缩', sourceEventSeq: 2 },
      })
      expect(nodes[2]).toMatchObject({ kind: 'compaction', summaryEventSeq: 2 })
    })
  })

  describe('assistant timing', () => {
    const base = 1_700_000_000_000

    it('derives step timing across a window rebuild (start + first token + completion)', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([
        ev.turnStart(0, 0),
        ev.user(1, '问'),
        ev.stepStart(2, 0),
        ev.chunkStart(3, 0),
        ev.chunkText(4, 0, '答'),
        ev.chunkText(5, 0, '案'),
        ev.assistant(6, 0, '答案'),
        ev.turnEnd(7, 0),
      ])
      const assistant = adapter.nodes().find(n => n.kind === 'assistant')
      expect(assistant).toMatchObject({
        timing: { stepStartTime: base + 2, firstTokenTime: base + 4, completedTime: base + 6 },
      })
    })

    it('derives the same timing on the live append path, first token winning once', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.user(0, '问')])
      adapter.append(ev.stepStart(1, 0))
      adapter.append(ev.chunkText(2, 0, '首'))
      adapter.append(ev.chunkText(3, 0, '次'))
      adapter.append(ev.assistant(4, 0, '首次'))
      const assistant = adapter.nodes().find(n => n.kind === 'assistant')
      expect(assistant).toMatchObject({
        timing: { stepStartTime: base + 1, firstTokenTime: base + 2, completedTime: base + 4 },
      })
    })

    it('soft-falls to null boundaries when the step opening fell outside the window', () => {
      const adapter = new TranscriptAdapter()
      adapter.reset([ev.assistant(100, 0, '被切窗的答案')])
      const assistant = adapter.nodes().find(n => n.kind === 'assistant')
      expect(assistant).toMatchObject({
        timing: { stepStartTime: null, firstTokenTime: null, completedTime: base + 100 },
      })
    })
  })
})
