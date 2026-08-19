/**
 * #18 factory-integration REAL boot: Loader + Include compose a test-only
 * cordis.yml over the shipped storage stack and the dsh-mygo service.
 * A bundle row referencing a `definePlugin` package (its non-enumerable
 * mount surface) self-adopts into the manager and its managed semantics
 * take effect (plugins() view, disable/enable dispatch gating, dynamic
 * install/uninstall). The route-flip negative check mirrors web-app's
 * storage-domain row: the registry domain lands on sqlite while the static
 * named domains (`workspace`, `session_projcache`) still land on json.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
// dsh-tool-cordis 公开包不再导出 sandbox 助手（host 内部化），F2(b) 改用裸注册等价验证
import { definePlugin, fromCordisPlugin } from '@r05en1cu/dsh-mygo-api'
import type { PluginDefinition } from '@r05en1cu/dsh-mygo-api'
import PluginManagerService from '@r05en1cu/dsh-mygo'

declare module 'cordis' {
  interface Events {
    'tools/change'(): void
  }
}

declare module '@r05en1cu/dsh-mygo-api' {
  interface PluginEvents {
    'tools/change'(): void
    'custom/thing'(payload: { readonly n: number }): void
  }
}

declare module 'cordis' {
  interface Events {
    'custom/thing'(payload: { readonly n: number }): void
  }
}

let root: string | undefined
let context: Context | undefined

// P-0：npm registry 注入桩。响应数据来自真实 registry 快照（固化在
// fixtures/registry/missing-pkg.json），测试离线确定，不依赖外网。
let registryServer: Server | undefined
let registryUrl = ''
const registryRequests: string[] = []

beforeAll(async () => {
  const snapshot = JSON.parse(await readFile(
    fileURLToPath(new URL('./fixtures/registry/missing-pkg.json', import.meta.url)),
    'utf8',
  )) as { readonly status: number; readonly body: { readonly error: string } }
  registryServer = createServer((request, response) => {
    registryRequests.push(request.url ?? '')
    response.writeHead(snapshot.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(snapshot.body))
  })
  await new Promise<void>(resolve => {
    registryServer?.listen(0, '127.0.0.1', () => {
      const address = registryServer?.address()
      if (address !== null && typeof address === 'object') {
        registryUrl = `http://127.0.0.1:${(address as { port: number }).port}`
      }
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>(resolve => registryServer?.close(() => resolve()))
  registryServer = undefined
})

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  delete (globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic
  delete (globalThis as { dshRealOrder?: string[] }).dshRealOrder
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

interface Loaded {
  readonly ctx: Context
  readonly root: string
  readonly warns: string[]
}

async function loadComposition(build: (root: string) => readonly string[]): Promise<Loaded> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'dsh-realboot-'))
  root = bootRoot
  const configPath = join(bootRoot, 'cordis.yml')
  const ctx = new Context()
  context = ctx
  const warns: string[] = []
  ctx.logger.exporter({
    levels: { default: 3 },
    export: (message) => {
      if (message.type === 'warn') warns.push(message.args.join(' '))
    },
  })
  ctx.baseUrl = pathToFileURL(bootRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const staticDefinition = staticFixture()
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-sqlite', storageSqlite],
    ['@deepseek-ai/dsh-storage-domain', storageDomain],
    ['@deepseek-ai/dsh-storage-json', storageJson],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRegistry],
    ['@r05en1cu/dsh-mygo/test-session-persistence', StubSessionPersistence],
    ['@r05en1cu/dsh-mygo', PluginManagerService],
    ['@r05en1cu/dsh-mygo/test-static', definePlugin(staticDefinition)],
    ['@r05en1cu/dsh-mygo/test-custom-events', definePlugin(customEventFixture())],
    ['@r05en1cu/dsh-mygo/test-pattern-events', definePlugin(patternEventFixture())],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await writeFile(configPath, build(bootRoot).join('\n'))
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, root: bootRoot, warns }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function staticFixture(): PluginDefinition {
  return {
    id: 'managed-static',
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: {
      activate(env) {
        env.on('tools/change', () => {
          const holder = globalThis as { dshRealDynamic?: { count: number } }
          const counter = (holder.dshRealDynamic ??= { count: 0 })
          counter.count += 1
        })
      },
    },
  }
}

function customEventFixture(): PluginDefinition {
  return {
    id: 'custom-events',
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: ['custom/thing'], transform: [], intercept: [], position: 'derived', claims: [] },
    events: ['custom/thing'],
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: {
      activate: (env) => {
        env.on('custom/thing', () => {
          const state = globalThis as { dshCustomEventCount?: number }
          state.dshCustomEventCount = (state.dshCustomEventCount ?? 0) + 1
        })
      },
    },
  }
}

function patternEventFixture(): PluginDefinition {
  return {
    id: 'pattern-events',
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
    events: ['pi-ext/*'],
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: {
      activate: (env) => {
        env.on('pi-ext/from-plugin' as never, (payload: unknown) => {
          const state = globalThis as { dshPatternBus?: unknown[] }
          state.dshPatternBus = [...(state.dshPatternBus ?? []), payload]
        })
        env.on('tools/change', () => {
          env.emit('pi-ext/from-plugin', { n: 1 })
        })
      },
    },
  }
}

const INLINE_DYNAMIC_CODE = `module.exports = {
  id: 'dynamic-test',
  version: '1.0.0',
  kinds: ['fixture'],
  requires: [],
  provides: [],
  permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
  stateful: false,
  swapPolicy: 'immediate',
  config: () => ({}),
  hooks: { activate: (env) => { env.on('tools/change', () => { globalThis.dshRealDynamic = globalThis.dshRealDynamic ?? { count: 0 }; globalThis.dshRealDynamic.count += 10 }) } },
}`

function transformCode(
  id: string,
  declarations: ReadonlyArray<{ readonly event: string; readonly reads?: readonly string[]; readonly writes?: readonly string[] }>,
): string {
  return `module.exports = {
    id: ${JSON.stringify(id)},
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: {
      observe: [],
      transform: ${JSON.stringify(declarations.map(declaration => ({
        event: declaration.event,
        ...(declaration.reads === undefined ? {} : { reads: [...declaration.reads] }),
        ...(declaration.writes === undefined ? {} : { writes: [...declaration.writes] }),
      })))},
      intercept: [],
      position: 'derived',
      claims: [],
    },
    stateful: false,
    swapPolicy: 'immediate',
    config: () => ({}),
    hooks: { activate: () => {} },
  }`
}

function managerRows(rootDir: string, profile: string, domainConfig: string[]): readonly string[] {
  return [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(rootDir, 'registry.db'))}`,
    '    journalMode: wal',
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    ...domainConfig,
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    `    profile: ${JSON.stringify(profile)}`,
    `    registry: ${JSON.stringify(registryUrl)}`,
    `    stateRoot: ${JSON.stringify(join(rootDir, 'state'))}`,
    '    cpuBudgetMs: 1',
    '',
  ]
}

/** Proposal A composition: the storage stack plus system-prompt/tools before the manager. */
function toolCompositionRows(rootDir: string, profile: string, managerExtra: readonly string[] = []): readonly string[] {
  return [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(rootDir, 'registry.db'))}`,
    '    journalMode: wal',
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: sqlite',
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@r05en1cu/dsh-mygo/test-session-persistence'",
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    `    profile: ${JSON.stringify(profile)}`,
    `    stateRoot: ${JSON.stringify(join(rootDir, 'state'))}`,
    '    cpuBudgetMs: 1',
    ...managerExtra,
    '',
  ]
}

function rawToolShape(name: string, marker: string): ToolDefinition {
  return {
    name,
    description: marker,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    execute: async () => marker,
  }
}

function bridgeToolCode(version: string, marker: string): string {
  return `module.exports = {
    id: 'bridge-tool',
    version: ${JSON.stringify(version)},
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: () => ({}),
    hooks: { activate: (env) => { env.registerTool({ name: 'bridge_tool', description: ${JSON.stringify(marker)}, input: { type: 'object' }, output: { type: 'string' }, execute: async () => ${JSON.stringify(marker)} }) } },
  }`
}

/** Structural sessionPersistence host service for the Proposal B REAL harness. */
class StubSessionPersistence extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sessionPersistence')
  }

  async listSnapshots(): Promise<Array<{ header: { id: string; cwd: string; createdAt: number }; revision: number }>> {
    return [{ header: { id: 'session-1', cwd: '/workspace', createdAt: 1 }, revision: 1 }]
  }

  async list(): Promise<Array<{ id: string; cwd: string; createdAt: number }>> {
    return [{ id: 'session-1', cwd: '/workspace', createdAt: 1 }]
  }

  locate(): { kind: 'jsonl'; path: string } {
    return { kind: 'jsonl', path: '/missing/session-1.jsonl' }
  }

  async inspect(): Promise<{ meta: { id: string }; events: unknown[] }> {
    return { meta: { id: 'session-1' }, events: [{ seq: 1, type: 'user/message', time: 1, data: { content: [{ type: 'text', text: 'hi' }] } }] }
  }

  async load(): Promise<{ meta: { id: string }; events: unknown[] }> {
    return { meta: { id: 'session-1' }, events: [] }
  }

  async readFrom(): Promise<unknown[]> {
    return []
  }

  async prepare(): Promise<{ id: string }> {
    return { id: 'session-1' }
  }

  async create(): Promise<void> {}

  async append(): Promise<void> {}
}

async function loadFixture<T>(relative: string): Promise<T> {
  return import(new URL(relative, import.meta.url).href) as Promise<T>
}

interface RawFixtureModule {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly Config?: unknown
  readonly apply: (...args: readonly unknown[]) => unknown
}

describe('#18 REAL boot: self-adoption and managed semantics', () => {
  it('boots a bundle row referencing a definePlugin package into the manager', async () => {
    const { ctx, root: bootRoot } = await loadComposition(bootRoot => [
      ...managerRows('<root>', 'realtest', ['    backend: sqlite']),
      "- name: '@r05en1cu/dsh-mygo/test-static'",
      '',
    ].map(line => line.replace('<root>', bootRoot)))
    // The manager service is online.
    expect(ctx.pluginManager).toBeDefined()
    // Self-adoption: the static entry is managed with origin static.
    await expect.poll(() => ctx.pluginManager.plugins().map(handle => handle.id)).toContain('managed-static')
    const handle = ctx.pluginManager.plugins().find(candidate => candidate.id === 'managed-static')
    expect(handle).toMatchObject({ origin: 'static', status: 'enabled', version: '1.0.0' })

    // Managed semantics: the adopted listener dispatches through the machine.
    const before = (globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic?.count ?? 0
    ctx.emit('tools/change')
    await sleep(20)
    expect((globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic?.count ?? 0).toBe(before + 1)

    // Disable gates dispatch; enable restores it.
    await ctx.pluginManager.disable('managed-static')
    ctx.emit('tools/change')
    await sleep(20)
    expect((globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic?.count ?? 0).toBe(before + 1)
    await ctx.pluginManager.enable('managed-static')
    ctx.emit('tools/change')
    await sleep(20)
    expect((globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic?.count ?? 0).toBe(before + 2)

    // Dynamic install through the service resolver, then uninstall.
    const dynamic = await ctx.pluginManager.install({ type: 'inline', code: INLINE_DYNAMIC_CODE })
    expect(dynamic).toMatchObject({ id: 'dynamic-test', status: 'enabled', origin: 'runtime-api' })
    ctx.emit('tools/change')
    await sleep(20)
    expect((globalThis as { dshRealDynamic?: { count: number } }).dshRealDynamic?.count ?? 0).toBe(before + 13)
    await ctx.pluginManager.uninstall('dynamic-test')
    expect(ctx.pluginManager.plugins().map(candidate => candidate.id)).toEqual(['managed-static'])

    // The registry medium is the sqlite file.
    const header = (await readFile(join(bootRoot, 'registry.db'))).subarray(0, 15).toString()
    expect(header).toContain('SQLite format 3')
  })

  it('dispatches a plugin-declared custom event through the managed machine', async () => {
    const { ctx } = await loadComposition(bootRoot => [
      ...managerRows('<root>', 'realtest-custom', ['    backend: sqlite']),
      "- name: '@r05en1cu/dsh-mygo/test-custom-events'",
      '',
    ].map(line => line.replace('<root>', bootRoot)))
    await expect.poll(() => ctx.pluginManager.plugins().map(handle => handle.id)).toContain('custom-events')
    const state = globalThis as { dshCustomEventCount?: number }
    delete state.dshCustomEventCount
    ctx.emit('custom/thing', { n: 1 })
    await sleep(20)
    expect(state.dshCustomEventCount).toBe(1)
  })

  it('materializes a namespace-pattern event bus through managed emit', async () => {
    const { ctx } = await loadComposition(bootRoot => [
      ...managerRows('<root>', 'realtest-pattern', ['    backend: sqlite']),
      "- name: '@r05en1cu/dsh-mygo/test-pattern-events'",
      '',
    ].map(line => line.replace('<root>', bootRoot)))
    await expect.poll(() => ctx.pluginManager.plugins().map(handle => handle.id)).toContain('pattern-events')
    const state = globalThis as { dshPatternBus?: unknown[] }
    delete state.dshPatternBus
    ctx.emit('tools/change')
    await sleep(20)
    expect(state.dshPatternBus).toEqual([{ n: 1 }])
  })

  // 全栈 sqlite 组合的集成路径：本环境实测 ~10s（早于 @cordisjs 命名修复，
  // 该套件在 0811 迁移后从未以默认 5s 超时跑过），显式放宽。
  it('covers replace, updateConfig, plan, and source-resolution failures over a dynamic plugin', { timeout: 30_000 }, async () => {
    const { ctx } = await loadComposition(bootRoot => managerRows('<root>', 'ops', ['    backend: sqlite'])
      .map(line => line.replace('<root>', bootRoot)))
    await ctx.pluginManager.install({ type: 'inline', code: INLINE_DYNAMIC_CODE })
    const v2 = INLINE_DYNAMIC_CODE.replace("version: '1.0.0'", "version: '2.0.0'")
    await ctx.pluginManager.replace('dynamic-test', { type: 'inline', code: v2 })
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'dynamic-test')?.version).toBe('2.0.0')
    await ctx.pluginManager.updateConfig('dynamic-test', {})
    expect((await ctx.pluginManager.plan({ op: 'uninstall', id: 'dynamic-test' })).accepted).toBe(true)
    expect((await ctx.pluginManager.plan({ op: 'disable', id: 'dynamic-test' })).accepted).toBe(true)
    expect((await ctx.pluginManager.plan({ op: 'enable', id: 'dynamic-test' })).accepted).toBe(true)
    const installPlan = await ctx.pluginManager.plan({ op: 'install', source: { type: 'inline', code: INLINE_DYNAMIC_CODE } })
    expect(installPlan.accepted).toBe(false)
    expect(installPlan.error?.code).toBe('concurrent-operation')
    const replacePlan = await ctx.pluginManager.plan({ op: 'replace', id: 'dynamic-test', source: { type: 'inline', code: v2 } })
    expect(replacePlan.accepted).toBe(true)
    await expect(ctx.pluginManager.plan({
      op: 'install',
      source: { type: 'npm', package: 'missing-pkg' },
    })).rejects.toMatchObject({ code: 'package-not-resolvable' })
    await expect(ctx.pluginManager.install({ type: 'npm', package: 'missing-pkg' }))
      .rejects.toMatchObject({ code: 'package-not-resolvable' })
    await expect(ctx.pluginManager.install({ type: 'inline', code: 'module.exports = 42' }))
      .rejects.toThrow(/did not export a PluginDefinition/)
    // P-0 断言：npm 请求确实打到本地桩（离线确定），且没有外部 host。
    expect(registryRequests.some(url => url.includes('missing-pkg'))).toBe(true)
    expect(registryRequests.every(url => url.startsWith('/'))).toBe(true)
  })

  it('REAL composition: conflicting, cyclic, and clean fixtures with plugin event flow (PO:249, HP:141)', async () => {
    const { ctx } = await loadComposition(bootRoot => managerRows('<root>', 'matrix', ['    backend: sqlite'])
      .map(line => line.replace('<root>', bootRoot)))
    const events: string[] = []
    const order = (globalThis as { dshRealOrder?: string[] }).dshRealOrder ??= []
    for (const name of ['plugin/installed', 'plugin/activated', 'plugin/disabled', 'plugin/enabled', 'plugin/replaced', 'plugin/uninstalled'] as const) {
      ctx.on(name, () => { events.push(name) })
    }

    // Clean compose: two observe plugins dispatch in derived id order.
    await ctx.pluginManager.install({ type: 'inline', code: `module.exports = {
      id: 'zeta', version: '1.0.0', kinds: ['fixture'], requires: [], provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false, swapPolicy: 'immediate', config: () => ({}),
      hooks: { activate: (env) => { env.on('tools/change', () => { (globalThis.dshRealOrder ??= []).push('zeta') }) } },
    }` })
    await ctx.pluginManager.install({ type: 'inline', code: `module.exports = {
      id: 'alpha', version: '1.0.0', kinds: ['fixture'], requires: [], provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false, swapPolicy: 'immediate', config: () => ({}),
      hooks: { activate: (env) => { env.on('tools/change', () => { (globalThis.dshRealOrder ??= []).push('alpha') }) } },
    }` })
    ctx.emit('tools/change')
    await sleep(20)
    expect(order).toEqual(['alpha', 'zeta'])
    expect(events).toEqual([
      'plugin/installed', 'plugin/activated',
      'plugin/installed', 'plugin/activated',
    ])

    // Conflict: two transform writers of one property preview and reject.
    await ctx.pluginManager.install({ type: 'inline', code: transformCode('w1', [{ event: 'system-prompt/assemble', writes: ['sections'] }]) })
    const conflict = await ctx.pluginManager.plan({
      op: 'install',
      source: { type: 'inline', code: transformCode('w2', [{ event: 'system-prompt/assemble', writes: ['sections'] }]) },
    })
    expect(conflict.accepted).toBe(false)
    expect(conflict.error?.code).toBe('write-conflict')
    await expect(ctx.pluginManager.install({
      type: 'inline',
      code: transformCode('w2', [{ event: 'system-prompt/assemble', writes: ['sections'] }]),
    })).rejects.toMatchObject({ code: 'write-conflict' })

    // Cycle: a writes sections / reads contexts, b writes contexts / reads sections.
    await ctx.pluginManager.install({
      type: 'inline',
      code: transformCode('cyc-a', [{
        event: 'system-prompt/assemble',
        writes: ['tools'],
        reads: ['contexts'],
      }]),
    })
    const cycle = await ctx.pluginManager.plan({
      op: 'install',
      source: {
        type: 'inline',
        code: transformCode('cyc-b', [{
          event: 'system-prompt/assemble',
          writes: ['contexts'],
          reads: ['tools'],
        }]),
      },
    })
    expect(cycle.accepted).toBe(false)
    expect(cycle.error?.code).toBe('ordering-cycle')
  })
})

describe('#18 route flip: static named domains stay on json', () => {
  it('keeps workspace and session_projcache on json while the registry goes sqlite', async () => {
    const { ctx, root: bootRoot } = await loadComposition(bootRoot => managerRows('<root>', 'web', [
      '    backend: sqlite',
      '    routes:',
      '      workspace: json',
      '      session_projcache: json',
    ]).map(line => line.replace('<root>', bootRoot)).concat([
      "- name: '@deepseek-ai/dsh-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(join(bootRoot, 'storages'))}`,
      '',
    ]))

    // The manager's registry domain opens on sqlite.
    await expect.poll(() => ctx.pluginManager.plugins()).toBeDefined()
    const registryHeader = (await readFile(join(bootRoot, 'registry.db'))).subarray(0, 15).toString()
    expect(registryHeader).toContain('SQLite format 3')

    // The web-app static named domains route to the json backend.
    const workspaceSpec = defineDomain({
      name: 'workspace',
      version: 1,
      tables: { rows: domainTable<string, { readonly v: number }>(zod.object({ v: zod.number() })) },
    })
    const workspace = await ctx.storageDomain.open(workspaceSpec)
    await workspace.table('rows').put('a', { v: 1 })
    const workspaceFile = await readFile(join(bootRoot, 'storages', 'workspace.json'), 'utf8')
    expect(workspaceFile).toContain('"v": 1')

    const projSpec = defineDomain({
      name: 'session_projcache',
      version: 1,
      tables: { rows: domainTable<string, { readonly v: number }>(zod.object({ v: zod.number() })) },
    })
    const proj = await ctx.storageDomain.open(projSpec)
    await proj.table('rows').put('a', { v: 2 })
    const projFile = await readFile(join(bootRoot, 'storages', 'session_projcache.json'), 'utf8')
    expect(projFile).toContain('"v": 2')
  })
})

