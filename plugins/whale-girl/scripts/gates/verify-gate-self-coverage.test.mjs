// 门禁自证：verify-gate-self-coverage 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-gate-self-coverage.mjs'

function makeTree(runSrc, gateFiles) {
  const root = mkdtempSync(join(tmpdir(), 'vgsc-'))
  const dir = join(root, 'scripts', 'gates')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'run.mjs'), runSrc)
  for (const f of gateFiles) writeFileSync(join(dir, f), '// fake')
  return root
}

const RUN_WITH_TESTS = `const GATES = [
  { name: 'verify-a', group: 'local', args: ['scripts/gates/verify-a.mjs'] },
  { name: 'verify-b', group: 'local', args: ['scripts/gates/verify-b.mjs'] },
  { name: 'unit-tests', group: 'ci', args: ['--test', 'tests/*.test.mjs'] },
]`

test('接受：GATES 全部有对应自证测试', () => {
  const { ok, errors } = check(makeTree(RUN_WITH_TESTS, ['verify-a.mjs', 'verify-b.mjs', 'verify-a.test.mjs', 'verify-b.test.mjs']))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：新增门禁缺自证测试（gate-self-tests glob 不会自然红）', () => {
  const { ok, errors } = check(makeTree(RUN_WITH_TESTS, ['verify-a.mjs', 'verify-b.mjs', 'verify-a.test.mjs']))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /门禁 verify-b 缺自证测试 scripts\/gates\/verify-b\.test\.mjs/)
})

test('接受：测试组本身（unit-tests/tool-tests/gate-self-tests）不要求 .test.mjs', () => {
  const { ok, errors } = check(makeTree(RUN_WITH_TESTS, ['verify-a.mjs', 'verify-b.mjs', 'verify-a.test.mjs', 'verify-b.test.mjs']))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：run.mjs 无 GATES 条目（解析失败）', () => {
  const { ok, errors } = check(makeTree('const x = 1', []))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /未解析到 GATES 条目/)
})
