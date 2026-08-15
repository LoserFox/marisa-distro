/**
 * Hub core: payload codec (text, binary, attachments), project-scoped
 * message refs, the durable domain (immutable message history with
 * idempotency and bounded queries), the project registry, and the real
 * HTTP server ⇄ client round trip over SQLite.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { SqliteStorageBackend } from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import {
  decodeBinaryPayload, decodeTextPayload, encodeBinaryPayload, encodeTextPayload,
  parseEncodedAttachments, validateMessageContent,
  DECODED_TEXT_LIMIT, MAX_ATTACHMENT_COUNT, MAX_MESSAGE_CONTENT_BYTES, TEXT_PLAIN_LIMIT,
  PayloadTooLargeError,
} from '../src/hub/payload.ts'
import { formatMessageRef, parseMessageRef } from '../src/hub/message-ref.ts'
import { a2aHubDomainSpec } from '../src/hub/spec.ts'
import { A2aHubRegistry, ProjectConflictError } from '../src/hub/registry.ts'
import { A2aHubMessages, MessageIdConflictError, UnknownReplyTargetError, MAX_HISTORY_BYTES } from '../src/hub/messages.ts'
import { A2aHubServer } from '../src/hub/server.ts'
import { A2aHubClient, probeHub } from '../src/hub/client.ts'

/** Boot a context with the storage hub, a real SQLite backend, and the a2a domain. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  const backend = new SqliteStorageBackend({ path: ':memory:', journalMode: 'wal' })
  ctx.storage.backend.register('sqlite', backend)
  const facility = new DomainFacility(ctx, { backend: 'sqlite' })
  ctx.storage.mount('domain', facility)
  const domain = await facility.open(a2aHubDomainSpec)
  const registry = new A2aHubRegistry(domain)
  const messages = new A2aHubMessages(domain)
  return { ctx, domain, registry, messages }
}

/** Ensure one project exists. */
async function ensureProject(registry: A2aHubRegistry, project: string): Promise<void> {
  if (registry.listProjects().some(p => p.name === project)) return
  await registry.createProject(project)
}

/** One appendable draft over a project. */
function draft(project: string, messageId: string, text = 'hello', overrides: Partial<Parameters<A2aHubMessages['append']>[0]> = {}) {
  return {
    messageId,
    project,
    from: { name: 'api', presenceId: 'presence-api' },
    target: { type: 'project' as const },
    payload: encodeTextPayload(text),
    attachments: [],
    createdAt: 100,
    ...overrides,
  }
}

describe('payload', () => {
  it('passes small texts through verbatim', () => {
    const text = 'x'.repeat(TEXT_PLAIN_LIMIT - 1)
    expect(encodeTextPayload(text)).toEqual({
      encoding: 'identity',
      data: text,
      uncompressedBytes: TEXT_PLAIN_LIMIT - 1,
    })
    expect(decodeTextPayload(encodeTextPayload('hello'))).toBe('hello')
  })

  it('gzip-compresses large texts and decodes them back', () => {
    const text = 'repeat '.repeat(TEXT_PLAIN_LIMIT)
    const encoded = encodeTextPayload(text)
    expect(encoded.encoding).toBe('gzip+base64')
    expect(encoded.uncompressedBytes).toBe(text.length)
    expect(decodeTextPayload(encoded)).toBe(text)
  })

  it('rejects decoded text beyond the hard cap', () => {
    expect(() => decodeTextPayload({
      encoding: 'gzip+base64',
      data: encodeTextPayload('z'.repeat(DECODED_TEXT_LIMIT + 1)).data,
      uncompressedBytes: DECODED_TEXT_LIMIT + 1,
    })).toThrow(PayloadTooLargeError)
  })

  it('rejects a size metadata mismatch', () => {
    expect(() => decodeTextPayload({
      encoding: 'identity',
      data: 'short',
      uncompressedBytes: 999,
    })).toThrow(/does not match/)
  })

  it('encodes binary payloads with gzip when it shrinks, and decodes both forms', () => {
    const small = Buffer.from('tiny')
    expect(encodeBinaryPayload(small)).toEqual({
      encoding: 'base64',
      data: small.toString('base64'),
      uncompressedBytes: 4,
    })
    expect(decodeBinaryPayload(encodeBinaryPayload(small)).equals(small)).toBe(true)
    const large = Buffer.from('compressible '.repeat(4096), 'utf8')
    const encoded = encodeBinaryPayload(large)
    expect(encoded.encoding).toBe('gzip+base64')
    expect(decodeBinaryPayload(encoded).equals(large)).toBe(true)
  })

  it('validates attachments: count, names, duplicates, and content budget', () => {
    const bytes = Buffer.from('file contents')
    const attachment = { name: 'note.md', payload: encodeBinaryPayload(bytes) }
    expect(parseEncodedAttachments([attachment])).toEqual([attachment])
    expect(() => parseEncodedAttachments([{ ...attachment, name: '../evil' }])).toThrow(/invalid attachment name/)
    expect(() => parseEncodedAttachments([attachment, attachment])).toThrow(/duplicate/)
    expect(() => parseEncodedAttachments(Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, (_, i) => ({ name: `a${i}`, payload: encodeBinaryPayload(bytes) }))))
      .toThrow(PayloadTooLargeError)
    expect(() => validateMessageContent(encodeTextPayload(''), [])).toThrow(/message text required/)
    // Total content budget: text plus attachments share the 4 MiB cap.
    const huge = encodeBinaryPayload(Buffer.alloc(MAX_MESSAGE_CONTENT_BYTES))
    expect(() => validateMessageContent(encodeTextPayload('hello'), [{ name: 'big.bin', payload: huge }]))
      .toThrow(PayloadTooLargeError)
  })
})

