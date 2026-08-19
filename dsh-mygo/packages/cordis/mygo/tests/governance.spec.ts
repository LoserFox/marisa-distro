/**
 * 治理视图测试（P3）：从 profile 实际安装状态（dependencies +
 * dsh.profile.bundles + 用户 patch 层 disabled 行）实时重建。
 * @module @r05en1cu/dsh-mygo/tests/governance
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundleResolution, disabledRowsOf, readGovernanceView } from '../src/governance.ts'

describe('治理视图（readGovernanceView）', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-governance-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('从 profile 文件重建依赖/bundle/disabled 三面', async () => {
    const dir = join(root, 'profiles', 'web')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      dependencies: { '@r05en1cu/dsh-mygo': '0.2.0-rc.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@r05en1cu/dsh-mygo'] } },
    }))
    await writeFile(join(dir, 'cordis.patch.yml'), [
      '# user layer',
      '- id: dsh-mygo-cli',
      '  disabled: true',
      '- id: other-row',
      '  config: {}',
      '',
    ].join('\n'))
    const view = readGovernanceView(dir, 'web')
    expect(view.profile).toBe('web')
    expect(view.dependencies).toEqual({ '@r05en1cu/dsh-mygo': '0.2.0-rc.0' })
    expect(view.bundles).toEqual(['@deepseek-ai/dsh-base', '@r05en1cu/dsh-mygo'])
    expect(view.disabledRows).toEqual(['dsh-mygo-cli'])
  })

  it('未初始化 profile → 空视图（不抛错）', () => {
    const view = readGovernanceView(join(root, 'profiles', 'ghost'), 'ghost')
    expect(view.dependencies).toEqual({})
    expect(view.bundles).toEqual([])
    expect(view.disabledRows).toEqual([])
  })

  it('disabledRowsOf 只抓 disabled: true 行，容忍 !!js 与注释', () => {
    const text = [
      '# comment',
      "- id: alpha",
      '  disabled: true',
      "- id: beta",
      "  disabled: !!js process.platform === 'win32'",
      "- id: gamma",
      '  config: {}',
      "- id: delta",
      '  disabled: false',
    ].join('\n')
    expect(disabledRowsOf(text)).toEqual(['alpha'])
  })

  it('bundle 解析预检（P7-A3）：拼错/缺失进问题清单，模板未装行不预检', async () => {
    const dir = join(root, 'profiles', 'web')
    await mkdir(join(dir, 'node_modules', '@test', 'real-bundle'), { recursive: true })
    await writeFile(join(dir, 'node_modules', '@test', 'real-bundle', 'package.json'), JSON.stringify({
      name: '@test/real-bundle', version: '1.0.0', main: 'index.js',
    }))
    await writeFile(join(dir, 'node_modules', '@test', 'real-bundle', 'index.js'), 'export {}\n')
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web',
      dependencies: { '@test/real-bundle': '1.0.0', '@test/ghost-bundel': '1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@test/real-bundle', '@test/ghost-bundel'] } },
    }))
    const problems = checkBundleResolution(readGovernanceView(dir, 'web'))
    // dsh-base 不在 dependencies（模板行）不预检；拼错的 ghost-bundel 被揪出
    expect(problems).toHaveLength(1)
    expect(problems[0]?.name).toBe('@test/ghost-bundel')
    expect(problems[0]?.reason).toContain('无法从 profile 目录解析')
  })
})
