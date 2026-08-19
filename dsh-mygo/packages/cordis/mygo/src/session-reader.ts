/**
 * Format-agnostic session reader: reads dsh conversation logs from the JSONL
 * backend (`session.jsonl[.zstd]`) or the SQLite backend (`sessions` /
 * `events` tables) and projects fields mygo cares about (surface text, tool
 * calls/results, tool-result meta cards, usage, turn boundaries).
 *
 * The reader is intentionally self-contained:
 * - JSONL chunk runs (`text-chunks` / `reasoning-chunks` /
 *   `tool-call-chunks`) are expanded locally, mirroring
 *   `@deepseek-ai/dsh-session/chunk-rows` (durable-encoding vocabulary, not
 *   session events).
 * - Zstandard concatenated frames are scanned and decompressed locally via
 *   `node:zlib` one-shot APIs (Node's `zstdDecompress` only handles the
 *   first frame).
 * - SQLite is opened read-only through `node:sqlite` and maps rows back to
 *   the shared `SessionEvent` envelope.
 *
 * @module @r05en1cu/dsh-mygo/src/session-reader
 */

import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { zstdDecompressSync } from 'node:zlib'
import { basename, join } from 'node:path'

/** The session header as stored (JSONL header line / SQLite sessions row). */
export interface SessionHeaderLike {
  readonly version: number
  readonly id: string
  readonly createdAt: number
  readonly cwd?: string
  readonly parentSession?: string
  readonly seedLength?: number
  readonly origin?: 'subagent'
  readonly delegationDepth: number
}

/** One session event envelope; `data` stays opaque to the reader. */
export interface SessionEventLike {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
  readonly surfaceOp?: unknown
  readonly sourceEventSeqs?: readonly number[]
}

/** One fully decoded stored session. */
export interface StoredSession {
  readonly header: SessionHeaderLike
  readonly events: readonly SessionEventLike[]
  /** Persisted seq where a torn tail starts, when one was cut on read. */
  readonly tornFrom?: number
}

/** Extracted fields mygo projects from one session log. */
export interface SessionFields {
  readonly messages: readonly {
    readonly role: 'user' | 'assistant'
    readonly turn: number
    readonly step: number
    readonly text: string
  }[]
  readonly toolCalls: readonly {
    readonly callId: string
    readonly name: string
    readonly arguments: string
  }[]
  readonly toolResults: readonly {
    readonly callId?: string
    readonly text: string
    readonly error?: { readonly name: string; readonly code: string }
    readonly meta?: unknown
  }[]
  readonly turns: readonly {
    readonly turn: number
    readonly endedAt?: number
    readonly reason?: unknown
  }[]
  readonly usage: readonly { readonly turn: number; readonly step: number; readonly usage?: unknown }[]
  readonly metaCards: readonly { readonly seq: number; readonly meta: unknown }[]
  readonly endSeedSeqs: readonly number[]
}

const ZSTD_MAGIC = 0xFD2FB528

/** One byte range of a structurally complete Zstandard frame. */
interface ZstdFrameRange {
  readonly start: number
  readonly end: number
}

/**
 * Locate complete Zstandard frames in a concatenated-frame stream without
 * decompressing blocks (same structural scan as the JSONL backend).
 * Trailing torn bytes are ignored (returned as a torn start).
 */
export function scanZstdFrames(buffer: Buffer): { readonly frames: readonly ZstdFrameRange[] } {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt zstd session log: invalid frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) {
      throw new Error(`corrupt zstd session log: reserved frame-header bit at byte ${offset - 1}`)
    }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) break
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) {
        throw new Error(`corrupt zstd session log: reserved block type at byte ${offset - 3}`)
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) break
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) break
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return { frames }
}

