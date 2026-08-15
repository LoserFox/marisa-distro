// 门禁自证：verify-prose 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-prose.mjs'

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'vprose-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

// 用最小文件集：门禁只扫 SCAN_FILES 里的，缺的会报「无法读取」——所以给全。
function fullTree(overrides = {}) {
  const files = {
    'AGENTS.md': '规则。\n- 写当前态。',
    'README.md': '# 项目\n描述。',
    'docs/AGENTS.md': '# 文档标准\n写契约。',
    'decisions/README.md': '# 决策记录契约\n格式。',
    ...overrides,
  }
  return makeTree(files)
}

test('接受：干净散文（无规划/历史/叙述残留）', () => {
  const { ok, errors } = check(fullTree())
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：规划语气（TODO/待迁移）', () => {
  const root = fullTree({ 'README.md': '# 项目\nTODO: 加配置文档。\n待迁移：旧接口。' })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /规划语气/)
  assert.match(errors.join('\n'), /README\.md:2/)
})

test('拒绝：历史叙述（"之前…现在"）', () => {
  const root = fullTree({ 'README.md': '# 项目\n之前用旧方案，现在改为新方案。' })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /历史叙述/)
})

test('拒绝：实现/评审叙述（测试走查）', () => {
  const root = fullTree({ 'README.md': '# 项目\n测试走查覆盖了全部路径。' })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /实现\/评审叙述/)
})

test('豁免：slop 清单上下文（反例教学不误报）', () => {
  const root = fullTree({ 'docs/AGENTS.md': '# 文档标准\n❌ 测试走查、待迁移（这些是反例）。' })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})
