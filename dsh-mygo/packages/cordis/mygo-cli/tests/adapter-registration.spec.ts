/**
 * P5 治理面注册测试：mygo-cli 在首个 mygo 命令时把 profile 执行面
 * adapter 注册进真实管理器的 loader 注册面；被动路径（非 mygo 首
 * token）完全无副作用（不注册、无输出）。
 * @module @r05en1cu/dsh-mygo-cli/tests/adapter-registration
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, internals } from '../src/index.ts'
import { collector, mountCliComposition } from './helpers.ts'

const ORIGINAL_DSH_HOME = process.env.DSH_HOME
const ORIGINAL_CORE_VERSION = process.env.DSH_CORE_VERSION

interface ManagerWithAdapters {
  loaderAdapters(): readonly { readonly id: string }[]
}

describe('loader adapter 治理面注册', () => {
  let home: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mygo-adapter-reg-'))
    process.env.DSH_HOME = home
    process.env.DSH_CORE_VERSION = '0.0.1-rc.1'
  })

  afterEach(async () => {
    internals.stdout = process.stdout
    internals.stderr = process.stderr
    if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = ORIGINAL_DSH_HOME
    if (ORIGINAL_CORE_VERSION === undefined) delete process.env.DSH_CORE_VERSION
    else process.env.DSH_CORE_VERSION = ORIGINAL_CORE_VERSION
    await rm(home, { recursive: true, force: true })
  })

  it('首个 mygo 命令注册 profile adapter；被动路径不注册', async () => {
    const passive = await mountCliComposition(['--port', '8080'], {
      profile: 'cli-reg-a',
      home,
      registry: 'http://127.0.0.1:1',
    })
    const managerA = passive.ctx.get<ManagerWithAdapters>('pluginManager') as ManagerWithAdapters
    expect(managerA.loaderAdapters()).toEqual([])
    await apply(passive.ctx)
    expect(managerA.loaderAdapters()).toEqual([])

    internals.stdout = collector()
    internals.stderr = collector()
    const active = await mountCliComposition(['mygo', 'instances'], {
      profile: 'cli-reg-b',
      home,
      registry: 'http://127.0.0.1:1',
    })
    const managerB = active.ctx.get<ManagerWithAdapters>('pluginManager') as ManagerWithAdapters
    expect(managerB.loaderAdapters()).toEqual([])
    await apply(active.ctx)
    expect(managerB.loaderAdapters().map(adapter => adapter.id)).toEqual(['profile'])
    // 幂等：再次 apply 不叠加
    await apply(active.ctx)
    expect(managerB.loaderAdapters()).toHaveLength(1)
  })
})
