/**
 * Format-agnostic session reader: JSONL (plaintext + zstd multi-frame),
 * packed chunk-run expansion, field extraction, and the SQLite backend.
 */

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  JsonlSessionReader,
  RdbSessionReader,
  SqliteSessionReader,
  extractFields,
  parseJsonl,
  scanZstdFrames,
} from '@r05en1cu/dsh-mygo'

const HEADER = JSON.stringify({
  type: 'session',
  version: 0,
  id: 'session-test-1',
  createdAt: 1786000000000,
  cwd: '/tmp/project',
  delegationDepth: 0,
})

function event(type: string, seq: number, data: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, seq, time: 1786000001000 + seq, data, ...extra })
}

function sampleLog(): string {
  return [
    HEADER,
    event('user/message', 0, { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'hi' }] } }, { surfaceOp: 'append' }),
    event('assistant/message', 1, {
      turn: 1,
      step: 1,
      message: { content: [{ type: 'text', text: 'hello' }] },
      usage: { promptTokens: 10, completionTokens: 5 },
    }, { surfaceOp: 'append' }),
    event('tool/call', 2, { turn: 1, step: 2, callId: 'call_1', name: 'json_query', arguments: '{"a":1}' }),
    event('tool/result', 3, {
      turn: 1,
      step: 2,
      message: { content: [{ type: 'text', text: 'ok' }] },
      meta: { kind: 'visualize', title: 'card' },
    }, { surfaceOp: 'append' }),
    JSON.stringify({
      type: 'text-chunks',
      seq0: 4,
      time0: 1786000002000,
      data: { turn: 1, step: 3, index: 0, dt: [10, 12], texts: ['a', 'b', 'c'] },
    }),
    JSON.stringify({
      type: 'tool-call-chunks',
      seq0: 7,
      time0: 1786000003000,
      data: { turn: 1, step: 4, index: 1, id: 'call_2', name: 'read', dt: [5], args: ['{"file":"x', '"}' ] },
    }),
    event('session/end-seed', 10, {}),
  ].join('\n') + '\n'
}

