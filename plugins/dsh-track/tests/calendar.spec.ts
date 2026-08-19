/**
 * Calendar-yarn data (v1): perDay aggregation, segments from executed-in
 * issues, project switches. @module tests/calendar.spec
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { buildSessionGraph } from '../src/graph/build.ts'
import { buildCalendar } from '../src/graph/calendar.ts'
import { projectIdFor } from '../src/graph/projects.ts'
import { createPluginHarness } from './harness.ts'

const CWD = '/ws/cal'
const DAY = 86400000;
const BASE = new Date('2026-08-01T00:00:00Z').getTime();

describe('buildCalendar', () => {
  let store: Awaited<ReturnType<typeof createPluginHarness>>['store'];
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const h = await createPluginHarness()
    store = h.store;
    dispose = h.dispose;
  })

  afterAll(async () => { await dispose() })

  it('groups sessions by day and derives segments/switches from issues', async () => {
    const projA = projectIdFor(CWD);
    await store.upsertProject({ id: projA, name: 'cal', path: CWD, sessionIds: ['c1'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    const ev: SessionEvent[] = [
      { type: 'turn/start', seq: 1, time: BASE, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: BASE + 1000, data: { content: [{ type: 'text', text: '需求一' }], source: { kind: 'user' }, id: 'm1' } },
      { type: 'turn/end', seq: 3, time: BASE + 2000, data: { turn: 1, reason: { kind: 'completed' } } },
      { type: 'user/message', seq: 4, time: BASE + DAY + 1000, data: { content: [{ type: 'text', text: '需求二' }], source: { kind: 'user' }, id: 'm2' } },
    ] as unknown as SessionEvent[];
    const hdr: SessionHeader = { version: 0, id: 'c1', createdAt: BASE, cwd: CWD } as SessionHeader;
    await store.upsertGraph(buildSessionGraph('c1', ev, hdr, BASE + DAY + 2000));
    const issueA = { id: 'track_issue_ca', identifier: 'INV-1', title: '需求一', description: '', priority: 2, state: 'todo' as const, teamId: 'INV', labels: [], linkedSessionIds: ['c1'], projectId: projA, promptMessageId: 'm1', sourceSpan: { sessionId: 'c1', seqStart: 2, seqEnd: 3, kind: 'span' as const }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never;
    await store.upsertIssue(issueA);
    await store.upsertLink({ id: 'track_link_ca', fromType: 'issue', fromId: 'track_issue_ca', toType: 'session', toId: 'c1', kind: 'executed-in', createdAt: new Date().toISOString(), linkMethod: 'session-link' } as never);

    const cal = await buildCalendar(store);
    expect(cal.sessions).toHaveLength(1);
    const s = cal.sessions[0]!;
    expect(s.nReq).toBe(1);
    expect(s.segments[0]?.req).toBe('需求一');
    expect(s.segments[0]?.proj).toBe(projA);
    // Turn outcome captured (✓).
    expect(s.segments[0]?.turns.some((t) => t.outcome === 'completed')).toBe(true);
    // Active across two days (需求二 user message on day+1 counts as activity).
    expect(s.perDay.length).toBeGreaterThanOrEqual(2);
    expect(s.switches).toBe(0);
    // Yarn nodes = REQUIREMENTS (issue), not sessions.
    expect(cal.requirements).toHaveLength(1);
    expect(cal.requirements[0]?.req).toBe('需求一');
    expect(cal.requirements[0]?.proj).toBe(projA);
    // Day window derives from the DATA range (no empty leading days).
    expect(cal.days).toBeLessThanOrEqual(18);
    expect(cal.projects.some((p) => p.id === projA)).toBe(true);
  })

  it('distributes legacy requirements (no sourceSpan) over their user messages', async () => {
    const projA = projectIdFor(CWD);
    // Two requirements with NO sourceSpan: they must anchor at their OWN user
    // message (k-th requirement -> k-th message), not all on the session start.
    const ev2: SessionEvent[] = [
      { type: 'turn/start', seq: 1, time: BASE, data: { turn: 1 } },
      { type: 'user/message', seq: 2, time: BASE + 1000, data: { content: [{ type: 'text', text: '第一件事' }], source: { kind: 'user' }, id: 'm1' } },
      { type: 'tool/call', seq: 3, time: BASE + 2000, data: { name: 'bash', callId: 'c1', arguments: '{}', turn: 1, step: 1 } },
      { type: 'user/message', seq: 4, time: BASE + DAY + 1000, data: { content: [{ type: 'text', text: '第二件事' }], source: { kind: 'user' }, id: 'm2' } },
    ] as unknown as SessionEvent[];
    const hdr2: SessionHeader = { version: 0, id: 'c2', createdAt: BASE, cwd: CWD } as SessionHeader;
    await store.upsertGraph(buildSessionGraph('c2', ev2, hdr2, BASE + DAY + 2000));
    // Two issues, NO sourceSpan (legacy shape) — linked to c2, ordered by seqStart 0.
    for (const [id, title, msg] of [['track_issue_c1', '第一件事', 'm1'], ['track_issue_c2', '第二件事', 'm2']] as const) {
      await store.upsertIssue({ id, identifier: 'INV-' + id.slice(-1), title, description: '', priority: 2, state: 'todo' as const, teamId: 'INV', labels: [], linkedSessionIds: ['c2'], projectId: projA, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
      await store.upsertLink({ id: 'track_link_' + id, fromType: 'issue', fromId: id, toType: 'session', toId: 'c2', kind: 'executed-in', createdAt: new Date().toISOString(), linkMethod: 'session-link' } as never);
    }
    const cal2 = await buildCalendar(store);
    const sess2 = cal2.sessions.find((x) => x.id === 'c2');
    expect(sess2?.nReq).toBe(2);
    // The two requirements land on DIFFERENT days (own message anchor), and
    // their events counts are the per-message spans, not the whole session.
    const days = new Set(cal2.requirements.filter((r) => r.sessionId === 'c2').map((r) => r.day));
    expect(days.size).toBe(2);
    const r1 = cal2.requirements.find((r) => r.id === 'track_issue_c1');
    const r2 = cal2.requirements.find((r) => r.id === 'track_issue_c2');
    expect(r1?.day).not.toBe(r2?.day);
  })
});
