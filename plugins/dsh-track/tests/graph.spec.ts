/**
 * M1 — session execution graph: builder determinism/structure, service
 * freshness, and store round-trip. The synthetic log mirrors the real
 * session.jsonl event shapes (user/message with data.id, turn/start,
 * step/start, tool/call+result pairing, subagent/descriptor).
 * @module tests/graph.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { ensureSessionGraph, buildWorkspaceGraphs, logSeqEnd } from '../src/graph/service.ts'
import { renderGraphText, renderGraphSummary } from '../src/graph/render.ts'
import { createPluginHarness } from './harness.ts'

const hdr: SessionHeader = {
  version: 0,
  id: 'sess-graph-1',
  createdAt: 1000,
  cwd: '/ws/track',
  parentSession: 'sess-parent',
  origin: 'subagent',
  delegationDepth: 1,
} as SessionHeader

const events = [
  { type: 'subagent/descriptor', seq: 0, time: 1000, data: { version: 2, label: 'G1 复测' } },
  { type: 'turn/start', seq: 1, time: 1010, data: { turn: 1 } },
  { type: 'user/message', seq: 2, time: 1020, data: { content: [{ type: 'text', text: '请检查 docs 目录里的文件是否存在' }], source: { kind: 'user' }, id: 'msg-1' } },
  { type: 'step/start', seq: 3, time: 1030, data: { turn: 1, step: 1 } },
  { type: 'tool/call', seq: 4, time: 1040, data: { turn: 1, step: 1, callId: 'call-1', name: 'glob', arguments: '{}' } },
  { type: 'tool/result', seq: 5, time: 1050, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: 'ok' }], isError: false }] } } },
  { type: 'assistant/message', seq: 6, time: 1060, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '检查完成' }] } } },
  { type: 'turn/end', seq: 7, time: 1070, data: { turn: 1, reason: { kind: 'completed' } } },
  { type: 'user/message', seq: 8, time: 1080, data: { content: [{ type: 'text', text: '换个话题，跑个命令' }], source: { kind: 'user' }, id: 'msg-2' } },
  { type: 'turn/start', seq: 9, time: 1090, data: { turn: 2 } },
  { type: 'tool/call', seq: 10, time: 1100, data: { turn: 2, callId: 'call-2', name: 'bash', arguments: '{}' } },
  { type: 'tool/result', seq: 11, time: 1110, data: { turn: 2, message: { source: { kind: 'tool', callId: 'call-2' }, content: [{ type: 'tool-result', toolCallId: 'call-2', content: [{ type: 'text', text: 'boom' }], isError: true }] } } },
] as unknown as SessionEvent[]

const NOW = 5000

describe('buildSessionGraph', () => {
  it('is deterministic — same log, same graph (minus builtAt)', () => {
    const a = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    const b = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    expect(a.nodes).toEqual(b.nodes)
    expect(a.edges).toEqual(b.edges)
    expect(a.header).toEqual(b.header)
    expect(a.seqEnd).toBe(b.seqEnd)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
  })

  it('builds the session turn step tool tree with header facts', () => {
    const g = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    const root = g.nodes.find((n) => n.kind === 'session')!;
    expect(root.parentSessionId).toBe('sess-parent')
    expect(root.origin).toBe('subagent')
    expect(root.agentLabel).toBe('G1 复测')
    expect(g.header.cwd).toBe('/ws/track')
    expect(g.header.delegationDepth).toBe(1)
    const turns = g.nodes.filter((n) => n.kind === 'turn')
    expect(turns).toHaveLength(2)
    const steps = g.nodes.filter((n) => n.kind === 'step')
    expect(steps).toHaveLength(1)
    const tools = g.nodes.filter((n) => n.kind === 'tool')
    expect(tools).toHaveLength(2)
    const users = g.nodes.filter((n) => n.kind === 'user-message')
    expect(users).toHaveLength(2)
    for (const n of g.nodes) {
      expect(n.citation.sessionId).toBe('sess-graph-1')
      expect(n.citation.seqStart).toBeGreaterThanOrEqual(0)
      expect(n.citation.seqEnd).toBeGreaterThanOrEqual(n.citation.seqStart)
    }
    expect(g.seqEnd).toBe(11)
  })

  it('pairs tool/result with tool/call and flags errors', () => {
    const g = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    const call1 = g.nodes.find((n) => n.kind === 'tool' && n.callId === 'call-1')!;
    expect(call1.toolName).toBe('glob')
    expect(call1.citation.seqStart).toBe(4)
    expect(call1.citation.seqEnd).toBe(5)
    expect(call1.toolError).toBeFalsy()
    const call2 = g.nodes.find((n) => n.kind === 'tool' && n.callId === 'call-2')!;
    expect(call2.toolError).toBe(true)
  })

  it('wires contains / invokes / provoked edges with correct direction', () => {
    const g = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    const root = g.nodes.find((n) => n.kind === 'session')!;
    const turn1 = g.nodes.find((n) => n.kind === 'turn' && n.turn === 1)!;
    const turn2 = g.nodes.find((n) => n.kind === 'turn' && n.turn === 2)!;
    const step = g.nodes.find((n) => n.kind === 'step')!;
    const call1 = g.nodes.find((n) => n.callId === 'call-1')!;
    const call2 = g.nodes.find((n) => n.callId === 'call-2')!;
    const msg1 = g.nodes.find((n) => n.messageId === 'msg-1')!;
    const msg2 = g.nodes.find((n) => n.messageId === 'msg-2')!;
    const has = (kind: string, from: string, to: string): boolean =>
      g.edges.some((e) => e.kind === kind && e.fromId === from && e.toId === to)
    expect(has('contains', root.id, turn1.id)).toBe(true)
    expect(has('contains', root.id, turn2.id)).toBe(true)
    expect(has('contains', turn1.id, step.id)).toBe(true)
    expect(has('invokes', step.id, call1.id)).toBe(true)
    expect(has('invokes', turn2.id, call2.id)).toBe(true)
    expect(has('provoked', msg1.id, turn1.id)).toBe(true)
    expect(has('provoked', msg2.id, turn2.id)).toBe(true)
    expect(msg1.messageId).toBe('msg-1')
  })

  it('renders a readable text tree with citations', () => {
    const g = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    const text = renderGraphText(g)
    expect(text).toContain('subagent')
    expect(text).toContain('forked from sess-parent')
    expect(text).toContain('Turn 1')
    expect(text).toContain('glob')
    expect(text).toContain('✗')
    expect(text).toContain('#4-5')
    expect(renderGraphSummary(g)).toContain('2 turn(s)')
  })
});

describe('graph service + store', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  const stubQuery = {
    readSession: async () => ({ session: hdr, events }),
    filterSessions: async () => [{ header: hdr, live: false, persisted: true }],
  } as unknown as Parameters<typeof ensureSessionGraph>[0]['sessionQuery'];

  it('round-trips a graph through the store', async () => {
    const g = buildSessionGraph('sess-graph-1', events, hdr, NOW)
    g.header.repos = [] // repo-touch freshness: a graph without repos is stale
    await store.upsertGraph(g);
    const back = await store.getGraph('sess-graph-1');
    expect(back?.sessionId).toBe('sess-graph-1');
    expect(back?.nodes).toHaveLength(g.nodes.length);
    expect((await store.listGraphs()).some((x) => x.sessionId === 'sess-graph-1')).toBe(true);
  })

  it('ensureSessionGraph builds once and reuses a fresh graph', async () => {
    // Separate session id: the round-trip test already stored a graph for sess-graph-1.
    const first = await ensureSessionGraph({ sessionQuery: stubQuery, store }, 'sess-graph-2', false, 6000);
    expect(first.seqEnd).toBe(11);
    const second = await ensureSessionGraph({ sessionQuery: stubQuery, store }, 'sess-graph-2', false, 7000);
    expect(second.builtAt).toBe(6000);
    const rebuilt = await ensureSessionGraph({ sessionQuery: stubQuery, store }, 'sess-graph-2', true, 8000);
    expect(rebuilt.builtAt).toBe(8000);
    expect(await store.getGraph('sess-graph-2')).toMatchObject({ builtAt: 8000 });
    expect((await store.readGlobal())?.graphBuiltSessions?.['sess-graph-2']).toBeDefined();
  })

  it('buildWorkspaceGraphs skips fresh sessions and reports counts', async () => {
    const result = await buildWorkspaceGraphs({ sessionQuery: stubQuery, store }, '/ws/track', 10, 9000);
    expect(result.total).toBe(1);
    expect(result.built).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  })

  it('logSeqEnd ignores the header line', () => {
    expect(logSeqEnd([{ seq: 3 }, { seq: 9 }, {}])).toBe(9);
  });
});
