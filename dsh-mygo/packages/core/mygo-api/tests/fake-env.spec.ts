/**
 * Fake-env roundtrip: a fixture plugin authored only against
 * `@r05en1cu/dsh-mygo-api` (no Cordis import) is unit-testable with
 * `createFakeEnv`. The fixture also proves the empty `PluginEvents` base
 * interface accepts declaration-merging event contributions from any owner.
 */

import z from '@deepseek-ai/schemastery'
import { describe, expect, it } from 'vitest'
import {
  PluginError,
  createFakeEnv,
  definePlugin,
  type PluginToolDefinition,
} from '@r05en1cu/dsh-mygo-api'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

declare module '@r05en1cu/dsh-mygo-api' {
  interface PluginEvents {
    /** Fixture event contributed by this test to the managed event map. */
    'fixture/echo'(event: { readonly text: string }): void
    /** Second fixture event so a trigger can miss every registered listener. */
    'fixture/other'(event: { readonly text: string }): void
  }
}

const fixtureTool: PluginToolDefinition = {
  name: 'fixture_tool',
  description: 'Fixture tool for fake-env roundtrips',
  input: { type: 'object' },
  output: { type: 'object' },
  execute: async (args, exec) => {
    expect(exec.signal).toBeInstanceOf(AbortSignal)
    return { ok: true, args }
  },
  renderIntent: { card: 'generic' },
}

describe('definePlugin', () => {
  it('carries the manifest verbatim and adds a non-enumerable mount surface', () => {
    const definition = {
      id: 'fixture-plugin',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: ['fixture-service'],
      provides: ['fixture-counter'],
      permissions: {
        observe: ['fixture/echo'],
        transform: [],
        intercept: [],
        position: 'derived',
        claims: [],
      },
      stateful: false,
      swapPolicy: 'immediate',
      config: z.object({}),
      hooks: {
        activate: () => {},
      },
    } satisfies Parameters<typeof definePlugin>[0]
    const plugin = definePlugin(definition)
    expect(plugin).toMatchObject(definition)
    expect(Object.keys(plugin)).toEqual(Object.keys(definition))
    expect(typeof plugin.apply).toBe('function')
    expect(plugin.inject).toEqual(['pluginManager'])
  })
})

