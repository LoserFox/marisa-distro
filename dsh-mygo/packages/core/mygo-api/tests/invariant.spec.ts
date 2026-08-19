import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantService from '@deepseek-ai/dsh-invariants'
import * as PluginApiInvariant from '@r05en1cu/dsh-mygo-api/invariant'

describe('dsh-mygo-api invariant companion', () => {
  it('registers package ownership and disposes cleanly', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantService)
    const fiber = await ctx.plugin(PluginApiInvariant)
    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
