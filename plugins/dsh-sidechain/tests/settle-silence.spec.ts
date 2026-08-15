/**
 * Unit tests for settlement-notice silencing: side children's `subagent-settled`
 * notices are stopped before they enter the parent inbox, everything else passes.
 */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import { createSettlementSilence } from '../src/settle-silence'

const SIDE = '11111111-1111-4111-8111-111111111111' as SessionId
const OTHER = '22222222-2222-4222-8222-222222222222' as SessionId

function notice(sender: string, kind: 'subagent-report' | 'subagent-settled' = 'subagent-settled'): UserMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text: 'Background subagent finished.' }],
    source: { kind, form: 'notice', senderSessionId: sender },
  } as unknown as UserMessage
}

function userMessage(text: string): UserMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  } as unknown as UserMessage
}

function fakeAgent(): Agent & { delivered: { method: string; message: UserMessage }[] } {
  const delivered: { method: string; message: UserMessage }[] = []
  return {
    delivered,
    followup(message: UserMessage) { delivered.push({ method: 'followup', message }) },
    steer(message: UserMessage) { delivered.push({ method: 'steer', message }) },
    inject(message: UserMessage) { delivered.push({ method: 'inject', message }) },
  } as unknown as Agent & { delivered: { method: string; message: UserMessage }[] }
}

function setup(liveAgents: Agent[] = []) {
  const created = { handler: undefined as ((payload: { agent: Agent }) => void) | undefined }
  const dispose = vi.fn()
  const ctx = {
    agents: { list: () => liveAgents },
    on: (name: string, handler: unknown) => {
      if (name === 'agent/created') created.handler = handler as (payload: { agent: Agent }) => void
      return dispose
    },
  }
  return { silence: createSettlementSilence(ctx as never), created, dispose }
}

beforeEach(() => {
  vi.stubEnv('DSH_HOME', mkdtempSync(join(tmpdir(), 'dsh-sidechain-silence-')))
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createSettlementSilence', () => {
  it.each(['followup', 'steer', 'inject'] as const)(
    'drops a recorded side child before parent.%s writes it to the inbox',
    (method) => {
      const { silence } = setup()
      const parent = fakeAgent()
      silence.noteChild(parent, SIDE)
      parent[method](notice(SIDE))
      expect(parent.delivered).toEqual([])
    },
  )

  it('also drops an explicit report from a recorded side child', () => {
    const { silence } = setup()
    const parent = fakeAgent()
    silence.noteChild(parent, SIDE)
    parent.followup(notice(SIDE, 'subagent-report'))
    expect(parent.delivered).toEqual([])
  })

  it('passes ordinary user messages and unrelated child settlements', () => {
    const { silence } = setup()
    const parent = fakeAgent()
    silence.noteChild(parent, SIDE)
    parent.followup(userMessage('继续干活'))
    parent.steer(notice(OTHER))
    expect(parent.delivered).toEqual([
      { method: 'followup', message: userMessage('继续干活') },
      { method: 'steer', message: notice(OTHER) },
    ])
  })

  it('patches future parent agents so persisted child ids stay silent after restart', () => {
    const first = setup()
    const original = fakeAgent()
    first.silence.noteChild(original, SIDE)
    first.silence.dispose()

    const restarted = setup()
    const resumedParent = fakeAgent()
    restarted.created.handler?.({ agent: resumedParent })
    resumedParent.followup(notice(SIDE))
    expect(resumedParent.delivered).toEqual([])
  })

  it('patches parents that are already live when the plugin loads', () => {
    const first = setup()
    first.silence.noteChild(fakeAgent(), SIDE)
    first.silence.dispose()

    const liveParent = fakeAgent()
    setup([liveParent])
    liveParent.followup(notice(SIDE))
    expect(liveParent.delivered).toEqual([])
  })

  it('restores patched delivery methods and removes the created listener on dispose', () => {
    const { silence, dispose } = setup()
    const parent = fakeAgent()
    silence.noteChild(parent, SIDE)
    silence.dispose()
    parent.followup(notice(SIDE))
    expect(parent.delivered).toEqual([{ method: 'followup', message: notice(SIDE) }])
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('durable child-id registry', () => {
  it('persists recorded ids under DSH_HOME and reloads them', async () => {
    const home = process.env.DSH_HOME!
    const first = setup()
    first.silence.noteChild(fakeAgent(), SIDE)
    const path = join(home, 'sidechain-children.json')
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toContain(SIDE)
    const restarted = setup()
    const resumedParent = fakeAgent()
    restarted.created.handler?.({ agent: resumedParent })
    resumedParent.followup(notice(SIDE))
    expect(resumedParent.delivered).toEqual([])
  })
})
