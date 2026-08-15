// 门禁自证：verify-md-links 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-md-links.mjs'

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'vml-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

test('拒绝：链接指向不存在的文件（含定位与原因）', () => {
  const root = makeTree({ 'a.md': '见 [b](missing.md)\n' })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /a\.md:1/)
  assert.match(errors.join('\n'), /missing\.md/)
})

test('拒绝：图片引用指向不存在的文件', () => {
  const root = makeTree({ 'a.md': '![img](./nope.png)\n' })
  const { ok } = check(root)
  assert.equal(ok, false)
})

test('接受：链接全部可达', () => {
  const root = makeTree({ 'a.md': '见 [b](b.md) 与 [子目录](sub/c.md)\n', 'b.md': 'ok\n', 'sub/c.md': 'ok\n' })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('接受：http/锚点链接与 archived/ 被跳过', () => {
  const root = makeTree({
    'a.md': '见 [web](https://example.com)、[锚点](#sec)、[邮件](mailto:x@y.z)\n',
    'archived/old.md': '见 [gone](missing.md)\n',
  })
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})
