/** Tests for route selection, internal Agent composition, and result parsing. */
import { describe, expect, it, vi } from 'vitest'
import type { Agent, CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  extractSuggestionText,
  generateSuggestedReplies,
  prepareSuggestionRequest,
  resolveConfiguredSuggestionRoute,
  resolveSuggestionRoute,
  type PreparedSuggestionRequest,
} from '../src/suggestion-llm.ts'

/** Build a minimal parent Agent face for pure request preparation. */
function parentAgent(options: {
  readonly logged?: { provider: string; model: string }
  readonly fallback?: { provider?: string; model?: string }
  readonly messages?: Message[]
  readonly cwd?: string
} = {}): Agent {
  return {
    id: 'session-parent' as Agent['id'],
    options: options.fallback ?? {},
    session: {
      header: {
        version: 0,
        id: 'session-parent',
        createdAt: 1,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      },
      requestHeader: () => options.logged === undefined ? undefined : { config: options.logged },
      deriveMessages: () => options.messages ?? [],
      events: (options.messages ?? []).flatMap((candidate, index) => candidate.role === 'assistant'
        ? [{
            type: 'assistant/message',
            seq: index,
            time: 0,
            surfaceOp: 'append',
            data: { turn: 1, step: 1, message: candidate },
          }]
        : []),
    },
  } as unknown as Agent
}

/** Create one text-only conversation message. */
function textMessage(role: 'user' | 'assistant', text: string): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role,
    content: [{ type: 'text', text }],
    source: role === 'assistant'
      ? { kind: 'model', provider: 'logged-provider', model: 'logged-model' }
      : { kind: 'user' },
  }
}

/** Create one injected context message that must not consume conversation slots. */
function contextMessage(text: string): Message {
  return {
    id: crypto.randomUUID() as Message['id'],
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'test-context', form: 'snapshot', sections: [] },
  }
}

function request(): PreparedSuggestionRequest {
  return {
    route: { provider: 'deepseek', model: 'chat' },
    system: 'Return JSON only.',
    prompt: 'Recent conversation',
    maxTokens: 128,
  }
}

/** Construct the official-event-only internal Agent used by generation tests. */
function generationHarness(output: string, options: { flush?: boolean; archiveFailure?: Error } = {}) {
  const events: SessionEvent[] = []
  const followup = vi.fn((message: Message) => {
    events.push(
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } } as SessionEvent,
      { type: 'user/message', seq: 1, time: 2, surfaceOp: 'append', data: message } as SessionEvent,
      {
        type: 'assistant/message',
        seq: 2,
        time: 3,
        surfaceOp: 'append',
        data: { turn: 1, step: 1, message: textMessage('assistant', output) },
      } as SessionEvent,
      { type: 'turn/end', seq: 3, time: 4, data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent,
    )
  })
  const internalAgent = {
    id: 'session-internal',
    options: { provider: 'deepseek', model: 'chat' },
    session: {
      id: 'session-internal',
      header: { version: 0, id: 'session-internal', createdAt: 2, cwd: '/work' },
      get seq() { return events.length },
      events,
    },
    whenIdle: vi.fn(async () => undefined),
    followup,
    cancel: vi.fn(),
  } as unknown as Agent
  const dispose = vi.fn(async () => undefined)
  const create = vi.fn(async (createOptions: CreateAgentOptions) => {
    const presentAs = vi.fn()
    const restrict = vi.fn()
    const section = vi.fn()
    await createOptions.setup?.({
      tools: { presentAs, restrict },
      systemPrompt: { section },
    } as never)
    return { agent: internalAgent, dispose, composition: { presentAs, restrict, section } }
  })
  const archiveSession = options.archiveFailure === undefined
    ? vi.fn(async () => undefined)
    : vi.fn(async () => { throw options.archiveFailure })
  const ctx = {
    agents: {
      withoutInitiator: <T>(operation: () => T): T => operation(),
      create,
    },
    sessions: { flush: vi.fn(async () => options.flush ?? true) },
    workspaceRegistry: { archiveSession },
  }
  return { ctx, create, internalAgent, followup, dispose, archiveSession }
}

describe('resolveSuggestionRoute', () => {
  it('prefers the latest logged request route', () => {
    expect(resolveSuggestionRoute(parentAgent({
      logged: { provider: 'logged', model: 'actual' },
      fallback: { provider: 'default', model: 'fallback' },
    }))).toEqual({ provider: 'logged', model: 'actual' })
  })

  it('falls back to Agent options and rejects incomplete routes', () => {
    expect(resolveSuggestionRoute(parentAgent({ fallback: { provider: 'p', model: 'm' } })))
      .toEqual({ provider: 'p', model: 'm' })
    expect(resolveSuggestionRoute(parentAgent({ fallback: { provider: 'p' } }))).toBeNull()
  })
})

describe('resolveConfiguredSuggestionRoute', () => {
  it('keeps inheritance when both override fields are omitted', () => {
    expect(resolveConfiguredSuggestionRoute(undefined, undefined)).toBeUndefined()
  })

  it('accepts only a complete non-empty override pair', () => {
    expect(resolveConfiguredSuggestionRoute('deepseek-official', 'deepseek-v4-flash')).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    expect(() => resolveConfiguredSuggestionRoute('deepseek-official', undefined)).toThrow(/must be set together/)
    expect(() => resolveConfiguredSuggestionRoute(undefined, 'deepseek-v4-flash')).toThrow(/must be set together/)
    expect(() => resolveConfiguredSuggestionRoute('', 'deepseek-v4-flash')).toThrow(/must be set together/)
  })
})

