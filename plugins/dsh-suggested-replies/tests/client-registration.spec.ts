/** Tests that the browser bundle uses the official slot above the composer. */
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { SuggestedRepliesSection } from '../src/client/SuggestedRepliesSection.tsx'
import { SuggestionBubbles } from '../src/client/SuggestionBubbles.tsx'

describe('client registration', () => {
  it('declares the runtime services needed by both Web surfaces', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers candidates only in conversation.input.dock at order 15', () => {
    const registrations: Array<{ definition: Record<string, unknown>; component: unknown }> = []
    const injectSlot = vi.fn((_name: string, callback: () => void) => callback())
    const rpc = { call: vi.fn() }
    const register = vi.fn((definition: Record<string, unknown>, component: unknown) => {
      registrations.push({ definition, component })
      return () => undefined
    })
    const ctx = {
      effect: (setup: () => unknown) => setup(),
      locale: { register: vi.fn(() => () => undefined), bind: () => () => '' },
      connection: { rpc },
      slots: { inject: injectSlot, register },
    }
    apply(ctx as never)

    expect(injectSlot).toHaveBeenCalledWith('conversation.input.dock', expect.any(Function))
    expect(injectSlot).not.toHaveBeenCalledWith('conversation.composer.dock', expect.any(Function))
    expect(registrations).toContainEqual({
      definition: expect.objectContaining({ name: 'conversation.input.dock', id: 'suggested-replies', order: 15 }),
      component: SuggestionBubbles,
    })
    const dock = registrations.find(entry => entry.component === SuggestionBubbles)
    expect(dock?.definition.inject).toBeTypeOf('function')
    expect((dock?.definition.inject as () => unknown)()).toEqual({ rpc })
    expect(registrations).toContainEqual({
      definition: expect.objectContaining({ name: 'settings.section', id: 'suggested-replies', order: 70 }),
      component: SuggestedRepliesSection,
    })
  })
})
