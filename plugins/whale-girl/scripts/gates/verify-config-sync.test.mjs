// 门禁自证：verify-config-sync 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-config-sync.mjs'

const CONFIG_SRC = `export const DEFAULTS = Object.freeze({
  size: 110, opacity: 1,
  walk: { enabled: true, minWaitMs: 18000, maxWaitMs: 40000, minMs: 3000, maxMs: 6000, speedPxPerSec: 45 },
  sleepAfterMs: 60000, pollMs: 3000, bubbleMs: 2500,
  welcomeMs: 6000, celebrateMs: 6000, errorMs: 4000, disappointedMs: 6000,
})`

function makeTree(configSrc, clientSrc) {
  const root = mkdtempSync(join(tmpdir(), 'vcsync-'))
  const mk = (rel, content) => {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
  mk('lib/src/config.mjs', configSrc)
  mk('lib/client/index.mjs', clientSrc)
  return root
}

test('接受：client CFG_DEFAULTS 与 DEFAULTS 一致', () => {
  const client = `const CFG_DEFAULTS = {
  size: 110, opacity: 1,
  walk: { enabled: true, minWaitMs: 18000, maxWaitMs: 40000, minMs: 3000, maxMs: 6000, speedPxPerSec: 45 },
  sleepAfterMs: 60000, pollMs: 3000, bubbleMs: 2500,
}`
  const { ok, errors } = check(makeTree(CONFIG_SRC, client))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：client 默认值与 DEFAULTS 不一致（漂移）', () => {
  const client = `const CFG_DEFAULTS = {
  size: 140, opacity: 1,
  walk: { enabled: true, minWaitMs: 18000, maxWaitMs: 40000, minMs: 3000, maxMs: 6000, speedPxPerSec: 45 },
  sleepAfterMs: 60000, pollMs: 3000, bubbleMs: 2500,
}`
  const { ok, errors } = check(makeTree(CONFIG_SRC, client))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /CFG_DEFAULTS\.size = 140 .* DEFAULTS\.size = 110/)
})

test('拒绝：client 配置项未在 DEFAULTS 声明', () => {
  const client = `const CFG_DEFAULTS = {
  size: 110, opacity: 1, teleportMs: 999,
}`
  const { ok, errors } = check(makeTree(CONFIG_SRC, client))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /CFG_DEFAULTS\.teleportMs 不在 src\/config\.mjs DEFAULTS/)
})

test('拒绝：缺少 DEFAULTS / CFG_DEFAULTS 对象', () => {
  const { ok: ok1, errors: e1 } = check(makeTree('export const x = 1', 'const CFG_DEFAULTS = { size: 110 }'))
  assert.equal(ok1, false)
  assert.match(e1.join('\n'), /未找到 DEFAULTS/)
  const { ok: ok2, errors: e2 } = check(makeTree(CONFIG_SRC, 'export const y = 2'))
  assert.equal(ok2, false)
  assert.match(e2.join('\n'), /未找到 CFG_DEFAULTS/)
})
