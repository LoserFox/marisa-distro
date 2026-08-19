/**
 * Storage operations for the session chat-log tools: enumerate persisted
 * sessions and read one session's transcript through `ctx.sessionPersistence`.
 *
 * Reads prefer `listSnapshots`/`inspect`, both non-mutating: observing a
 * foreign session never repairs a torn tail or closes an interrupted turn.
 * When `inspect` rejects a log (e.g. a seq gap left by a crashed concurrent
 * writer — real multi-agent stores show these), the read falls back to a
 * tolerant direct parse of the JSONL artifact located via `locate`: frames
 * are decoded with `node:zlib`, and malformed lines are skipped instead of
 * rejecting the whole session, so a chat transcript still comes back.
 *
 * @module @dsh-external/session-chatlog/operations
 */

import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionHeader, SessionId } from '@deepseek-ai/dsh-session'

/** A persisted-session snapshot as surfaced to the model. */
export interface SessionSnapshot {
  id: string
  cwd: string | null
  createdAt: number
  revision: string
  /** Best user-facing preview: the first user message, truncated. */
  preview: string | null
}

/** Maximum characters of the first-user-message preview in `session_list`. */
export const PREVIEW_MAX_CHARS = 160

/** Maximum zstd frames decoded to locate a session's preview (head read). */
export const PREVIEW_FRAME_LIMIT = 4

/**
 * Enumerate every persisted session in the shared store.
 * @param ctx - Cordis context carrying `sessionPersistence`.
 * @returns snapshots sorted by createdAt ascending.
 */
export async function loadSessionSnapshot(ctx: Context): Promise<SessionSnapshot[]> {
  const snapshots = await ctx.sessionPersistence.listSnapshots()
  const out: SessionSnapshot[] = []
  for (const { header, revision } of snapshots) {
    out.push({
      id: header.id,
      cwd: header.cwd ?? null,
      createdAt: header.createdAt,
      revision: revision.toString(),
      preview: await readPreview(ctx, header),
    })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * Head read for one session's preview (mirrors Codex's `read_head_summary`):
 * decodes only the first frames of the artifact and stops at the first user
 * message, so listing stays cheap even for very large sessions.
 * @param ctx - Cordis context carrying `sessionPersistence`.
 * @param header - the session header (used to locate the artifact).
 * @returns the truncated first user message, or null when unavailable.
 */
async function readPreview(ctx: Context, header: SessionHeader): Promise<string | null> {
  const location = ctx.sessionPersistence.locate(header)
  if (location === undefined || location.kind !== 'jsonl') return null
  try {
    const events = await readJsonlArtifactHead(location.path, PREVIEW_FRAME_LIMIT)
    const first = events.find(event => event.type === 'user/message')
    if (first === undefined) return null
    const { text } = messageTextOf(first)
    if (text.length === 0) return null
    return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text
  } catch {
    return null // unreadable artifact: list without a preview
  }
}

/**
 * Extract the chat text of one message event (user/steering carry
 * `data.content[]`; assistant carries `data.message.content[]`).
 * @param event - the message event.
 * @returns the joined text blocks.
 */
function messageTextOf(event: SessionEvent): { text: string } {
  const data = event.data as Record<string, unknown> | undefined
  let content: Array<Record<string, unknown>>
  if (Array.isArray(data?.content)) {
    content = data.content as Array<Record<string, unknown>>
  } else {
    const message = data?.message as Record<string, unknown> | undefined
    content = Array.isArray(message?.content)
      ? message.content as Array<Record<string, unknown>>
      : []
  }
  return {
    text: content.filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string).join('\n'),
  }
}

/**
 * Read one session's stored log without mutating it. Strict service read
 * first; tolerant JSONL artifact parse as fallback (see module docs).
 * @param ctx - Cordis context carrying `sessionPersistence`.
 * @param id - the persisted session id to inspect.
 * @returns the session's header and stored events.
 */