/** Decompress a concatenated Zstandard frame stream (complete frames only). */
export function decompressZstd(buffer: Buffer): Buffer {
  const { frames } = scanZstdFrames(buffer)
  if (frames.length === 0) throw new Error('corrupt zstd session log: no complete frame')
  const chunks: Buffer[] = []
  for (const frame of frames) {
    chunks.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(chunks)
}

/**
 * Expand one durable log line: a session event verbatim, or a packed chunk
 * run into its original `assistant/chunk` members.
 */
export function decodeStorageRecord(value: unknown): SessionEventLike[] {
  if (value === null || typeof value !== 'object') return [value as SessionEventLike]
  const record = value as Record<string, unknown>
  const type = record.type
  if (type !== 'text-chunks' && type !== 'reasoning-chunks' && type !== 'tool-call-chunks') {
    return [value as SessionEventLike]
  }
  if (typeof record.seq0 !== 'number' || typeof record.time0 !== 'number') {
    throw new Error(`corrupt packed chunk row ${String(type)}: missing seq0/time0`)
  }
  const data = record.data as Record<string, unknown> | undefined
  if (data === null || typeof data !== 'object') {
    throw new Error(`corrupt packed chunk row ${String(type)}: missing data`)
  }
  const { turn, step, index, dt, texts, args } = data as {
    turn?: unknown
    step?: unknown
    index?: unknown
    dt?: unknown
    texts?: unknown
    args?: unknown
  }
  const members = type === 'tool-call-chunks' ? args : texts
  if (typeof turn !== 'number' || typeof step !== 'number' || typeof index !== 'number'
    || !Array.isArray(dt) || !Array.isArray(members)) {
    throw new Error(`corrupt packed chunk row ${String(type)}: malformed run data`)
  }
  const seq0 = record.seq0
  const time0 = record.time0
  const events: SessionEventLike[] = []
  let accTime = 0
  for (let k = 0; k < members.length; k++) {
    if (k > 0) accTime += (dt[k - 1] as number) ?? 0
    const chunk = type === 'tool-call-chunks'
      ? {
          type: 'tool-call-delta',
          index,
          id: (data as { id?: unknown }).id,
          ...((data as { name?: unknown }).name === undefined ? {} : { name: (data as { name?: unknown }).name }),
          argumentsDelta: members[k],
        }
      : {
          type: type === 'text-chunks' ? 'text-delta' : 'reasoning-delta',
          index,
          text: members[k],
        }
    events.push({
      type: 'assistant/chunk',
      seq: (seq0 as number) + k,
      time: (time0 as number) + accTime,
      data: { turn, step, chunk },
    })
  }
  return events
}

function isZstd(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === ZSTD_MAGIC
}

/** Parse one decoded JSONL artifact (header line + event lines). */
export function parseJsonl(text: string): StoredSession {
  const lines = text.split('\n').filter(line => line.trim() !== '')
  if (lines.length === 0) throw new Error('empty session log')
  const headerValue = JSON.parse(lines[0] as string) as Record<string, unknown>
  if (headerValue.type !== 'session') throw new Error('session log must start with a session header line')
  const header: SessionHeaderLike = {
    version: headerValue.version as number,
    id: headerValue.id as string,
    createdAt: headerValue.createdAt as number,
    ...(headerValue.cwd === undefined ? {} : { cwd: headerValue.cwd as string }),
    ...(headerValue.parentSession === undefined ? {} : { parentSession: headerValue.parentSession as string }),
    ...(headerValue.seedLength === undefined ? {} : { seedLength: headerValue.seedLength as number }),
    ...(headerValue.origin === undefined ? {} : { origin: headerValue.origin as 'subagent' }),
    delegationDepth: (headerValue.delegationDepth as number) ?? 0,
  }
  const events: SessionEventLike[] = []
  for (const line of lines.slice(1)) {
    events.push(...decodeStorageRecord(JSON.parse(line) as unknown))
  }
  return { header, events }
}

/** JSONL session reader over a session root (project/session directory layout). */
export class JsonlSessionReader {
  constructor(private readonly root: string) {}

  /** List every materialized session header. */
  async list(): Promise<SessionHeaderLike[]> {
    const headers: SessionHeaderLike[] = []
    const projects = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const sessions = await readdir(join(this.root, project.name), { withFileTypes: true }).catch(() => [])
      for (const session of sessions) {
        if (!session.isDirectory()) continue
        const dir = join(this.root, project.name, session.name)
        for (const suffix of ['.jsonl.zstd', '.jsonl'] as const) {
          const path = join(dir, `session${suffix}`)
          if (!existsSync(path)) continue
          try {
            headers.push(this.readFromFile(path).header)
          } catch {
            // one corrupt artifact must not hide the rest
          }
          break
        }
      }
    }
    return headers
  }

  /** Read one session by id, scanning every project directory. */
  async readById(id: string): Promise<StoredSession | undefined> {
    const projects = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    for (const project of projects) {
      if (!project.isDirectory()) continue
      const sessions = await readdir(join(this.root, project.name), { withFileTypes: true }).catch(() => [])
      for (const session of sessions) {
        if (!session.isDirectory()) continue
        const dir = join(this.root, project.name, session.name)
        for (const suffix of ['.jsonl.zstd', '.jsonl'] as const) {
          const path = join(dir, `session${suffix}`)
          if (!existsSync(path)) continue
          const stored = this.readFromFile(path)
          if (stored.header.id === id) return stored
        }
      }
    }
    return undefined
  }

  /** Read one artifact directly (handles plaintext and zstd). */
  readFromFile(path: string): StoredSession {
    const buffer = readFileSync(path)
    const text = isZstd(buffer) ? decompressZstd(buffer).toString('utf8') : buffer.toString('utf8')
    return parseJsonl(text)
  }
}