describe('prepareSuggestionRequest', () => {
  const config = { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 384 }

  it('prepares the exact route, persona, prompt, and token cap for the internal Agent', () => {
    const subject = parentAgent({
      logged: { provider: 'logged', model: 'actual' },
      messages: [
        textMessage('user', '请实现'),
        contextMessage('very large injected instructions'),
        textMessage('assistant', '已经实现完成'),
      ],
    })
    const prepared = prepareSuggestionRequest(subject, config, 1, new AbortController().signal)
    expect(prepared).toMatchObject({
      route: { provider: 'logged', model: 'actual' },
      maxTokens: 384,
    })
    expect(prepared?.system).toContain('JSON')
    expect(prepared?.prompt).toContain('请实现')
    expect(prepared?.prompt).toContain('已经实现完成')
    expect(prepared?.prompt).not.toContain('very large injected instructions')
  })

  it('prefers an explicit route and returns null without route, completed-turn text, or a live lease', () => {
    const subject = parentAgent({
      logged: { provider: 'logged', model: 'actual' },
      messages: [textMessage('user', '请实现'), textMessage('assistant', '已经实现完成')],
    })
    expect(prepareSuggestionRequest(subject, {
      ...config,
      suggestionRoute: { provider: 'cheap-provider', model: 'cheap-model' },
    }, 1, new AbortController().signal)?.route).toEqual({ provider: 'cheap-provider', model: 'cheap-model' })

    expect(prepareSuggestionRequest(parentAgent(), config, 1, new AbortController().signal)).toBeNull()
    expect(prepareSuggestionRequest(parentAgent({
      fallback: { provider: 'p', model: 'm' },
      messages: [textMessage('assistant', 'answer')],
    }), config, 2, new AbortController().signal)).toBeNull()
    const aborted = new AbortController()
    aborted.abort()
    expect(prepareSuggestionRequest(subject, config, 1, aborted.signal)).toBeNull()
  })
})

describe('extractSuggestionText', () => {
  it('returns the last non-empty assistant text in the owned interval', () => {
    const events = [
      { type: 'assistant/message', seq: 0, time: 0, data: { turn: 0, step: 0, message: textMessage('assistant', 'old') } },
      { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
      { type: 'assistant/message', seq: 2, time: 2, data: { turn: 1, step: 1, message: textMessage('assistant', 'new') } },
    ] as SessionEvent[]
    expect(extractSuggestionText(events, 1)).toBe('new')
  })
})

describe('generateSuggestedReplies', () => {
  const config = { suggestionCount: 3, contextMessageCount: 4, maxSuggestionChars: 120, maxTokens: 128 }

  it('uses an official zero-tool Agent, flushes it, archives it, and parses its final message', async () => {
    const harness = generationHarness('{"suggestions":["继续实现","运行测试","查看差异"]}')
    await expect(generateSuggestedReplies(
      harness.ctx as never,
      parentAgent({ cwd: '/work' }),
      'session-internal' as never,
      request(),
      config,
      new AbortController().signal,
    )).resolves.toEqual(['继续实现', '运行测试', '查看差异'])

    const options = harness.create.mock.calls[0]?.[0]
    expect(options).toMatchObject({
      sessionId: 'session-internal',
      meta: { cwd: '/work' },
      agentOptions: { provider: 'deepseek', model: 'chat', maxTokens: 128 },
    })
    expect(options?.meta).not.toHaveProperty('parentSession')
    const composition = (await harness.create.mock.results[0]?.value)?.composition
    expect(composition?.presentAs).toHaveBeenCalledWith('native')
    expect(composition?.restrict).toHaveBeenCalledWith({ allow: [] })
    expect(composition?.section).toHaveBeenCalledWith(expect.objectContaining({
      name: 'deployment:persona',
      order: 0,
      complete: true,
    }))
    expect(harness.followup).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: 'plugin', plugin: 'dsh-suggested-replies' },
      content: [{ type: 'text', text: 'Recent conversation' }],
    }))
    expect(harness.ctx.sessions.flush).toHaveBeenCalledWith(harness.internalAgent.session)
    expect(harness.archiveSession).toHaveBeenCalledWith('session-internal')
    expect(harness.dispose).toHaveBeenCalledOnce()
  })

  it('falls back to three usable replies for malformed model output and still flushes the internal Session', async () => {
    const harness = generationHarness('not json')
    await expect(generateSuggestedReplies(
      harness.ctx as never,
      parentAgent(),
      'session-internal' as never,
      request(),
      config,
      new AbortController().signal,
    )).resolves.toEqual(['Continue', 'Could you explain that in more detail?', 'Can you give me a concrete example?'])
    expect(harness.ctx.sessions.flush).toHaveBeenCalledOnce()
    expect(harness.dispose).toHaveBeenCalledOnce()
  })

  it('fails when no durability listener flushes the internal Session', async () => {
    const harness = generationHarness('{"suggestions":["a","b","c"]}', { flush: false })
    await expect(generateSuggestedReplies(
      harness.ctx as never,
      parentAgent(),
      'session-internal' as never,
      request(),
      config,
      new AbortController().signal,
    )).rejects.toThrow(/no durability listener/)
    expect(harness.dispose).toHaveBeenCalledOnce()
  })

  it('fails before model work when the internal Session cannot be hidden from navigation', async () => {
    const harness = generationHarness('{"suggestions":["a","b","c"]}', { archiveFailure: new Error('busy') })
    await expect(generateSuggestedReplies(
      harness.ctx as never,
      parentAgent(),
      'session-internal' as never,
      request(),
      config,
      new AbortController().signal,
    )).rejects.toThrow(/could not archive internal Session/)
    expect(harness.followup).not.toHaveBeenCalled()
    expect(harness.ctx.sessions.flush).toHaveBeenCalledOnce()
    expect(harness.dispose).toHaveBeenCalledOnce()
  })
})
