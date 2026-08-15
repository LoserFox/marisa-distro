/**
 * Attachment snapshotting and materialization. Outbound: the sender
 * snapshots current-session file paths before sending (the hub never
 * resolves sender-local paths). Inbound: the receiver materializes
 * attachment bytes into a per-message directory under the system temp dir
 * and references the resulting absolute paths. One message shares a 4 MiB
 * decoded-content budget across text and attachments.
 * @module @dpskh/a2a/attachments
 */

import { mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  encodeBinaryPayload,
  MAX_ATTACHMENT_COUNT,
  MAX_MESSAGE_CONTENT_BYTES,
  type EncodedAttachment,
} from './hub/payload.ts'

/** One materialized attachment: name, byte count, and the local file path. */
export interface A2aAttachmentReference {
  readonly name: string
  readonly path: string
  readonly uncompressedBytes: number
}

/** Read one file stably (regular file, unchanged during the read, size-capped). */
async function readStableFile(filePath: string, maxBytes: number, source: string): Promise<Buffer> {
  const file = await open(filePath, 'r')
  try {
    const before = await file.stat()
    if (!before.isFile()) throw new Error(`attachment source must be a regular file: ${source}`)
    if (before.size > maxBytes) {
      throw new Error(`attachments exceed ${MAX_MESSAGE_CONTENT_BYTES} bytes`)
    }
    const buffer = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < buffer.byteLength) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      )
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const after = await file.stat()
    if (offset !== before.size || after.size !== before.size) {
      throw new Error(`attachment changed while being read: ${source}`)
    }
    return buffer.subarray(0, offset)
  } finally {
    await file.close()
  }
}

/**
 * Snapshot one set of sender-local file paths into encoded attachments.
 * @param sources - absolute file paths, at most {@link MAX_ATTACHMENT_COUNT}.
 * @returns the encoded attachments (names are the file basenames).
 */
export async function snapshotAttachments(sources: readonly string[]): Promise<EncodedAttachment[]> {
  if (sources.length === 0) return []
  if (sources.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`message has more than ${MAX_ATTACHMENT_COUNT} attachments`)
  }
  const attachments: EncodedAttachment[] = []
  let totalBytes = 0
  for (const source of sources) {
    const bytes = await readStableFile(source, MAX_MESSAGE_CONTENT_BYTES - totalBytes, source)
    totalBytes += bytes.byteLength
    attachments.push({
      name: path.basename(source),
      payload: encodeBinaryPayload(bytes),
    })
  }
  return attachments
}

/**
 * Materialize one message's attachments under a per-message directory in
 * the system temp dir. The directory name derives from the message
 * reference, so repeated materialization of the same message reuses one
 * location (idempotent).
 * @param project - the message's project (directory namespace).
 * @param messageRef - the message reference (per-message directory).
 * @param attachments - the decoded attachments.
 * @returns the local references.
 */
export async function materializeAttachments(
  project: string,
  messageRef: string,
  attachments: readonly { name: string; bytes: Buffer }[],
): Promise<A2aAttachmentReference[]> {
  if (attachments.length === 0) return []
  const root = path.join(tmpdir(), 'dsh-a2a', project, messageRef)
  await mkdir(root, { recursive: true })
  const realRoot = await realpath(root)
  const outputDirectory = await mkdtemp(path.join(realRoot, 'attach-'))
  try {
    const references: A2aAttachmentReference[] = []
    for (const attachment of attachments) {
      const filePath = path.join(outputDirectory, attachment.name)
      await writeFile(filePath, attachment.bytes, { flag: 'wx', mode: 0o600 })
      references.push({
        name: attachment.name,
        path: filePath,
        uncompressedBytes: attachment.bytes.byteLength,
      })
    }
    return references
  } catch (error) {
    try {
      await rm(outputDirectory, { recursive: true, force: true })
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'failed to materialize and clean up A2A attachments',
      )
    }
    throw error
  }
}