/** SQLite session reader over a `sessions`/`events` database file. */
export class SqliteSessionReader {
  constructor(private readonly path: string) {}

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.path)
    db.exec('PRAGMA query_only = ON')
    return db
  }

  list(): SessionHeaderLike[] {
    const db = this.open()
    try {
      const rows = db.prepare(
        'SELECT id, version, created_at, cwd, parent_session, seed_length, origin, delegation_depth'
        + ' FROM sessions ORDER BY created_at',
      ).all() as Array<Record<string, unknown>>
      return rows.map(rowToHeader)
    } finally {
      db.close()
    }
  }

  readById(id: string): StoredSession | undefined {
    const db = this.open()
    try {
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
      if (row === undefined) return undefined
      const eventRows = db.prepare('SELECT seq, type, time, data, source_event_seqs, surface_op'
        + ' FROM events WHERE session_id = ? ORDER BY seq').all(id) as Array<Record<string, unknown>>
      return {
        header: rowToHeader(row),
        events: eventRows.map(eventRowToEvent),
      }
    } finally {
      db.close()
    }
  }
}

function rowToHeader(row: Record<string, unknown>): SessionHeaderLike {
  return {
    version: row.version as number,
    id: row.id as string,
    createdAt: row.created_at as number,
    ...(row.cwd === null ? {} : { cwd: row.cwd as string }),
    ...(row.parent_session === null ? {} : { parentSession: row.parent_session as string }),
    ...(row.seed_length === null ? {} : { seedLength: row.seed_length as number }),
    ...(row.origin === null ? {} : { origin: row.origin as 'subagent' }),
    delegationDepth: (row.delegation_depth as number) ?? 0,
  }
}

function eventRowToEvent(row: Record<string, unknown>): SessionEventLike {
  return {
    type: row.type as string,
    seq: row.seq as number,
    time: row.time as number,
    data: JSON.parse(row.data as string) as unknown,
    ...(row.source_event_seqs === null ? {} : { sourceEventSeqs: JSON.parse(row.source_event_seqs as string) as number[] }),
    ...(row.surface_op === null ? {} : { surfaceOp: JSON.parse(row.surface_op as string) as unknown }),
  }
}

export interface RdbEventRow {
  readonly fSequence: number
  readonly fKind: string
  readonly fData: string
  readonly fCreatedAt: number
  readonly fOriginalSeq: number
  readonly fSourceEventSeqs: string | null
  readonly fSurfaceOp: string | null
}

/**
 * RDB session reader: the `@morlay/session-persistence-rdb` three-table
 * event store. `assistant/chunk` rows are never persisted, so surviving
 * events carry a DENSE `f_sequence` plus the upstream `f_original_seq`;
 * `sourceEventSeqs` and positional `replace` surface ops are remapped back
 * to the dense space (first mapping wins, mirroring `buildSeqMap`). Torn
 * tails after the last committed `turn/end` are cut on read.
 */
