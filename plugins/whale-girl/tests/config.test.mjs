// src/config.mjs 单测（node:test）。归属：配置 schema/默认值改动跑本文件。
// 注意：本测试在插件安装目录运行（schemastery 从公共层解析）；单测脚本路径
// 通过 NODE_PATH 或安装目录保证可解析（见 AGENTS.md 验证纪律）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, buildSchema, validateConfig, NAMESPACE } from '../.dsh-plugin/src/config.mjs'

test('NAMESPACE 与 DEFAULTS 完整性', () => {
  assert.equal(NAMESPACE, 'whale-girl')
  assert.equal(typeof DEFAULTS.size, 'number')
  assert.equal(DEFAULTS.size, 110)
  assert.equal(DEFAULTS.walk.enabled, true)
  assert.equal(DEFAULTS.walk.maxWaitMs, 40000)
})

test('buildSchema 可构造（schemastery z object，函数式 schema）', () => {
  const schema = buildSchema()
  assert.equal(typeof schema, 'function') // z.object 返回可调用的 schema 构造器
})

test('validateConfig：成对字段合法通过、非法拒绝', () => {
  assert.doesNotThrow(() => validateConfig({ walk: { minWaitMs: 1000, maxWaitMs: 5000, minMs: 500, maxMs: 3000 } }))
  const e1 = (() => { try { validateConfig({ walk: { minWaitMs: 9000, maxWaitMs: 5000 } }); return null } catch (e) { return e } })()
  assert.ok(e1 instanceof Error)
  assert.match(e1.message, /walk\.minWaitMs 不得大于 walk\.maxWaitMs/)
  const e2 = (() => { try { validateConfig({ walk: { minMs: 9000, maxMs: 5000 } }); return null } catch (e) { return e } })()
  assert.ok(e2 instanceof Error)
  assert.match(e2.message, /walk\.minMs 不得大于 walk\.maxMs/)
})

test('validateConfig：缺 walk 或空值安全', () => {
  assert.doesNotThrow(() => validateConfig(undefined))
  assert.doesNotThrow(() => validateConfig({}))
  assert.doesNotThrow(() => validateConfig({ walk: undefined }))
})

test('DEFAULTS.replies：内置回话池非空且为数组', () => {
  assert.ok(Array.isArray(DEFAULTS.replies.feed) && DEFAULTS.replies.feed.length > 0)
  assert.ok(Array.isArray(DEFAULTS.replies.play) && DEFAULTS.replies.play.length > 0)
})
