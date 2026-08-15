// 门禁自证：verify-decisions 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-decisions.mjs'

const GOOD = `# Decision: 测试决策

Status: implemented

## Problem

动机。

## Decision

已落地。

## Alternatives considered

**备选 A。** 为何落败。

## Consequences

后果。
`

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'vdec-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

test('接受：合法记录', () => {
  const root = makeTree({ 'decisions/implemented/process/2026-08-08-x.md': GOOD })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：Status 与所在目录不一致', () => {
  const bad = GOOD.replace('Status: implemented', 'Status: proposed')
  const root = makeTree({ 'decisions/implemented/process/2026-08-08-x.md': bad })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /Status "proposed" 与所在目录 implemented/)
})

test('拒绝：已实施记录缺 Alternatives considered', () => {
  const bad = GOOD.replace('## Alternatives considered\n\n**备选 A。** 为何落败。\n\n', '')
  const root = makeTree({ 'decisions/implemented/process/2026-08-08-x.md': bad })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /缺必需章节 "## Alternatives considered"/)
})

test('拒绝：已实施记录出现规划语气标题', () => {
  const bad = GOOD.replace('## Decision', '## Proposal')
  const root = makeTree({ 'decisions/implemented/process/2026-08-08-x.md': bad })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /禁止规划语气标题 "## Proposal"/)
})

test('拒绝：分类不在封闭集合', () => {
  const root = makeTree({ 'decisions/implemented/nonsense/2026-08-08-x.md': GOOD })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /分类不在封闭集合/)
})

test('拒绝：文件名不带日期', () => {
  const root = makeTree({ 'decisions/implemented/process/no-date.md': GOOD })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /文件名必须形如/)
})

// ---- 取代检查输出契约（2026-08-10 落地，漏洞 A 审查）----

test('接受：部分取代声明带链接 + 目标含回链（双向互链）', () => {
  const a = GOOD.replace('## Decision', '## Decision\n\n本决策部分取代 [B](2026-08-08-b.md) 的 X 描述。')
  const b = GOOD.replace('## Decision', '## Decision\n\n关联：见 [A](2026-08-09-a.md)。')
  const root = makeTree({
    'decisions/implemented/feature/2026-08-09-a.md': a,
    'decisions/implemented/feature/2026-08-08-b.md': b,
  })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：取代声明不带链接（散文提及不可机械校验）', () => {
  const a = GOOD.replace('## Decision', '## Decision\n\n本决策部分取代 B 的 X 描述。')
  const root = makeTree({ 'decisions/implemented/feature/2026-08-09-a.md': a })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /取代声明必须带相对路径链接/)
})

test('拒绝：部分取代目标缺回链（单向声明，双向互链缺失）', () => {
  const a = GOOD.replace('## Decision', '## Decision\n\n本决策部分取代 [B](2026-08-08-b.md) 的 X 描述。')
  const root = makeTree({
    'decisions/implemented/feature/2026-08-09-a.md': a,
    'decisions/implemented/feature/2026-08-08-b.md': GOOD,
  })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /部分取代目标 .* 必须含指向本记录的链接/)
})

test('拒绝：完全取代未归档到 archived/（旧件必须归档冻结）', () => {
  const a = GOOD.replace('## Decision', '## Decision\n\n本决策完全取代 [B](2026-08-08-b.md)。')
  const root = makeTree({
    'decisions/implemented/feature/2026-08-09-a.md': a,
    'decisions/implemented/feature/2026-08-08-b.md': GOOD,
  })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /完全取代的旧件必须归档到 decisions\/archived\//)
})

test('接受：完全取代已归档且带 Archived 标记', () => {
  const a = GOOD.replace('## Decision', '## Decision\n\n本决策完全取代 [../archived/feature/2026-08-08-b.md](decisions/archived/feature/2026-08-08-b.md)。')
  const archived = `# Decision: 旧决策

Status: archived
Archived: 2026-08-09

## Problem

动机。

## Decision

已落地。

## Alternatives considered

**备选 A。**

## Consequences

后果。
`
  const root = makeTree({
    'decisions/implemented/feature/2026-08-09-a.md': a,
    'decisions/archived/feature/2026-08-08-b.md': archived,
  })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})
