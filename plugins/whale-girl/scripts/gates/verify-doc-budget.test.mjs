// 门禁自证：verify-doc-budget 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check, BUDGETS } from './verify-doc-budget.mjs'

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'vbudget-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

test('接受：所有常驻文件在预算内', () => {
  const files = {}
  for (const rel of Object.keys(BUDGETS)) files[rel] = 'x'.repeat(100)
  const { ok, errors } = check(makeTree(files))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：单个文件超限（含文件路径与超出量）', () => {
  const limit = BUDGETS['AGENTS.md']
  const files = {}
  for (const rel of Object.keys(BUDGETS)) files[rel] = 'x'.repeat(100)
  files['AGENTS.md'] = 'y'.repeat(limit + 10) // 超 10 字符
  const { ok, errors } = check(makeTree(files))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /AGENTS\.md/)
  assert.match(errors.join('\n'), /超 10/)
})

test('拒绝：文件缺失（预算清单内文件被删）', () => {
  const files = {}
  for (const rel of Object.keys(BUDGETS)) {
    if (rel !== 'README.md') files[rel] = 'x'.repeat(100)
  }
  const { ok, errors } = check(makeTree(files))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /README\.md: 无法读取/)
})
