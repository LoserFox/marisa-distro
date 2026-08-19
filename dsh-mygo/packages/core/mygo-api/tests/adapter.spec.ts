/**
 * §23.1 adapters: the self-adoption shape delegates to the manager, and the
 * migration bridge runs a raw cordis apply against a host-shaped transparent
 * facade that intercepts registrations and forwards everything else.
 */

import { describe, expect, it, vi } from 'vitest'
import z from '@deepseek-ai/schemastery'
import { createFakeEnv, definePlugin, fromCordisPlugin, PluginError } from '@r05en1cu/dsh-mygo-api'
import type { PluginDefinition } from '@r05en1cu/dsh-mygo-api'

function fixture(id: string): PluginDefinition {
  return {
    id,
    version: '1.0.0',
    kinds: ['fixture'],
    requires: ['svc'],
    provides: ['other'],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({ step: z.number().default(1) }),
    hooks: { activate: () => {} },
  }
}

describe('definePlugin mount surface (P2 merged toCordisPlugin)', () => {
  it('produces a ctx.plugin-consumable module that only self-adopts', async () => {
    const definition = fixture('managed')
    const shape = definePlugin(definition)
    expect(shape.name).toBe('managed')
    expect(shape.inject).toEqual(['pluginManager'])
    expect(shape.Config).toBe(definition.config)
    // 挂载面是非枚举属性：strict zod 校验只见 manifest 字段。
    expect(Object.keys(shape)).toEqual(Object.keys(definition))
    const adopt = vi.fn(async () => {})
    shape.apply({ pluginManager: { adopt } }, { step: 2 })
    // The mount surface hands the definition and the row config to the manager.
    expect(adopt).toHaveBeenCalledWith(definition, { step: 2 })
  })
})

