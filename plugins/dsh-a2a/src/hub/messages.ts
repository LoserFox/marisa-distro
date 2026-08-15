/**
 * The hub message store over the a2a domain: append-only immutable history
 * with per-project monotonic sequences, msgId idempotency, project-scoped
 * `replyTo` resolution, and bounded history queries. Appends run on the
 * store's own chain (sequence allocation + inserts are one atomic slot), so
 * concurrent senders can never interleave mid-append.
 * @module @dpskh/a2a/hub/messages
 */

import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { formatMessageRef, parseMessageRef, PROJECT_NAME_RE, AGENT_NAME_RE } from './message-ref.ts'
import { validateMessageContent, type EncodedAttachment, type EncodedTextPayload } from './payload.ts'
import { compositeKey } from './spec.ts'
import type { a2aHubDomainSpec, a2aMessageRecord } from './spec.ts'
import type { A2aHistoryPage, A2aHistoryQuery, A2aMessageTarget, A2aRealtimeMessage } from './types.ts'

/** msgId idempotency-key rule (opaque machine key, not user-facing). */
const MESSAGE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/

/** One history response's decoded-byte budget. */
export const MAX_HISTORY_BYTES = 4 * 1024 * 1024

/** Reusing a msgId with different content. */
export class MessageIdConflictError extends Error {}

/** The replyTo reference is unknown or belongs to another project. */
export class UnknownReplyTargetError extends Error {}

/** One client-authored message draft, pre-validation. */
export interface A2aMessageDraft {
  readonly messageId: string
  readonly project: string
  readonly from: { name: string; presenceId: string }
  readonly target: A2aMessageTarget
  readonly payload: EncodedTextPayload
  readonly attachments: readonly EncodedAttachment[]
  readonly createdAt: number
  readonly replyTo?: string
}

type HubDomain = Domain<typeof a2aHubDomainSpec>

/** Stored message row plus its composite key parts. */
interface MessageRow {
  readonly project: string
  readonly sequence: number
  readonly record: z.infer<typeof a2aMessageRecord>
}

/** The message store over one opened a2a domain. */
export class A2aHubMessages {
  /** Tail of the append chain: one append (check + allocate + insert) never interleaves with another. */
  private chain: Promise<void> = Promise.resolve()

  /** @param domain - the opened a2a hub domain. */
  constructor(private readonly domain: HubDomain) {}

  /**
   * Append one message. Idempotent by msgId: a retry of the same body
   * returns the original message (its stored sequence included); reusing
   * the id for different content throws {@link MessageIdConflictError}.
   * @param draft - the message draft.
   * @returns whether this call inserted, and the stored message.
   */
  append(draft: A2aMessageDraft): Promise<{ inserted: boolean; message: A2aRealtimeMessage }> {
    const job = async (): Promise<{ inserted: boolean; message: A2aRealtimeMessage }> => {
      const { attachments, contentBytes } = this.validateDraft(draft)
      const replyToSequence = this.resolveReply(draft.project, draft.replyTo)
      const byId = this.domain.table('message_ids')
      const existing = byId.get(draft.messageId)
      if (existing !== undefined) {
        const row = this.rowAt(existing.project, existing.sequence)
        if (row === null) {
          throw new Error(`idempotency index points at a missing message: ${draft.messageId}`)
        }
        if (!this.matches(row, draft, attachments, replyToSequence)) {
          throw new MessageIdConflictError(`messageId already used with different content: ${draft.messageId}`)
        }
        return { inserted: false, message: this.toMessage(row) }
      }
      const sequence = await this.allocateSequence(draft.project)
      const record: z.infer<typeof a2aMessageRecord> = {
        msgId: draft.messageId,
        senderName: draft.from.name,
        senderPresenceId: draft.from.presenceId,
        target: { ...draft.target },
        encoding: draft.payload.encoding,
        data: draft.payload.data,
        uncompressedBytes: draft.payload.uncompressedBytes,
        attachments: attachments.map(attachment => ({
          name: attachment.name,
          payload: { ...attachment.payload },
        })),
        contentBytes,
        createdAt: draft.createdAt,
        ...(replyToSequence === null ? {} : { replyToSequence }),
      }
      await this.domain.table('messages').put(compositeKey([draft.project, String(sequence)]), record)
      await byId.put(draft.messageId, { project: draft.project, sequence })
      return {
        inserted: true,
        message: {
          messageId: draft.messageId,
          messageRef: formatMessageRef(draft.project, sequence),
          project: draft.project,
          sequence,
          from: { ...draft.from },
          target: { ...draft.target },
          payload: { ...draft.payload },
          attachments: attachments.map(attachment => ({
            name: attachment.name,
            payload: { ...attachment.payload },
          })),
          createdAt: draft.createdAt,
          ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
        },
      }
    }
    const result = this.chain.then(job)
    this.chain = result.then(() => {}, () => {})
    return result
  }

