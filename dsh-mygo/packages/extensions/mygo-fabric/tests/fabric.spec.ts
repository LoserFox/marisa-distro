/**
 * mygo-fabric 治理壳测试（P6）：受管块写入/移除幂等、enable 经 profile
 * loader 安装（fixture 桩包 + 真实 fabric 仓本地路径 spec）、disable
 * 移除块、治理面登记形态、HOME 隔离闸。全部临时 $DSH_HOME（离线；
 * 本地路径 spec = link 安装，零网络）。
 * @module @r05en1cu/dsh-mygo-ext-fabric/tests/fabric
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FABRIC_BLOCK_BEGIN,
  FABRIC_DEFAULT_SPECS,
  apply,
  disableFabric,
  enableFabric,
  fabricExtensionRegistration,
  removeManagedExtensionBlock,
} from '../src/index.ts'

const FABRIC_REPO = '/home/rosen/workspace/dsh_dev/fabric'

describe('fabric 受管块（启用/停用/幂等）', () => {
  let root: string
  let home: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-fabric-'))
    home = join(root, 'home')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function writeStubPackage(name: string): Promise<string> {
    const dir = join(root, `stub-${name}`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }, null, 2))
    await writeFile(join(dir, 'index.js'), 'export const name = \'stub\'\nexport function apply() {}\n')
    return dir
  }

  function patchText(): Promise<string> {
    return readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')
  }

  it('enable：安装两包 + 写受管块；二次 enable 幂等零重复', async () => {
    const stubA = await writeStubPackage('cordis-fabric')
    const stubB = await writeStubPackage('cordis-fabric-dsh')
    const target = { home, profile: 'web' }
    const first = enableFabric(target, { specs: [stubA, stubB] })
    expect(first).toEqual({ ok: true, enabled: true, profile: 'web' })
    const text = await patchText()
    expect(text).toContain(FABRIC_BLOCK_BEGIN)
    expect(text).toContain("- id: cordis-fabric\n      name: 'cordis-fabric'")
    expect(text).toContain("- id: cordis-fabric-dsh\n      name: 'cordis-fabric-dsh'")
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['cordis-fabric', 'cordis-fabric-dsh'])
    // 幂等：二次 enable 块仍唯一
    expect(enableFabric(target, { specs: [stubA, stubB] }).ok).toBe(true)
    const again = await patchText()
    expect(again.match(/mygo managed extension \(id:fabric\)/g)).toHaveLength(2) // begin + end 各一
  }, 60_000)

  it('disable：移除受管块（幂等；包保留在 dependencies）', async () => {
    const stubA = await writeStubPackage('cordis-fabric')
    const stubB = await writeStubPackage('cordis-fabric-dsh')
    const target = { home, profile: 'web' }
    enableFabric(target, { specs: [stubA, stubB] })
    const disabled = disableFabric(target)
    expect(disabled).toEqual({ ok: true, enabled: false, profile: 'web' })
    expect(await patchText()).not.toContain('cordis-fabric')
    // 幂等：二次 disable 无变化
    expect(disableFabric(target).ok).toBe(true)
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['cordis-fabric', 'cordis-fabric-dsh'])
  }, 60_000)

  it('真实 fabric 仓本地路径 spec（守则过渡形态）：安装 + 受管块 + 停用', async () => {
    const target = { home, profile: 'web' }
    const specs = [
      join(FABRIC_REPO, 'packages', 'cordis-fabric'),
      join(FABRIC_REPO, 'packages', 'cordis-fabric-dsh'),
    ]
    const enabled = enableFabric(target, { specs })
    expect(enabled.ok).toBe(true)
    const text = await patchText()
    expect(text).toContain(FABRIC_BLOCK_BEGIN)
    const manifest = JSON.parse(await readFile(join(home, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(manifest.dependencies?.['cordis-fabric']).toContain('link:')
    expect(manifest.dependencies?.['cordis-fabric-dsh']).toContain('link:')
    expect(disableFabric(target).ok).toBe(true)
  }, 120_000)

  it('HOME 隔离闸：非法 profile 名（分隔符/点段）直接拒绝', async () => {
    expect(() => enableFabric({ home, profile: '../escape' })).toThrow('逃出实例 HOME')
    expect(() => disableFabric({ home, profile: '../escape' })).toThrow('逃出实例 HOME')
    expect(() => enableFabric({ home, profile: 'a/b' })).toThrow('逃出实例 HOME')
  })

  it('specs 数量与包清单不一致 → 明确错误', async () => {
    const result = enableFabric({ home, profile: 'web' }, { specs: ['/tmp/only-one'] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('数量必须与包清单一致')
  })

  it('removeManagedExtensionBlock：无块原样返回', () => {
    expect(removeManagedExtensionBlock('- insert: []\n', 'fabric')).toBe('- insert: []\n')
  })

  it('去重互斥（P7-B8）：层内已有不受管 fabric 载体行时 enable 拒绝', async () => {
    const stubA = await writeStubPackage('cordis-fabric')
    const stubB = await writeStubPackage('cordis-fabric-dsh')
    await mkdir(join(home, 'profiles', 'web'), { recursive: true })
    await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
      '# 既有载体行（如旧安装形态残留）',
      '- insert:',
      '    - id: cordis-fabric',
      "      name: 'cordis-fabric'",
      '',
    ].join('\n'))
    const result = enableFabric({ home, profile: 'web' }, { specs: [stubA, stubB] })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('重复插行互斥')
    expect(result.error).toContain('cordis-fabric')
    // 未写受管块
    expect(await readFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')).not.toContain(FABRIC_BLOCK_BEGIN)
  })

  it('默认 spec 为 git 子目录 spec 白名单形态', () => {
    expect(FABRIC_DEFAULT_SPECS[0]).toBe('github:omdsh-dev/fabric#main&path:/packages/cordis-fabric')
    expect(FABRIC_DEFAULT_SPECS[1]).toContain('&path:/packages/cordis-fabric-dsh')
  })
})

describe('治理面登记形态', () => {
  it('apply 把 fabric 登记进 extension 注册面；注销器随清理调用', () => {
    const registrations: unknown[] = []
    let disposer: (() => void) | undefined
    const ctx = {
      get: (key: string): unknown => key === 'pluginManager'
        ? {
            registerExtension: (registration: unknown): (() => void) => {
              registrations.push(registration)
              return () => { disposer = undefined }
            }
          }
        : undefined,
      effect: (fn: () => () => void): void => { disposer = fn() },
    }
    apply(ctx)
    expect(registrations).toEqual([fabricExtensionRegistration()])
    expect((registrations[0] as { id: string }).id).toBe('fabric')
    expect((registrations[0] as { blockMarker: string }).blockMarker).toBe(FABRIC_BLOCK_BEGIN)
    expect(typeof disposer).toBe('function')
  })

  it('管理器缺失 fail loud', () => {
    expect(() => apply({ get: () => undefined })).toThrow('需要 pluginManager 服务')
  })
})
