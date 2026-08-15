// 门禁：assets manifest 引用一致性。
// 拒绝不变量：assets/manifest.json 里每个角色必须含全部 15 状态（缺一个即拒——
// 素材必须全量提供，不再 emoji 降级）；每个 state 的 sheet 引用的文件必须真实存在、
// 扩展名在 MIME 白名单内（与 src/assets.mjs 一致）、frames/fps 字段合法、
// playback 播放模式在封闭枚举内且帧数满足该模式的下限（loop≥1/pingpong≥2/once≥1/
// blink≥2——播放器按 playback 数据驱动推进，不再按状态名特判）、
// motion 配方（若声明）在白名单内且 frames 必须为 1（帧播放器与运动配方互斥；
// 定向例外：error 是唯一允许多帧+运动叠加的状态——2 帧「正常→惊吓」播完僵住，
// 叠加 shake 让 burst 窗口内持续颤抖不静止，见 decisions 动画编排修订记录）、
// PNG 多帧 sheet 必须满足宽度 = frames × 高度（横排帧图契约——单姿势图配 frames>1
// 会把姿势劈成两半）、且状态名必须在 client STATE_NAMES 权威集合内。
// 只读、确定性。
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { STATE_NAMES, PLAYBACK_MODES, PLAYBACK_MIN_FRAMES } from '../../.dsh-plugin/client/logic.mjs'
import { ROLE_ID_RE } from '../../.dsh-plugin/client/character.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

/** 与 src/assets.mjs 的 MIME 表一致的扩展名白名单。 */
const ALLOWED_EXT = ['.png', '.svg', '.webp', '.jpg', '.jpeg', '.gif', '.json']

/** 与 client/index.mjs 的 pet-motion-* 类一致的运动配方白名单。 */
export const MOTION_WHITELIST = ['bob', 'wiggle', 'squash', 'shake', 'sigh', 'hop', 'tilt', 'float', 'wave']

/** 定向例外：允许多帧+运动叠加的状态（默认互斥；error 2帧+shake 见决策记录）。 */
export const MOTION_MULTIFRAME_ALLOWED = new Set(['error'])

/** 读 PNG 的 IHDR 宽高（无依赖）；非 PNG 返回 null。 */
function pngSize(file) {
  const buf = readFileSync(file)
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

/** 校验一个角色的 states（sheet 文件在 assets/characters/<id>/ 下）。 */
function checkStates(states, roleId, errors, root) {
  const dir = roleId === null ? join(root, '.dsh-plugin', 'assets') : join(root, '.dsh-plugin', 'assets', 'characters', roleId)
  const label = roleId === null ? 'states' : `characters.${roleId}.states`
  // 必备集：全部 15 状态必须声明（素材全量契约——不再 emoji 降级）。
  const declared = new Set(Object.keys(states))
  for (const name of STATE_NAMES) {
    if (!declared.has(name)) {
      errors.push(`${label}: 缺必备状态 ${name}（素材必须全量提供 15 状态，不再 emoji 降级）`)
    }
  }
  for (const [name, cfg] of Object.entries(states)) {
    if (!STATE_NAMES.includes(name)) {
      errors.push(`${label}.${name}: 状态不在 client STATE_NAMES 权威集合（须同步 client/logic.mjs 与 spec）`)
    }
    if (cfg === null || typeof cfg !== 'object' || typeof cfg.sheet !== 'string' || cfg.sheet === '') {
      errors.push(`${label}.${name}: 缺 sheet 字段`)
      continue
    }
    const file = join(dir, cfg.sheet)
    try {
      if (!statSync(file).isFile()) throw new Error('not a file')
    } catch {
      errors.push(`${label}.${name}: sheet "${cfg.sheet}" 文件不存在（期望 ${dir.slice(root.length + 1)}/${cfg.sheet}）`)
    }
    const dot = cfg.sheet.lastIndexOf('.')
    const ext = dot === -1 ? '' : cfg.sheet.slice(dot).toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      errors.push(`${label}.${name}: sheet "${cfg.sheet}" 扩展名不在白名单 ${ALLOWED_EXT.join('/')}`)
    }
    if (!Number.isInteger(cfg.frames) || cfg.frames < 1) errors.push(`${label}.${name}: frames 必须是正整数`)
    if (typeof cfg.fps !== 'number' || cfg.fps <= 0) errors.push(`${label}.${name}: fps 必须是正数`)
    // 播放模式（v5）：playback 枚举 + 帧数交叉校验（取代 loop 布尔——播放器按此推进帧）。
    if (!PLAYBACK_MODES.includes(cfg.playback)) {
      errors.push(`${label}.${name}: playback "${cfg.playback}" 不在 ${PLAYBACK_MODES.join('/')}`)
    } else if (cfg.frames < PLAYBACK_MIN_FRAMES[cfg.playback]) {
      errors.push(`${label}.${name}: playback ${cfg.playback} 要求 frames ≥ ${PLAYBACK_MIN_FRAMES[cfg.playback]}（当前 ${cfg.frames}）`)
    }
    if (cfg.motion !== undefined) {
      if (!MOTION_WHITELIST.includes(cfg.motion)) {
        errors.push(`${label}.${name}: motion "${cfg.motion}" 不在白名单 ${MOTION_WHITELIST.join('/')}`)
      }
      if (cfg.frames !== 1 && !MOTION_MULTIFRAME_ALLOWED.has(name)) {
        errors.push(`${label}.${name}: motion 配方要求 frames === 1（帧播放器与运动配方互斥；仅 ${[...MOTION_MULTIFRAME_ALLOWED].join('/')} 定向例外）`)
      }
    }
    // PNG 多帧契约：宽度 = frames × 高度（横排、帧等宽同高）。
    // 单姿势 256×256 图配 frames:2 → 256 ≠ 512 → 拒绝（帧播放器会把姿势劈成两半）。
    if (cfg.frames > 1 && cfg.sheet.toLowerCase().endsWith('.png')) {
      try {
        const size = pngSize(file)
        if (size !== null && size.w !== cfg.frames * size.h) {
          errors.push(`${label}.${name}: frames ${cfg.frames} 要求 PNG 宽度 = ${cfg.frames} × 高度（当前 ${size.w}×${size.h}——单姿势图勿配 frames>1）`)
        }
      } catch {
        // 文件不可读（statSync 已报错）：跳过尺寸校验
      }
    }
  }
}