describe('fromCordisPlugin', () => {
  it('mounts a Service-style class plugin via new (token-meter pattern)', () => {
    class RawServicePlugin {
      static inject = ['sessions']
      static Config = z.object({})

      constructor(ctx: unknown) {
        const facade = ctx as {
          provide(key: string, value: unknown): () => void
          on(event: string, listener: (...args: unknown[]) => unknown): () => void
        }
        facade.provide('skillStats', this)
        facade.on('session/event', () => {})
      }
    }
    const env = createFakeEnv(fixture('classy'))
    const bridged = fromCordisPlugin(RawServicePlugin, fixture('classy'))
    void bridged.hooks.activate?.(env)
    expect(env.provided.find(record => record.capability === 'skillStats')?.value)
      .toBeInstanceOf(RawServicePlugin)
    expect(env.listeners.some(record => record.event === 'session/event')).toBe(true)
  })

  it('runs the raw apply against the restricted facade', () => {
    const env = createFakeEnv(fixture('bridged'))
    const calls: string[] = []
    const raw = {
      name: 'raw-plugin',
      inject: ['anything'],
      Config: z.object({ step: z.number().default(7) }),
      apply(ctx: {
        on(event: string, listener: (...args: unknown[]) => unknown): () => void
        get(key: string): unknown
        provide(key: string, value: unknown): () => void
        logger: { info(message: unknown): void }
      }) {
        calls.push('apply')
        ctx.on('agent/created', () => {})
        void ctx.get('svc')
        ctx.provide('other', 1)
        ctx.logger.info('hello')
      },
    }
    const bridged = fromCordisPlugin(raw, fixture('bridged'))
    void bridged.hooks.activate?.(env)
    expect(calls).toEqual(['apply'])
    expect(env.listeners).toHaveLength(1)
    expect(env.provided.find(record => record.capability === 'other')?.value).toBe(1)
    expect(env.logs.some(log => log.args[0] === 'hello')).toBe(true)
  })

  it('accepts direct EventOptions and still registers the listener', () => {
    const env = createFakeEnv(fixture('strict'))
    const raw = {
      name: 'raw',
      apply(ctx: { on(event: string, listener: () => void, options: { prepend: boolean }): void }) {
        ctx.on('agent/created', () => {}, { prepend: true })
      },
    }
    void fromCordisPlugin(raw, fixture('strict')).hooks.activate?.(env)
    expect(env.listeners).toHaveLength(1)
    expect(env.listeners[0]?.event).toBe('agent/created')
  })

  it('accepts both the logger factory shape and the logger object shape', () => {
    const env = createFakeEnv(fixture('logger-shape'))
    const raw = {
      name: 'raw',
      apply(ctx: {
        logger: { info(message: unknown): void; warn(message: unknown): void } & ((name: string) => {
          info(message: unknown): void
        })
      }) {
        ctx.logger('auto-approval').info('factory line')
        ctx.logger.warn('object line')
      },
    }
    void fromCordisPlugin(raw, fixture('logger-shape')).hooks.activate?.(env)
    expect(env.logs).toEqual([
      { level: 'info', args: ['factory line'] },
      { level: 'warn', args: ['object line'] },
    ])
  })

  it('fills the raw config through its schemastery schema with empty input', () => {
    const env = createFakeEnv(fixture('configured'))
    let seen: unknown
    const raw = {
      name: 'raw',
      Config: z.object({ step: z.number().default(3) }),
      apply(_ctx: unknown, config: unknown) {
        seen = config
      },
    }
    void fromCordisPlugin(raw, fixture('configured')).hooks.activate?.(env)
    expect(seen).toEqual({ step: 3 })
  })

  it('maps ctx.tools.register onto the managed tool surface (Proposal A bridge)', () => {
    const env = createFakeEnv(fixture('tool-bridge'))
    const calls: string[] = []
    const raw = {
      name: 'calculator',
      apply(ctx: { tools: { register(tool: unknown): () => void } }) {
        calls.push('apply')
        const disposer = ctx.tools.register({
          name: 'calculator',
          description: 'Safe math',
          parameters: { type: 'object', properties: { expression: { type: 'string' } } },
          output: { schema: { type: 'number' }, render: () => [{ type: 'text', text: '0' }] },
          execute: async (args: { expression: string }) => args.expression.length,
        })
        calls.push(typeof disposer)
      },
    }
    const bridged = fromCordisPlugin(raw, fixture('tool-bridge'))
    void bridged.hooks.activate?.(env)
    expect(calls).toEqual(['apply', 'function'])
    expect(env.tools).toHaveLength(1)
    expect(env.tools[0]).toMatchObject({
      name: 'calculator',
      description: 'Safe math',
      input: { type: 'object', properties: { expression: { type: 'string' } } },
      output: { type: 'number' },
      renderIntent: { card: 'generic' },
    })
    expect(typeof env.tools[0]?.execute).toBe('function')
    const mapped = env.tools.find(tool => tool.name === 'calculator')
    void expect(mapped?.execute({ expression: '1+1' }, { signal: new AbortController().signal })).resolves.toBe(3)
  })

  it('defaults missing parameters and output schema to empty objects in the tools.register bridge', () => {
    const env = createFakeEnv(fixture('tool-minimal'))
    const raw = {
      name: 'minimal',
      apply(ctx: { tools: { register(tool: unknown): () => void } }) {
        ctx.tools.register({ name: 'minimal_tool', description: 'd', execute: async () => 'x' })
      },
    }
    void fromCordisPlugin(raw, fixture('tool-minimal')).hooks.activate?.(env)
    expect(env.tools[0]).toMatchObject({
      name: 'minimal_tool',
      input: {},
      output: {},
      renderIntent: { card: 'generic' },
    })
  })

  it('rejects a malformed ctx.tools.register with manifest-invalid naming the plugin', () => {
    const env = createFakeEnv(fixture('tool-malformed'))
    const raw = {
      name: 'broken',
      apply(ctx: { tools: { register(tool: unknown): () => void } }) {
        ctx.tools.register({ name: 'broken_tool' })
      },
    }
    const bridged = fromCordisPlugin(raw, fixture('tool-malformed'))
    expect(() => { void bridged.hooks.activate?.(env) }).toThrow(PluginError)
    try {
      void bridged.hooks.activate?.(env)
    } catch (error) {
      expect((error as PluginError).code).toBe('manifest-invalid')
      expect((error as PluginError).pluginId).toBe('tool-malformed')
    }
  })

  it('maps ctx.systemPrompt.section onto the managed prompt-section surface (Proposal B)', () => {
    const env = createFakeEnv(fixture('prompt-bridge'))
    const calls: string[] = []
    const raw = {
      name: 'prompt-plugin',
      apply(ctx: { systemPrompt: { section(section: unknown): () => void } }) {
        calls.push('apply')
        const disposer = ctx.systemPrompt.section({ name: 'tool:prompt', order: 114, text: 'guidance' })
        ctx.systemPrompt.section({ name: 'tool:dynamic', order: 115, text: () => 'dynamic' })
        calls.push(typeof disposer)
      },
    }
    void fromCordisPlugin(raw, fixture('prompt-bridge')).hooks.activate?.(env)
    expect(calls).toEqual(['apply', 'function'])
    expect(env.promptSections).toHaveLength(2)
    expect(env.promptSections[0]).toEqual({ name: 'tool:prompt', order: 114, text: 'guidance' })
    expect(env.promptSections[1]?.name).toBe('tool:dynamic')
    expect(env.promptSections[1]?.order).toBe(115)
    expect(typeof env.promptSections[1]?.text).toBe('function')
  })

  it('rejects a malformed ctx.systemPrompt.section with manifest-invalid naming the plugin', () => {
    const env = createFakeEnv(fixture('prompt-malformed'))
    const raw = {
      name: 'broken-prompt',
      apply(ctx: { systemPrompt: { section(section: unknown): () => void } }) {
        ctx.systemPrompt.section({ name: 'x' })
      },
    }
    const bridged = fromCordisPlugin(raw, fixture('prompt-malformed'))
    expect(() => { void bridged.hooks.activate?.(env) }).toThrow(PluginError)
    try {
      void bridged.hooks.activate?.(env)
    } catch (error) {
      expect((error as PluginError).code).toBe('manifest-invalid')
      expect((error as PluginError).pluginId).toBe('prompt-malformed')
    }
  })

  it('forwards ctx.sessionPersistence through env.get (host passthrough)', () => {
    const service = { listSnapshots: async () => [{ id: 's1' }] }
    const env = createFakeEnv({
      ...fixture('session-bridge'),
      requires: ['sessionPersistence'],
    })
    const seeded = createFakeEnv({
      ...fixture('session-bridge'),
      requires: ['sessionPersistence'],
      services: { sessionPersistence: service },
    })
    let seen: unknown = 'unset'
    const raw = {
      name: 'session-plugin',
      apply(ctx: { sessionPersistence: unknown }) {
        seen = ctx.sessionPersistence
      },
    }
    void fromCordisPlugin(raw, fixture('session-bridge')).hooks.activate?.(env)
    expect(seen).toBeUndefined()
    void fromCordisPlugin(raw, { ...fixture('session-bridge'), requires: ['sessionPersistence'] })
      .hooks.activate?.(seeded)
    expect(seen).toBe(service)
  })

  it('resolves raw inject services through ctx property access (facade-service-gap fix)', () => {
    const settings = { get: (key: string) => `v:${key}` }
    const env = createFakeEnv({
      ...fixture('inject-services'),
      requires: ['settings'],
      services: { settings },
    })
    let seen: unknown
    const raw = {
      name: 'settings-plugin',
      inject: ['settings'],
      apply(ctx: { settings: { get(key: string): string } }) {
        seen = ctx.settings.get('theme')
      },
    }
    void fromCordisPlugin(raw, fixture('inject-services')).hooks.activate?.(env)
    expect(seen).toBe('v:theme')
  })

  it('forwards unknown host-service members across every mediated service', () => {
    const registerProvider = vi.fn(() => () => {})
    const context = vi.fn(() => 'ctx')
    const alias = vi.fn(() => 'aliased')
    const schemas = vi.fn(() => [])
    const tapIndex = vi.fn(() => () => {})
    const env = createFakeEnv({
      ...fixture('host-surfaces'),
      requires: ['skills', 'systemPrompt', 'commands', 'tools', 'httpServer'],
      services: {
        skills: { registerProvider },
        systemPrompt: { context },
        commands: { alias },
        tools: { schemas },
        httpServer: { tapIndex },
      },
    })
    const raw = {
      name: 'surface-plugin',
      apply(ctx: {
        skills: { registerProvider(create: unknown): () => void }
        systemPrompt: { context(section: unknown): string }
        commands: { alias(name: string): string }
        tools: { schemas(): unknown[] }
        httpServer: { tapIndex(path: string, fn: unknown): () => void }
      }) {
        ctx.skills.registerProvider({ create: () => {} })
        ctx.systemPrompt.context({})
        ctx.commands.alias('x')
        ctx.tools.schemas()
        ctx.httpServer.tapIndex('/index.html', () => {})
      },
    }
    void fromCordisPlugin(raw, fixture('host-surfaces')).hooks.activate?.(env)
    expect(registerProvider).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledTimes(1)
    expect(alias).toHaveBeenCalledTimes(1)
    expect(schemas).toHaveBeenCalledTimes(1)
    expect(tapIndex).toHaveBeenCalledTimes(1)
  })

  it('falls back to raw host properties and tolerates Cordis inject-guard throws', () => {
    const throwingHost = {
      get baseUrl() {
        return 'https://example.test'
      },
      get settings() {
        throw new Error('cannot get property "settings" without inject')
      },
    }
    const env = createFakeEnv({ ...fixture('host-fallback'), host: throwingHost })
    const seen: unknown[] = []
    const raw = {
      name: 'host-fallback',
      apply(ctx: { baseUrl: string; settings: unknown }) {
        seen.push(ctx.baseUrl)
        seen.push(ctx.settings)
      },
    }
    void fromCordisPlugin(raw, fixture('host-fallback')).hooks.activate?.(env)
    expect(seen).toEqual(['https://example.test', undefined])
  })

  it('records registration-class host method disposers as host effects', () => {
    const registerProvider = vi.fn(() => () => {})
    const context = vi.fn(() => () => {})
    const env = createFakeEnv({
      ...fixture('host-effects'),
      requires: ['skills', 'systemPrompt'],
      services: {
        skills: { registerProvider },
        systemPrompt: { context },
      },
    })
    const raw = {
      name: 'host-effects',
      apply(ctx: {
        skills: { registerProvider(create: unknown): () => void }
        systemPrompt: { context(section: unknown): () => void }
      }) {
        // Plugin discards both disposers; the facade must still record them.
        ctx.skills.registerProvider(() => ({}))
        ctx.systemPrompt.context({ name: 'x', order: 1, text: 'x' })
      },
    }
    void fromCordisPlugin(raw, fixture('host-effects')).hooks.activate?.(env)
    expect(env.hostEffects).toHaveLength(2)
    expect(env.hostEffects[0]?.name).toBe('host-effects:skills.registerProvider')
    expect(env.hostEffects[1]?.name).toBe('host-effects:systemPrompt.context')
  })

  it('does not double-register a host effect passed through ctx.effect', () => {
    const tapIndex = vi.fn(() => () => {})
    const env = createFakeEnv({
      ...fixture('host-effect-effect'),
      requires: ['httpServer'],
      services: { httpServer: { tapIndex } },
    })
    const raw = {
      name: 'host-effect-effect',
      apply(ctx: {
        effect(callback: () => unknown, name?: string): void
        httpServer: { tapIndex(transform: unknown): () => void }
      }) {
        ctx.effect(() => ctx.httpServer.tapIndex((html: string) => html), 'index')
      },
    }
    void fromCordisPlugin(raw, fixture('host-effect-effect')).hooks.activate?.(env)
    expect(env.hostEffects).toHaveLength(1)
    // Only the facade's own timer-cleanup effect may be present — the host
    // disposer must NOT be re-registered through the ordinary effect path.
    expect(env.effects.map(record => record.name)).toEqual(['host-effect-effect:timers'])
  })

  it('does not record query-class host methods as host effects', () => {
    const schemas = vi.fn(() => [])
    const env = createFakeEnv({
      ...fixture('host-query'),
      requires: ['tools'],
      services: { tools: { schemas } },
    })
    const raw = {
      name: 'host-query',
      apply(ctx: { tools: { schemas(): unknown[] } }) {
        ctx.tools.schemas()
      },
    }
    void fromCordisPlugin(raw, fixture('host-query')).hooks.activate?.(env)
    expect(env.hostEffects).toHaveLength(0)
    expect(schemas).toHaveBeenCalledTimes(1)
  })
})
