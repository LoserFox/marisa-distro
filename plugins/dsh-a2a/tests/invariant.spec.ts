/**
 * a2a invariant companion: the presence-changed stream must stay well-formed.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantService from '@deepseek-ai/dsh-invariants'
import * as A2aInvariant from '../src/invariant.ts'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(InvariantService)
  await ctx.plugin(A2aInvariant)
  return ctx
}

function presence(overrides: Partial<{ project: string; agentId: string; name: string; presenceId: string; joined: boolean }> = {}) {
  return {
    project: 'mesh',
    agentId: 'session-a',
    name: 'api',
    presenceId: 'presence-api',
    joined: true,
    ...overrides,
  }
}

describe('a2a invariants', () => {
  it('accepts connect/disconnect lifecycle pairs per presence', async () => {
    const ctx = await setup()
    ctx.emit('a2a/presence-changed', presence())
    ctx.emit('a2a/presence-changed', presence({ joined: false }))
    ctx.emit('a2a/presence-changed', presence({ name: 'web', presenceId: 'presence-web' }))
    ctx.emit('a2a/presence-changed', presence({ name: 'web', presenceId: 'presence-web', joined: false }))
    await ctx.fiber.dispose()
  })

  it('rejects empty identity fields', async () => {
    const ctx = await setup()
    expect(() => {
      ctx.emit('a2a/presence-changed', presence({ project: '' }))
    }).toThrow(/non-empty project, agentId, name, and presenceId/)
    expect(() => {
      ctx.emit('a2a/presence-changed', presence({ name: '' }))
    }).toThrow(/non-empty project, agentId, name, and presenceId/)
    await ctx.fiber.dispose()
  })

  it('rejects repeated connect or disconnect states', async () => {
    const ctx = await setup()
    expect(() => {
      ctx.emit('a2a/presence-changed', presence())
      ctx.emit('a2a/presence-changed', presence())
    }).toThrow(/repeated connect/)
    expect(() => {
      ctx.emit('a2a/presence-changed', presence({ name: 'web', presenceId: 'p' }))
      ctx.emit('a2a/presence-changed', presence({ name: 'web', presenceId: 'p', joined: false }))
      ctx.emit('a2a/presence-changed', presence({ name: 'web', presenceId: 'p', joined: false }))
    }).toThrow(/repeated disconnect/)
    await ctx.fiber.dispose()
  })
})