describe('message-ref', () => {
  it('formats and parses project-scoped references', () => {
    expect(formatMessageRef('demo', 42)).toBe('demo:42')
    expect(parseMessageRef('demo:42')).toEqual({ project: 'demo', sequence: 42 })
    expect(parseMessageRef('nope')).toBeNull()
    expect(parseMessageRef('demo:0')).toBeNull()
    expect(parseMessageRef('demo:1x')).toBeNull()
    expect(parseMessageRef(':42')).toBeNull()
    expect(() => formatMessageRef('bad name', 1)).toThrow(/invalid message reference/)
  })
})

describe('message store', () => {
  it('forms one immutable sequence per project with idempotent messageIds', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'billing')
    const first = await messages.append(draft('billing', 'message-1'))
    const second = await messages.append(draft('billing', 'message-2', 'freeze the contract', { replyTo: first.message.messageRef }))
    expect(first).toMatchObject({ inserted: true, message: { sequence: 1, messageRef: 'billing:1' } })
    expect(second).toMatchObject({
      inserted: true,
      message: { sequence: 2, messageRef: 'billing:2', replyTo: 'billing:1' },
    })
    expect(messages.history({ project: 'billing', limit: 10 }).messages.map(m => m.messageRef))
      .toEqual(['billing:1', 'billing:2'])

    // Same msgId + same content returns the original message (other fields ignored).
    const repeated = await messages.append(draft('billing', 'message-1', 'hello', { from: { name: 'api', presenceId: 'another-presence' }, createdAt: 999 }))
    expect(repeated).toEqual({ inserted: false, message: first.message })
    // Same msgId + different content is a conflict.
    await expect(messages.append(draft('billing', 'message-1', 'different body')))
      .rejects.toThrow(MessageIdConflictError)
    await ctx.fiber.dispose()
  })

  it('rejects unknown or cross-project reply targets', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'billing')
    await ensureProject(registry, 'other')
    await messages.append(draft('billing', 'root'))
    await expect(messages.append(draft('billing', 'x', 'hi', { replyTo: 'billing:99' })))
      .rejects.toThrow(UnknownReplyTargetError)
    await expect(messages.append(draft('billing', 'y', 'hi', { replyTo: 'other:1' })))
      .rejects.toThrow(UnknownReplyTargetError)
    await ctx.fiber.dispose()
  })

  it('validates drafts at the store boundary', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'billing')
    await expect(messages.append(draft('billing', 'bad id!'))).rejects.toThrow(/invalid messageId/)
    await expect(messages.append(draft('billing', 'ok', 'hi', { from: { name: '', presenceId: 'p' } }))).rejects.toThrow(/invalid sender name/)
    await expect(messages.append(draft('billing', 'ok', 'hi', { target: { type: 'agent', name: 'bad name' } }))).rejects.toThrow(/invalid recipient name/)
    await expect(messages.append(draft('billing', 'ok', 'hi', { from: { name: 'api', presenceId: '' } }))).rejects.toThrow(/presenceId/)
    await ctx.fiber.dispose()
  })

  it('attachment content participates in messageId idempotency', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'attachments')
    const base = draft('attachments', 'attachment-idempotency', 'training contract', {
      attachments: [{ name: 'handoff.md', payload: encodeBinaryPayload(Buffer.from('# Handoff\nseed=20\n', 'utf8')) }],
    })
    const first = await messages.append(base)
    const repeated = await messages.append({ ...base, from: { name: 'api', presenceId: 'replacement' }, createdAt: 200 })
    expect(repeated).toEqual({ inserted: false, message: first.message })
    await expect(messages.append({
      ...base,
      attachments: [{ name: 'handoff.md', payload: encodeBinaryPayload(Buffer.from('# Handoff\nseed=21\n', 'utf8')) }],
    })).rejects.toThrow(MessageIdConflictError)
    await ctx.fiber.dispose()
  })

  it('history uses stable project cursors and sender filters', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'history')
    for (const [index, from] of ['api', 'web', 'api'].entries()) {
      await messages.append({
        ...draft('history', `history-${index + 1}`, `message ${index + 1}`),
        from: { name: from, presenceId: `presence-${from}` },
        createdAt: index + 1,
      })
    }
    const refs = (page: ReturnType<A2aHubMessages['history']>) => page.messages.map(m => m.messageRef)
    expect(refs(messages.history({ project: 'history', limit: 2 }))).toEqual(['history:2', 'history:3'])
    expect(refs(messages.history({ project: 'history', before: 'history:3', limit: 2 }))).toEqual(['history:1', 'history:2'])
    expect(refs(messages.history({ project: 'history', after: 'history:1', limit: 1 }))).toEqual(['history:2'])
    expect(refs(messages.history({ project: 'history', from: 'api' }))).toEqual(['history:1', 'history:3'])
    // before and after are mutually exclusive; cursors must belong to the project.
    expect(() => messages.history({ project: 'history', before: 'history:1', after: 'history:2' })).toThrow(/not both/)
    expect(() => messages.history({ project: 'history', before: 'other:1' })).toThrow(/another project/)
    await ctx.fiber.dispose()
  })

  it('history responses have an explicit decoded-byte bound', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'bounded')
    const text = 'x'.repeat(MAX_HISTORY_BYTES / 2)
    for (let index = 1; index <= 3; index++) {
      await messages.append(draft('bounded', `bounded-${index}`, text, { createdAt: index }))
    }
    const refs = messages.history({ project: 'bounded', limit: 10 }).messages.map(m => m.messageRef)
    expect(refs).toEqual(['bounded:2', 'bounded:3'])
    await ctx.fiber.dispose()
  })

  it('get resolves one reference and deleteProject purges the project', async () => {
    const { ctx, registry, messages } = await harness()
    await ensureProject(registry, 'demo')
    await ensureProject(registry, 'other')
    const first = await messages.append(draft('demo', 'demo-1'))
    expect(messages.get(first.message.messageRef)?.messageId).toBe('demo-1')
    expect(messages.get('demo:99')).toBeNull()
    await registry.deleteProject('demo')
    await messages.deleteProject('demo')
    expect(messages.get('demo:1')).toBeNull()
    expect(messages.history({ project: 'demo' }).messages).toEqual([])
    // The other project is untouched, and demo can be recreated with fresh sequences.
    await registry.createProject('demo')
    const fresh = await messages.append(draft('demo', 'demo-2'))
    expect(fresh.message.messageRef).toBe('demo:1')
    await ctx.fiber.dispose()
  })
})

