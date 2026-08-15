/**
 * Durable a2a hub domain (protocol version 3): project metadata, per-project
 * sequence counters, the immutable message history, and the msgId
 * idempotency index. Presence, delivery, and roster state are in-memory
 * only — messages are the sole durable record. One domain over the routed
 * backend; the domain's single write chain serializes every mutation, and
 * the message store adds its own chain so an append (sequence allocation +
 * inserts) never interleaves with another append.
 * @module @dpskh/a2a/hub/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

/** Composite table key separator; none of the parts may contain it. */
export const KEY_SEP = '/'

/** One stored project. */
export const a2aProjectRecord = z.object({
  displayName: z.string().optional(),
  description: z.string().optional(),
  createdByCwd: z.string().optional(),
  createdAt: z.number(),
})

/** One per-project sequence counter (seeded at project creation). */
export const a2aSequenceRecord = z.object({
  next: z.number(),
})

/** One stored attachment: a name plus its encoded content bytes. */
export const a2aAttachmentRecord = z.object({
  name: z.string(),
  payload: z.object({
    encoding: z.enum(['base64', 'gzip+base64']),
    data: z.string(),
    uncompressedBytes: z.number(),
  }),
})

/**
 * One stored message. `msgId` rides the idempotency index; the composite
 * key is `project/sequence`. `contentBytes` is the decoded text plus
 * attachment byte total, verified at read.
 */
export const a2aMessageRecord = z.object({
  msgId: z.string(),
  senderName: z.string(),
  senderPresenceId: z.string(),
  target: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('agent'),
      name: z.string(),
      presenceId: z.string().optional(),
    }),
    z.object({ type: z.literal('project') }),
  ]),
  encoding: z.enum(['identity', 'gzip+base64']),
  data: z.string(),
  uncompressedBytes: z.number(),
  attachments: z.array(a2aAttachmentRecord).default([]),
  contentBytes: z.number(),
  createdAt: z.number(),
  replyToSequence: z.number().optional(),
})

/** One msgId → (project, sequence) idempotency index row. */
export const a2aMessageIdRecord = z.object({
  project: z.string(),
  sequence: z.number(),
})

/** Durable hub state, one domain over the routed backend. */
export const a2aHubDomainSpec = defineDomain({
  name: 'a2a',
  version: 3,
  tables: {
    projects: domainTable<string, z.infer<typeof a2aProjectRecord>>(a2aProjectRecord),
    sequences: domainTable<string, z.infer<typeof a2aSequenceRecord>>(a2aSequenceRecord),
    messages: domainTable<string, z.infer<typeof a2aMessageRecord>>(a2aMessageRecord),
    message_ids: domainTable<string, z.infer<typeof a2aMessageIdRecord>>(a2aMessageIdRecord),
  },
})

/** Join parts into one composite table key.
 * @param parts - key parts, none containing the separator.
 * @returns the joined key.
 */
export function compositeKey(parts: readonly string[]): string {
  return parts.join(KEY_SEP)
}
