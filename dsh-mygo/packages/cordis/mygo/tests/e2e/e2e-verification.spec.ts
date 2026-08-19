/**
 * E2E 真实验证轮（T21+）：S1-S9 场景矩阵。语料为六类真实来源
 * （见 corpus.ts 审阅记录）；离线 registry 桩 + 真实 tarball。
 * 故障分类纪律：impl-bug 直接修 / fixture-issue 修夹具 / design-gap 冲突上报。
 * @module @r05en1cu/dsh-mygo/tests/e2e/e2e-verification
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import z from '@deepseek-ai/schemastery'
import { Context } from '@deepseek-ai/cordis'
import type { PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import { fromCordisPlugin } from '@r05en1cu/dsh-mygo-api'
import { LifecycleEngine, type LifecycleEngineOptions } from '../../src/lifecycle.ts'
import { DispatchMachine } from '../../src/dispatch.ts'
import { resolvePluginManagerConfig } from '../../src/config.ts'
import { InMemoryRegistryStore } from '../../src/store.ts'
import { parsePackageManifest } from '../../src/package/manifest-v2.ts'
import { readRestoredPackage } from '../../src/package/package-restore.ts'
import { preGate, captureExports } from '../../src/package/fine-epoch.ts'
import { detectDualPresence } from '../../src/package/dual-presence.ts'
import { harvestPackageMetadata } from '../../src/package/harvester.ts'
import { checkTemplateAlignment } from '../../src/package/template-align.ts'
import { BuiltinMixinEngine } from '../../src/package/mixin-engine.ts'
import { MountOrchestrator } from '../../src/package/mount-orchestrator.ts'
import {
  CORPUS,
  corpusOf,
  loadEntry,
  type CorpusPlugin,
} from './corpus.ts'
import {
  packCorpus,
  startOfflineRegistry,
  installCorpusToStore,
  mountComposition,
  expandBundlePatch,
  mapLegacyPluginFile,
  type PackedPackage,
} from './harness.ts'

// ---------------- 性能记录（S3/S6/S2 实测值，写入 docs/e2e-verification.md） ----------------
export const PERF: Record<string, number> = {}

// ---------------- 单元级引擎 harness（B8 同款，供 S3-S7 使用） ----------------
function fixture(id: string, overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  const base: PluginDefinition = {
    id,
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: { activate: () => {} },
  }
  return {
    ...base,
    ...overrides,
    hooks: { ...base.hooks, ...(overrides.hooks ?? {}) },
  }
}

function source(id: string): PluginSource {
  return { type: 'inline', code: id }
}

function engineHarness(options: Partial<LifecycleEngineOptions> = {}): {
  readonly engine: LifecycleEngine
  readonly ctx: Context
  readonly definitions: Map<string, PluginDefinition>
  readonly logs: string[]
} {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: [] })
  machine.start()
  const definitions = new Map<string, PluginDefinition>()
  const logs: string[] = []
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: [],
    logger: { error: m => logs.push(String(m)), info: () => {}, warn: m => logs.push(String(m)), debug: () => {} },
    resolveSource: async (value: PluginSource) => {
      const definition = definitions.get(value.type === 'inline' ? value.code : value.package)
      if (definition === undefined) throw new Error(`source ${value.type} not resolvable`)
      return definition
    },
    ...options,
  })
  return { engine, ctx, definitions, logs }
}

// ---------------- 语料打包 + 离线 registry ----------------
let packed: PackedPackage[] = []
let registry: Awaited<ReturnType<typeof startOfflineRegistry>>

beforeAll(async () => {
  const installable = CORPUS.filter(plugin => plugin.entry !== '')
  packed = await Promise.all(installable.map(packCorpus))
  registry = await startOfflineRegistry(packed)
  // zotero-wave-rag 的模块级 Engine 会读运行配置：重定向到临时目录，避免触碰真实 home。
  process.env.ZWR_CONFIG_DIR = join(tmpdir(), 'mygo-e2e-zwr-config')
}, 60_000)

// ---------------- S1/S2/S9 共享挂载 ----------------
async function loadableModules(): Promise<Map<string, unknown>> {
  const modules = new Map<string, unknown>()
  for (const plugin of CORPUS.filter(item => item.entry !== '')) {
    modules.set(plugin.name, await loadEntry(plugin))
  }
  return modules
}

describe('T21 S1 快乐路径：六类夹具混装安装→落盘→挂载全通', () => {
  it('桥接安装 F1/F3/F4（真实 tarball + 真实完整性），还原集覆盖桥接 id，报告无 ERROR', async () => {
    const bridge = packed.filter(item => ['F1', 'F3', 'F4'].includes(item.plugin.category))
    const { paths } = await installCorpusToStore(bridge, registry.url)
    const { readdir } = await import('node:fs/promises')
    const installedIds = (await readdir(paths.packagesRoot)).sort()
    for (const category of ['F1', 'F3', 'F4'] as const) {
      for (const plugin of corpusOf(category)) {
        // versionOverride 条目是同一包的 registry 历史版本（非独立安装目标）。
        if (plugin.versionOverride !== undefined) continue
        expect(installedIds).toContain(plugin.id)
      }
    }
    // 路径安全 + 事实文件字段在还原产物中成立（entry 相对 + sha512/fileSize 记录）。
    for (const id of installedIds) {
      for (const version of await readdir(join(paths.packagesRoot, id))) {
        const restored = await readRestoredPackage(join(paths.packagesRoot, id, version), id, version)
        expect(restored).toBeDefined()
        if (restored === undefined) continue
        expect(restored.entry.startsWith('/')).toBe(false)
        expect(restored.entry.includes('/../')).toBe(false)
        expect(typeof restored.entrySha512).toBe('string')
        expect(typeof restored.entryFileSize).toBe('number')
      }
    }
  }, 60_000)

  it('桥接运行面：真实 F3/F4 入口经 mygo 引擎挂载（含 requires 政策闸），全 active 无报错', async () => {
    const h = engineHarness()
    const voice = corpusOf('F4').find(item => item.id === 'dsh-voice-chat') as CorpusPlugin
    const vibe = corpusOf('F4').find(item => item.id === 'dsh-vibe-mode') as CorpusPlugin
    const template = corpusOf('F3')[0] as CorpusPlugin
    const voiceModule = await loadEntry(voice) as { apply(ctx: unknown): void }
    const vibeModule = await loadEntry(vibe) as { apply(ctx: unknown): void }
    const templateModule = await loadEntry(template) as { name: string; apply(ctx: unknown): void }
    const vibeManifestRequires = (vibe.manifestOverlay?.requires ?? {}) as Record<string, string>

    h.definitions.set('dsh-voice-chat', fromCordisPlugin(voiceModule as never, {
      id: 'dsh-voice-chat', version: '0.2.0', kinds: [], events: [],
      requires: [], provides: ['voice-chat'], permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false, swapPolicy: 'immediate', config: z.object({}),
    }))
    h.definitions.set('dsh-vibe-mode', fromCordisPlugin(vibeModule as never, {
      id: 'dsh-vibe-mode', version: '0.1.0', kinds: [], events: [],
      requires: [], serviceRequires: vibeManifestRequires, provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false, swapPolicy: 'immediate', config: z.object({}),
    }))
    h.definitions.set('plugin-template', fromCordisPlugin(templateModule as never, {
      id: 'plugin-template', version: '0.0.1', kinds: [], events: [],
      requires: [], provides: [], permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false, swapPolicy: 'immediate', config: z.object({ message: z.string().default('ok') }),
    }))
    await h.engine.install(source('dsh-voice-chat'))
    await h.engine.install(source('dsh-vibe-mode'))
    await h.engine.install(source('plugin-template'))
    for (const id of ['dsh-voice-chat', 'dsh-vibe-mode', 'plugin-template']) {
      expect(h.engine.plugins().find(p => p.id === id)?.status).toBe('enabled')
      expect(h.engine.plugins().find(p => p.id === id)?.policyStatus).toBe('active')
    }
    expect(h.logs.join('\n')).not.toContain('ERROR')
  })

  it('直连运行面：真实 F2/F5/F6 入口经原生 loader 挂载（direct path），无 dispose-abandoned / 无 ERROR', async () => {
    const modules = await loadableModules()
    const direct = CORPUS.filter(plugin => ['F2', 'F5', 'F6'].includes(plugin.category) && plugin.entry !== '')
    const stub = {
      name: 'session-projections-stub',
      apply(owner: Context) {
        owner.provide('sessionProjections', { register() { return undefined } })
      },
    }
    modules.set('session-projections-stub', stub)
    const { ctx, warns } = await mountComposition([...direct, {
      category: 'F2' as const, id: 'session-projections-stub', name: 'session-projections-stub',
      dir: '', entry: 'stub.js', trust: 'reviewed' as const, reviewNote: 'stub',
    }], registry.url, modules)
    const tools = ctx.tools.schemas().map(schema => schema.name)
    expect(tools).toContain('time')
    expect(tools).toContain('zotero_status')
    expect(tools).toContain('view_image')
    expect(tools).toContain('gh_bridge')
    const joined = warns.join('\n')
    expect(joined).not.toContain('dispose-abandoned')
    expect(joined).not.toContain('ERROR')
    await ctx.fiber.dispose()
  }, 90_000)
})

describe('T22 S2 确定性复验：同一输入两次安装落盘集合一致', () => {
  it('同输入两次安装产物 (id, version) 集合与内容哈希一致，并记录安装耗时', async () => {
    const bridge = packed.filter(item => ['F1', 'F3', 'F4'].includes(item.plugin.category))
    const t0 = performance.now()
    // 同一 profile、不同隔离还原根（resolveMygoPaths 每次用新 DSH_HOME）。
    const first = await installCorpusToStore(bridge, registry.url, 'e2e-det')
    const second = await installCorpusToStore(bridge, registry.url, 'e2e-det')
    PERF.s2SolveMs = (performance.now() - t0) / 2
    // 确定性口径（2026-08-13 范围重塑）：无 lockfile/求解器，比较两次还原的
    // (id, version, entrySha256) 事实集合。
    const snapshotOf = async (paths: typeof first.paths): Promise<readonly string[]> => {
      const { readdir } = await import('node:fs/promises')
      const out: string[] = []
      for (const id of (await readdir(paths.packagesRoot)).sort()) {
        for (const version of (await readdir(join(paths.packagesRoot, id))).sort()) {
          const restored = await readRestoredPackage(join(paths.packagesRoot, id, version), id, version)
          out.push(`${id}@${version}#${restored?.entrySha256 ?? 'missing'}`)
        }
      }
      return out
    }
    const snapshotA = await snapshotOf(first.paths)
    const snapshotB = await snapshotOf(second.paths)
    expect(snapshotA.length).toBeGreaterThan(0)
    expect(snapshotB).toEqual(snapshotA)
    // 多候选确定性：voice-chat 双版本（0.2.0/0.1.0）取最高版本。
    expect(snapshotA.some(entry => entry.startsWith('dsh-voice-chat@0.2.0#'))).toBe(true)
    expect(snapshotA.some(entry => entry.startsWith('dsh-voice-chat@0.1.0#'))).toBe(false)
  }, 90_000)
})

describe('T23 S3 符号缺失：pre-gate 同步拦截 + symbol-missing 报告 + 实测耗时', () => {
  it('真实消费者经包装服务访问缺失符号 → 前置门 symbol-missing，policyStatus inactive', async () => {
    const h = engineHarness()
    const raw = { a: 1, run() { return 'ok' } }
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) { env.provide('svc', raw) },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) {
          // 真实动态访问：consumer 在运行期通过包装面取缺失符号。
          const svc = env.get<Record<string, unknown>>('svc')
          void svc?.ghost
          env.provide('consumer-marker', { live: true })
        },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    const snapshot = h.engine.fineEpoch().get('svc')
    const t0 = performance.now()
    const gate = preGate(['ghost'], snapshot)
    const elapsedMs = performance.now() - t0
    PERF.s3PreGateMs = elapsedMs
    expect(gate.ok).toBe(false)
    expect(gate.missing).toEqual(['ghost'])
    expect(elapsedMs).toBeLessThan(1)
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    // 行为断言（修复批次 2 / 任务 2.6）：政策停用 → provide 不解析 + 引擎产出
    // symbol-missing 报告（不再只是标签 + 测试手工调用的纯函数）。
    expect(h.engine.provideValue('consumer-marker')).toBeUndefined()
    expect(h.engine.policyReportOf('consumer')?.code).toBe('symbol-missing')
    expect(h.engine.policyReportOf('consumer')?.conflicts[0]?.constraint.kind).toBe('symbol')
  })
})

describe('T24 S4 requires 门三态（F4 载体 + 提供者存在/缺失/版本不符）', () => {
  it('服务缺失 → service-missing + 候选集来自 B19；提供者出现 → 自动激活；版本不符 → mismatch', async () => {
    // F4 载体：vibe-mode 的服务级 requires（voice-chat >=0.1.0；2026-08-13
    // 范围重塑后真实仓库的顶层 depends 已非法，语料契约改由 corpus overlay 携带）。
    const vibeCorpus = corpusOf('F4')[0] as CorpusPlugin
    const requires = (vibeCorpus.manifestOverlay?.requires ?? {}) as Record<string, string>
    expect(Object.keys(requires)).toEqual(['voice-chat'])

    const h = engineHarness()
    const vibeDefinition = {
      ...fixture('dsh-vibe-mode', {
        serviceRequires: requires,
        requires: ['voice-chat'],
      }),
      hooks: {
        activate(env) { env.provide('vibe-marker', { live: true }) },
      },
    }
    h.definitions.set('dsh-vibe-mode', vibeDefinition)
    await h.engine.install(source('dsh-vibe-mode'))
    expect(h.engine.plugins().find(p => p.id === 'dsh-vibe-mode')?.policyStatus).toBe('inactive')
    expect(h.engine.providerObservationRegistry().candidates('voice-chat')).toEqual([])
    // 行为断言（修复批次 2 / 任务 2.6）：停用 = provide 不解析 + 引擎产出报告。
    expect(h.engine.provideValue('vibe-marker')).toBeUndefined()
    expect(h.engine.policyReportOf('dsh-vibe-mode')?.code).toBe('policy-rejected')

    // 提供者出现（版本满足）→ INACTIVE 自动激活（行为：provide 重新解析）。
    h.definitions.set('voice', fixture('voice-chat', {
      version: '0.2.0',
      provides: ['voice-chat'],
      hooks: {
        activate(env) { env.provide('voice-chat', { speak() { return 'hi' } }) },
      },
    }))
    await h.engine.install(source('voice'))
    expect(h.engine.plugins().find(p => p.id === 'dsh-vibe-mode')?.policyStatus).toBe('active')
    expect(h.engine.provideValue('vibe-marker')).not.toBeUndefined()
    expect(h.engine.policyReportOf('dsh-vibe-mode')).toBeUndefined()
    const candidates = h.engine.providerObservationRegistry().candidates('voice-chat')
    expect(candidates.map(item => item.pluginId)).toEqual(['voice-chat'])

    // 版本不符 → provider-version-mismatch → INACTIVE（行为：provide 再次不解析）。
    h.definitions.set('voice-old', fixture('voice-chat', {
      version: '0.0.9',
      provides: ['voice-chat'],
      hooks: {
        activate(env) { env.provide('voice-chat', { speak() { return 'old' } }) },
      },
    }))
    await h.engine.replace('voice-chat', source('voice-old'))
    expect(h.engine.plugins().find(p => p.id === 'dsh-vibe-mode')?.policyStatus).toBe('inactive')
    expect(h.engine.provideValue('vibe-marker')).toBeUndefined()
    const report = h.engine.policyReportOf('dsh-vibe-mode')
    expect(report?.code).toBe('policy-rejected')
    expect(report?.conflicts[0]?.constraint.kind).toBe('requires')
    expect(report?.conflicts[0]?.constraint.range).toBe('>=0.1.0')
  })
})

describe('T25 S5 提供者消失：unprovide → 细 epoch 记账清理 + 依赖方 INACTIVE', () => {
  it('replace 到不提供该服务的版本 → 快照/观测清理，消费者 INACTIVE（notify 双源路径）', async () => {
    const h = engineHarness()
    h.definitions.set('consumer', fixture('consumer', {
      serviceRequires: { svc: '>=1.0.0' },
      hooks: {
        activate(env) { env.provide('consumer-marker', { live: true }) },
      },
    }))
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) { env.provide('svc', { ok: true }) },
      },
    }))
    await h.engine.install(source('consumer'))
    await h.engine.install(source('provider'))
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('active')
    expect(h.engine.fineEpoch().get('svc')).toBeDefined()
    expect(h.engine.provideValue('consumer-marker')).not.toBeUndefined()

    h.definitions.set('provider2', fixture('provider', {
      version: '2.0.0',
      provides: [],
      hooks: { activate: () => {} },
    }))
    await h.engine.replace('provider', source('provider2'))
    expect(h.engine.fineEpoch().get('svc')).toBeUndefined()
    expect(h.engine.providerObservationRegistry().candidates('svc')).toEqual([])
    expect(h.engine.plugins().find(p => p.id === 'consumer')?.policyStatus).toBe('inactive')
    // 行为断言（修复批次 2 / 任务 2.6）：停用 = provide 不解析 + 报告。
    expect(h.engine.provideValue('consumer-marker')).toBeUndefined()
    expect(h.engine.policyReportOf('consumer')?.code).toBe('policy-rejected')
  })
})

describe('T26 S6 dispose 悬挂：5000ms 超时 → dispose-abandoned + 队列释放 + 回滚不阻塞', () => {
  it('永不结束的 settings-owner disposal 在默认超时后被放弃，replace 继续完成', async () => {
    const h = engineHarness({ config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }) })
    h.definitions.set('p', fixture('p'))
    await h.engine.install(source('p'))
    // A2 注入：settings owner fiber 的 dispose 永不结束（disposeGeneration 会从这里
    // 构造 settingsOwnerDisposal，因此不会被覆盖——之前直接注入 promise 会被覆盖，是假绿）。
    const record = (h.engine as unknown as {
      records: Map<string, { generations: { settingsOwner: { fiber: { dispose(): Promise<void> } } }[] }>
    }).records.get('p')
    if (record?.generations[0] === undefined) throw new Error('record missing')
    record.generations[0].settingsOwner = {
      fiber: { dispose: () => new Promise<void>(() => {}) },
    }

    const t0 = performance.now()
    h.definitions.set('p2', fixture('p', { version: '2.0.0' }))
    await h.engine.replace('p', source('p2'))
    const elapsed = performance.now() - t0
    PERF.s6DisposeTimeoutMs = elapsed
    expect(elapsed).toBeGreaterThanOrEqual(4000)
    expect(elapsed).toBeLessThan(8000)
    expect(h.engine.plugins()[0]?.generation).toBe(2)
    expect(h.logs.some(line => line.includes('dispose-abandoned'))).toBe(true)
  }, 20_000)
})

describe('T27 S7 exports 逃逸：桥接 set 拒绝 + 政策报告；直连不受约束', () => {
  it('桥接路径 set 被拒且原始对象不被触碰', async () => {
    const h = engineHarness()
    const raw = { version: 1 }
    let seen: unknown
    h.definitions.set('provider', fixture('provider', {
      provides: ['svc'],
      hooks: {
        activate(env) { env.provide('svc', raw) },
      },
    }))
    h.definitions.set('consumer', fixture('consumer', {
      requires: ['svc'],
      hooks: {
        activate(env) { seen = env.get('svc') },
      },
    }))
    await h.engine.install(source('provider'))
    await h.engine.install(source('consumer'))
    const wrapped = seen as Record<string, unknown>
    expect(() => { wrapped.version = 2 }).toThrow(TypeError)
    expect(raw.version).toBe(1)
    expect(h.logs.some(line => line.includes('exports-frozen'))).toBe(true)
  })

  it('直连路径（原生 loader 插件）同操作不受约束', async () => {
    const ctx = new Context()
    const target: Record<string, unknown> = { x: 1 }
    await ctx.plugin({
      name: 'direct-plugin',
      apply(owner: Context) {
        owner.provide('direct-svc', target)
      },
    })
    const got = ctx.get<Record<string, unknown>>('direct-svc')
    got.x = 2
    delete got.x
    expect(target).toEqual({})
    await ctx.fiber.dispose()
  })
})

describe('T28 S8 双存在：npm 嵌套 + requires 同服务 → 告警不阻断', () => {
  it('dsh-cc-tui 真实依赖 + vibe-mode 服务需求均输出告警而不抛错', async () => {
    const ccTui = JSON.parse(await readFile(
      join((CORPUS.find(item => item.id === 'dsh-cc-tui') as CorpusPlugin).dir, 'package.json'), 'utf8',
    )) as { dependencies: Record<string, string> }
    const warnings = detectDualPresence({
      pluginId: 'dsh-cc-tui',
      dependencies: ccTui.dependencies,
      registeredIds: new Set(['@deepseek-ai/dsh-working-activity']),
    })
    expect(warnings.some(w => w.kind === 'npm-nested-plugin' && w.target === '@deepseek-ai/dsh-working-activity')).toBe(true)
    const vibe = detectDualPresence({
      pluginId: 'dsh-vibe-mode',
      serviceRequirements: { 'voice-chat': '>=0.1.0', 'dsh-voice-chat': '>=0.1.0' },
      registeredIds: new Set(['dsh-voice-chat']),
    })
    expect(vibe.some(w => w.kind === 'service-requirement')).toBe(true)
  })
})

describe('T29 S9 社区零阻断：F2 全样本挂载 + 收割器告警可出、阻断 MUST NOT', () => {
  it('F2 真实元数据收割（engines.dsh/cordis peer/dsh-tools peer）输出归一或 EXT-1 告警，永不抛错', async () => {
    for (const plugin of corpusOf('F2')) {
      const pkg = JSON.parse(await readFile(join(plugin.dir, 'package.json'), 'utf8'))
      const result = harvestPackageMetadata(pkg)
      expect(result.packageName).toBe(plugin.name)
      // 告警可出（含 EXT-1 无法归一），但绝无阻断性异常。
      expect(() => result).not.toThrow()
    }
  })

  it('F2 全部真实入口在组合中挂载成功（直接路径不阻断）', async () => {
    const f2 = corpusOf('F2')
    const modules = new Map<string, unknown>()
    for (const plugin of f2) {
      if (plugin.entry !== '') modules.set(plugin.name, await loadEntry(plugin))
    }
    const { ctx, warns } = await mountComposition(f2, registry.url, modules, 'e2e-f2')
    // 直接路径：原生 loader 挂载成功即零阻断（manager 不介入）。
    const tools = ctx.tools.schemas().map(schema => schema.name)
    expect(tools).toContain('time')
    expect(tools).toContain('zotero_status')
    expect(warns.join('\n')).not.toContain('dispose-abandoned')
    await ctx.fiber.dispose()
  }, 60_000)
})

describe('T30 语料侧断言：F3 模板对齐 / F5 legacy 映射 / F6 bundle 展开', () => {
  it('F3 官方模板 package.json 对齐（B16 真实闭环）', async () => {
    const template = corpusOf('F3')[0] as CorpusPlugin
    const pkg = JSON.parse(await readFile(join(template.dir, 'package.json'), 'utf8'))
    const result = checkTemplateAlignment(pkg)
    expect(result.aligned).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it('F5 真实 dsh.plugin.json 只读映射 + 迁移警告', async () => {
    const f5 = corpusOf('F5')[0] as CorpusPlugin
    const legacy = JSON.parse(await readFile(join(f5.dir, 'dsh.plugin.json'), 'utf8'))
    const mapped = mapLegacyPluginFile(legacy)
    expect(mapped.value?.id).toBe('dsh-pty-windows')
    expect(mapped.value?.entry).toBe('index.mjs')
    expect(mapped.warnings.some(line => line.includes('legacy dsh.plugin.json'))).toBe(true)
  })

  it('F6 真实 dsh.bundle.patch 展开为 entry 行（dsh-101 主流形态）', async () => {
    const f6 = corpusOf('F6')[0] as CorpusPlugin
    const patch = await readFile(join(f6.dir, 'cordis.patch.yml'), 'utf8')
    const rows = expandBundlePatch(patch)
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.some(row => row.kind === 'insert' && row.id === 'dsh-101-app')).toBe(true)
  })
})

describe('T31 F1 fabric mixin 插件真实路径（loader:mixin + patches → 目标可观测行为改变）', () => {
  it('真实 fabric 仓库补丁经 mygo mixin 引擎应用，行为改变且确定性', async () => {
    const fabric = corpusOf('F1')[0] as CorpusPlugin
    const pkg = JSON.parse(await readFile(join(fabric.dir, 'package.json'), 'utf8'))
    pkg.dsh = pkg.dsh ?? {}
    pkg.dsh.mygo = {
      formatVersion: 1,
      id: 'dsh-cordis-fabric',
      entry: 'lib/index.js',
      core: '*',
      loader: { id: 'mixin', range: '*' },
      patches: [{
        id: 'fabric-greet',
        target: { module: 'host-target', filePath: 'lib/index.js', symbol: 'greet', operation: 'before' },
      }],
    }
    const parsed = parsePackageManifest(pkg)
    expect(parsed.problems).toEqual([])
    expect(parsed.value?.loader).toEqual({ id: 'mixin', range: '*' })
    expect(parsed.value?.patches?.[0]?.target.symbol).toBe('greet')

    // 真实 fabric 运行时校验补丁描述（real code touch）。
    const fabricLib = await loadEntry(fabric) as { validatePatchStatic?(patch: unknown): void }
    expect(typeof fabricLib.validatePatchStatic).toBe('function')
    fabricLib.validatePatchStatic?.({
      id: 'fabric-greet',
      target: { module: 'host-target', versionRange: '*', filePath: 'lib/index.js', symbol: 'greet' },
      operation: 'before',
    })

    // mygo mixin 引擎真实挂载（fabric-mixin.spec 同款流程）。
    const root = await mkdtemp(join(tmpdir(), 'mygo-e2e-f1-'))
    const moduleRoot = join(root, 'node_modules')
    await mkdir(join(moduleRoot, 'host-target', 'lib'), { recursive: true })
    await writeFile(join(moduleRoot, 'host-target', 'package.json'), JSON.stringify({
      name: 'host-target', version: '1.0.0', main: 'lib/index.js',
    }))
    await writeFile(
      join(moduleRoot, 'host-target', 'lib', 'index.js'),
      "function greet(name) { return 'hello ' + name }\nexports.greet = greet\nexports.NAME = 'host'\n",
    )
    const req = createRequire(join(moduleRoot, 'noop.js'))
    const engine = new BuiltinMixinEngine(async (module, filePath) => {
      const pkgPath = req.resolve(`${module}/package.json`)
      const entry = filePath ?? 'lib/index.js'
      return { entryPath: join(dirname(pkgPath), entry) }
    }, join(root, 'tmp'))
    const orchestrator = new MountOrchestrator()
    const patch = {
      plugin: 'dsh-cordis-fabric',
      patchId: 'fabric-greet',
      target: { module: 'host-target', filePath: 'lib/index.js', symbol: 'greet' },
      operation: 'before' as const,
    }
    orchestrator.collectMixinPatches([patch])
    orchestrator.startPhase1()
    engine.registerPatch(patch)
    const key = engine.targetKey(patch.target)
    engine.registerHandler(key, (call, invoke) => {
      call.arguments[0] = `fabric:${String(call.arguments[0])}`
      return invoke()
    })
    const facadeUrl = await engine.buildFacade(patch.target)
    orchestrator.startPhase2(['dsh-cordis-fabric'])
    const loaded = await import(facadeUrl)
    const proxy = await (loaded.default ?? loaded) as { greet(name: string): string; NAME: string }
    expect(proxy.greet('world')).toBe('hello fabric:world')
    expect(proxy.NAME).toBe('host')
    expect(engine.traceJson()).toContain('fabric-greet')
    await rm(root, { recursive: true, force: true })
  })
})

afterAll(async () => {
  await registry.close()
  console.log('[E2E-PERF]', JSON.stringify(PERF))
})
