import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantService from '@deepseek-ai/dsh-invariants'
import * as PluginManagerInvariant from '@r05en1cu/dsh-mygo/invariant'

describe('dsh-mygo invariant companion', () => {
  it('registers package ownership and disposes cleanly', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantService)
    const fiber = await ctx.plugin(PluginManagerInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
