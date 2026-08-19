/**
 * bundle 卸载路由测试（r6 追加）：profile 执行面卸载（pnpm remove +
 * reconcile）、面板自卸载拒绝、dsh-mygo 核心 force 守卫、plan 预览拒绝
 * 透传。全部临时 $DSH_HOME（离线 file: 包装置）。
 * 注意：面板模块的 HOME_ROOT 在 import 时定型——本套件在 beforeAll 先
 * 设临时 DSH_HOME 再动态导入（教训：先于 import 设 env 是硬要求）。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/uninstall-routing
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { profileInstall } from '@r05en1cu/dsh-mygo-loader-profile'
import { hasLiveBlock, writeLiveBlock } from '@r05en1cu/dsh-mygo'
import type { BundleMember } from '@r05en1cu/dsh-mygo'
import type { BundleUninstallOutcome } from '../src/index.ts'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME

let home: string
let routeBundleUninstall: typeof import('../src/index.ts').routeBundleUninstall
type PanelContext = import('../src/index.ts').PanelContext

function memberOf(id: string, packageName: string): BundleMember {
  return { id, packageName, enabled: true } as BundleMember
}

/** 读 profile manifest（同步；mock loader 闭包内用）。 */
function manifestDeps(): readonly string[] {
  const manifest = JSON.parse(readFileSync(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
    readonly dependencies?: Record<string, string>
  }
  return Object.keys(manifest.dependencies ?? {})
}

/**
 * live 路径 mock ctx：get('loader') 供给条目枚举桩（activeIds 存活 fiber，
 * inactiveIds 条目残留但 fiber 已 dispose），pluginManager 附
 * bundleSetEnabled 记录面。onPoll 回调供顺序断言（观察调用时序的盘态）。
 */
function mockLiveCtx(
  members: readonly BundleMember[],
  loader: { entries(): Iterable<{ id: string; fiber?: object }> },
  extra?: { onBundleSetEnabled?: (id: string, enabled: boolean) => void },
): PanelContext {
  return {
    get: (name: string) => (name === 'loader' ? loader : undefined),
    pluginManager: {
      bundleList: () => members,
      plan: () => Promise.resolve({ accepted: true }),
      bundleSetEnabled: (id: string, enabled: boolean) => {
        extra?.onBundleSetEnabled?.(id, enabled)
        return Promise.resolve()
      },
      plugins: () => [],
      configOf: () => ({}),
      updateConfig: () => Promise.resolve(),
    },
  } as unknown as PanelContext
}

function mockCtx(members: readonly BundleMember[], planAccepted = true): PanelContext {
  return {
    pluginManager: {
      bundleList: () => members,
      plan: () => Promise.resolve(planAccepted
        ? { accepted: true }
        : { accepted: false, error: { code: 'dependent-exists', message: '存在依赖者' } }),
      plugins: () => [],
      configOf: () => ({}),
      updateConfig: () => Promise.resolve(),
    },
  } as unknown as PanelContext
}

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'mygo-uninstall-route-'))
  process.env.DSH_HOME = home
  const mod = await import('../src/index.ts')
  routeBundleUninstall = mod.routeBundleUninstall
})

afterAll(async () => {
  if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_DSH_HOME
  await rm(home, { recursive: true, force: true })
})

