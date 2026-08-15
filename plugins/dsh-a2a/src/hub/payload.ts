/**
 * Message payloads on the mesh wire: identity under the plain limit,
 * gzip+base64 above it, and a hard decoded-size cap so a hostile hub never
 * inflates memory. Text, attachments, and their sum share one content
 * budget (mirrors the omp-a2a v0.3 payload contract).
 * @module @dpskh/a2a/hub/payload
 */

import { gunzipSync, gzipSync } from 'node:zlib'

/** Text at or below this many bytes travels verbatim. */
export const TEXT_PLAIN_LIMIT = 32 * 1024

/** One message's total decoded content (text + attachments) cap. */
export const MAX_MESSAGE_CONTENT_BYTES = 4 * 1024 * 1024

/** Decoded text beyond this many bytes is rejected at the wire boundary. */
export const DECODED_TEXT_LIMIT = MAX_MESSAGE_CONTENT_BYTES

/** One message accepts at most this many attachments. */
export const MAX_ATTACHMENT_COUNT = 8

/** Attachment names beyond this many bytes are rejected. */
export const MAX_ATTACHMENT_NAME_BYTES = 255

/** Wire text payload encoding union. */
export type EncodedTextPayload =
  | { encoding: 'identity'; data: string; uncompressedBytes: number }
  | { encoding: 'gzip+base64'; data: string; uncompressedBytes: number }

/** Wire binary payload encoding union. */
export type EncodedBinaryPayload =
  | { encoding: 'base64'; data: string; uncompressedBytes: number }
  | { encoding: 'gzip+base64'; data: string; uncompressedBytes: number }

/** One attachment on the wire: a name plus encoded content bytes. */
export interface EncodedAttachment {
  readonly name: string
  readonly payload: EncodedBinaryPayload
}

/** Rejected because decoded content exceeds a payload cap. */
export class PayloadTooLargeError extends Error {}

/** Validate an uncompressed byte count against the content cap. */
function assertUncompressedBytes(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_MESSAGE_CONTENT_BYTES
  ) {
    throw new PayloadTooLargeError(`${label} has invalid uncompressed byte count`)
  }
  return value
}

/** Decode canonical base64; a re-encoded mismatch means a non-canonical wire value. */
function decodeBase64(data: unknown, label: string): Buffer {
  if (typeof data !== 'string') throw new Error(`${label} data must be a string`)
  const bytes = Buffer.from(data, 'base64')
  if (bytes.toString('base64') !== data) {
    throw new Error(`${label} data is not canonical base64`)
  }
  return bytes
}

/**
 * Encode one message text for the mesh wire.
 * @param text - the message text.
 * @returns the encoded payload; large texts are gzip-compressed.
 */
export function encodeTextPayload(text: string): EncodedTextPayload {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength > MAX_MESSAGE_CONTENT_BYTES) {
    throw new PayloadTooLargeError(`message text exceeds ${MAX_MESSAGE_CONTENT_BYTES} bytes`)
  }
  if (bytes.byteLength < TEXT_PLAIN_LIMIT) {
    return { encoding: 'identity', data: text, uncompressedBytes: bytes.byteLength }
  }
  return {
    encoding: 'gzip+base64',
    data: gzipSync(bytes).toString('base64'),
    uncompressedBytes: bytes.byteLength,
  }
}

/**
 * Decode one mesh text payload back to text.
 * @param payload - the wire payload.
 * @returns the decoded text.
 * @throws {PayloadTooLargeError} when the decoded size exceeds the content cap.
 */
export function decodeTextPayload(payload: EncodedTextPayload): string {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- wire boundary: payload arrives from parsed JSON.
  if (!payload || typeof payload !== 'object') {
    throw new Error('message text payload is required')
  }
  const expectedBytes = assertUncompressedBytes(payload.uncompressedBytes, 'message text')
  let bytes: Buffer
  if (payload.encoding === 'identity') {
    bytes = Buffer.from(payload.data, 'utf8')
  } else {
    bytes = gunzipSync(decodeBase64(payload.data, 'message text'), {
      maxOutputLength: DECODED_TEXT_LIMIT + 1,
    })
  }
  if (bytes.byteLength > DECODED_TEXT_LIMIT) {
    throw new PayloadTooLargeError(`message text exceeds ${DECODED_TEXT_LIMIT} bytes after decoding`)
  }
  if (bytes.byteLength !== expectedBytes) {
    throw new Error('message text size does not match payload metadata')
  }
  return bytes.toString('utf8')
}

/**
 * Encode one attachment's bytes for the mesh wire.
 * @param bytes - the raw bytes.
 * @returns the encoded payload; gzip is used when it shrinks the value.
 */
