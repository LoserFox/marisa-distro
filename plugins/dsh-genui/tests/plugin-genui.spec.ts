import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as GenUI from '../src/plugin/index.ts'

/** Boot the plugin and return the assembled system-prompt sections. */
async function assemble() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(GenUI)
  return ctx.systemPrompt.assemble({})
}

describe('genui:fence section', () => {
  it('registers the dsh-ui fence language section', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    expect(names).toContain('genui:fence')
  })

  it('teaches the fence syntax and the component vocabulary', async () => {
    const assembly = await assemble()
    const section = assembly.sections.find(s => s.name === 'genui:fence')
    expect(section).toBeDefined()
    const text = typeof section!.text === 'string' ? section!.text : ''
    expect(text).toContain('dsh-ui')
    // The model must know the white-listed component types.
    for (const type of ['text', 'card', 'grid', 'stat', 'table', 'chart', 'tabs', 'button', 'progress', 'plot', 'callout', 'steps', 'diff', 'mermaid', 'scene3d']) {
      expect(text).toContain(type)
    }
  })

  it('sorts the section among the tool-guidance sections', async () => {
    const assembly = await assemble()
    const names = assembly.sections.map(s => s.name)
    // The section lands among the tool-guidance band, not at the harness identity head.
    const index = names.indexOf('genui:fence')
    expect(index).toBeGreaterThan(0)
  })

  it('registers the render_ui tool when the tools service exists', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    const registered: unknown[] = []
    ctx.provide('tools', { register: (tool: unknown) => { registered.push(tool) } })
    await ctx.plugin(GenUI)
    expect(registered).toHaveLength(2)
    const names = registered.map(t => (t as { name: string }).name).sort()
    expect(names).toEqual(['render_ui', 'validate_dsh_ui'])
  })

  it('registers render_ui when tools binds AFTER the plugin (start-up ordering)', async () => {
    // Regression: this plugin injects only systemPrompt, so cordis starts it
    // before the tools provider (which injects deeper dependencies) on real
    // hosts. A one-shot probe at apply time silently missed the registry —
    // the fence section landed, the tool never registered. The plugin must
    // subscribe to the service-binding event and register when tools appears.
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(GenUI) // plugin first — tools not yet provided
    const registered: unknown[] = []
    ctx.provide('tools', { register: (tool: unknown) => { registered.push(tool) } })
    expect(registered).toHaveLength(2)
    const names = registered.map(t => (t as { name: string }).name).sort()
    expect(names).toEqual(['render_ui', 'validate_dsh_ui'])
  })

  it('keeps the fence channel without a tools service', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(GenUI)
    const assembly = await ctx.systemPrompt.assemble({})
    expect(assembly.sections.map(s => s.name)).toContain('genui:fence')
  })

  it('registers the asset route when webServer binds after the plugin', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(GenUI)
    const routes: unknown[] = []
    ctx.provide('webServer', { register: (route: unknown) => { routes.push(route) } })
    expect(routes).toEqual([expect.objectContaining({
      kind: 'prefix',
      path: '/plugins/@deepseek-ai/dsh-genui/assets',
    })])
  })
})
