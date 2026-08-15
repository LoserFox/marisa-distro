// 门禁自证：verify-spec-states 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
// v5：权威集合从 EMOJI 表改为 STATE_NAMES（素材全量契约），校验 STATE_TABLE 行漂移，
// 并校验 spec 状态总表播放行为列 ↔ manifest playback 值（语义级配错盲区）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-spec-states.mjs'
import { STATE_NAMES, STATE_TABLE } from '../../.dsh-plugin/client/logic.mjs'

const names = [...STATE_NAMES]
// 真实 playback 映射（与 assets/manifest.json 一致；测试用简化全 loop + idle blink + walk pingpong）
const PLAYBACK = Object.fromEntries(names.map((s) => [s, s === 'idle' ? 'blink' : s === 'walk' ? 'pingpong' : s === 'wake' || s === 'error' ? 'once' : 'loop']))
// 与 STATE_TABLE 行序一致的优先级列表（state-machine.md 格式）。
function goodPriority() {
  const rows = STATE_TABLE.map((r, i) => `${i + 1}. \`${r.state}\``)
  return ['## 优先级（STATE_TABLE 行序，文法单源）', '', ...rows, '', '## 状态转换语义', ''].join('\n')
}

/** 构造一份与当前 STATE_NAMES 完全一致的 spec 总表（状态总表后紧跟 h3 小节表，验证不误读）。 */
function goodSpec(playback = PLAYBACK) {
  const rows = names.map((s) => `| \`${s}\` | 触发 | 1 | — | \`${playback[s]}\` | 画面 |`)
  return [
    '# Sprite 素材规格（生图契约）',
    '',
    '## 状态总表（权威，15 状态）',
    '',
    '| 状态 | 触发 | 帧数 | motion 配方 | 播放行为 | 画面 |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    '### 播放行为（playback，manifest 必填）',
    '',
    '| 模式 | 帧序 | 帧数下限 | 示例 |',
    '|---|---|---|---|',
    '| `loop` | 正向循环 | ≥1 | working |',
    '| `pingpong` | 往返 | ≥2 | walk |',
    '',
    '## 其它小节',
    '',
  ].join('\n')
}

function makeTree(specContent, manifest = null, stateMachine = goodPriority()) {
  const root = mkdtempSync(join(tmpdir(), 'vspec-'))
  const docs = join(root, 'docs')
  mkdirSync(docs, { recursive: true })
  writeFileSync(join(docs, 'sprites-spec.md'), specContent)
  writeFileSync(join(docs, 'state-machine.md'), stateMachine)
  if (manifest !== null) {
    const assets = join(root, '.dsh-plugin', 'assets')
    mkdirSync(assets, { recursive: true })
    writeFileSync(join(assets, 'manifest.json'), JSON.stringify(manifest))
  }
  return root
}

test('接受：spec 总表与 STATE_NAMES 逐名一致、声明数正确', () => {
  const { ok, errors } = check(makeTree(goodSpec()))
  assert.equal(ok, true, errors.join('\n'))
})

test('接受：spec 播放行为列与 manifest playback 一致', () => {
  const manifest = { characters: { 'whale-girl': { states: Object.fromEntries(names.map((s) => [s, { sheet: `${s}.png`, frames: 2, fps: 4, playback: PLAYBACK[s] }])) } }, default: 'whale-girl' }
  const { ok, errors } = check(makeTree(goodSpec(), manifest))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：spec 播放行为列 ≠ manifest playback（语义级配错：idle 配 loop）', () => {
  const specBad = goodSpec({ ...PLAYBACK, idle: 'loop' }) // spec 说 idle=loop
  const manifest = { characters: { 'whale-girl': { states: Object.fromEntries(names.map((s) => [s, { sheet: `${s}.png`, frames: 2, fps: 4, playback: PLAYBACK[s] }])) } }, default: 'whale-girl' }
  const { ok, errors } = check(makeTree(specBad, manifest))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /characters\.whale-girl\.states\.idle: manifest playback "blink" ≠ spec 状态总表播放行为 "loop"/)
})

test('拒绝：STATE_NAMES 有但 spec 缺（新增状态漏同步 spec）', () => {
  const rows = names.filter((s) => s !== 'think').map((s) => `| \`${s}\` | 触发 | 1 | — | \`${PLAYBACK[s]}\` | 画面 |`)
  const spec = [
    '## 状态总表（权威，14 状态）',
    '',
    '| 状态 | 帧数 | 播放行为 |',
    '|---|---|---|',
    ...rows,
  ].join('\n')
  const { ok, errors } = check(makeTree(spec))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /client STATE_NAMES 有 think/)
})

test('拒绝：spec 有但 STATE_NAMES 缺（删除/改名状态漏同步 logic.mjs）', () => {
  const rows = [...names, 'teleport'].map((s) => `| \`${s}\` | 触发 | 1 | — | \`${PLAYBACK[s] ?? 'loop'}\` | 画面 |`)
  const spec = [
    '## 状态总表（权威，16 状态）',
    '',
    '| 状态 | 帧数 | 播放行为 |',
    '|---|---|---|',
    ...rows,
  ].join('\n')
  const { ok, errors } = check(makeTree(spec))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /spec 状态总表有 teleport/)
})

test('拒绝：声明数与表格行数不符（标题数字漂移）', () => {
  const spec = [
    '## 状态总表（权威，99 状态）',
    '',
    '| 状态 | 帧数 | 播放行为 |',
    '|---|---|---|',
    ...names.map((s) => `| \`${s}\` | 1 | \`${PLAYBACK[s]}\` |`),
  ].join('\n')
  const { ok, errors } = check(makeTree(spec))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /声明 99 状态，表格实际/)
})

test('拒绝：缺少权威总表标题', () => {
  const { ok, errors } = check(makeTree('# 只有标题\n\n没有总表\n'))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /缺少「状态总表（权威，N 状态）」标题/)
})

test('接受：优先级列表行序与 STATE_TABLE 一致', () => {
  const { ok, errors } = check(makeTree(goodSpec(), null, goodPriority()))
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：优先级列表行序 ≠ STATE_TABLE（文档与文法单源漂移）', () => {
  // idle 提到首位——文档行序与 STATE_TABLE 不一致即红
  const tableOrder = STATE_TABLE.map((r) => r.state)
  const reordered = ['idle', ...tableOrder.filter((s) => s !== 'idle')]
  const bad = ['## 优先级（STATE_TABLE 行序，文法单源）', '', ...reordered.map((s, i) => `${i + 1}. \`${s}\``), ''].join('\n')
  const { ok, errors } = check(makeTree(goodSpec(), null, bad))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /优先级列表行序.*≠.*STATE_TABLE 行序/)
})

test('拒绝：缺优先级逐行列表（state-machine 无 N. 行）', () => {
  const { ok, errors } = check(makeTree(goodSpec(), null, '## 优先级\n\ndrag > idle > burst\n'))
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /缺少「## 优先级」逐行列表/)
})