export class RdbSessionReader {
  constructor(private readonly path: string) {}

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.path)
    db.exec('PRAGMA query_only = ON')
    return db
  }

  list(): SessionHeaderLike[] {
    const db = this.open()
    try {
      const rows = db.prepare(
        'SELECT f_session_id, f_version, f_created_at, f_cwd, f_parent_session,'
        + ' f_seed_length, f_origin, f_delegation_depth'
        + ' FROM t_sessions ORDER BY f_created_at',
      ).all() as Array<Record<string, unknown>>
      return rows.map(rdbRowToHeader)
    } finally {
      db.close()
    }
  }

  readById(id: string): StoredSession | undefined {
    const db = this.open()
    try {
      const session = db.prepare('SELECT * FROM t_sessions WHERE f_session_id = ?').get(id) as
        | Record<string, unknown>
        | undefined
      if (session === undefined) return undefined
      const rows = db.prepare(
        'SELECT se.f_sequence AS fSequence, e.f_kind AS fKind, e.f_data AS fData,'
        + ' e.f_created_at AS fCreatedAt, e.f_original_seq AS fOriginalSeq,'
        + ' e.f_source_event_seqs AS fSourceEventSeqs, e.f_surface_op AS fSurfaceOp'
        + ' FROM t_session_events se JOIN t_events e ON e.f_event_id = se.f_event_id'
        + ' WHERE se.f_session_id = ? ORDER BY se.f_sequence',
      ).all(id) as unknown as RdbEventRow[]
      const { preserved, tornFrom } = scanRdbRows(rows)
      return {
        header: rdbRowToHeader(session),
        events: preserved,
        ...(tornFrom === undefined ? {} : { tornFrom }),
      }
    } finally {
      db.close()
    }
  }
}

export function rdbRowToHeader(row: Record<string, unknown>): SessionHeaderLike {
  return {
    version: row.f_version as number,
    id: row.f_session_id as string,
    createdAt: row.f_created_at as number,
    ...(row.f_cwd === null ? {} : { cwd: row.f_cwd as string }),
    ...(row.f_parent_session === null ? {} : { parentSession: row.f_parent_session as string }),
    ...(row.f_seed_length === null ? {} : { seedLength: row.f_seed_length as number }),
    ...(row.f_origin === null ? {} : { origin: row.f_origin as 'subagent' }),
    delegationDepth: (row.f_delegation_depth as number) ?? 0,
  }
}

/** Reconstruct one event with upstream→dense seq remapping. */
function rdbRowToEvent(row: RdbEventRow, seqMap: ReadonlyMap<number, number>): SessionEventLike {
  const remap = (seq: number): number => seqMap.get(seq) ?? seq
  return {
    type: row.fKind,
    seq: row.fSequence,
    time: row.fCreatedAt,
    data: JSON.parse(row.fData) as unknown,
    ...(row.fSourceEventSeqs === null
      ? {}
      : { sourceEventSeqs: (JSON.parse(row.fSourceEventSeqs) as number[]).map(remap) }),
    ...(row.fSurfaceOp === null
      ? {}
      : { surfaceOp: remapRdbSurfaceOp(JSON.parse(row.fSurfaceOp) as unknown, remap) }),
  }
}

function remapRdbSurfaceOp(
  op: unknown,
  remap: (seq: number) => number,
): unknown {
  if (op === null || typeof op !== 'object' || Array.isArray(op)) return op
  const record = op as Record<string, unknown>
  if (record.op !== 'replace' || typeof record.start !== 'number' || typeof record.end !== 'number') {
    return op
  }
  return { op: 'replace', start: remap(record.start), end: remap(record.end) }
}

/**
 * Scan one session's RDB rows with the same crash-tail semantics as the
 * backend: the contiguous prefix through the last committed `turn/end` is
 * preserved; holes or seq gaps after it stop the read (torn tail).
 */