describe('#18 deferred wirings: auto-disable and dispatch audit', () => {
  it('auto-disables a plugin after five CPU violations and audits the dispatch stream', async () => {
    const { ctx, root: bootRoot } = await loadComposition(bootRoot => managerRows('<root>', 'wiring', [
      '    backend: sqlite',
    ]).map(line => line.replace('<root>', bootRoot)))
    const cpuCode = `module.exports = {
      id: 'cpu-bound',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: (env) => { env.on('tools/change', () => { const start = Date.now(); while (Date.now() - start < 25) {} }) } },
    }`
    await ctx.pluginManager.install({ type: 'inline', code: cpuCode })
    for (let index = 0; index < 5; index += 1) {
      ctx.emit('tools/change')
      await sleep(30)
    }
    await expect.poll(() => ctx.pluginManager.plugins().find(handle => handle.id === 'cpu-bound')?.status)
      .toBe('disabled')
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'cpu-bound')?.reason).toBe('cpu-quota')
    const audit = await readFile(join(bootRoot, 'state', 'wiring', 'audit.jsonl'), 'utf8')
    expect(audit.split('\n').filter(line => line.includes('"class":"quota"')).length).toBeGreaterThanOrEqual(5)
  })

  it('surfaces a throwing managed listener as a veto-suppressed audit entry', async () => {
    const { ctx, root: bootRoot, warns } = await loadComposition(bootRoot => managerRows('<root>', 'wiring2', ['    backend: sqlite'])
      .map(line => line.replace('<root>', bootRoot)))
    const throwingCode = `module.exports = {
      id: 'thrower',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: (env) => { env.on('tools/change', () => { throw new Error('boom') }) } },
    }`
    await ctx.pluginManager.install({ type: 'inline', code: throwingCode })
    const cpuCode = `module.exports = {
      id: 'cpu-bound',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: (env) => { env.on('tools/change', () => { const start = Date.now(); while (Date.now() - start < 25) {} }) } },
    }`
    await ctx.pluginManager.install({ type: 'inline', code: cpuCode })
    ctx.emit('tools/change')
    await sleep(30)
    const audit = await readFile(join(bootRoot, 'state', 'wiring2', 'audit.jsonl'), 'utf8')
    expect(audit).toContain('"class":"veto-suppressed"')
    expect(audit).toContain('"class":"quota"')

    // A hostile audit path makes the violation append fail; the sink warns.
    const auditPath = join(bootRoot, 'state', 'wiring2', 'audit.jsonl')
    await rm(auditPath)
    await mkdir(auditPath)
    ctx.emit('tools/change')
    await expect.poll(() => warns.some(line => line.includes('violation audit failed'))).toBe(true)
  })

  it('warns when the auto-disable protocol rejects under a concurrent operation', async () => {
    const { ctx, warns } = await loadComposition(bootRoot => managerRows('<root>', 'wiring3', ['    backend: sqlite'])
      .map(line => line.replace('<root>', bootRoot)))
    // The first session/flush listener blocks forever (a parallel-band
    // dispatch that never settles), while tools/change listeners spin 25ms
    // to accumulate CPU-quota violations.
    const cpuCode = `module.exports = {
      id: 'cpu-bound',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: ['session/flush', 'tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: (env) => {
        let blocked = false
        env.on('session/flush', async () => {
          if (!blocked) { blocked = true; await new Promise(() => {}) }
        })
        env.on('tools/change', () => { const start = Date.now(); while (Date.now() - start < 25) {} })
      } },
    }`
    await ctx.pluginManager.install({ type: 'inline', code: cpuCode })
    const hangingCode = `module.exports = {
      id: 'cpu-bound',
      version: '2.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: ['tools/change'], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: async () => { await new Promise(() => {}) } },
    }`
    // Keep the old generation's listener live while the replace holds the
    // per-id lock: the in-flight parallel dispatch makes releaseGeneration
    // wait for idle before the (hanging) apply runs under the native
    // dispose-first ordering.
    ;(ctx.emit as (name: string, ...args: unknown[]) => void)('session/flush', {})
    await sleep(30)
    const replacing = ctx.pluginManager.replace('cpu-bound', { type: 'inline', code: hangingCode })
    await sleep(30)
    for (let index = 0; index < 5; index += 1) {
      ctx.emit('tools/change')
      await sleep(30)
    }
    await expect.poll(() => warns.some(line => line.includes('auto-disable failed'))).toBe(true)
    void replacing
  })

  it('exposes host-side audit readers on the manager service (SEC:153)', async () => {
    const { ctx } = await loadComposition(bootRoot => managerRows('<root>', 'auditread', ['    backend: sqlite'])
      .map(line => line.replace('<root>', bootRoot)))
    await ctx.pluginManager.install({ type: 'inline', code: INLINE_DYNAMIC_CODE })
    const service = ctx.pluginManager as unknown as PluginManagerService
    const tail = await service.auditTail(10)
    expect(tail.some(entry => entry.class === 'mount' && entry.plugin?.id === 'dynamic-test')).toBe(true)
    expect((await service.auditByPlugin('dynamic-test')).length).toBeGreaterThanOrEqual(1)
    expect((await service.auditSince(0)).length).toBeGreaterThanOrEqual(1)
  })
})

