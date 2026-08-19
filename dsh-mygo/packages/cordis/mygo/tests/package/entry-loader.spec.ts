/**
 * 入口加载测试：ESM 与 CJS 入口经 file URL 动态加载，不依赖 tsx。
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extractPlugin, loadPluginEntry } from '../../src/package/entry-loader.ts'

describe('entry loader', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-entry-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('loads an ESM default-export entry', async () => {
    await writeFile(join(root, 'index.mjs'), 'export default { id: "esm", apply() {} }')
    const loaded = await loadPluginEntry(root, 'index.mjs')
    expect(extractPlugin(loaded)).toMatchObject({ id: 'esm' })
  })

  it('loads a CommonJS entry through ESM interop', async () => {
    await mkdir(join(root, 'cjs'), { recursive: true })
    await writeFile(join(root, 'cjs', 'package.json'), JSON.stringify({ type: 'commonjs' }))
    await writeFile(join(root, 'cjs', 'index.js'), 'module.exports = { id: "cjs", apply() {} }')
    const loaded = await loadPluginEntry(join(root, 'cjs'), 'index.js')
    expect(extractPlugin(loaded)).toMatchObject({ id: 'cjs' })
  })
})
