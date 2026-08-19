/**
 * 符号级校验测试（《第二轮增强》第 7 条）：import 收集、运行时 exports 探测、
 * 缺失硬阻断 / 存在即事实。
 */

import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectNamedImports,
  probePackageExports,
  verifySymbols,
} from '../../src/package/symbol-verify.ts'

describe('symbol verification', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-symbols-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('collects ESM named imports and CJS destructured requires', () => {
    const source = `
      import { a, b as bee } from 'pkg-a'
      import def from 'pkg-b'
      const { c: cc, d } = require('pkg-c')
      import {
        multi,
        line
      } from 'pkg-d'
    `
    const refs = collectNamedImports(source, 'index.js')
    expect(refs.find(ref => ref.specifier === 'pkg-a')?.named).toEqual(['a', 'bee'])
    expect(refs.find(ref => ref.specifier === 'pkg-c')?.named).toEqual(['cc', 'd'])
    expect(refs.find(ref => ref.specifier === 'pkg-d')?.named).toEqual(['multi', 'line'])
    expect(refs.find(ref => ref.specifier === 'pkg-b')?.named).toEqual([])
  })

  it('skips type-only imports and inline type members (not runtime-probeable)', () => {
    const source = `
      import type { Foo } from 'pkg-types'
      import { value, type Bar, type Baz as B } from 'pkg-mixed'
      import {
        thing,
        type Multi,
      } from 'pkg-multi'
      export { type ReExported } from 'pkg-re'
    `
    const refs = collectNamedImports(source, 'index.js')
    expect(refs.find(ref => ref.specifier === 'pkg-types')).toBeUndefined()
    expect(refs.find(ref => ref.specifier === 'pkg-mixed')?.named).toEqual(['value'])
    expect(refs.find(ref => ref.specifier === 'pkg-multi')?.named).toEqual(['thing'])
    expect(refs.find(ref => ref.specifier === 'pkg-re')?.named).toEqual([])
  })

  it('probes runtime exports from an ESM entry', async () => {
    const entry = join(root, 'index.mjs')
    await writeFile(entry, 'export const alpha = 1\nexport function beta() {}\nexport default { gamma: 2 }\n')
    const exports = await probePackageExports(entry)
    expect(exports.has('alpha')).toBe(true)
    expect(exports.has('beta')).toBe(true)
    expect(exports.has('gamma')).toBe(true)
  })

  it('flags missing symbols and passes existing ones', async () => {
    const entry = join(root, 'index.mjs')
    await writeFile(entry, 'export const alpha = 1\n')
    const checks = await verifySymbols(
      [
        { specifier: 'pkg', named: ['alpha', 'omega'], file: 'index.js' },
      ],
      async () => probePackageExports(entry),
    )
    expect(checks.find(check => check.symbol === 'omega')?.missing).toBe(true)
    expect(checks.find(check => check.symbol === 'alpha')?.missing).toBe(false)
  })
})