  /**
   * Read one message by its friendly reference.
   * @param reference - the `<project>:<sequence>` reference.
   * @returns the message, or `null` when unknown.
   */
  get(reference: string): A2aRealtimeMessage | null {
    const parsed = parseMessageRef(reference)
    if (parsed === null) throw new Error(`invalid message reference: ${reference}`)
    const row = this.rowAt(parsed.project, parsed.sequence)
    return row === null ? null : this.toMessage(row)
  }

  /**
   * Query a project's history, newest-first with a decoded-byte budget.
   * @param query - project, cursors, sender filter, and limit.
   * @returns the matched messages in ascending sequence order.
   */
  history(query: A2aHistoryQuery): A2aHistoryPage {
    if (!PROJECT_NAME_RE.test(query.project)) throw new Error(`invalid project: ${query.project}`)
    if (query.before !== undefined && query.after !== undefined) {
      throw new Error('history accepts before or after, not both')
    }
    if (query.from !== undefined && !AGENT_NAME_RE.test(query.from)) {
      throw new Error(`invalid name: ${query.from}`)
    }
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 500)
    let beforeSequence: number | undefined
    let afterSequence: number | undefined
    if (query.before !== undefined) {
      const ref = parseMessageRef(query.before)
      if (ref === null || ref.project !== query.project) {
        throw new Error('history cursor belongs to another project')
      }
      beforeSequence = ref.sequence
    }
    if (query.after !== undefined) {
      const ref = parseMessageRef(query.after)
      if (ref === null || ref.project !== query.project) {
        throw new Error('history cursor belongs to another project')
      }
      afterSequence = ref.sequence
    }
    // With `after`, the window is walked oldest-first (the first message
    // after the cursor is the oldest candidate); otherwise newest-first.
    const ascending = afterSequence !== undefined
    const rows = this.projectRows(query.project)
      .filter(row => (beforeSequence === undefined || row.sequence < beforeSequence)
        && (afterSequence === undefined || row.sequence > afterSequence)
        && (query.from === undefined || row.record.senderName === query.from))
      .sort((left, right) => ascending ? left.sequence - right.sequence : right.sequence - left.sequence)
    const selected: MessageRow[] = []
    let cumulative = 0
    for (const row of rows) {
      const bytes = this.contentBytesOf(row)
      if (cumulative + bytes > MAX_HISTORY_BYTES) break
      cumulative += bytes
      selected.push(row)
      if (selected.length >= limit) break
    }
    if (!ascending) selected.reverse()
    return { messages: selected.map(row => this.toMessage(row)) }
  }

  /**
   * Purge one project's history and sequence state.
   * @param project - project name.
   */
  async deleteProject(project: string): Promise<void> {
    const messages = this.domain.table('messages')
    for (const key of messages.keys()) {
      if (key.startsWith(`${project}/`)) await messages.delete(key)
    }
    const byId = this.domain.table('message_ids')
    for (const [key, record] of byId.entries()) {
      if (record.project === project) await byId.delete(key)
    }
    await this.domain.table('sequences').delete(project)
  }

  /** Resolve one stored row by project and sequence. */
  private rowAt(project: string, sequence: number): MessageRow | null {
    const record = this.domain.table('messages').get(compositeKey([project, String(sequence)]))
    if (record === undefined) return null
    return { project, sequence, record }
  }

  /** All rows of one project (composite keys are "<project>/<sequence>"). */
  private projectRows(project: string): MessageRow[] {
    const prefix = `${project}/`
    const rows: MessageRow[] = []
    for (const [key, record] of this.domain.table('messages').entries()) {
      if (!key.startsWith(prefix)) continue
      const sequence = Number(key.slice(prefix.length))
      if (!Number.isSafeInteger(sequence) || sequence < 1) continue
      rows.push({ project, sequence, record })
    }
    return rows
  }

  /**
   * Allocate the next sequence of a project atomically. The sequences row
   * is seeded at project creation; a missing row (defensive) is created.
   */
  private async allocateSequence(project: string): Promise<number> {
    const sequences = this.domain.table('sequences')
    const current = sequences.get(project)
    if (current === undefined) {
      await sequences.put(project, { next: 2 })
      return 1
    }
    const next = (await sequences.update(project, row => ({ next: row.next + 1 }))).next
    return next - 1
  }

  /** Validate one draft's fields and content; returns the normalized attachments. */
  private validateDraft(draft: A2aMessageDraft): { attachments: EncodedAttachment[]; contentBytes: number } {
    if (!MESSAGE_ID_RE.test(draft.messageId)) throw new Error(`invalid messageId: ${draft.messageId}`)
    if (!PROJECT_NAME_RE.test(draft.project)) throw new Error(`invalid project: ${draft.project}`)
    if (!AGENT_NAME_RE.test(draft.from.name)) throw new Error(`invalid sender name: ${draft.from.name}`)
    if (!draft.from.presenceId) throw new Error('sender presenceId is required')
    if (draft.target.type === 'agent' && !AGENT_NAME_RE.test(draft.target.name)) {
      throw new Error(`invalid recipient name: ${draft.target.name}`)
    }
    if (!Number.isSafeInteger(draft.createdAt) || draft.createdAt < 0) {
      throw new Error('invalid createdAt')
    }
    return validateMessageContent(draft.payload, draft.attachments)
  }

  /** Resolve a replyTo reference to its stored sequence, when any. */
  private resolveReply(project: string, replyTo: string | undefined): number | null {
    if (replyTo === undefined) return null
    const parsed = parseMessageRef(replyTo)
    if (parsed === null || parsed.project !== project) {
      throw new UnknownReplyTargetError('replyTo belongs to another project')
    }
    if (this.rowAt(project, parsed.sequence) === null) {
      throw new UnknownReplyTargetError(`unknown replyTo: ${replyTo}`)
    }
    return parsed.sequence
  }

  /** Whether a stored row equals one draft (idempotency match). */
  private matches(
    row: MessageRow,
    draft: A2aMessageDraft,
    attachments: EncodedAttachment[],
    replyToSequence: number | null,
  ): boolean {
    if (row.project !== draft.project
      || row.record.senderName !== draft.from.name
      || row.record.encoding !== draft.payload.encoding
      || row.record.data !== draft.payload.data
      || row.record.uncompressedBytes !== draft.payload.uncompressedBytes
      || JSON.stringify(row.record.attachments) !== JSON.stringify(attachments)
      || (row.record.replyToSequence ?? null) !== replyToSequence) {
      return false
    }
    if (row.record.target.type === 'project') return draft.target.type === 'project'
    return draft.target.type === 'agent' && row.record.target.name === draft.target.name
  }

  /** One stored row's decoded content bytes (text + attachments). */
  private contentBytesOf(row: MessageRow): number {
    const attachments = row.record.attachments.reduce(
      (total, attachment) => total + attachment.payload.uncompressedBytes,
      0,
    )
    return row.record.uncompressedBytes + attachments
  }

  /** Project one stored row into its wire message, verifying size metadata. */
  private toMessage(row: MessageRow): A2aRealtimeMessage {
    const contentBytes = this.contentBytesOf(row)
    if (contentBytes !== row.record.contentBytes) {
      throw new Error('stored message content size does not match metadata')
    }
    const payload: EncodedTextPayload = {
      encoding: row.record.encoding,
      data: row.record.data,
      uncompressedBytes: row.record.uncompressedBytes,
    }
    return {
      messageId: row.record.msgId,
      messageRef: formatMessageRef(row.project, row.sequence),
      project: row.project,
      sequence: row.sequence,
      from: {
        name: row.record.senderName,
        presenceId: row.record.senderPresenceId,
      },
      target: row.record.target.type === 'agent'
        ? {
          type: 'agent',
          name: row.record.target.name,
          ...(row.record.target.presenceId === undefined
            ? {}
            : { presenceId: row.record.target.presenceId }),
        }
        : { type: 'project' },
      payload,
      attachments: row.record.attachments.map(attachment => ({
        name: attachment.name,
        payload: { ...attachment.payload },
      })),
      createdAt: row.record.createdAt,
      ...(row.record.replyToSequence === undefined
        ? {}
        : { replyTo: formatMessageRef(row.project, row.record.replyToSequence) }),
    }
  }
}