export function encodeBinaryPayload(bytes: Uint8Array): EncodedBinaryPayload {
  if (bytes.byteLength > MAX_MESSAGE_CONTENT_BYTES) {
    throw new PayloadTooLargeError(`attachment exceeds ${MAX_MESSAGE_CONTENT_BYTES} bytes`)
  }
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength >= TEXT_PLAIN_LIMIT) {
    const compressed = gzipSync(input)
    if (compressed.byteLength < bytes.byteLength) {
      return {
        encoding: 'gzip+base64',
        data: compressed.toString('base64'),
        uncompressedBytes: bytes.byteLength,
      }
    }
  }
  return { encoding: 'base64', data: input.toString('base64'), uncompressedBytes: bytes.byteLength }
}

/**
 * Decode one attachment payload back to bytes.
 * @param payload - the wire payload.
 * @returns the raw bytes.
 * @throws {PayloadTooLargeError} when the decoded size exceeds the content cap.
 */
export function decodeBinaryPayload(payload: EncodedBinaryPayload): Buffer {
  // oxlint-disable-next-line typescript/no-unnecessary-condition -- wire boundary: payload arrives from parsed JSON.
  if (!payload || typeof payload !== 'object') {
    throw new Error('attachment payload is required')
  }
  const expectedBytes = assertUncompressedBytes(payload.uncompressedBytes, 'attachment')
  const encoded = decodeBase64(payload.data, 'attachment')
  let bytes: Buffer
  if (payload.encoding === 'base64') {
    bytes = encoded
  } else {
    bytes = gunzipSync(encoded, { maxOutputLength: MAX_MESSAGE_CONTENT_BYTES + 1 })
  }
  if (bytes.byteLength > MAX_MESSAGE_CONTENT_BYTES) {
    throw new PayloadTooLargeError(`attachment exceeds ${MAX_MESSAGE_CONTENT_BYTES} bytes after decoding`)
  }
  if (bytes.byteLength !== expectedBytes) {
    throw new Error('attachment size does not match payload metadata')
  }
  return bytes
}

/**
 * Validate one wire attachment list: count, names, and decodable payloads.
 * @param value - the wire attachments value.
 * @returns the validated attachments.
 */
export function parseEncodedAttachments(value: unknown): EncodedAttachment[] {
  if (!Array.isArray(value)) throw new Error('attachments must be an array')
  if (value.length > MAX_ATTACHMENT_COUNT) {
    throw new PayloadTooLargeError(`message has more than ${MAX_ATTACHMENT_COUNT} attachments`)
  }
  const names = new Set<string>()
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('invalid attachment')
    }
    const record = candidate as Record<string, unknown>
    if (typeof record.name !== 'string' || !('payload' in record)) {
      throw new Error('invalid attachment')
    }
    const name = record.name
    let hasControlCharacter = false
    for (const character of name) {
      const codePoint = character.codePointAt(0)
      if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
        hasControlCharacter = true
        break
      }
    }
    if (
      name.length === 0 ||
      Buffer.byteLength(name, 'utf8') > MAX_ATTACHMENT_NAME_BYTES ||
      name === '.' ||
      name === '..' ||
      name.includes('/') ||
      name.includes('\\') ||
      hasControlCharacter
    ) {
      throw new Error(`invalid attachment name: ${name}`)
    }
    if (names.has(name)) throw new Error(`duplicate attachment name: ${name}`)
    names.add(name)
    const payload = record.payload
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('encoding' in payload) ||
      (payload.encoding !== 'base64' && payload.encoding !== 'gzip+base64') ||
      !('data' in payload) ||
      typeof payload.data !== 'string' ||
      !('uncompressedBytes' in payload) ||
      typeof payload.uncompressedBytes !== 'number'
    ) {
      throw new Error(`invalid attachment payload: ${name}`)
    }
    const payloadRecord = payload as { encoding: 'base64' | 'gzip+base64'; data: string; uncompressedBytes: number }
    const normalized: EncodedAttachment = {
      name,
      payload: {
        encoding: payloadRecord.encoding,
        data: payloadRecord.data,
        uncompressedBytes: payloadRecord.uncompressedBytes,
      },
    }
    decodeBinaryPayload(normalized.payload)
    return normalized
  })
}

/**
 * Validate one message's full content: non-empty decoded text, valid
 * attachments, and one shared decoded-byte budget.
 * @param payload - the text payload.
 * @param attachmentsValue - the wire attachments value.
 * @returns the validated attachments and the total content byte count.
 */
export function validateMessageContent(
  payload: EncodedTextPayload,
  attachmentsValue: unknown,
): { attachments: EncodedAttachment[]; contentBytes: number } {
  const text = decodeTextPayload(payload)
  if (text.trim().length === 0) throw new Error('message text required')
  const attachments = parseEncodedAttachments(attachmentsValue)
  const contentBytes = attachments.reduce(
    (total, attachment) => total + attachment.payload.uncompressedBytes,
    payload.uncompressedBytes,
  )
  if (contentBytes > MAX_MESSAGE_CONTENT_BYTES) {
    throw new PayloadTooLargeError(`message content exceeds ${MAX_MESSAGE_CONTENT_BYTES} bytes`)
  }
  return { attachments, contentBytes }
}
