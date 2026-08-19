// 门禁自证：check-generated（client.js 新鲜度）必须证明它会拒绝（法则 2）。
// 在临时根构造最小 client 源 → 生成 → 篡改 → 断言 --check 拒绝；未篡改则通过。
// esbuild 不可用时跳过（该门禁声明消费构建产物，缺失外部工具时明确跳过）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generate, esbuildAvailable } from '../build-client.mjs'

const ENTRY = `export function apply() {}\n`

function makeRoot({ entry = ENTRY } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gen-'))
  mkdirSync(join(root, 'lib', 'client'), { recursive: true })
  writeFileSync(join(root, 'lib', 'client', 'index.mjs'), entry)
  return root
}

test('拒绝：client.js 与生成器输出不一致（含修复提示）', { skip: !esbuildAvailable() }, async () => {
  const root = makeRoot()
  await generate({ check: false, root })
  writeFileSync(join(root, 'lib', 'client.js'), readFileSync(join(root, 'lib', 'client.js'), 'utf8') + '\n// tampered')
  const result = await generate({ check: true, root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /不一致/)
  assert.match(result.errors.join('\n'), /build-client\.mjs/)
})

test('接受：client.js 与生成器输出一致', { skip: !esbuildAvailable() }, async () => {
  const root = makeRoot()
  await generate({ check: false, root })
  const result = await generate({ check: true, root })
  assert.equal(result.ok, true)
})

test('拒绝：client.js 缺失', { skip: !esbuildAvailable() }, async () => {
  const root = makeRoot()
  const result = await generate({ check: true, root })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /不存在/)
})