describe('Proposal A: tools.register bridge (F1/F2 REAL)', () => {
  it('F1: bridge-published tools keep schemas() order across replace and fire no tools/change', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'f1')
      .map(line => line.replace('<root>', bootRoot)))
    ctx.tools.register(rawToolShape('raw_stable', 'raw'))
    let changes = 0
    ctx.on('tools/change', () => { changes += 1 })
    await ctx.pluginManager.install({ type: 'inline', code: bridgeToolCode('1.0.0', 'v1') })
    const before = ctx.tools.schemas().map(schema => schema.name)
    expect(before).toEqual(['raw_stable', 'bridge_tool'])
    expect(changes).toBe(1)
    await ctx.pluginManager.replace('bridge-tool', { type: 'inline', code: bridgeToolCode('2.0.0', 'v2') })
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(before)
    expect(changes).toBe(1)
    const view = ctx.tools.get('bridge_tool') as unknown as {
      execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown>
    }
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('v2')
  })

  it('F2(a): a raw plugin through fromCordisPlugin routes its tool through the manager indirection', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'f2a')
      .map(line => line.replace('<root>', bootRoot)))
    const raw = {
      name: 'facade-calc',
      apply: (ctxLike: { tools: { register(tool: unknown): () => void } }): void => {
        ctxLike.tools.register(rawToolShape('facade_tool', 'f2'))
      },
    }
    const definition = fromCordisPlugin(raw, {
      id: 'facade-calc',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: z.object({}),
    })
    await ctx.pluginManager.adopt(definition, {})
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'facade_tool')).toBe(true)
    const view = ctx.tools.get('facade_tool') as unknown as {
      execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown>
    }
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('f2')
    await ctx.pluginManager.uninstall('facade-calc')
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'facade_tool')).toBe(false)
  })

  it('F2(b): a raw plugin registering a tool bypasses the manager (P3：sandbox 助手已随公开包内部化)', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'f2b')
      .map(line => line.replace('<root>', bootRoot)))
    // 公开版 @deepseek-ai/dsh-tool-cordis 不再导出 sandboxDefineTool /
    // guardedPlugin（host 内部实现）；本用例的核心断言是「raw 直注册不进
    // 受管集」，用裸 ToolDefinition + 裸函数插件即可等价验证。
    const tool = rawToolShape('sandbox_tool', 'sandbox')
    ctx.plugin({
      name: 'raw-mount',
      inject: ['tools'],
      apply: (ctxLike: { tools: { register(tool: unknown): () => void } }): void => {
        ctxLike.tools.register(tool)
      },
    })
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'sandbox_tool')).toBe(true)
    // raw 注册落在裸注册表：manager 的受管集保持为空。
    expect(ctx.pluginManager.plugins().some(handle => handle.id === 'raw-mount-sandbox_tool')).toBe(false)
  })

  it('pre-baked race: raw-held tool names reject loudly and a later raw registration cannot win', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'race', [
      '    grants:',
      '      race-claimant:',
      '        claims: true',
    ]).map(line => line.replace('<root>', bootRoot)))

    // Raw first, managed claimant later: claims on a raw-held slot is loud.
    ctx.tools.register(rawToolShape('race_held', 'raw'))
    const claimant = `module.exports = {
      id: 'race-claimant',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: ['tool:race_held'] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: (env) => { env.registerTool({ name: 'race_held', description: 'late', input: {}, output: { type: 'string' }, execute: async () => 'late' }) } },
    }`
    await expect(ctx.pluginManager.install({ type: 'inline', code: claimant }))
      .rejects.toMatchObject({ code: 'claims-unmanaged-incumbent' })
    expect(ctx.tools.get('race_held')).toBeDefined()

    // Bridge first, raw later: the registry duplicate error rejects loudly.
    await ctx.pluginManager.install({ type: 'inline', code: bridgeToolCode('1.0.0', 'v1') })
    expect(() => ctx.tools.register(rawToolShape('bridge_tool', 'raw-late'))).toThrow()
    const view = ctx.tools.get('bridge_tool') as unknown as {
      execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown>
    }
    await expect(view.execute({}, { signal: new AbortController().signal })).resolves.toBe('v1')
  })
})

