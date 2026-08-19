/**
 * REAL guards for the author guide: the two examples from the
 * tutorial are mounted through the manager service and must actually run.
 */

import { describe, expect, it } from 'vitest'
import { afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { pathToFileURL } from 'node:url'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageSqlite from '@deepseek-ai/dsh-storage-sqlite'
import PluginManagerService from '@r05en1cu/dsh-mygo'
import { GUARD_PLUGIN_CODE, MINIMAL_PLUGIN_CODE } from './author-examples.ts'

declare module 'cordis' {
  interface Events {
    'tools/change'(): void
  }
}

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  delete (globalThis as { __authorHello?: { count: number }; __authorGuard?: { count: number } }).__authorHello
  delete (globalThis as { __authorHello?: { count: number }; __authorGuard?: { count: number } }).__authorGuard
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function boot(managerRows: readonly string[]): Promise<Context> {
  const bootRoot = await mkdtemp(join(tmpdir(), 'dsh-author-'))
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
    ...managerRows,
    '',
  ]
  const rendered = rows.join('\n').replace(
    '    stateRoot: state',
    `    stateRoot: ${JSON.stringify(join(bootRoot, 'state'))}`,
  )
  await writeFile(configPath, rendered)
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

function managerRow(extra: readonly string[]): readonly string[] {
  return [
    "- name: '@r05en1cu/dsh-mygo'",
    '  config:',
    '    profile: author',
    '    stateRoot: state',
    ...extra,
  ]
}

describe('author-guide examples', () => {
  it('Example A: the minimal definePlugin runs and its listener fires', async () => {
    const ctx = await boot(managerRow([]))
    await ctx.pluginManager.install({ type: 'inline', code: MINIMAL_PLUGIN_CODE })
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'hello-plugin'))
      .toMatchObject({ status: 'enabled', origin: 'runtime-api', version: '1.0.0' })
    ctx.emit('tools/change')
    await sleep(20)
    expect((globalThis as { __authorHello?: { count: number } }).__authorHello?.count).toBe(1)
  })

  it('Example B: intercept declarations mount without any grants entry', async () => {
    const ctx = await boot(managerRow([]))
    await ctx.pluginManager.install({ type: 'inline', code: GUARD_PLUGIN_CODE })
    expect(ctx.pluginManager.plugins().find(handle => handle.id === 'guard-plugin')?.status).toBe('enabled')
  })
})