export async function readSessionTranscript(
  ctx: Context,
  id: string,
): Promise<{ meta: SessionHeader; events: readonly SessionEvent[] }> {
  try {
    const { meta, events } = await ctx.sessionPersistence.inspect(id as SessionId)
    return { meta, events }
  } catch {
    // Strict read rejected the log (seq gap / torn tail); fall back to a
    // tolerant parse so the transcript is still available.
    const snapshots = await ctx.sessionPersistence.listSnapshots()
    const snapshot = snapshots.find(s => s.header.id === id)
    if (snapshot === undefined) throw new Error(`session not found: ${id}`)
    const location = ctx.sessionPersistence.locate(snapshot.header)
    if (location === undefined || location.kind !== 'jsonl') {
      throw new Error(`session ${id} cannot be read as a chat transcript`)
    }
    const events = await readJsonlArtifact(location.path)
    return { meta: snapshot.header, events }
  }
}

/** Byte offset ranges of structurally complete zstd frames in a buffer. */
interface ZstdFrameRange {
  start: number
  end: number
}

const ZSTD_MAGIC = 0xFD2FB528

/**
 * Scan concatenated zstd frames (the JSONL backend's append container).
 * Tolerant: returns the frames it can locate and stops at the first
 * structural break instead of rejecting the whole buffer.
 * @param buffer - the concatenated zstd stream.
 * @returns complete frame ranges in file order.
 */
function scanZstdFrames(buffer: Buffer): ZstdFrameRange[] {
  const frames: Array<ZstdFrameRange> = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) break // reserved bits
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    let lastBlock = false
    while (!lastBlock) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      if (blockType === 0x03) return frames
      const payloadBytes = blockType === 0x01 ? 1 : blockHeader >>> 3
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

/**
 * Decode zstd frames into their text payloads.
 * @param buffer - the concatenated zstd artifact bytes.
 * @param frameLimit - maximum frames to decode (head read), or undefined for all.
 * @returns the decoded text parts in file order.
 */
function decodeFrames(buffer: Buffer, frameLimit?: number): string[] {
  const frames = scanZstdFrames(buffer)
  const limited = frameLimit === undefined ? frames : frames.slice(0, frameLimit)
  const parts: string[] = []
  for (const frame of limited) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8'))
    } catch {
      // skip an undecodable frame; keep the rest of the transcript
    }
  }
  return parts
}

/** Parse JSONL text into events, skipping malformed lines. */
function parseEventLines(text: string): SessionEvent[] {
  const events: SessionEvent[] = []
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const event = JSON.parse(line) as SessionEvent
      if (typeof event.type === 'string') {
        events.push(event)
      }
    } catch {
      // malformed line (torn tail fragment): skip
    }
  }
  return events
}

/**
 * Tolerantly parse a JSONL session artifact into events: zstd frames are
 * decoded individually, JSON lines that fail to parse are skipped, and no
 * seq contiguity is required (the chat projection sorts and tolerates gaps).
 * @param path - the artifact path (`.jsonl` or `.jsonl.zstd`).
 * @returns the events found in the artifact.
 */
async function readJsonlArtifact(path: string): Promise<SessionEvent[]> {
  const buffer = await readFile(path)
  const text = path.endsWith('.jsonl.zstd')
    ? decodeFrames(buffer).join('')
    : buffer.toString('utf8')
  return parseEventLines(text)
}

/**
 * Head read of a JSONL artifact: decode only the first frames (the session
 * start) and return the events found there. Mirrors Codex's head scan that
 * powers conversation-list previews without reading whole rollouts.
 * @param path - the artifact path (`.jsonl` or `.jsonl.zstd`).
 * @param frameLimit - maximum zstd frames to decode.
 * @returns the events found in the head of the artifact.
 */
async function readJsonlArtifactHead(path: string, frameLimit: number): Promise<SessionEvent[]> {
  const buffer = await readFile(path)
  const text = path.endsWith('.jsonl.zstd')
    ? decodeFrames(buffer, frameLimit).join('')
    : buffer.toString('utf8')
  return parseEventLines(text)
}
