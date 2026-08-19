/**
 * #22 dsh-external ecosystem compatibility matrix: five real Cordis plugins
 * are exercised through the migration bridge (`fromCordisPlugin`) with zero
 * modification to their source, mounted in a REAL Loader composition over the
 * manager service. The verdicts drive the ecosystem-compat report:
 * direct-accept / needs-wrapper / rejected-with-§16.2-code, and every
 * non-direct verdict is classified as a facade-coverage gap (harness side,
 * candidate for v1.1 review) or a plugin-boundary violation (correctly
 * intercepted).
 *
 * Fixture provenance (pinned commits) lives in
 * `tests/fixtures/dsh-external/PROVENANCE.md`; the sources are verbatim
 * copies of the upstream plugin files.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Storage from '@deepseek-ai/dsh-storage'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'
import PluginManagerService from '@r05en1cu/dsh-mygo'
import { fromCordisPlugin } from '@r05en1cu/dsh-mygo-api'
import type { PluginDefinition, RawCordisFunctionPlugin, Schemastery } from '@r05en1cu/dsh-mygo-api'

declare module 'cordis' {
  interface Events {
    'tools/change'(): void
  }
}

/** Structural shape of one vendored plugin module (upstream types differ from this snapshot by design). */
interface RawFixtureModule {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly Config?: unknown
  readonly apply: (...args: readonly unknown[]) => unknown
}

/**
 * Load one fixture at runtime through a computed URL so the vendored
 * third-party sources stay outside the repository TypeScript programs (their
 * upstream types intentionally do not match this snapshot's declarations;
 * the fixtures are host-tsconfig-excluded like the typert generator fixtures).
 */
