// 门禁自证：verify-assets 必须证明它会拒绝（法则 2）。
// 归属：门禁源码改动跑本文件（node --test scripts/gates/）。
// v5：素材全量契约——每个角色必须含全部 15 状态（STATE_NAMES），缺一即拒。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { check } from './verify-assets.mjs'
import { STATE_NAMES } from '../../lib/client/logic.mjs'

/** 构造一个含全部 15 状态的完整 manifest（每个状态一个合法条目）。 */
function fullStates(overrides = {}) {
  const states = {}
  for (const name of STATE_NAMES) {
    states[name] = { sheet: `${name}.png`, frames: 2, fps: 4, playback: 'loop' }
  }
  for (const [k, v] of Object.entries(overrides)) states[k] = v
  return { states }
}

/** 写全 15 个 sheet 文件（目录由 root 决定）。 */
function writeSheets(root, dir = 'lib/assets') {
  for (const name of STATE_NAMES) {
    const p = join(root, dir, `${name}.png`)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, fakePng(512, 256))
  }
}

function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'vass-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content instanceof Buffer ? content : typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

/** 构造最小 PNG 头（宽高可指定；门禁只读 IHDR 尺寸）。 */
function fakePng(w, h) {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12)
  buf.writeUInt32BE(w, 16)
  buf.writeUInt32BE(h, 20)
  return buf
}

test('接受：全 15 状态 + sheet 全存在且字段合法', () => {
  const root = makeTree({ 'lib/assets/manifest.json': fullStates() })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：缺必备状态（素材必须全量，不再 emoji 降级）', () => {
  const states = fullStates()
  delete states.states.think // 缺一个
  const root = makeTree({ 'lib/assets/manifest.json': states })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /缺必备状态 think/)
})

test('拒绝：manifest 引用不存在的 sheet（含状态名与路径）', () => {
  const root = makeTree({ 'lib/assets/manifest.json': fullStates() }) // 不写 sheet 文件
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /states\.idle/)
  assert.match(errors.join('\n'), /idle\.png/)
})

test('拒绝：manifest 不是合法 JSON', () => {
  const root = makeTree({ 'lib/assets/manifest.json': '{broken' })
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /无法解析/)
})

