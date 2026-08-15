// 门禁自证：verify-settings-schema 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-settings-schema.mjs'

function makeTree(configSrc) {
  const root = mkdtempSync(join(tmpdir(), 'vsch-'))
  const p = join(root, '.dsh-plugin', 'src', 'config.mjs')
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, configSrc)
  return root
}

const GOOD = `export function buildSchema() {
  return z.object({
    size: z.number().min(64).max(160).default(110),
    walkEnabled: z.boolean().default(true),
  })
}`

test('接受：合法 schema（数值 clamp + 默认值 + 无语义层字段）', () => {
  const { ok, errors } = check(makeTree(GOOD))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：数值字段缺 min/max（未 clamp）', () => {
  const bad = `export function buildSchema() {
  return z.object({
    size: z.number().default(110),
  })
}`
  const { ok, errors } = check(makeTree(bad))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /size: 数值字段缺 min/)
  assert.match(errors.join('\n'), /size: 数值字段缺 max/)
})

test('拒绝：缺默认值（default(...)）', () => {
  const bad = `export function buildSchema() {
  return z.object({
    size: z.number().min(1).max(200),
  })
}`
  const { ok, errors } = check(makeTree(bad))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /size: 缺默认值/)
})

test('拒绝：字段名落入语义层黑名单（XP 不可配）', () => {
  const bad = `export function buildSchema() {
  return z.object({
    taskXp: z.number().min(1).max(100).default(10),
    size: z.number().min(64).max(160).default(110),
  })
}`
  const { ok, errors } = check(makeTree(bad))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /taskXp: 字段名落入语义层黑名单/)
})

test('拒绝：缺 buildSchema 函数', () => {
  const { ok, errors } = check(makeTree('export const x = 1'))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /未找到 buildSchema/)
})