describe('fake env', () => {
  it('resolves host services regardless of the requires declaration (host passthrough)', () => {
    const env = createFakeEnv({
      requires: ['fixture-service'],
      services: { 'fixture-service': { ready: true }, 'undeclared-service': { secret: true } },
    })
    expect(env.get('fixture-service')).toEqual({ ready: true })
    expect(env.get('undeclared-service')).toEqual({ secret: true })
    expect(env.get('anything-else')).toBeUndefined()
  })

  it('throws setup-registration when registering during the setup phase', () => {
    const env = createFakeEnv()
    env.phase = 'setup'
    for (const [method, register] of [
      ['on', () => env.on('fixture/echo', () => {})],
      ['registerTool', () => env.registerTool(fixtureTool)],
      ['registerPromptSection', () => env.registerPromptSection({ name: 'fixture:section', order: 1, text: 'x' })],
      ['provide', () => env.provide('fixture-counter', { count: 0 })],
    ] as const) {
      let caught: unknown
      try {
        register()
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(PluginError)
      expect((caught as PluginError).code).toBe('setup-registration')
      expect((caught as PluginError).details).toEqual({ method })
      expect((caught as PluginError).message).toContain(method)
    }
    env.phase = 'activate'
    expect(() => env.on('fixture/echo', () => {})).not.toThrow()
  })

  it('roundtrips a fixture plugin through setup, activate, trigger, and disposal', async () => {
    const received: string[] = []
    const plugin = definePlugin({
      id: 'fixture-plugin',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: ['fixture-service'],
      provides: ['fixture-counter'],
      permissions: {
        observe: ['fixture/echo'],
        transform: [],
        intercept: [],
        position: 'derived',
        claims: [],
      },
      stateful: false,
      swapPolicy: 'immediate',
      config: z.object({}),
      hooks: {
        async activate(env) {
          env.on('fixture/echo', ({ text }) => {
            received.push(text)
          })
          env.registerTool(fixtureTool)
          env.provide('fixture-counter', { count: 0 })
        },
      },
    })

    const env = createFakeEnv({
      requires: ['fixture-service'],
      services: { 'fixture-service': { ready: true } },
      plugins: [
        {
          id: 'existing',
          version: '1.0.0',
          generation: 1,
          origin: 'static',
          status: 'enabled',
          kinds: [],
          requires: [],
          provides: [],
          orderNeutral: true,
          source: { type: 'static' },
        },
      ],
    })

    expect(env.plugins().map(handle => handle.id)).toEqual(['existing'])
    expect(env.phase).toBe('activate')

    const activation = plugin.hooks.activate(env)
    if (activation !== undefined) await activation

    expect(env.listeners).toHaveLength(1)
    expect(env.listeners[0]?.event).toBe('fixture/echo')
    expect(env.tools).toEqual([fixtureTool])
    expect(env.provided).toEqual([{ capability: 'fixture-counter', value: { count: 0 }, active: true }])

    await env.trigger('fixture/echo', { text: 'hello' })
    expect(received).toEqual(['hello'])

    const listenerDisposer = env.on('fixture/echo', () => {})
    expect(env.listeners).toHaveLength(2)
    listenerDisposer()
    expect(env.listeners).toHaveLength(1)

    const toolDisposer = env.registerTool(fixtureTool)
    expect(env.tools).toHaveLength(2)
    toolDisposer()
    expect(env.tools).toHaveLength(1)

    const sectionDisposer = env.registerPromptSection({ name: 'fixture:section', order: 1, text: 'x' })
    expect(env.promptSections).toHaveLength(1)
    sectionDisposer()
    expect(env.promptSections).toHaveLength(0)
    sectionDisposer()
    expect(env.promptSections).toHaveLength(0)

    const provideDisposer = env.provide('fixture-counter', { count: 1 })
    expect(env.provided.at(-1)?.active).toBe(true)
    provideDisposer()
    expect(env.provided.at(-1)?.active).toBe(false)

    await env.updateConfig({ step: 2 })
    expect(env.updateConfigCalls).toEqual([{ step: 2 }])
  })

  it('derives agent-scoped envs with independent records', async () => {
    const parent = createFakeEnv()
    const parentReceived: string[] = []
    const childReceived: string[] = []
    parent.on('fixture/echo', ({ text }) => {
      parentReceived.push(text)
    })
    const child = parent.scope('agent-1' as SessionId)
    expect(child).not.toBe(parent)
    expect(child.scopedTo).toBe('agent-1')
    expect(parent.scopeCalls).toEqual(['agent-1'])
    child.on('fixture/echo', ({ text }) => {
      childReceived.push(text)
    })
    await parent.trigger('fixture/echo', { text: 'parent' })
    await child.trigger('fixture/echo', { text: 'child' })
    expect(parentReceived).toEqual(['parent'])
    expect(childReceived).toEqual(['child'])
    expect(parent.listeners).toHaveLength(1)
    expect(child.listeners).toHaveLength(1)
  })

  it('records fs, fetch, and logger calls and exposes seeded views', async () => {
    const files = new Map([['/seed.txt', new TextEncoder().encode('seed')]])
    const response = new Response('ok')
    const env = createFakeEnv({ files, fetchResponse: response })

    expect(new TextDecoder().decode(await env.fs.read('/seed.txt'))).toBe('seed')
    expect(new TextDecoder().decode(await env.fs.read('/missing.txt'))).toBe('')
    await env.fs.write('/out.txt', 'written')
    expect(env.fsReads).toEqual(['/seed.txt', '/missing.txt'])
    expect(env.fsWrites).toHaveLength(1)
    expect(env.fsWrites[0]?.path).toBe('/out.txt')
    expect(new TextDecoder().decode(env.fsWrites[0]?.data ?? new Uint8Array())).toBe('written')
    expect(new TextDecoder().decode(await env.fs.read('/out.txt'))).toBe('written')
    await env.fs.append('/out.txt', '!')
    expect(env.fsAppends).toEqual([{ path: '/out.txt', data: new TextEncoder().encode('!') }])
    expect(new TextDecoder().decode(await env.fs.read('/out.txt'))).toBe('written!')
    await expect(env.fs.readdir('/')).resolves.toEqual([
      { name: 'seed.txt', kind: 'file' },
      { name: 'out.txt', kind: 'file' },
    ])
    await expect(env.fs.stat('/seed.txt')).resolves.toEqual({ kind: 'file', size: 4, mtimeMs: 0 })
    await expect(env.fs.stat('/missing.txt')).rejects.toThrow(/ENOENT/)
    expect(env.fsReaddirs).toEqual(['/'])
    expect(env.fsStats).toEqual(['/seed.txt', '/missing.txt'])

    const varsEnv = createFakeEnv({ vars: { FOO: 'bar' } })
    expect(varsEnv.vars.get('FOO')).toBe('bar')
    varsEnv.vars.set('FOO', 'baz')
    expect(varsEnv.vars.get('FOO')).toBe('baz')
    expect(varsEnv.vars.get('SECRET')).toBeUndefined()
    varsEnv.vars.set('SECRET', 'x')
    expect(varsEnv.vars.get('SECRET')).toBe('x')
    expect(varsEnv.varsGets).toEqual(['FOO', 'FOO', 'SECRET', 'SECRET'])
    expect(varsEnv.varsSets).toEqual([{ name: 'FOO', value: 'baz' }, { name: 'SECRET', value: 'x' }])

    const llmEnv = createFakeEnv({
      llmHandler: async request => ({ content: `echo:${request.model}`, model: request.model }),
    })
    await expect(llmEnv.llm.complete({
      model: 'probe-model',
      messages: [{ role: 'user', content: 'hi' }],
    })).resolves.toEqual({ content: 'echo:probe-model', model: 'probe-model' })
    await expect(llmEnv.llm.complete({ model: 'other', messages: [] }))
      .resolves.toEqual({ content: 'echo:other', model: 'other' })
    expect(llmEnv.llmCalls.map(call => call.model)).toEqual(['probe-model', 'other'])

    const execEnv = createFakeEnv({
      execHandler: async request => ({ stdout: `out:${request.command}`, stderr: '', code: 0 }),
    })
    await expect(execEnv.exec.run({ command: 'probe-cli', args: ['a'] }))
      .resolves.toEqual({ stdout: 'out:probe-cli', stderr: '', code: 0 })
    await expect(execEnv.exec.run({ command: 'other-cli' }))
      .resolves.toEqual({ stdout: 'out:other-cli', stderr: '', code: 0 })
    expect(execEnv.execCalls.map(call => call.command)).toEqual(['probe-cli', 'other-cli'])

    await execEnv.exec.run({ command: 'probe-cli', stdin: 'echo hello' })
    expect(execEnv.execCalls[2]).toMatchObject({ command: 'probe-cli', stdin: 'echo hello' })

    const bytesEnv = createFakeEnv({
      execHandler: async () => ({
        stdout: 'utf8',
        stderr: '',
        code: 0,
        stdoutBytes: new TextEncoder().encode('utf8'),
        stderrBytes: new Uint8Array(),
      }),
    })
    await expect(bytesEnv.exec.run({ command: 'raw-cli' })).resolves.toMatchObject({
      stdout: 'utf8',
      stdoutBytes: new TextEncoder().encode('utf8'),
    })

    const httpEnv = createFakeEnv()
    const disposer = httpEnv.http.register({
      method: 'POST',
      path: '/probe',
      handler: async () => ({ status: 200, body: { ok: true } }),
    })
    expect(httpEnv.httpRegistrations).toHaveLength(1)
    const adminDisposer = httpEnv.http.register({ method: 'GET', path: '/admin', handler: async () => ({ status: 200 }) })
    expect(httpEnv.httpRegistrations).toHaveLength(2)
    disposer()
    expect(httpEnv.httpRegistrations).toHaveLength(1)
    adminDisposer()
    expect(httpEnv.httpRegistrations).toHaveLength(0)

    const skillEnv = createFakeEnv()
    const skillDisposer = skillEnv.skills.register({
      name: 'probe-skill',
      description: 'Probe skill',
      content: '# Probe',
    })
    expect(skillEnv.registeredSkills).toEqual([{ name: 'probe-skill', description: 'Probe skill', content: '# Probe' }])
    skillDisposer()
    expect(skillEnv.registeredSkills).toHaveLength(0)

    const commandEnv = createFakeEnv()
    const commandDisposer = commandEnv.commands.register({
      name: 'side',
      description: 'Open a side session',
      handler: async () => ({ kind: 'success', text: 'ok' }),
    })
    expect(commandEnv.commandRegistrations).toHaveLength(1)
    commandDisposer()
    expect(commandEnv.commandRegistrations).toHaveLength(0)

    expect(await env.fetch('https://example.dev/api', { method: 'GET' })).toBe(response)
    expect(env.fetchCalls).toEqual([{ url: 'https://example.dev/api', init: { method: 'GET' } }])
    await env.fetch('https://example.dev/plain')
    expect(env.fetchCalls[1]).toEqual({ url: 'https://example.dev/plain' })

    env.logger.warn('rate %d', 1000)
    env.logger.error('boom')
    expect(env.logs).toEqual([
      { level: 'warn', args: ['rate %d', 1000] },
      { level: 'error', args: ['boom'] },
    ])
  })

  it('supports per-call responses through fetchHandler', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const env = createFakeEnv({
      fetchHandler: async (url, init) => {
        calls.push(init === undefined ? { url } : { url, init })
        return new Response(JSON.stringify({ ok: url.endsWith('/retry') }), {
          status: url.endsWith('/retry') ? 200 : 503,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    expect((await env.fetch('https://example.dev/fail', { method: 'POST' })).status).toBe(503)
    const retry = await env.fetch('https://example.dev/retry')
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual({ ok: true })
    expect(calls).toEqual([
      { url: 'https://example.dev/fail', init: { method: 'POST' } },
      { url: 'https://example.dev/retry' },
    ])
    expect(env.fetchCalls.map(call => call.url)).toEqual(['https://example.dev/fail', 'https://example.dev/retry'])
  })

  it('covers default seeds, binary writes, double disposal, and non-matching triggers', async () => {
    const env = createFakeEnv({ requires: ['declared-only'] })
    expect(env.get('declared-only')).toBeUndefined()
    expect(createFakeEnv().get('undeclared')).toBeUndefined()
    expect(env.plugins()).toEqual([])

    env.logger.info('hello')
    env.logger.debug('trace')
    expect(env.logs).toEqual([
      { level: 'info', args: ['hello'] },
      { level: 'debug', args: ['trace'] },
    ])

    await env.fs.write('/bin.dat', new Uint8Array([1, 2, 3]))
    expect(new TextDecoder().decode(await env.fs.read('/bin.dat'))).toBe('')

    const listenerDisposer = env.on('fixture/echo', () => {})
    listenerDisposer()
    listenerDisposer()
    expect(env.listeners).toHaveLength(0)

    const toolDisposer = env.registerTool(fixtureTool)
    toolDisposer()
    toolDisposer()
    expect(env.tools).toHaveLength(0)

    env.on('fixture/echo', () => {
      throw new Error('must not run for another event')
    })
    await env.trigger('fixture/other', { text: 'x' })
  })

  it('records dynamic install/uninstall calls and honors installHandler', async () => {
    const env = createFakeEnv({
      installHandler: source => ({
        id: 'grown-tool',
        version: '1.0.0',
        generation: 1,
        origin: 'runtime-api',
        status: 'enabled',
        kinds: ['utility'],
        requires: [],
        provides: [],
        orderNeutral: true,
        source,
      }),
    })
    const handle = await env.install({ type: 'inline', code: 'export default {}' }, { config: { x: 1 } })
    expect(handle).toMatchObject({ id: 'grown-tool', origin: 'runtime-api' })
    expect(env.installCalls).toEqual([
      { source: { type: 'inline', code: 'export default {}' }, options: { config: { x: 1 } } },
    ])
    await env.uninstall('grown-tool')
    expect(env.uninstallCalls).toEqual(['grown-tool'])
  })

  it('records managed emits and dispatches them to matching listeners', async () => {
    const env = createFakeEnv()
    const seen: Array<{ event: string; payload: unknown }> = []
    env.on('pi-ext/greet' as never, (payload: unknown) => {
      seen.push({ event: 'pi-ext/greet', payload })
    })
    env.on('pi-ext/other' as never, () => {
      seen.push({ event: 'pi-ext/other', payload: undefined })
    })
    env.emit('pi-ext/greet', { text: 'hello' })
    expect(env.emitCalls).toEqual([{ event: 'pi-ext/greet', payload: { text: 'hello' } }])
    await Promise.resolve()
    expect(seen).toEqual([{ event: 'pi-ext/greet', payload: { text: 'hello' } }])
    env.emit('pi-ext/greet')
    expect(env.emitCalls[1]).toEqual({ event: 'pi-ext/greet' })
  })
})