async function loadFixture<T>(relative: string): Promise<T> {
  return import(new URL(relative, import.meta.url).href) as Promise<T>
}

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** REAL Loader composition over the manager service (same stack as #18). */
async function boot(profile: string): Promise<Context> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'dsh-compat-'))
  root = bootRoot
  const configPath = join(bootRoot, 'cordis.yml')
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(bootRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-sqlite', storageSqlite],
    ['@deepseek-ai/dsh-storage-domain', storageDomain],
    ['@r05en1cu/dsh-mygo', PluginManagerService],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const rows = [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(bootRoot, 'registry.db'))}`,
    '    journalMode: wal',
    "- name: '@deepseek-ai/dsh-storage-domain'",
    '  config:',
    '    backend: sqlite',
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    `    profile: ${JSON.stringify(profile)}`,
    `    stateRoot: ${JSON.stringify(join(bootRoot, 'state'))}`,
    '',
  ]
  await writeFile(configPath, rows.join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

/** Structural sessionPersistence host service for the session-chatlog matrix case. */
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

/** Full Proposal A/B composition: storage + system-prompt + tools + stub sessionPersistence + manager. */
async function bootWithServices(profile: string): Promise<Context> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'dsh-compat-full-'))
  root = bootRoot
  const configPath = join(bootRoot, 'cordis.yml')
  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(bootRoot).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-storage', Storage],
    ['@deepseek-ai/dsh-storage-sqlite', storageSqlite],
    ['@deepseek-ai/dsh-storage-domain', storageDomain],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRegistry],
    ['@r05en1cu/dsh-mygo/test-session-persistence', StubSessionPersistence],
    ['@r05en1cu/dsh-mygo', PluginManagerService],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const rows = [
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-sqlite'",
    '  config:',
    `    path: ${JSON.stringify(join(bootRoot, 'registry.db'))}`,
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
    `    stateRoot: ${JSON.stringify(join(bootRoot, 'state'))}`,
    '',
  ]
  await writeFile(configPath, rows.join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

/** Caller-supplied §5 declaration for one raw plugin (the migration wrapper's manifest side). */
function declaration(
  id: string,
  version: string,
  kinds: readonly string[],
  observe: readonly string[] = [],
  config: Schemastery = z.object({}),
  requires: readonly string[] = [],
): Omit<PluginDefinition, 'hooks'> {
  return {
    id,
    version,
    kinds: [...kinds],
    requires: [...requires],
    provides: [],
    permissions: { observe: [...observe], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config,
  }
}

function rawOf(module: RawFixtureModule): RawCordisFunctionPlugin {
  return {
    ...(module.name === undefined ? {} : { name: module.name }),
    ...(module.inject === undefined ? {} : { inject: module.inject }),
    ...(module.Config === undefined ? {} : { Config: module.Config }),
    apply: module.apply,
  }
}

describe('#22 dsh-external zero-modification compatibility matrix', () => {
  it('chat-width: host half mounts as-is; its function lives in the unhosted client half', async () => {
    const ctx = await boot('chatwidth')
    const raw = (await loadFixture<{ readonly default: RawFixtureModule }>('./fixtures/dsh-external/chat-width/index.mjs')).default
    const adapted = fromCordisPlugin(rawOf(raw), declaration('chat-width', '0.1.0', ['ui']))
    await ctx.pluginManager.adopt(adapted, {})
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'chat-width'))
      .toMatchObject({ status: 'enabled', origin: 'static', version: '0.1.0' })
    // The upstream host half is an intentional no-op (`apply() {}`); the
    // width engine ships in the browser half (`dshClient`), which v1 does not
    // host. Mounting proves the host shell is direct-acceptable.
  })

  it('dsh-working-activity: zero-modification mount succeeds through inject/effect interception', async () => {
    const ctx = await boot('working')
    const workingActivity = await loadFixture<RawFixtureModule>('./fixtures/dsh-external/working-activity/src/index.ts')
    const adapted = fromCordisPlugin(
      rawOf(workingActivity),
      declaration('working-activity', '0.0.1', ['ui'], ['session/event', 'agent/status', 'session/disposed'], workingActivity.Config as Schemastery),
    )
    await ctx.pluginManager.adopt(adapted, {})
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'working-activity')?.status).toBe('enabled')
  })

  it('session-chatlog: zero-modification mount succeeds through the service-mapping bridge (Proposal B)', async () => {
    const ctx = await bootWithServices('chatlog')
    const sessionChatlog = await loadFixture<RawFixtureModule>('./fixtures/dsh-external/session-chatlog/src/index.ts')
    const adapted = fromCordisPlugin(
      rawOf(sessionChatlog),
      declaration('session-chatlog', '0.2.0', ['tools'], [], sessionChatlog.Config as Schemastery, ['sessionPersistence']),
    )
    await ctx.pluginManager.adopt(adapted, {})
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'session-chatlog')?.status).toBe('enabled')
    await expect.poll(() => ctx.tools.schemas().some(schema => schema.name === 'session_list')).toBe(true)
  })

  it('dsh-tool-calculator: zero-modification mount succeeds through the tools.register bridge (Proposal A)', async () => {
    const ctx = await boot('calc')
    const calculator = await loadFixture<RawFixtureModule>('./fixtures/dsh-external/dsh-tool-calculator/src/index.ts')
    const raw = rawOf(calculator)
    const adapted = fromCordisPlugin(raw, declaration('dsh-tool-calculator', '0.0.1', ['tools']))
    await ctx.pluginManager.adopt(adapted, {})
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'dsh-tool-calculator')?.status).toBe('enabled')
  })

  it('distill: zero-modification mount rejects event-not-mountable (agent/settled outside the harness vocabulary) and the plugin crosses v1 boundaries', async () => {
    const ctx = await boot('distill')
    const distill = await loadFixture<RawFixtureModule>('./fixtures/dsh-external/distill/src/index.ts')
    const adapted = fromCordisPlugin(
      rawOf(distill),
      declaration('distill', '0.1.0', ['autonomy'], ['agent/settled', 'session/disposed'], distill.Config as Schemastery),
    )
    const error = await ctx.pluginManager.adopt(adapted, {}).then(
      () => null,
      (caught: unknown) => caught as { code?: string; details?: Record<string, unknown> },
    )
    expect(error?.code).toBe('event-not-mountable')
    expect(error?.details?.event).toBe('agent/settled')
  })
})
