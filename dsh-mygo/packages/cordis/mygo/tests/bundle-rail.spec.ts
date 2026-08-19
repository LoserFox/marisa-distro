/**
 * P3 bundle rail: patch parsing, companion blocks, atomic manifest writes,
 * `dsh plugin` forwarding through a fake CLI, and cross-rail solving.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'
import {
  BundleRail,
  DispatchMachine,
  InMemoryRegistryStore,
  LifecycleEngine,
  resolvePluginManagerConfig,
  writeLiveBlock,
} from '@r05en1cu/dsh-mygo'

interface Fixture {
  readonly dshHome: string
  readonly checkout: string
  readonly profile: string
  readonly rail: BundleRail
  readonly cliCalls: string[][]
}

function fixture(): Fixture {
  const dshHome = mkdtempSync(join(tmpdir(), 'mygo-bundle-'))
  const checkout = mkdtempSync(join(tmpdir(), 'mygo-bundle-checkout-'))
  const profile = 'web'
  const profileDir = join(dshHome, 'profiles', profile)
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  }, null, 2))
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# user layer\n')
  const binDir = join(checkout, 'bin')
  mkdirSync(binDir, { recursive: true })
  const cliCalls: string[][] = []
  writeFileSync(join(binDir, 'dsh'), [
    '#!/usr/bin/env node',
    "const calls = JSON.parse(process.env.MYGO_CLI_CALLS ?? '[]')",
    "calls.push(process.argv.slice(2))",
    "process.env.MYGO_CLI_CALLS = JSON.stringify(calls)",
    'const fs = require("node:fs")',
    'const path = require("node:path")',
    'const home = process.env.MYGO_DSH_HOME',
    'const manifest = path.join(home, "profiles", process.env.MYGO_PROFILE ?? "web", "package.json")',
    'const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"))',
    'const args = process.argv.slice(2)',
    'const addIdx = args.indexOf("add")',
    'if (addIdx !== -1) {',
    '  const spec = args[addIdx + 1]',
    '  const name = spec.replace(/^github:/, "").replace(/^git\\+/, "").split("#")[0].replace(/@[^@/]+$/, "")',
    '  pkg.dependencies = { ...pkg.dependencies, [name]: "1.0.0" }',
    '  if (!(pkg.dsh.profile.bundles || []).includes(name)) pkg.dsh.profile.bundles.push(name)',
    '}',
    'const rmIdx = args.indexOf("remove")',
    'if (rmIdx !== -1) {',
    '  const name = args[rmIdx + 1]',
    '  delete pkg.dependencies[name]',
    '  pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles || []).filter((entry) => entry !== name)',
    '}',
    'fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2))',
  ].join('\n'), { mode: 0o755 })
  const rail = new BundleRail({ dshHome, profile, checkout })
  return { dshHome, checkout, profile, rail, cliCalls }
}

function writeBundle(
  f: Fixture,
  packageName: string,
  overrides: {
    readonly version?: string
    readonly patch?: string
    readonly mygoCompat?: Record<string, Record<string, string>>
    readonly provides?: readonly string[]
  } = {},
): void {
  const dir = join(f.dshHome, 'profiles', f.profile, 'node_modules', packageName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: packageName,
    version: overrides.version ?? '1.0.0',
    main: 'index.js',
    dsh: {
      bundle: { patch: 'cordis.patch.yml' },
      ...(overrides.mygoCompat === undefined && overrides.provides === undefined
        ? {}
        : {
            mygo: {
              ...(overrides.mygoCompat === undefined ? {} : { compatibility: overrides.mygoCompat }),
              ...(overrides.provides === undefined ? {} : { provides: overrides.provides }),
            },
          }),
    },
  }, null, 2))
  writeFileSync(join(dir, 'cordis.patch.yml'), overrides.patch ?? `
- insert:
    - id: ${packageName.replace(/^@[^/]+\//, '')}-row
      name: 'placeholder'
`)
}

function declareInstalled(f: Fixture, packageName: string, listed = true): void {
  const path = join(f.dshHome, 'profiles', f.profile, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [packageName]: '1.0.0' }
  if (listed) pkg.dsh.profile.bundles = [...(pkg.dsh.profile.bundles ?? []), packageName]
  writeFileSync(path, JSON.stringify(pkg, null, 2))
}

describe('bundle rail primitives', () => {
  it('parses insert / override / disable patch facts', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle', {
      patch: `
- insert:
    - id: test-row
      name: 'x'
- id: host-row
  disabled: true
- id: host-config
  config: { a: 1 }
`,
    })
    const member = f.rail.readMember('@dsh-external/test-bundle', true)
    expect(member?.patchFacts).toEqual([
      { rowId: 'test-row', kind: 'insert' },
      { rowId: 'host-row', kind: 'disable' },
      { rowId: 'host-config', kind: 'override' },
    ])
    expect(member?.hostConflicts).toEqual(['禁用宿主行 host-row', '改写宿主行 host-config'])
  })

  it('writes and removes the companion block atomically', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle')
    declareInstalled(f, '@dsh-external/test-bundle', true)
    const member = f.rail.members()[0]
    expect(member).toBeDefined()
    expect(f.rail.hasCompanion('test-bundle')).toBe(false)
    f.rail.disable('test-bundle')
    expect(f.rail.hasCompanion('test-bundle')).toBe(true)
    const text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('- id: test-bundle-row\n  disabled: true')
    expect(f.rail.members()[0]?.enabled).toBe(false)
    f.rail.enable('test-bundle')
    expect(f.rail.hasCompanion('test-bundle')).toBe(false)
    expect(f.rail.members()[0]?.enabled).toBe(true)
  })

  it('占位 [] 文档：disable 追加块时摘除 []，enable 摘除块后回落 []', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle')
    declareInstalled(f, '@dsh-external/test-bundle', true)
    const patchFile = join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml')
    writeFileSync(patchFile, '# 用户层注释\n[]\n', 'utf8')
    f.rail.disable('test-bundle')
    const afterDisable = readFileSync(patchFile, 'utf8')
    expect(afterDisable).toContain('- id: test-bundle-row\n  disabled: true')
    expect(afterDisable.trim().startsWith('[]')).toBe(false)
    f.rail.enable('test-bundle')
    const afterEnable = readFileSync(patchFile, 'utf8')
    expect(afterEnable).not.toContain('mygo bundle disable block')
    expect(afterEnable.trimEnd().endsWith('[]')).toBe(true)
  })

  it('live rail 在管的包：members() 标 live 且 enabled 反映真实激活态（r7 P4 回归）', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/live-bundle')
    writeBundle(f, '@dsh-external/plain-dep')
    // live 轨：dependency 但不在 bundles（单轨），patch 层有受管块
    declareInstalled(f, '@dsh-external/live-bundle', false)
    declareInstalled(f, '@dsh-external/plain-dep', false)
    const bundleDir = join(f.dshHome, 'profiles', 'web', 'node_modules', '@dsh-external', 'live-bundle')
    expect(writeLiveBlock(f.dshHome, 'web', '@dsh-external/live-bundle', bundleDir).ok).toBe(true)
    const members = f.rail.members()
    const live = members.find(member => member.id === 'live-bundle')
    expect(live?.live).toBe(true)
    expect(live?.enabled).toBe(true)
    // 无 live 块也未列入 bundles 的依赖维持 disabled（行为不变）
    const plain = members.find(member => member.id === 'plain-dep')
    expect(plain?.live).toBeUndefined()
    expect(plain?.enabled).toBe(false)
    // companion disable 块对 live 成员照常生效
    f.rail.disable('live-bundle')
    expect(f.rail.members().find(member => member.id === 'live-bundle')?.enabled).toBe(false)
  })

  it('forwards install/uninstall through the official CLI', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle')
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    try {
      const member = f.rail.install('@dsh-external/test-bundle@1.0.0')
      expect(member.packageName).toBe('@dsh-external/test-bundle')
      expect(f.rail.members().some(entry => entry.id === 'test-bundle')).toBe(true)
      f.rail.uninstall('test-bundle')
      expect(f.rail.members().some(entry => entry.id === 'test-bundle')).toBe(false)
    } finally {
      process.env = env
    }
  })

  it('add 成功但 member 解析失败：回滚 remove，deps/bundles 不留残（rc8 P4）', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/broken-bundle')
    // exports 缺 ./package.json 子路径 → resolveBundleDir 解析失败（P6 e2e
    // 实测形态）→ member 解析失败必须回滚
    const pkgPath = join(f.dshHome, 'profiles', 'web', 'node_modules', '@dsh-external', 'broken-bundle', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    pkg.exports = { '.': './index.js' }
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    try {
      expect(() => f.rail.install('@dsh-external/broken-bundle@1.0.0')).toThrow('未能在 profile 中找到 bundle')
      const manifest = JSON.parse(readFileSync(join(f.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as {
        readonly dependencies?: Record<string, string>
        readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
      }
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@dsh-external/broken-bundle')
      expect(manifest.dsh?.profile?.bundles ?? []).not.toContain('@dsh-external/broken-bundle')
    } finally {
      process.env = env
      rmSync(f.dshHome, { recursive: true, force: true })
      rmSync(f.checkout, { recursive: true, force: true })
    }
  })

  it('merges dsh.bundle.requires/breaks into compatibility', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/compat-bundle', {
      mygoCompat: { depends: { alpha: '>=1.0.0' } },
    })
    declareInstalled(f, '@dsh-external/compat-bundle', true)
    const member = f.rail.members()[0]
    expect(member?.compatibility).toEqual({ depends: { alpha: '>=1.0.0' } })
  })

  it('enables opt-in rows (insert with disabled: true) via an enable block', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/opt-in-bundle', {
      patch: `
- insert:
    - id: opt-row-a
      name: 'a'
      disabled: true
    - id: opt-row-b
      name: 'b'
`,
    })
    declareInstalled(f, '@dsh-external/opt-in-bundle', true)
    const member = f.rail.members()[0]
    expect(member?.patchFacts).toEqual([
      { rowId: 'opt-row-a', kind: 'insert', disabled: true },
      { rowId: 'opt-row-b', kind: 'insert' },
    ])
    expect(member?.enabled).toBe(true)
    f.rail.disable('opt-in-bundle')
    expect(f.rail.members()[0]?.enabled).toBe(false)
    f.rail.enable('opt-in-bundle')
    expect(f.rail.members()[0]?.enabled).toBe(true)
    const text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
    expect(text).toContain('- id: opt-row-a\n  disabled: false')
    expect(text).not.toContain('- id: opt-row-b\n  disabled: false')
    expect(text).not.toContain('mygo bundle disable block')
  })

  it('detects host replacements from defaults and declarations', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/rdb-like', {
      patch: `
- insert:
    - id: session-persistence-rdb
      name: 'x'
`,
      mygoCompat: {},
    })
    declareInstalled(f, '@dsh-external/rdb-like', true)
    const member = f.rail.members()[0]
    expect(member?.hostDisables).toEqual(['session-persistence-jsonl'])
    expect(member?.hostConflicts).toContain('替换宿主行 session-persistence-jsonl')
  })

  it('writes the host block on install, restores it on enable, removes it on disable/uninstall', () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/rdb-like', {
      patch: `
- insert:
    - id: session-persistence-rdb
      name: 'x'
`,
    })
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    try {
      f.rail.install('@dsh-external/rdb-like@1.0.0')
      let text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
      expect(text).toContain('mygo bundle host block')
      expect(text).toContain('- id: session-persistence-jsonl\n  disabled: true')
      f.rail.disable('rdb-like')
      text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
      expect(text).not.toContain('mygo bundle host block')
      expect(text).toContain('mygo bundle disable block')
      f.rail.enable('rdb-like')
      text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
      expect(text).toContain('mygo bundle host block')
      expect(text).not.toContain('mygo bundle disable block')
      f.rail.uninstall('rdb-like')
      text = readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
      expect(text).not.toContain('mygo bundle host block')
      expect(text).not.toContain('mygo bundle disable block')
    } finally {
      process.env = env
    }
  })
})

describe('bundle rail unified graph', () => {
  function plugin(id: string, compatibility?: Record<string, Record<string, string>>): PluginDefinition {
    return {
      id,
      version: '1.0.0',
      kinds: ['fixture'],
      requires: [],
      provides: [],
      permissions: { observe: [], transform: [], intercept: [], position: 'derived', claims: [] },
      stateful: false,
      swapPolicy: 'immediate',
      config: z.object({}),
      ...(compatibility === undefined ? {} : { compatibility }),
      hooks: { activate: () => {} },
    }
  }

  function source(id: string): PluginSource {
    return { type: 'inline', code: id }
  }

  it('enable plan rejects a bridge plugin whose compat-depends bundle is disabled (no cascade)', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle')
    declareInstalled(f, '@dsh-external/test-bundle', true)

    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('alpha', plugin('alpha', { depends: { 'test-bundle': '>=1.0.0' } }))
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
      bundleRail: f.rail,
    })
    await engine.install(source('alpha'))
    await engine.bundleSetEnabled('test-bundle', false, true)
    // 求解器级联已删除（2026-08-13 范围重塑）：bundle 停用不连带停用 alpha，
    // 显式停用后 enable 预览按兼容预检拒绝（depends 目标已停用）。
    await engine.disable('alpha')
    const plan = await engine.plan({ op: 'enable', id: 'alpha' })
    expect(plan.accepted).toBe(false)
    expect(plan.error?.code).toBe('compatibility-conflict')
    await engine.bundleSetEnabled('test-bundle', true)
    expect(f.rail.members()[0]?.enabled).toBe(true)
    await engine.enable('alpha')
    expect(engine.plugins().find(handle => handle.id === 'alpha')?.status).toBe('enabled')
    rmSync(f.dshHome, { recursive: true, force: true })
    rmSync(f.checkout, { recursive: true, force: true })
  })

  it('blocks disabling a bundle whose provided service has an enabled requires-dependent; force overrides', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/test-bundle', { provides: ['bundle-svc'] })
    declareInstalled(f, '@dsh-external/test-bundle', true)

    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const definitions = new Map<string, PluginDefinition>()
    definitions.set('alpha', { ...plugin('alpha'), requires: ['bundle-svc'] })
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: async (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : source.package)
        if (definition === undefined) throw new Error('missing')
        return definition
      },
      bundleRail: f.rail,
    })
    await engine.install(source('alpha'))
    await expect(engine.bundleSetEnabled('test-bundle', false)).rejects.toMatchObject({
      code: 'dependent-exists',
    })
    await engine.bundleSetEnabled('test-bundle', false, true)
    expect(f.rail.members()[0]?.enabled).toBe(false)
    // 级联停用已删除：下游保持 enabled，由调用方显式处理。
    expect(engine.plugins().find(handle => handle.id === 'alpha')?.status).toBe('enabled')
    rmSync(f.dshHome, { recursive: true, force: true })
    rmSync(f.checkout, { recursive: true, force: true })
  })

  it('rolls back a verified bundle install when its activation is rejected', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/bad-bundle', {
      mygoCompat: { depends: { missing: '>=1.0.0' } },
    })
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    const ctx = new Context()
    const store = new InMemoryRegistryStore()
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store,
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      bundleRail: f.rail,
    })
    try {
      await expect(engine.bundleInstall('@dsh-external/bad-bundle@1.0.0')).rejects.toMatchObject({
        code: 'compatibility-conflict',
      })
      expect(f.rail.members().some(entry => entry.id === 'bad-bundle')).toBe(false)
    } finally {
      process.env = env
      rmSync(f.dshHome, { recursive: true, force: true })
      rmSync(f.checkout, { recursive: true, force: true })
    }
  })

  /**
   * r7 e2e 抓出的自撞假阳性回归：预检必须先移出 bundles 再离线组合，
   * 否则组合树已含新 bundle 自己的行，任何安装都被误判撞车拒绝。
   */
  function healAppBoot(f: Fixture): void {
    const anchor = new URL('../../loaders/mygo-loader-profile/package.json', import.meta.url)
    const appBootDir = dirname(createRequire(anchor).resolve('@deepseek-ai/dsh-app-boot/package.json'))
    const scopeDir = join(f.dshHome, 'profiles', 'node_modules', '@deepseek-ai')
    mkdirSync(scopeDir, { recursive: true })
    symlinkSync(appBootDir, join(scopeDir, 'dsh-app-boot'))
  }

  function liveEngine(f: Fixture): LifecycleEngine {
    const ctx = new Context()
    // loader 桩：live 块落盘后才视为已挂载（verifyEntryState 首轮即过；
    // 冻结层守卫依赖「写块前条目不活跃」）。
    ctx.provide('loader', {
      *entries() {
        const patchFile = join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml')
        const text = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
        if (text.includes('live-ok-row')) yield { id: 'include:live-ok-row', fiber: {} }
      },
    })
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    return new LifecycleEngine({
      ctx,
      dispatch: machine,
      store: new InMemoryRegistryStore(),
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      bundleRail: f.rail,
    })
  }

  it('live rail 安装：预检在单轨切换后跑（不自撞），成功切 live 轨', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/live-ok')
    writeFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), '[]\n', 'utf8')
    healAppBoot(f)
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    const engine = liveEngine(f)
    try {
      const result = await engine.bundleInstall('@dsh-external/live-ok@1.0.0')
      expect(result.activated).toBe('live')
      // 单轨：包退出 bundles，live 受管块接管物化
      const manifest = JSON.parse(readFileSync(join(f.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as {
        readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
      }
      expect(manifest.dsh?.profile?.bundles ?? []).not.toContain('@dsh-external/live-ok')
      expect(readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8'))
        .toContain('# >>> mygo live block: @dsh-external/live-ok')
    } finally {
      process.env = env
      rmSync(f.dshHome, { recursive: true, force: true })
      rmSync(f.checkout, { recursive: true, force: true })
    }
  })

  it('live rail 预检拒绝：与既有 bundle 行撞 id → 回滚干净（deps/bundles/块全无）', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/existing', {
      patch: "- insert:\n    - id: same-row\n      name: 'existing-plugin'\n",
    })
    declareInstalled(f, '@dsh-external/existing', true)
    writeBundle(f, '@dsh-external/challenger', {
      patch: "- insert:\n    - id: same-row\n      name: 'challenger-plugin'\n",
    })
    writeFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), '[]\n', 'utf8')
    healAppBoot(f)
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    const engine = liveEngine(f)
    try {
      await expect(engine.bundleInstall('@dsh-external/challenger@1.0.0')).rejects.toMatchObject({
        code: 'compatibility-conflict',
      })
      const manifest = JSON.parse(readFileSync(join(f.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as {
        readonly dependencies?: Record<string, string>
        readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
      }
      expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@dsh-external/challenger')
      expect(manifest.dsh?.profile?.bundles ?? []).not.toContain('@dsh-external/challenger')
      expect(readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')).not.toContain('challenger')
    } finally {
      process.env = env
      rmSync(f.dshHome, { recursive: true, force: true })
      rmSync(f.checkout, { recursive: true, force: true })
    }
  })

  it('冻结层守卫：行已被 boot 轨物化（重复安装）时保持 boot 轨、不写 live 块（rc8 e2e 修复）', async () => {
    const f = fixture()
    writeBundle(f, '@dsh-external/live-ok')
    writeFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), '[]\n', 'utf8')
    healAppBoot(f)
    const env = process.env
    process.env = { ...env, MYGO_DSH_HOME: f.dshHome, MYGO_PROFILE: f.profile, MYGO_CLI_CALLS: '[]' }
    // loader 桩：行自始至终活跃（模拟 frozen bundlePatches 已物化该包）。
    const ctx = new Context()
    ctx.provide('loader', {
      *entries() {
        yield { id: 'include:live-ok-row', fiber: {} }
      },
    })
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    const engine = new LifecycleEngine({
      ctx,
      dispatch: machine,
      store: new InMemoryRegistryStore(),
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      bundleRail: f.rail,
    })
    try {
      const result = await engine.bundleInstall('@dsh-external/live-ok@1.0.0')
      expect(result.activated).toBe('live')
      const manifest = JSON.parse(readFileSync(join(f.dshHome, 'profiles', 'web', 'package.json'), 'utf8')) as {
        readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
      }
      // 单轨落在 boot 轨：bundles 保留该包，patch 层无 live 块
      expect(manifest.dsh?.profile?.bundles ?? []).toContain('@dsh-external/live-ok')
      expect(readFileSync(join(f.dshHome, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')).not.toContain('mygo live block')
    } finally {
      process.env = env
      rmSync(f.dshHome, { recursive: true, force: true })
      rmSync(f.checkout, { recursive: true, force: true })
    }
  })
})

describe('rc.3 planState 去重（重复 id 修复）', () => {
  function plugin(id: string): PluginDefinition {
    return {
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
  }

  function source(id: string): PluginSource {
    return { type: 'inline', code: id }
  }

  function engine(f: Fixture, definitions: Map<string, PluginDefinition>): LifecycleEngine {
    const ctx = new Context()
    const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
    machine.start()
    return new LifecycleEngine({
      ctx,
      dispatch: machine,
      store: new InMemoryRegistryStore(),
      config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
      resolveSource: (source: PluginSource) => {
        const definition = definitions.get(source.type === 'inline' ? source.code : '')
        if (definition === undefined) return Promise.reject(new Error('missing'))
        return Promise.resolve(definition)
      },
      bundleRail: f.rail,
    })
  }

  it('管理器包同为 bundle 成员（id=dsh-mygo）时 plan/disable 不再抛 duplicate', async () => {
    const f = fixture()
    // @r05en1cu/dsh-mygo 的成员 id 恰为 MYGO_MANAGER_ID——bundle 真相源
    // 与管理器自描述重叠（事故复现面）。
    writeBundle(f, '@r05en1cu/dsh-mygo')
    declareInstalled(f, '@r05en1cu/dsh-mygo', true)
    const definitions = new Map([['alpha', plugin('alpha')]])
    const eng = engine(f, definitions)
    await eng.install(source('alpha'))
    // 修复前：planOperation 的 assertUniqueIds 抛 plan input has duplicate plugin id dsh-mygo
    const plan = await eng.plan({ op: 'disable', id: 'alpha' })
    expect(plan.accepted).toBe(true)
    await eng.disable('alpha')
    expect(eng.plugins().find(handle => handle.id === 'alpha')?.status).toBe('disabled')
    rmSync(f.dshHome, { recursive: true, force: true })
    rmSync(f.checkout, { recursive: true, force: true })
  })

  it('桥接记录与 bundle 成员同 id：去重后 plan 面正常（bundle 真相源优先）', async () => {
    const f = fixture()
    writeBundle(f, '@test/alpha')
    declareInstalled(f, '@test/alpha', true)
    const definitions = new Map([['alpha', plugin('alpha')]])
    const eng = engine(f, definitions)
    // alpha 既是 bundle 成员（id 推导为 alpha）又是桥接安装记录
    await eng.install(source('alpha'))
    const plan = await eng.plan({ op: 'disable', id: 'alpha' })
    expect(plan.accepted).toBe(true)
    // bundle 停用后 plan 仍正常工作（同一 id 只计一份）
    await eng.bundleSetEnabled('alpha', false, true)
    const again = await eng.plan({ op: 'enable', id: 'alpha' })
    expect(again.error?.message ?? '').not.toContain('duplicate plugin id')
    rmSync(f.dshHome, { recursive: true, force: true })
    rmSync(f.checkout, { recursive: true, force: true })
  })
})
