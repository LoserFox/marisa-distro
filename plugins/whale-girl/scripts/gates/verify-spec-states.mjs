// 门禁：docs/sprites-spec.md 状态总表与 client STATE_NAMES 权威集合一致。
// 拒绝不变量：spec「状态总表（权威，N 状态）」声明数 ≠ 表格实际状态行数，
// 或表格状态集合 ≠ client/logic.mjs 的 STATE_NAMES（双向——新增/改名状态
// 必须同时改 spec 与 STATE_NAMES，任一漏改即红；防止文档漂移），
// 或 STATE_TABLE 行的状态（含 burst 的 resolve 值）不在 STATE_NAMES（文法漂移），
// 或 spec 状态总表的播放行为列 ≠ assets/manifest.json 每角色的 playback 值
// （playback 语义级配错盲区：枚举合法但模式不符——idle 配 loop、walk 配 loop 等），
// 或 docs/state-machine.md 优先级逐行列表的行序 ≠ STATE_TABLE 行序
// （文档优先级是 STATE_TABLE 的行序家——单测不再拷贝 order 数组，此处机械守护）。
// 只读、确定性。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { STATE_NAMES, STATE_TABLE } from '../../lib/client/logic.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
// 权威总表标题：`## 状态总表（权威，N 状态）`（N 由表格行数验证，防止手改标题数漂移）。
const TITLE_RE = /^## 状态总表（权威，(\d+) 状态）$/
// 表格状态行：`| \`name\` | 触发 | 帧数 | motion | \`playback\` | 画面 |`（表头/分隔行除外）。
const STATE_ROW_RE = /^\| `([a-z-]+)` \|.*\| `([a-z]+)` \|/
// 优先级逐行列表行：`N. ...`（行内可含多个状态 token，如 `eat` / `play`；全角括号注释忽略）。
const PRIORITY_ROW_RE = /^\d+\.\s+/

/** 校验 spec 状态总表与 STATE_NAMES/STATE_TABLE/manifest playback 一致。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  const spec = join(root, 'docs', 'sprites-spec.md')
  let lines
  try {
    lines = readFileSync(spec, 'utf8').split('\n')
  } catch (error) {
    return { ok: false, errors: [`docs/sprites-spec.md 无法读取：${error instanceof Error ? error.message : String(error)}`] }
  }
  let declared = null
  let inTable = false
  const rows = [] // { name, playback }
  for (const line of lines) {
    const t = TITLE_RE.exec(line)
    if (t !== null) {
      declared = Number(t[1])
      inTable = true
      continue
    }
    if (inTable) {
      if (line.startsWith('#')) break // 表格结束（下一标题，h2/h3 皆然——状态总表是第一个表）
      const m = STATE_ROW_RE.exec(line)
      if (m !== null && !line.includes('---')) rows.push({ name: m[1], playback: m[2] })
    }
  }
  if (declared === null) {
    errors.push('docs/sprites-spec.md 缺少「状态总表（权威，N 状态）」标题')
    return { ok: false, errors }
  }
  if (rows.length !== declared) {
    errors.push(`状态总表声明 ${declared} 状态，表格实际 ${rows.length} 行（新增/删除状态须同步标题数字与表格）`)
  }
  const specSet = new Set(rows.map((r) => r.name))
  const nameSet = new Set(STATE_NAMES)
  for (const name of nameSet) {
    if (!specSet.has(name)) errors.push(`client STATE_NAMES 有 ${name}，spec 状态总表缺（须同步 docs/sprites-spec.md）`)
  }
  for (const name of specSet) {
    if (!nameSet.has(name)) errors.push(`spec 状态总表有 ${name}，client STATE_NAMES 缺（须同步 client/logic.mjs）`)
  }
  // STATE_TABLE 文法漂移：行状态（含 burst resolve 的动态值）必须在权威集合内。
  for (const row of STATE_TABLE) {
    if (row.state !== 'burst' && !nameSet.has(row.state)) {
      errors.push(`STATE_TABLE 行状态 ${row.state} 不在 STATE_NAMES（新增状态须同步权威集合与 spec）`)
    }
  }
  for (const dynamic of ['welcome', 'celebrate', 'error', 'disappointed']) {
    if (!nameSet.has(dynamic)) errors.push(`burst 动态解析值 ${dynamic} 不在 STATE_NAMES`)
  }
  // spec 播放行为列 ↔ manifest playback 对照（语义级配错盲区拦截）。
  const manifestPath = join(root, 'lib', 'assets', 'manifest.json')
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const specPlayback = new Map(rows.map((r) => [r.name, r.playback]))
    const collect = (states, label) => {
      for (const [name, cfg] of Object.entries(states ?? {})) {
        if (cfg !== null && typeof cfg === 'object' && typeof cfg.playback === 'string') {
          const expected = specPlayback.get(name)
          if (expected !== undefined && cfg.playback !== expected) {
            errors.push(`${label}.${name}: manifest playback "${cfg.playback}" ≠ spec 状态总表播放行为 "${expected}"（须同步）`)
          }
        }
      }
    }
    if (manifest?.characters !== null && typeof manifest?.characters === 'object') {
      for (const [id, ch] of Object.entries(manifest.characters)) {
        if (ch !== null && typeof ch === 'object') collect(ch.states, `characters.${id}.states`)
      }
    } else {
      collect(manifest?.states, 'states')
    }
  } catch {
    // manifest 不可读/不可解析：verify-assets 门禁负责报（此处跳过，不重复报）
  }
  // 优先级列表 ↔ STATE_TABLE 行序（文档为行序家；单测不再拷贝 order 数组）。
  const docOrder = parsePriorityList(join(root, 'docs', 'state-machine.md'))
  if (docOrder === null) {
    errors.push('docs/state-machine.md 缺少「## 优先级」逐行列表（N. 行，verify-spec-states 机械校验行序）')
  } else {
    const tableOrder = STATE_TABLE.map((r) => r.state)
    if (JSON.stringify(docOrder) !== JSON.stringify(tableOrder)) {
      errors.push(`优先级列表行序 [${docOrder.join(', ')}] ≠ STATE_TABLE 行序 [${tableOrder.join(', ')}]（文档与文法单源漂移）`)
    }
  }
  return { ok: errors.length === 0, errors }
}

/** 解析 docs/state-machine.md 优先级逐行列表 → 状态 token 序列；缺列表返回 null。 */
export function parsePriorityList(file) {
  let lines
  try {
    lines = readFileSync(file, 'utf8').split('\n')
  } catch {
    return null
  }
  const order = []
  let inList = false
  for (const line of lines) {
    if (line.startsWith('## 优先级')) { inList = true; continue }
    if (inList) {
      if (line.startsWith('## ')) break
      if (PRIORITY_ROW_RE.test(line)) {
        // 剥离全角括号注释（burst 行内展开的 4 状态不算顶层 token），取行内全部反引号 token
        // （`eat` / `play` 一行即两个连续行——文档行序 token 序列须等于 STATE_TABLE 行序）。
        const withoutNotes = line.replace(/（[^）]*）/g, '')
        const tokens = [...withoutNotes.matchAll(/`([a-z-]+)`/g)].map((m) => m[1])
        if (tokens.length > 0) order.push(...tokens)
      }
    }
  }
  return order.length > 0 ? order : null
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-spec-states] ${e}`)
  if (!ok) {
    console.error(`[verify-spec-states] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log(`[verify-spec-states] OK（${STATE_NAMES.length} 状态与 spec 总表一致）`)
}