export function scanRdbRows(
  rows: readonly RdbEventRow[],
): { readonly preserved: readonly SessionEventLike[]; readonly tornFrom?: number } {
  const parsed: Array<{ ok: boolean; event?: SessionEventLike }> = []
  const seqMap = new Map<number, number>()
  for (const row of rows) {
    if (!seqMap.has(row.fOriginalSeq)) seqMap.set(row.fOriginalSeq, row.fSequence)
  }
  for (const row of rows) {
    try {
      parsed.push({ ok: true, event: rdbRowToEvent(row, seqMap) })
    } catch {
      parsed.push({ ok: false })
    }
  }
  let lastTurnEnd = -1
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]?.ok && rows[i]?.fKind === 'turn/end') {
      lastTurnEnd = i
      break
    }
  }
  const preserved: SessionEventLike[] = []
  for (let i = 0; i < rows.length; i++) {
    const entry = parsed[i]
    if (entry === undefined || !entry.ok || entry.event === undefined) {
      if (i <= lastTurnEnd) {
        throw new Error(`corrupt rdb session log: unparsable committed event at seq ${rows[i]?.fSequence}`)
      }
      break
    }
    if (entry.event.seq !== i) {
      if (i <= lastTurnEnd) {
        throw new Error(`corrupt rdb session log: seq gap in committed region (expected ${i}, got ${entry.event.seq})`)
      }
      break
    }
    preserved.push(entry.event)
  }
  return preserved.length < rows.length
    ? { preserved, tornFrom: preserved.length }
    : { preserved }
}

/** Extract mygo-relevant fields from one decoded event log. */
export function extractFields(events: readonly SessionEventLike[]): SessionFields {
  const messages: Array<{ role: 'user' | 'assistant'; turn: number; step: number; text: string }> = []
  const toolCalls: Array<{ callId: string; name: string; arguments: string }> = []
  const toolResults: Array<{
    callId?: string
    text: string
    error?: { name: string; code: string }
    meta?: unknown
  }> = []
  const turnMap = new Map<number, { turn: number; endedAt?: number; reason?: unknown }>()
  const usage: Array<{ turn: number; step: number; usage?: unknown }> = []
  const metaCards: Array<{ seq: number; meta: unknown }> = []
  const endSeedSeqs: number[] = []
  for (const event of events) {
    const data = event.data as Record<string, unknown>
    switch (event.type) {
      case 'user/message': {
        const text = contentToText((data.message as { content?: unknown } | undefined)?.content)
        if (text !== undefined) {
          messages.push({ role: 'user', turn: data.turn as number, step: data.step as number, text })
        }
        break
      }
      case 'assistant/message': {
        const message = data.message as { content?: unknown } | undefined
        const text = contentToText(message?.content)
        if (text !== undefined) {
          messages.push({ role: 'assistant', turn: data.turn as number, step: data.step as number, text })
        }
        usage.push({ turn: data.turn as number, step: data.step as number, ...(data.usage === undefined ? {} : { usage: data.usage }) })
        break
      }
      case 'tool/call':
        toolCalls.push({
          callId: data.callId as string,
          name: data.name as string,
          arguments: data.arguments as string,
        })
        break
      case 'tool/result': {
        const message = data.message as { content?: unknown } | undefined
        toolResults.push({
          ...((data as { callId?: unknown }).callId === undefined ? {} : { callId: (data as { callId?: unknown }).callId as string }),
          text: contentToText(message?.content) ?? '',
          ...(data.error === undefined ? {} : { error: data.error as { name: string; code: string } }),
          ...(data.meta === undefined ? {} : { meta: data.meta }),
        })
        if (data.meta !== undefined) metaCards.push({ seq: event.seq, meta: data.meta })
        break
      }
      case 'turn/start':
        turnMap.set(data.turn as number, { turn: data.turn as number })
        break
      case 'turn/end': {
        const existing = turnMap.get(data.turn as number) ?? { turn: data.turn as number }
        turnMap.set(data.turn as number, {
          ...existing,
          endedAt: event.time,
          ...(data.reason === undefined ? {} : { reason: data.reason }),
        })
        break
      }
      case 'session/end-seed':
        endSeedSeqs.push(event.seq)
        break
      default:
        break
    }
  }
  const turns: SessionFields['turns'] = [...turnMap.values()].sort((left, right) => left.turn - right.turn)
  return {
    messages,
    toolCalls,
    toolResults,
    turns,
    usage,
    metaCards,
    endSeedSeqs,
  }
}

/** Best-effort extraction of plain text from a message content block list. */
function contentToText(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') parts.push(record.text)
  }
  return parts.length === 0 ? undefined : parts.join('\n')
}

/** Best-effort session-id extraction from a log file name (diagnostics). */
export function sessionIdOfFile(path: string): string {
  const base = basename(path)
  return base === 'session.jsonl' || base === 'session.jsonl.zstd'
    ? basename(join(path, '..'))
    : base
}
