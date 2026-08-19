/**
 * HMR 体验迭代 R1/R2：mygo 自更新「整仓为最小更新单元」——工作区包枚举与
 * 逐包构建形态推导（R1）；插件更新树原子换入（staging + 备份回滚，R2）。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/workspace-packages
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildArgsFor, listMygoPackageDirs, swapTreeIntoPlace } from '../src/workspace-packages.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mygo-workspace-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function seedPackage(rel: string, name: string): Promise<void> {
  const dir = join(root, rel)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name }))
}

describe('listMygoPackageDirs（整仓枚举）', () => {
  it('枚举 packages 下全部 @r05en1cu/* 包并按组序+字典序稳定排序', async () => {
    await seedPackage('packages/core/mygo-api', '@r05en1cu/dsh-mygo-api')
    await seedPackage('packages/cordis/mygo', '@r05en1cu/dsh-mygo')
    await seedPackage('packages/cordis/mygo-cli', '@r05en1cu/dsh-mygo-cli')
    await seedPackage('packages/extensions/mygo-panel', '@r05en1cu/dsh-mygo-ext-panel')
    await seedPackage('packages/extensions/mygo-fabric', '@r05en1cu/dsh-mygo-ext-fabric')
    await seedPackage('packages/loaders/mygo-loader-profile', '@r05en1cu/dsh-mygo-loader-profile')
    await seedPackage('packages/loaders/mygo-loader-hub', '@r05en1cu/dsh-mygo-loader-hub')
    expect(await listMygoPackageDirs(root)).toEqual([
      'packages/core/mygo-api',
      'packages/cordis/mygo',
      'packages/cordis/mygo-cli',
      'packages/extensions/mygo-fabric',
      'packages/extensions/mygo-panel',
      'packages/loaders/mygo-loader-hub',
      'packages/loaders/mygo-loader-profile',
    ])
  })

  it('跳过非 @r05en1cu 包与无 package.json 目录', async () => {
    await seedPackage('packages/core/mygo-api', '@r05en1cu/dsh-mygo-api')
    await seedPackage('packages/cordis/not-mygo', '@deepseek-ai/dsh-other')
    await mkdir(join(root, 'packages', 'extensions', 'empty'), { recursive: true })
    expect(await listMygoPackageDirs(root)).toEqual(['packages/core/mygo-api'])
  })

  it('缺失组目录与空仓库返回空数组', async () => {
    expect(await listMygoPackageDirs(root)).toEqual([])
    await mkdir(join(root, 'packages'), { recursive: true })
    expect(await listMygoPackageDirs(root)).toEqual([])
  })
})

describe('buildArgsFor（逐包构建形态）', () => {
  it('面板包（tsdown.config.mjs）走 tsc -p + tsdown --config .mjs', async () => {
    await mkdir(join(root, 'panel'), { recursive: true })
    await writeFile(join(root, 'panel', 'tsdown.config.mjs'), '')
    expect(await buildArgsFor(join(root, 'panel'))).toEqual({
      tsc: ['-p', 'tsconfig.json'],
      tsdown: ['--config', 'tsdown.config.mjs'],
    })
  })

  it('标准包（无 .mjs）走 tsc -b + tsdown --config tsdown.config.ts', async () => {
    await mkdir(join(root, 'std'), { recursive: true })
    expect(await buildArgsFor(join(root, 'std'))).toEqual({
      tsc: ['-b'],
      tsdown: ['--config', 'tsdown.config.ts'],
    })
  })
})

describe('swapTreeIntoPlace（安装树原子换入，R2）', () => {
  async function seed(dir: string, marker: string): Promise<void> {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'marker.txt'), marker)
  }

  it('staging 就位后旧树被替换且备份清理（HMR swap 成功路径）', async () => {
    const staging = join(root, 'staging')
    const target = join(root, 'plugin')
    await seed(staging, 'new')
    await seed(target, 'old')
    await swapTreeIntoPlace(staging, target)
    expect(await readFile(join(target, 'marker.txt'), 'utf8')).toBe('new')
    // 备份已删除，目录下只留正式树
    const entries = await readdirOf(root)
    expect(entries.filter(name => name.includes('.bak-'))).toEqual([])
    expect(entries).toContain('plugin')
  })

  it('target 不存在时直接就位 staging（首装路径）', async () => {
    const staging = join(root, 'staging')
    const target = join(root, 'plugin')
    await seed(staging, 'new')
    await swapTreeIntoPlace(staging, target)
    expect(await readFile(join(target, 'marker.txt'), 'utf8')).toBe('new')
  })

  it('staging 缺失时抛错且旧树原样保留（失败回滚路径）', async () => {
    const staging = join(root, 'missing-staging')
    const target = join(root, 'plugin')
    await seed(target, 'old')
    await expect(swapTreeIntoPlace(staging, target)).rejects.toThrow()
    expect(await readFile(join(target, 'marker.txt'), 'utf8')).toBe('old')
    const entries = await readdirOf(root)
    expect(entries.filter(name => name.includes('.bak-'))).toEqual([])
  })
})

async function readdirOf(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  return (await readdir(dir)).sort()
}
