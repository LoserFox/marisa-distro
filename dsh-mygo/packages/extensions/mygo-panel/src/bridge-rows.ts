/**
 * 面板桥接行的文本装配与可解析性校验（P8 后 rc.3 升级路径安全加固）：
 * 纯函数面，供 syncBridgeRows 调用、包级测试直测。
 *
 * 红线：
 * - 只替换/插入自己的标记块，用户内容（块外）逐字节不动；
 * - 空文件落 `[]`（合法 YAML），绝不把 `[]` 裹进块注释中间；
 * - 写出前校验桥接包可解析，不可解析的行跳过（由调用方 warn）——
 *   绝不写出会让 dsh boot fail-loud 的行。
 * @module @r05en1cu/dsh-mygo-ext-panel/bridge-rows
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 受管块标记（profile patch 层内）。 */
export const ROW_MARKER_START = '# --- dsh-mygo-panel managed installs (generated; do not edit) ---'
export const ROW_MARKER_END = '# --- end dsh-mygo-panel managed installs ---'

/** 一条桥接行（装配所需的最小面）。 */
export interface BridgeRowLike {
  readonly id: string
  readonly name: string
  readonly config: unknown
}

/** 剥出标记块之外的用户内容（head/tail 原样；无块时整体为 head）。 */
export function splitManagedBlock(existing: string): { readonly head: string; readonly tail: string } {
  const start = existing.indexOf(ROW_MARKER_START)
  if (start === -1) return { head: existing, tail: '' }
  const end = existing.indexOf(ROW_MARKER_END, start)
  if (end === -1) return { head: existing.slice(0, start), tail: '' }
  return {
    head: existing.slice(0, start),
    tail: existing.slice(end + ROW_MARKER_END.length),
  }
}

/** 判断一段文本是否含有 YAML 内容行（非空非注释）。 */
function hasContent(text: string): boolean {
  return text.split('\n').some(line => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('#')
  })
}

/**
 * 装配 profile patch 文本：rows 为空时整块摘除（结果无内容则落 `[]`）；
 * 非空时 head（用户内容）原样保留 + 受管块 + tail。head 恰为独立 `[]`
 * 占位文档时视为空（升级行将取而代之）。
 */
export function buildProfilePatchText(existing: string, rows: readonly BridgeRowLike[]): string {
  const { head, tail } = splitManagedBlock(existing)
  const headText = head.trim() === '[]' ? '' : head.replace(/\s+$/, '')
  const tailText = tail.replace(/^\s+/, '')
  if (rows.length === 0) {
    const kept = [headText, tailText.replace(/\s+$/, '')].filter(part => part !== '')
    if (kept.length === 0) return '[]\n'
    const body = kept.join('\n\n')
    // 仅剩注释/空白时也必须落顶层数组——YAML 只有注释解析为 null，
    // host 侧要求顶层数组（rc.3 事故形态）。
    return hasContent(body) ? body + '\n' : body + '\n[]\n'
  }
  let block = `${ROW_MARKER_START}\n- insert:\n`
  for (const row of rows) {
    block += `    - id: ${row.id}\n      name: '${row.name}'\n      config: ${JSON.stringify(row.config)}\n`
  }
  block += `${ROW_MARKER_END}\n`
  if (headText === '') return `${block}${tailText}`
  return `${headText}\n\n${block}${tailText}`
}

/**
 * 校验桥接行在目标 profile 可解析：profile node_modules 或
 * profiles/node_modules 兜底链上存在同名包（package.json name 精确匹配
 * 防陈旧 scope 错位）且入口文件存在（main / exports['.'] / src/index.ts
 * 顺序探测）。
 */
export function isBridgeRowResolvable(profileDir: string, homeRoot: string, name: string): boolean {
  const candidates = [
    join(profileDir, 'node_modules', name),
    join(homeRoot, 'profiles', 'node_modules', name),
  ]
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        readonly name?: unknown
        readonly main?: unknown
        readonly exports?: unknown
      }
      if (pkg.name !== name) continue
      const entries: string[] = []
      if (typeof pkg.main === 'string' && pkg.main !== '') entries.push(pkg.main)
      const exportsField = pkg.exports
      if (typeof exportsField === 'object' && exportsField !== null && !Array.isArray(exportsField)) {
        const dot = (exportsField as Record<string, unknown>)['.']
        const target = typeof dot === 'string'
          ? dot
          : typeof dot === 'object' && dot !== null
            ? (dot as Record<string, unknown>).default ?? (dot as Record<string, unknown>).import
            : undefined
        if (typeof target === 'string' && target !== '') entries.push(target)
      }
      entries.push('src/index.ts', 'lib/index.js')
      if (entries.some(entry => existsSync(join(dir, entry)))) return true
    } catch {
      // 无 package.json / 不可读：换下一个候选
    }
  }
  return false
}

/**
 * 过滤出可解析的桥接行；被跳过的行通过 onSkip 回调（调用方负责 warn
 * 日志——指明目录与清理建议）。
 */
export function filterResolvableRows(
  rows: readonly BridgeRowLike[],
  resolvable: (name: string) => boolean,
  onSkip: (row: BridgeRowLike) => void,
): readonly BridgeRowLike[] {
  const kept: BridgeRowLike[] = []
  for (const row of rows) {
    if (resolvable(row.name)) kept.push(row)
    else onSkip(row)
  }
  return kept
}
