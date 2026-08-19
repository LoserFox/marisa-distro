/**
 * design-r3 批次 10 验收（B17）：T1..T20 覆盖映射 + 缺口的集中回归。
 * 既有套件已覆盖 T1-T4/T6/T8-T10/T12-T16/T18-T20；本文件补齐
 * T5（安装期哈希不匹配）、T7（environment 只读不阻断）、T11（运行期反应式
 * 收敛）、T17（P1/P2 回滚后跨调用状态无残留）。
 */

import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { restorePackage } from '../../src/package/package-restore.ts'
import { resolveMygoPaths } from '../../src/package/paths.ts'
import { parsePackageManifest } from '../../src/package/manifest-v2.ts'
import { LifecycleEngine, type LifecycleEngineOptions } from '../../src/lifecycle.ts'
import { DispatchMachine } from '../../src/dispatch.ts'
import { resolvePluginManagerConfig } from '../../src/config.ts'
import { InMemoryRegistryStore } from '../../src/store.ts'
import type { PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

function fixture(
  id: string,
  overrides: Partial<PluginDefinition> = {},
): PluginDefinition {
  const base: PluginDefinition = {
    id,
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: {
      observe: [],
      transform: [],
      intercept: [],
      position: 'derived',
      claims: [],
    },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: { activate: () => {} },
  }
  return {
    ...base,
    ...overrides,
    hooks: {
      ...base.hooks,
      ...(overrides.hooks ?? {}),
    },
  }
}

function source(id: string): PluginSource {
  return { type: 'inline', code: id }
}

function harness(options: Partial<LifecycleEngineOptions> = {}): {
  readonly engine: LifecycleEngine
  readonly ctx: Context
  readonly definitions: Map<string, PluginDefinition>
} {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: [] })
  machine.start()
  const definitions = new Map<string, PluginDefinition>()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: [],
    resolveSource: async (sourceValue: PluginSource) => {
      const definition = definitions.get(sourceValue.type === 'inline' ? sourceValue.code : sourceValue.package)
      if (definition === undefined) throw new Error(`source ${sourceValue.type} not resolvable`)
      return definition
    },
    ...options,
  })
  return { engine, ctx, definitions }
}

const execFileAsync = promisify(execFile)

describe('T5: install-time hash mismatch never writes disk', () => {
  let root: string
  let server: Server
  let port = 0
  let tarballPath: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-r3-t5-'))
    const pkg = join(root, 'pkg')
    await mkdir(join(pkg, 'package', 'lib'), { recursive: true })
    await writeFile(join(pkg, 'package', 'package.json'), JSON.stringify({
      name: '@test/bad',
      version: '1.0.0',
      main: 'lib/index.js',
      dsh: { mygo: { entry: 'lib/index.js' } },
    }))
    await writeFile(join(pkg, 'package', 'lib', 'index.js'), 'export default {}')
    tarballPath = join(root, 'bad.tgz')
    await execFileAsync('tar', ['-czf', tarballPath, '-C', pkg, 'package'])
    server = createServer(async (_request, response) => {
      const bytes = await import('node:fs/promises').then(fs => fs.readFile(tarballPath))
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      response.end(bytes)
    })
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address !== null && typeof address === 'object') port = address.port
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })

  it('rejects a corrupted integrity before writing the target dir (Modrinth HashError 对齐)', async () => {
    const paths = resolveMygoPaths('web', { DSH_HOME: join(root, 'home') })
    const manifest = parsePackageManifest({
      name: '@test/bad',
      version: '1.0.0',
      main: 'lib/index.js',
      dsh: { mygo: { entry: 'lib/index.js' } },
    }).value
    if (manifest === undefined) throw new Error('manifest missing')
    const wrongIntegrity = `sha512-${createHash('sha512').update('wrong').digest('base64')}`
    await expect(restorePackage(join(paths.packagesRoot, 'bad', '1.0.0'), {
      version: '1.0.0',
      tarball: `http://127.0.0.1:${port}/bad.tgz`,
      integrity: wrongIntegrity,
      manifest,
    }, { tmpDir: paths.tmpDir })).rejects.toThrow(/完整性校验失败/)
    const storeRoot = join(paths.packagesRoot)
    await expect(readdir(storeRoot)).rejects.toBeTruthy()
  })
})

describe('T7: environment is read-only metadata and never blocks', () => {
  it('parses an environment block with no problems', () => {
    const result = parsePackageManifest({
      name: 'p',
      version: '1.0.0',
      main: 'index.js',
      dsh: { mygo: { environment: { platform: 'web', profile: 'headless' } } },
    })
    expect(result.problems).toEqual([])
    expect(result.value?.environment).toEqual({ platform: 'web', profile: 'headless' })
  })
})

describe('T11/T20: runtime reactive convergence without restart', () => {
  it('converges INACTIVE → ACTIVE → INACTIVE as providers change at runtime', async () => {
    const h = harness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { 'voice-chat': '>=0.1.0' },
    }))
    await h.engine.install(source('consumer'))
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('inactive')

    h.definitions.set('provider', fixture('provider', {
      provides: ['voice-chat'],
      hooks: {
        activate(env) {
          env.provide('voice-chat', { speak() { return 'ok' } })
        },
      },
    }))
    await h.engine.install(source('provider'))
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('active')

    await h.engine.uninstall('provider')
    expect(h.engine.plugins().find(plugin => plugin.id === 'consumer')?.policyStatus).toBe('inactive')
  })
})

describe('T17: no cross-call state residue after a failed replace (P1/P2 rollback)', () => {
  it('keeps the incumbent generation and its state when the replacement fails to stage', async () => {
    const h = harness()
    const state = { count: 0 }
    h.definitions.set('p', fixture('p', {
      stateful: true,
      hooks: {
        activate(env) {
          env.on('lifecycle/emit', () => { state.count += 1 })
        },
        captureState: () => ({ count: state.count }),
        restoreState: (snapshot: unknown) => {
          if (snapshot !== undefined) {
            const restored = snapshot as { count: number }
            state.count = restored.count
          }
        },
      },
    }))
    await h.engine.install(source('p'))
    h.ctx.emit('lifecycle/emit', {})
    h.ctx.emit('lifecycle/emit', {})
    expect(state.count).toBe(2)

    // 新代在 staging 失败 → replace 中止，旧代与状态保持（P1-global 回滚语义）。
    h.definitions.set('p-bad', fixture('p', {
      version: '2.0.0',
      stateful: true,
      hooks: {
        restoreState: () => { throw new Error('boom') },
      },
    }))
    await expect(h.engine.replace('p', source('p-bad'))).rejects.toMatchObject({ code: 'staging-failed' })
    expect(h.engine.plugins()[0]?.version).toBe('1.0.0')
    h.ctx.emit('lifecycle/emit', {})
    expect(state.count).toBe(3)
  })
})