/** 校验 assets manifest。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  const manifestPath = join(root, '.dsh-plugin', 'assets', 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    return { ok: false, errors: [`assets/manifest.json 无法解析：${error instanceof Error ? error.message : String(error)}`] }
  }
  if (manifest === null || typeof manifest !== 'object') {
    return { ok: false, errors: ['.dsh-plugin/assets/manifest.json 必须是对象'] }
  }
  // 角色索引（characters）优先；顶层 states（旧格式）若并存也校验——两种格式都校验，
  // 防止「characters 存在时顶层遗留块无人管」的死数据盲区。
  const hasCharacters = manifest.characters !== undefined
  if (hasCharacters) {
    if (manifest.characters === null || typeof manifest.characters !== 'object' || Array.isArray(manifest.characters)) {
      return { ok: false, errors: ['.dsh-plugin/assets/manifest.json 的 characters 必须是对象'] }
    }
    for (const [roleId, ch] of Object.entries(manifest.characters)) {
      if (!ROLE_ID_RE.test(roleId)) {
        errors.push(`characters.${roleId}: 角色 id 只允许 [a-z0-9-]（URL 路径安全）`)
        continue
      }
      if (ch === null || typeof ch !== 'object') {
        errors.push(`characters.${roleId}: 角色定义必须是对象`)
        continue
      }
      if (ch.states === null || typeof ch.states !== 'object' || Array.isArray(ch.states)) {
        errors.push(`characters.${roleId}: 缺 states 对象`)
        continue
      }
      checkStates(ch.states, roleId, errors, root)
    }
    if (manifest.default !== undefined) {
      if (typeof manifest.default !== 'string' || !(manifest.default in manifest.characters)) {
        errors.push(`default "${String(manifest.default)}" 必须指向 characters 中存在的角色`)
      }
    }
    // 并存校验：顶层 states 若存在（旧格式兼容块），按平铺目录同样校验——不允许死数据逃过门禁。
    if (manifest.states !== undefined) {
      if (manifest.states === null || typeof manifest.states !== 'object' || Array.isArray(manifest.states)) {
        errors.push('.dsh-plugin/assets/manifest.json 的顶层 states（兼容块）必须是对象')
      } else {
        checkStates(manifest.states, null, errors, root)
      }
    }
  } else {
    if (manifest.states === undefined || typeof manifest.states !== 'object' || Array.isArray(manifest.states)) {
      return { ok: false, errors: ['.dsh-plugin/assets/manifest.json 缺 states 对象（或 characters 角色索引）'] }
    }
    checkStates(manifest.states, null, errors, root)
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-assets] ${e}`)
  if (!ok) {
    console.error(`[verify-assets] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log('[verify-assets] OK')
}
