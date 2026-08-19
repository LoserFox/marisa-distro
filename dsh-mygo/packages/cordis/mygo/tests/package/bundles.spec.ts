/**
 * 嵌套包治理测试（《第二轮增强》1–4 条）：递归扫描、声明一致性、
 * 未声明内嵌插件/共享状态/dsh 核心调用检出。
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectUndeclaredBundles, scanBundles, sourceCallsDshCore } from '../../src/package/bundle-scan.ts'

describe('bundle scan', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-bundles-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('scans declared bundles recursively and validates id/version/path', async () => {
    await mkdir(join(root, 'vendor', 'lib'), { recursive: true })
    await writeFile(join(root, 'vendor', 'lib', 'package.json'), JSON.stringify({
      name: 'lib',
      version: '1.2.0',
      main: 'index.js',
      dsh: { mygo: { entry: 'index.js', core: '*' } },
    }))
    const result = await scanBundles('plugin', root, [{ id: 'lib', version: '1.2.0', path: 'vendor/lib' }])
    expect(result.problems).toEqual([])
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0]?.manifest.id).toBe('lib')
  })

  it('rejects declaration/actual mismatch', async () => {
    await mkdir(join(root, 'vendor', 'lib'), { recursive: true })
    await writeFile(join(root, 'vendor', 'lib', 'package.json'), JSON.stringify({
      name: 'lib',
      version: '1.3.0',
      main: 'index.js',
      dsh: { mygo: { entry: 'index.js', core: '*' } },
    }))
    const result = await scanBundles('plugin', root, [{ id: 'lib', version: '1.2.0', path: 'vendor/lib' }])
    expect(result.problems.join()).toContain('不一致')
  })

  it('detects undeclared bundled plugins, shared state, and dsh-core calls', async () => {
    await mkdir(join(root, 'vendor', 'mini-plugin'), { recursive: true })
    await writeFile(join(root, 'vendor', 'mini-plugin', 'package.json'), JSON.stringify({
      name: 'mini-plugin',
      version: '1.0.0',
      dsh: { mygo: { entry: 'index.js', core: '*' } },
    }))
    await mkdir(join(root, 'shared'), { recursive: true })
    await writeFile(join(root, 'shared', 'package.json'), JSON.stringify({
      name: 'shared',
      version: '1.0.0',
      dsh: { mygo: { shared: true } },
    }))
    await mkdir(join(root, 'core-user'), { recursive: true })
    await writeFile(join(root, 'core-user', 'index.js'), "import { x } from '@deepseek-ai/dsh-session'\n")
    const problems = await detectUndeclaredBundles(root, [])
    expect(problems.join('\n')).toContain('未声明内嵌插件')
    expect(problems.join('\n')).toContain('未声明共享状态包')
    expect(problems.join('\n')).toContain('未声明 dsh 核心调用')
  })

  it('detects dsh-core calls in source text', () => {
    expect(sourceCallsDshCore("import { x } from '@deepseek-ai/dsh-tools'")).toBe(true)
    expect(sourceCallsDshCore("const y = require('lodash')")).toBe(false)
  })
})