describe('Proposal B: systemPrompt/sessionPersistence mapping (REAL)', () => {
  it('session-chatlog mounts zero-modification through the facade and its tools execute against the projection', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'service-map')
      .map(line => line.replace('<root>', bootRoot)))
    let promptChanges = 0
    ctx.on('system-prompt/change', () => { promptChanges += 1 })

    const sessionChatlog = await loadFixture<RawFixtureModule>('./fixtures/dsh-external/session-chatlog/src/index.ts')
    const raw = {
      ...(sessionChatlog.name === undefined ? {} : { name: sessionChatlog.name }),
      Config: sessionChatlog.Config,
      apply: sessionChatlog.apply,
    }
    const definition = fromCordisPlugin(raw, {
      id: 'session-chatlog',
      version: '0.2.0',
      kinds: ['tools'],
      requires: ['sessionPersistence'],
      provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: z.object({}),
    })
    await ctx.pluginManager.adopt(definition, {})
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'session_list')).toBe(true)
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'session_read_chat')).toBe(true)
    expect(promptChanges).toBe(1)

    const list = ctx.tools.get('session_list') as unknown as {
      execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown>
    }
    const result = await list.execute({}, { signal: new AbortController().signal })
    expect(JSON.stringify(result)).toContain('session-1')

    await ctx.pluginManager.uninstall('session-chatlog')
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'session_list')).toBe(false)
    await expect.poll(() => promptChanges).toBe(2)
  })

  it('forwards projection writes to the host sessionPersistence service', async () => {
    const { ctx } = await loadComposition(bootRoot => toolCompositionRows('<root>', 'write-denied')
      .map(line => line.replace('<root>', bootRoot)))
    const probe = `module.exports = {
      id: 'write-probe',
      version: '1.0.0',
      kinds: ['fixture'],
      requires: ['sessionPersistence'],
      provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: () => ({}),
      hooks: { activate: async (env) => { await env.get('sessionPersistence').create({ id: 'x' }) } },
    }`
    await ctx.pluginManager.install({ type: 'inline', code: probe })
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'write-probe')?.status).toBe('enabled')
  })
})