describe('session reader jsonl', () => {
  it('parses plaintext logs and expands packed chunk runs', () => {
    const stored = parseJsonl(sampleLog())
    expect(stored.header.id).toBe('session-test-1')
    expect(stored.header.delegationDepth).toBe(0)
    expect(stored.events.map(item => item.type)).toEqual([
      'user/message',
      'assistant/message',
      'tool/call',
      'tool/result',
      'assistant/chunk',
      'assistant/chunk',
      'assistant/chunk',
      'assistant/chunk',
      'assistant/chunk',
      'session/end-seed',
    ])
    const chunks = stored.events.filter(item => item.type === 'assistant/chunk')
    expect(chunks[0]).toMatchObject({ seq: 4, time: 1786000002000 })
    expect(chunks[2]).toMatchObject({ seq: 6, time: 1786000002022 })
    expect(chunks[3]).toMatchObject({ seq: 7, time: 1786000003000 })
    const toolCallChunk = chunks[4]?.data as { chunk: { type: string; argumentsDelta: string } }
    expect(toolCallChunk.chunk).toMatchObject({ type: 'tool-call-delta', id: 'call_2', name: 'read' })
    expect(toolCallChunk.chunk.argumentsDelta).toBe('"}')
  })

  it('decodes concatenated zstd frames and reads through the directory reader', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mygo-session-reader-'))
    try {
      const project = join(root, '--tmp-project--')
      const dir = join(project, 'session-test-2')
      mkdirSync(dir, { recursive: true })
      const lines = sampleLog().split('\n').filter(line => line !== '')
      const headerValue = JSON.parse(lines[0] as string) as { id: string }
      headerValue.id = 'session-test-2'
      lines[0] = JSON.stringify(headerValue)
      const frame1 = zstdCompressSync(Buffer.from(lines.slice(0, 2).join('\n') + '\n'))
      const frame2 = zstdCompressSync(Buffer.from(lines.slice(2).join('\n') + '\n'))
      writeFileSync(join(dir, 'session.jsonl.zstd'), Buffer.concat([frame1, frame2]))
      const reader = new JsonlSessionReader(root)
      const listed = await reader.list()
      expect(listed.map(header => header.id)).toEqual(['session-test-2'])
      const stored = await reader.readById('session-test-2')
      expect(stored?.events.length).toBeGreaterThan(5)
      expect(scanZstdFrames(Buffer.concat([frame1, frame2])).frames.length).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('session reader field extraction', () => {
  it('projects messages, tool calls/results, meta cards, usage and boundaries', () => {
    const fields = extractFields(parseJsonl(sampleLog()).events)
    expect(fields.messages).toEqual([
      { role: 'user', turn: 1, step: 1, text: 'hi' },
      { role: 'assistant', turn: 1, step: 1, text: 'hello' },
    ])
    expect(fields.toolCalls).toEqual([{ callId: 'call_1', name: 'json_query', arguments: '{"a":1}' }])
    expect(fields.toolResults[0]).toMatchObject({ text: 'ok', meta: { kind: 'visualize', title: 'card' } })
    expect(fields.metaCards).toEqual([{ seq: 3, meta: { kind: 'visualize', title: 'card' } }])
    expect(fields.usage).toEqual([
      { turn: 1, step: 1, usage: { promptTokens: 10, completionTokens: 5 } },
    ])
    expect(fields.endSeedSeqs).toEqual([10])
  })
})

describe('session reader sqlite', () => {
  it('reads sessions and events from a backend-shaped database', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mygo-session-sqlite-')), 'sessions.sqlite')
    const db = new DatabaseSync(file)
    db.exec(`
      CREATE TABLE persistence_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), store_id TEXT NOT NULL) STRICT;
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, created_at INTEGER NOT NULL,
        cwd TEXT, parent_session TEXT, seed_length INTEGER, origin TEXT,
        delegation_depth INTEGER, incarnation TEXT NOT NULL, revision INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE events (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, type TEXT NOT NULL, time INTEGER NOT NULL,
        data TEXT NOT NULL, source_event_seqs TEXT, surface_op TEXT,
        PRIMARY KEY (session_id, seq)
      ) STRICT;
      INSERT INTO sessions VALUES ('session-sql-1', 0, 1786000000000, '/tmp', NULL, NULL, NULL, 0, 'inc-1', 2);
      INSERT INTO events VALUES ('session-sql-1', 0, 'user/message', 1786000000001, '{"turn":1,"step":1,"message":{"content":[{"type":"text","text":"sql hi"}]}}', NULL, '"append"');
      INSERT INTO events VALUES ('session-sql-1', 1, 'tool/call', 1786000000002, '{"turn":1,"step":2,"callId":"c1","name":"bash","arguments":"ls"}', NULL, NULL);
    `)
    db.close()
    const reader = new SqliteSessionReader(file)
    const listed = reader.list()
    expect(listed[0]).toMatchObject({ id: 'session-sql-1', version: 0, createdAt: 1786000000000 })
    const stored = reader.readById('session-sql-1')
    expect(stored?.events).toHaveLength(2)
    expect(stored?.events[0]).toMatchObject({ type: 'user/message', seq: 0, surfaceOp: 'append' })
    const fields = extractFields(stored?.events ?? [])
    expect(fields.messages[0]?.text).toBe('sql hi')
    expect(fields.toolCalls[0]).toMatchObject({ callId: 'c1', name: 'bash', arguments: 'ls' })
  })
})

describe('session reader rdb', () => {
  function rdbFixture(): { readonly file: string; readonly dir: string } {
    const dir = mkdtempSync(join(tmpdir(), 'mygo-session-rdb-'))
    const file = join(dir, 'sessions.sqlite')
    const db = new DatabaseSync(file)
    db.exec(`
      CREATE TABLE t_sessions (
        f_id INTEGER PRIMARY KEY, f_session_id TEXT NOT NULL UNIQUE,
        f_head_event_id TEXT NOT NULL DEFAULT '', f_head_sequence INTEGER NOT NULL DEFAULT -1,
        f_version INTEGER NOT NULL, f_created_at INTEGER NOT NULL,
        f_cwd TEXT, f_parent_session TEXT, f_seed_length INTEGER, f_origin TEXT,
        f_delegation_depth INTEGER, f_incarnation TEXT NOT NULL, f_revision INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE t_events (
        f_id INTEGER PRIMARY KEY, f_event_id TEXT NOT NULL UNIQUE, f_parent_id TEXT NOT NULL DEFAULT '',
        f_kind TEXT NOT NULL DEFAULT '', f_role TEXT NOT NULL DEFAULT '', f_name TEXT NOT NULL DEFAULT '',
        f_action_id TEXT NOT NULL DEFAULT '', f_encoding TEXT NOT NULL DEFAULT '',
        f_data TEXT NOT NULL, f_created_at INTEGER NOT NULL DEFAULT 0,
        f_original_seq INTEGER NOT NULL, f_source_event_seqs TEXT, f_surface_op TEXT
      ) STRICT;
      CREATE TABLE t_session_events (
        f_id INTEGER PRIMARY KEY, f_session_id TEXT NOT NULL REFERENCES t_sessions(f_session_id) ON DELETE CASCADE,
        f_event_id TEXT NOT NULL REFERENCES t_events(f_event_id) ON DELETE CASCADE,
        f_sequence INTEGER NOT NULL,
        UNIQUE (f_session_id, f_sequence)
      ) STRICT;
      INSERT INTO t_sessions (f_session_id, f_version, f_created_at, f_cwd, f_incarnation, f_revision)
        VALUES ('rdb-1', 0, 1786000000000, '/tmp', 'inc-1', 3);
    `)
    const insertEvent = db.prepare(
      'INSERT INTO t_events (f_event_id, f_kind, f_data, f_created_at, f_original_seq, f_source_event_seqs, f_surface_op)'
      + ' VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    const insertBridge = db.prepare(
      'INSERT INTO t_session_events (f_session_id, f_event_id, f_sequence) VALUES (?, ?, ?)',
    )
    const events: Array<[string, string, string, number, string | null, string | null]> = [
      ['ev-0', 'user/message', JSON.stringify({ turn: 1, step: 1, message: { content: [{ type: 'text', text: 'rdb hi' }] } }), 0, null, '"append"'],
      ['ev-1', 'tool/call', JSON.stringify({ turn: 1, step: 2, callId: 'c1', name: 'bash', arguments: 'ls' }), 2, null, null],
      ['ev-2', 'turn/end', JSON.stringify({ turn: 1, reason: { kind: 'completed' } }), 3, null, null],
      ['ev-3', 'turn/start', JSON.stringify({ turn: 2 }), 4, null, null],
      ['ev-4', 'assistant/message', JSON.stringify({ turn: 2, step: 1, message: { content: [{ type: 'text', text: 'done' }] } }), 5, '[0,2]', '"append"'],
      ['ev-5', 'assistant/message', JSON.stringify({ turn: 2, step: 1, message: { content: [{ type: 'text', text: 'replaced' }] } }), 6, null, '{"op":"replace","start":2,"end":3}'],
    ]
    events.forEach(([id, kind, data, orig, sources, op], index) => {
      insertEvent.run(id, kind, data, 1786000001000 + index, orig, sources, op)
      insertBridge.run('rdb-1', id, index)
    })
    // Torn tail: unparsable row after the last committed turn/end (seq 6).
    insertEvent.run('ev-torn', 'assistant/chunk', '{bad json', 1786000009000, 8, null, null)
    insertBridge.run('rdb-1', 'ev-torn', 6)
    db.close()
    return { file, dir }
  }

  it('reads dense-seq remapped events and cuts the torn tail', () => {
    const { file, dir } = rdbFixture()
    try {
      const reader = new RdbSessionReader(file)
      const listed = reader.list()
      expect(listed[0]).toMatchObject({ id: 'rdb-1', version: 0, createdAt: 1786000000000 })
      const stored = reader.readById('rdb-1')
      expect(stored?.tornFrom).toBe(6)
      expect(stored?.events).toHaveLength(6)
      const types = stored?.events.map(event => event.type)
      expect(types).toEqual([
        'user/message', 'tool/call', 'turn/end', 'turn/start', 'assistant/message', 'assistant/message',
      ])
      const remapped = stored?.events[4]
      expect(remapped?.sourceEventSeqs).toEqual([0, 1])
      expect(stored?.events[5]?.surfaceOp).toEqual({ op: 'replace', start: 1, end: 2 })
      const fields = extractFields(stored?.events ?? [])
      expect(fields.messages[0]?.text).toBe('rdb hi')
      expect(fields.toolCalls[0]).toMatchObject({ callId: 'c1', name: 'bash', arguments: 'ls' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