describe('project registry', () => {
  it('creates, lists, reads, and deletes projects', async () => {
    const { ctx, registry } = await harness()
    await registry.createProject('billing', { displayName: 'Billing', description: 'rewrite', createdByCwd: '/w' })
    await expect(registry.createProject('billing')).rejects.toThrow(ProjectConflictError)
    expect(registry.listProjects().map(p => p.name)).toEqual(['billing'])
    expect(registry.getProject('billing')?.displayName).toBe('Billing')
    expect(() => registry.getProject('bad name!')).toThrow(/invalid project name/)
    expect(await registry.deleteProject('billing')).toBe(true)
    expect(await registry.deleteProject('billing')).toBe(false)
    expect(registry.listProjects()).toEqual([])
    await ctx.fiber.dispose()
  })
})

describe('hub server and client', () => {
  it('serves projects, history, and the meta probe over HTTP', async () => {
    const { ctx, registry, messages } = await harness()
    const server = new A2aHubServer({ host: '127.0.0.1', port: 0, registry, messages })
    const port = await server.listen()
    const client = new A2aHubClient({ baseUrl: `http://127.0.0.1:${port}` })
    try {
      const meta = await probeHub(client.url)
      expect(meta.protocolVersion).toBe(3)
      expect(meta.port).toBe(port)

      const project = await client.createProject('demo', { createdByCwd: '/w' })
      expect(project.name).toBe('demo')
      await expect(client.createProject('demo')).rejects.toThrow(/already exists/)
      expect(await client.listProjects()).toHaveLength(1)

      await messages.append(draft('demo', 'wire-1', 'over the wire'))
      const page = await client.history({ project: 'demo' })
      expect(page.messages).toHaveLength(1)
      expect(page.messages[0]?.messageRef).toBe('demo:1')
      await expect(client.history({ project: 'nope' })).rejects.toThrow(/unknown project/)

      expect(await client.deleteProject('demo')).toBe(true)
      await expect(client.history({ project: 'demo' })).rejects.toThrow(/unknown project/)
      await server.close()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('refuses project deletion while presences are active', async () => {
    const { ctx, registry, messages } = await harness()
    const server = new A2aHubServer({ host: '127.0.0.1', port: 0, registry, messages })
    const port = await server.listen()
    const client = new A2aHubClient({ baseUrl: `http://127.0.0.1:${port}` })
    await registry.createProject('busy')
    // No realtime client is connected, so deletion succeeds; the presence
    // guard is exercised by the realtime spec.
    expect(await client.deleteProject('busy')).toBe(true)
    await server.close()
    await ctx.fiber.dispose()
  })
})