test('拒绝：frames 非法', () => {
  const bad = fullStates({ idle: { sheet: 'idle.png', frames: 0, fps: 4, playback: 'loop' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /frames 必须是正整数/)
})

test('拒绝：sheet 扩展名不在 MIME 白名单', () => {
  const bad = fullStates({ idle: { sheet: 'idle.txt', frames: 2, fps: 4, playback: 'loop' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /扩展名不在白名单/)
})

test('接受：frames:1 + 白名单 motion 配方', () => {
  const good = fullStates({ idle: { sheet: 'idle.png', frames: 1, fps: 4, playback: 'loop', motion: 'bob' } })
  const root = makeTree({ 'lib/assets/manifest.json': good })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：motion 不在白名单', () => {
  const bad = fullStates({ idle: { sheet: 'idle.png', frames: 1, fps: 4, playback: 'loop', motion: 'teleport' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /motion "teleport" 不在白名单/)
})

test('拒绝：motion 配 frames>1（与帧播放器互斥）', () => {
  const bad = fullStates({ idle: { sheet: 'idle.png', frames: 2, fps: 4, playback: 'loop', motion: 'bob' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /motion 配方要求 frames === 1/)
})

test('接受：定向例外 error 多帧+运动叠加（2帧+shake，仅 error 放行）', () => {
  const good = fullStates({ error: { sheet: 'error.png', frames: 2, fps: 8, playback: 'once', motion: 'shake' } })
  const root = makeTree({ 'lib/assets/manifest.json': good })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：error 之外的状态多帧+运动叠加（例外不扩散）', () => {
  const bad = fullStates({ drag: { sheet: 'drag.png', frames: 2, fps: 5, playback: 'loop', motion: 'tilt' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /motion 配方要求 frames === 1/)
})

test('拒绝：单姿势 256×256 配 frames:2（宽度 ≠ 2×高度，姿势会被劈开）', () => {
  const bad = fullStates({ eat: { sheet: 'eat.png', frames: 2, fps: 10, playback: 'once' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  // 覆盖 eat 为 256 单宽（其他状态正常 512）——在 writeSheets 之后覆盖
  writeFileSync(join(root, 'lib', 'assets', 'eat.png'), fakePng(256, 256))
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /frames 2 要求 PNG 宽度 = 2 × 高度/)
})

test('拒绝：manifest 状态不在 client STATE_NAMES 权威集合', () => {
  const states = fullStates()
  states.states.teleport = { sheet: 'teleport.png', frames: 1, fps: 4, playback: 'loop' }
  const root = makeTree({ 'lib/assets/manifest.json': states })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /不在 client STATE_NAMES 权威集合/)
})

test('接受：角色索引（characters + default）且 sheet 在角色目录', () => {
  const good = {
    characters: {
      'whale-girl': { meta: { stageSize: 110 }, states: fullStates().states },
      cat: { states: fullStates().states },
    },
    default: 'whale-girl',
  }
  const root = makeTree({ 'lib/assets/manifest.json': good })
  writeSheets(root, 'lib/assets/characters/whale-girl')
  writeSheets(root, 'lib/assets/characters/cat')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：角色 sheet 文件缺失（期望在 characters/<id>/ 下）', () => {
  const bad = {
    characters: { 'whale-girl': { states: fullStates().states } },
    default: 'whale-girl',
  }
  const root = makeTree({ 'lib/assets/manifest.json': bad, 'assets/idle.png': 'x' }) // 平铺不算数
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /文件不存在.*characters\/whale-girl\/idle\.png/)
})

test('拒绝：角色 id 非法（URL 注入面）', () => {
  const bad = {
    characters: { 'a/b': { states: fullStates().states } },
    default: 'a/b',
  }
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets/characters/a/b')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /角色 id 只允许/)
})

test('拒绝：default 指向不存在的角色', () => {
  const bad = {
    characters: { 'whale-girl': { states: fullStates().states } },
    default: 'nope',
  }
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets/characters/whale-girl')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /default .* 必须指向/)
})

test('接受：旧格式顶层 states（sheet 平铺 assets/）兼容', () => {
  const root = makeTree({ 'lib/assets/manifest.json': fullStates() })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

// ---- playback 播放模式（v5）----

test('接受：四种 playback 模式 + 帧数下限满足', () => {
  const good = fullStates({
    idle: { sheet: 'idle.png', frames: 3, fps: 2, playback: 'blink' },
    walk: { sheet: 'walk.png', frames: 3, fps: 6, playback: 'pingpong' },
    wake: { sheet: 'wake.png', frames: 2, fps: 3, playback: 'once' },
  })
  const root = makeTree({ 'lib/assets/manifest.json': good })
  writeSheets(root, 'lib/assets')
  // blink/pingpong 用 3 帧 → 需 768×256；覆盖（其他状态默认 512×256 匹配 frames:2）
  writeFileSync(join(root, 'lib', 'assets', 'idle.png'), fakePng(768, 256))
  writeFileSync(join(root, 'lib', 'assets', 'walk.png'), fakePng(768, 256))
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})

test('拒绝：playback 不在封闭枚举', () => {
  const bad = fullStates({ idle: { sheet: 'idle.png', frames: 3, fps: 2, playback: 'teleport' } })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /playback "teleport" 不在/)
})

test('拒绝：blink/pingpong 帧数低于下限（交叉校验）', () => {
  const bad = fullStates({
    idle: { sheet: 'idle.png', frames: 1, fps: 2, playback: 'blink' },    // blink 需 ≥2
    walk: { sheet: 'walk.png', frames: 1, fps: 6, playback: 'pingpong' }, // pingpong 需 ≥2
  })
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /playback blink 要求 frames ≥ 2/)
  assert.match(errors.join('\n'), /playback pingpong 要求 frames ≥ 2/)
})

test('拒绝：playback 字段缺失（undefined）——枚举校验兜住', () => {
  const bad = fullStates()
  delete bad.states.idle.playback // 漏配 playback
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /playback "undefined" 不在/)
})

test('拒绝：characters 与顶层 states 并存时顶层遗留块同样校验（防死数据盲区）', () => {
  // characters 全量正常 + 顶层 states 缺必备状态（think）→ 并存时也必须红
  const bad = {
    characters: { 'whale-girl': { states: fullStates().states } },
    default: 'whale-girl',
    states: (() => { const s = fullStates().states; delete s.think; return s })(),
  }
  const root = makeTree({ 'lib/assets/manifest.json': bad })
  writeSheets(root, 'lib/assets/characters/whale-girl')
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, false)
  assert.match(errors.join('\n'), /states: 缺必备状态 think/)
})

test('接受：characters 与顶层 states 并存且都全量合法', () => {
  const good = {
    characters: { 'whale-girl': { states: fullStates().states } },
    default: 'whale-girl',
    states: fullStates().states,
  }
  const root = makeTree({ 'lib/assets/manifest.json': good })
  writeSheets(root, 'lib/assets/characters/whale-girl')
  writeSheets(root, 'lib/assets')
  const { ok, errors } = check(root)
  assert.equal(ok, true, errors.join('\n'))
})