async function writeBundleFixture(name: string, patchText = '- insert: []\n'): Promise<string> {
  const dir = join(home, `fixture-${name.replace('/', '_')}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  await writeFile(join(dir, 'cordis.patch.yml'), patchText)
  return dir
}

async function profileManifest(): Promise<{
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}> {
  return JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as never
}

describe('routeBundleUninstall（bundle 轨卸载路由）', () => {
  it('面板自身拒绝经该路径卸载（指引 dsh plugin remove）', async () => {
    const outcome = await routeBundleUninstall(
      mockCtx([memberOf('dsh-mygo-ext-panel', '@r05en1cu/dsh-mygo-ext-panel')]),
      'dsh-mygo-ext-panel',
      false,
      'web',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('dsh plugin remove')
  })

  it('dsh-mygo 核心：无 force 拒绝；force 后经 profile 执行面卸载', async () => {
    const bundleDir = await writeBundleFixture('@r05en1cu/dsh-mygo')
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const members = [memberOf('dsh-mygo', '@r05en1cu/dsh-mygo')]
    const refused = await routeBundleUninstall(mockCtx(members), 'dsh-mygo', false, 'web')
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain('force: true')
    // 未动 profile
    expect(Object.keys((await profileManifest()).dependencies ?? {})).toContain('@r05en1cu/dsh-mygo')
    const outcome = await routeBundleUninstall(mockCtx(members), 'dsh-mygo', true, 'web')
    expect(outcome.ok).toBe(true)
    expect(outcome.warning).toContain('中断')
    expect(Object.keys((await profileManifest()).dependencies ?? {})).not.toContain('@r05en1cu/dsh-mygo')
    expect((await profileManifest()).dsh?.profile?.bundles).not.toContain('@r05en1cu/dsh-mygo')
  }, 120_000)

  it('普通 bundle 成员：plan 通过后经 pnpm remove + reconcile 卸载', async () => {
    const bundleDir = await writeBundleFixture('@test/community-one')
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const outcome: BundleUninstallOutcome = await routeBundleUninstall(
      mockCtx([memberOf('community-one', '@test/community-one')]),
      'community-one',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    const manifest = await profileManifest()
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@test/community-one')
    expect(manifest.dsh?.profile?.bundles).not.toContain('@test/community-one')
  }, 120_000)

  it('plan 预览拒绝（dependent-exists）透传且不执行卸载', async () => {
    const bundleDir = await writeBundleFixture('@test/community-two')
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const outcome = await routeBundleUninstall(
      mockCtx([memberOf('community-two', '@test/community-two')], false),
      'community-two',
      false,
      'web',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('存在依赖者')
    expect(Object.keys((await profileManifest()).dependencies ?? {})).toContain('@test/community-two')
  }, 120_000)

  it('卸载成功路径清理 patch 残留行（rowId 先于 pnpm remove 推导；文件仍合法 YAML）', async () => {
    // bundle patch 首个 insert 行 id = advisor-x（rowId 与成员 id 不同形态）
    const bundleDir = await writeBundleFixture(
      '@test/community-three',
      "- insert:\n    - id: advisor-x\n      name: '@test/community-three'\n",
    )
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    // 模拟 r6 配置写入 + 受管 disable 块 + 其他用户行
    const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
    await writeFile(patchPath, [
      '# 用户层注释',
      '- id: other-plugin',
      '  config:',
      '    keep: true',
      '',
      '# --- mygo managed disable (id:advisor-x) ---',
      '- id: advisor-x',
      '  disabled: true',
      '# --- end mygo managed disable ---',
      '',
      '- id: advisor-x',
      '  config:',
      "    model: ''",
      '    immuneTurns: 3',
      '',
    ].join('\n'))
    const outcome = await routeBundleUninstall(
      mockCtx([memberOf('community-three', '@test/community-three')]),
      'community-three',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    expect(Object.keys((await profileManifest()).dependencies ?? {})).not.toContain('@test/community-three')
    const text = await readFile(patchPath, 'utf8')
    expect(text).not.toContain('advisor-x')
    expect(text).not.toContain('mygo managed disable')
    expect(text).toContain('# 用户层注释')
    expect(text).toContain('- id: other-plugin')
    // 合法 YAML 且顶层数组只剩 other-plugin 行（经核心 js-yaml 展开校验）
    const { expandBundlePatch } = await import('@r05en1cu/dsh-mygo')
    expect(expandBundlePatch(text).map(row => row.id)).toEqual(['other-plugin'])
  }, 120_000)

  it('卸载后无残留行的 profile：patch 层回落合法空数组', async () => {
    const bundleDir = await writeBundleFixture('@test/community-four')
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
    await writeFile(patchPath, '- id: community-four\n  config:\n    model: x\n')
    const outcome = await routeBundleUninstall(
      mockCtx([memberOf('community-four', '@test/community-four')]),
      'community-four',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    const text = await readFile(patchPath, 'utf8')
    expect(text.trim()).toBe('[]')
  }, 120_000)
})

describe('routeBundleUninstall（r7 live rail 路径）', () => {
  it('live rail 包：先剥块 + 验证 dispose 再 pnpm remove（顺序断言），文案刷新生效', async () => {
    const bundleDir = await writeBundleFixture(
      '@test/live-five',
      "- insert:\n    - id: live-five-row\n      name: '@test/live-five'\n",
    )
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    // 模拟 live rail 安装后的盘态：受管块在 patch 层
    const installedDir = join(home, 'profiles', 'web', 'node_modules', '@test', 'live-five')
    expect(writeLiveBlock(home, 'web', '@test/live-five', installedDir).ok).toBe(true)
    // loader 桩：第一次枚举条目仍存活（dispose 尚未发生），之后消失；
    // 每次枚举记录当时依赖是否仍在（验证 dispose 必须先于 pnpm remove）。
    let polls = 0
    let depPresentAtLastPoll: boolean | undefined
    const loader = {
      *entries() {
        polls += 1
        depPresentAtLastPoll = manifestDeps().includes('@test/live-five')
        if (polls === 1) yield { id: 'include:live-five-row', fiber: {} }
      },
    }
    const outcome = await routeBundleUninstall(
      mockLiveCtx([memberOf('live-five', '@test/live-five')], loader),
      'live-five',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    expect(polls).toBeGreaterThan(0)
    expect(depPresentAtLastPoll).toBe(true)
    expect(outcome.message).toContain('刷新页面后生效')
    expect(manifestDeps()).not.toContain('@test/live-five')
    expect(hasLiveBlock(home, 'web', '@test/live-five')).toBe(false)
  }, 120_000)

  it('live 验证超时：恢复 live 块且不执行 pnpm remove', async () => {
    const bundleDir = await writeBundleFixture(
      '@test/live-six',
      "- insert:\n    - id: live-six-row\n      name: '@test/live-six'\n",
    )
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const installedDir = join(home, 'profiles', 'web', 'node_modules', '@test', 'live-six')
    expect(writeLiveBlock(home, 'web', '@test/live-six', installedDir).ok).toBe(true)
    // 条目始终存活 → dispose 验证永不通过（默认 10s 超时）
    const loader = {
      *entries() {
        yield { id: 'include:live-six-row', fiber: {} }
      },
    }
    const outcome = await routeBundleUninstall(
      mockLiveCtx([memberOf('live-six', '@test/live-six')], loader),
      'live-six',
      false,
      'web',
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('live 卸载验证超时')
    expect(manifestDeps()).toContain('@test/live-six')
    expect(hasLiveBlock(home, 'web', '@test/live-six')).toBe(true)
  }, 120_000)

  it('boot rail 包且实例在跑：先写 disable 块摘 fiber（验证先于 pnpm remove）', async () => {    const bundleDir = await writeBundleFixture(
      '@test/live-seven',
      "- insert:\n    - id: live-seven-row\n      name: '@test/live-seven'\n",
    )
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    let detached = false
    let depPresentAtDetach: boolean | undefined
    let disableArgs: readonly [string, boolean] | undefined
    const member = {
      ...memberOf('live-seven', '@test/live-seven'),
      patchFacts: [{ rowId: 'live-seven-row', kind: 'insert' as const }],
    }
    const loader = {
      *entries() {
        if (!detached) yield { id: 'include:live-seven-row', fiber: {} }
      },
    }
    const outcome = await routeBundleUninstall(
      mockLiveCtx([member], loader, {
        onBundleSetEnabled: (id, enabled) => {
          disableArgs = [id, enabled]
          depPresentAtDetach = manifestDeps().includes('@test/live-seven')
          detached = true
        },
      }),
      'live-seven',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    expect(disableArgs).toEqual(['live-seven', false])
    expect(depPresentAtDetach).toBe(true)
    expect(outcome.message).toContain('刷新页面后生效')
    expect(manifestDeps()).not.toContain('@test/live-seven')
  }, 120_000)

  it('live 生效的卸载向 SSE 通道广播 unmount 帧（rc8）', async () => {
    const bundleDir = await writeBundleFixture(
      '@test/live-eight',
      "- insert:\n    - id: live-eight-row\n      name: '@test/live-eight'\n",
    )
    expect(profileInstall(bundleDir, { profile: 'web', home }).ok).toBe(true)
    const installedDir = join(home, 'profiles', 'web', 'node_modules', '@test', 'live-eight')
    expect(writeLiveBlock(home, 'web', '@test/live-eight', installedDir).ok).toBe(true)
    // 挂接一个假 SSE 连接（直接经 live-events 路由面）
    const { registerLiveEventsRoute } = await import('../src/live-events.ts')
    const chunks: string[] = []
    let closeListener: (() => void) | undefined
    registerLiveEventsRoute({
      register(route) {
        const handler = route.handler as (req: unknown, res: unknown) => void
        handler({ method: 'GET' }, {
          writeHead: () => {},
          write: (chunk: string) => chunks.push(chunk),
          on: (_event: 'close', listener: () => void) => { closeListener = listener },
        })
        return () => {}
      },
    } as never)
    const loader = { *entries() { /* 行已 dispose（无条目） */ } }
    const outcome = await routeBundleUninstall(
      mockLiveCtx([memberOf('live-eight', '@test/live-eight')], loader),
      'live-eight',
      false,
      'web',
    )
    expect(outcome.ok).toBe(true)
    expect(chunks.some(chunk => chunk.includes('"op":"unmount","id":"@test/live-eight"'))).toBe(true)
    closeListener?.()
  }, 120_000)
})
