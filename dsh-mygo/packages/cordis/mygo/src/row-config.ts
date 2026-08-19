/**
 * profile patch 层行 config 读写（P7-A2 起；r6 起面板/CLI 共用，收敛进
 * mygo 核心）：patch 不 deep-merge 的补救——读取目标行的整行 config，浅
 * 合并修改后写回整行；行定位与块切分为文本级（保留注释与行序），config
 * 子块经 js-yaml 解析/重排。`upsertRowConfig` 覆盖「行不存在则追加
 * id 定向覆盖行」（bundle 行在 bundle patch 层声明，用户层首次覆盖时
 * 无既有行）。r7 起全部写盘走 patch-io（进程内串行 + tmp+rename 原子写）。
 * @module @r05en1cu/dsh-mygo/src/row-config
 */

import { existsSync, readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { COMPANION_BLOCK_MARKERS } from './bundle-rail.ts'
import { configFingerprint } from './config-fingerprint.ts'
import { LIVE_BLOCK_PATTERN } from './live-rail.ts'
import { hasYamlContent, mutatePatchFile, readPatchText, resolvePatchPath } from './patch-io.ts'

export interface ConfigRowResult {
  readonly ok: boolean
  /** 当前 config（读/写后均为整行最新值）。 */
  readonly config?: Record<string, unknown>
  readonly error?: string | undefined
  /** 该行 config 的当前 revision；行缺失时按 0 计。 */
  readonly revision?: number | undefined
  /** expectedRevision 过期时的冲突事实（不写入）。 */
  readonly revisionConflict?: {
    readonly expected: number
    readonly actual: number
  }
}

/** 行 config revision 的读视图：行缺失按空 config / revision 0 处理。 */
export interface ConfigRowRevision {
  readonly ok: boolean
  readonly config: Record<string, unknown> | undefined
  readonly revision: number
  readonly error?: string | undefined
}

/** patch 层行的文本区间。 */
interface RowSpan {
  readonly start: number
  readonly end: number
  readonly indent: string
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** 定位插件行（`- id: <id>`，可选引号；insert 列表内缩进更深亦覆盖）。 */
function findRow(lines: readonly string[], id: string): RowSpan | undefined {
  const rowRe = new RegExp(`^(\\s*)-\\s+id:\\s*['"]?${escapeRegExp(id)}['"]?\\s*$`)
  for (const [index, line] of lines.entries()) {
    const match = rowRe.exec(line)
    if (match === null) continue
    const indent = match[1] ?? ''
    let end = lines.length
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? ''
      if (candidate.trim() === '') continue
      const depth = indentOf(candidate)
      if (depth < indent.length) {
        end = cursor
        break
      }
      if (depth === indent.length && candidate.trimStart().startsWith('- ')) {
        end = cursor
        break
      }
    }
    return { start: index, end, indent }
  }
  return undefined
}

/** 行内 config 子块区间（无 config 返回 undefined）。 */
function findConfigBlock(rowLines: readonly string[], rowIndent: string): { readonly start: number; readonly end: number; readonly indent: string; readonly inline?: string } | undefined {
  const configRe = /^(\s*)config:\s*(.*)$/
  for (const [index, line] of rowLines.entries()) {
    const match = configRe.exec(line)
    if (match === null) continue
    const indent = match[1] ?? ''
    if (indent.length <= rowIndent.length) continue
    const inline = (match[2] ?? '').trim()
    if (inline !== '') return { start: index, end: index + 1, indent, inline }
    let end = rowLines.length
    for (let cursor = index + 1; cursor < rowLines.length; cursor += 1) {
      const candidate = rowLines[cursor] ?? ''
      if (candidate.trim() === '') continue
      if (indentOf(candidate) <= indent.length) {
        end = cursor
        break
      }
    }
    return { start: index, end, indent }
  }
  return undefined
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 枚举 patch 层全部行 id（出现序去重；r6 配置导出用）。 */
export function listPatchRowIds(text: string): readonly string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/^\s*-\s+id:\s*['"]?([a-z][a-z0-9-]*)['"]?\s*$/gm)) {
    const id = match[1]
    if (id !== undefined && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/** mygo 受管 disable 块标记（profileSetEnabled 写入、removePatchRows 清理共用）。 */
export const DISABLE_BLOCK_BEGIN = '# --- mygo managed disable'
export const DISABLE_BLOCK_END = '# --- end mygo managed disable ---'

/** 进程内行 revision 缓存：fingerprint 变化才推进，数值单调。 */
interface RowRevisionEntry {
  revision: number
  fingerprint: string | undefined
}

const rowRevisions = new Map<string, RowRevisionEntry>()

function rowRevisionKey(home: string, profile: string, id: string): string {
  return `${home}\u0000${profile}\u0000${id}`
}

/** 按当前 fingerprint 取 revision：首次读为 0，fingerprint 变化 +1。 */
function rowRevisionOf(key: string, fingerprint: string | undefined): number {
  const current = rowRevisions.get(key)
  if (current === undefined) {
    rowRevisions.set(key, { revision: 0, fingerprint })
    return 0
  }
  if (current.fingerprint !== fingerprint) {
    current.revision += 1
    current.fingerprint = fingerprint
  }
  return current.revision
}

/** 写入后推进 revision：before/after 相同则不动，不同则 +1。 */
function advanceRowRevision(key: string, before: string | undefined, after: string | undefined): number {
  const current = rowRevisions.get(key) ?? { revision: 0, fingerprint: before }
  if (current.fingerprint !== after) {
    current.revision += 1
    current.fingerprint = after
  }
  rowRevisions.set(key, current)
  return current.revision
}

/** 文本级 revision 状态：行缺失 = 空 config，revision 沿用该行缓存。 */
function rowRevisionOfText(home: string, profile: string, id: string, text: string): ConfigRowRevision {
  const key = rowRevisionKey(home, profile, id)
  const lines = text.split('\n')
  if (findRow(lines, id) === undefined) {
    return {
      ok: true,
      config: undefined,
      revision: rowRevisionOf(key, undefined),
    }
  }
  const parsed = rowConfigOfText(text, id)
  if (!parsed.ok) {
    return {
      ok: false,
      config: undefined,
      revision: rowRevisions.get(key)?.revision ?? 0,
      error: parsed.error,
    }
  }
  const config = parsed.config ?? {}
  const fingerprint = configFingerprint(config)
  return { ok: true, config, revision: rowRevisionOf(key, fingerprint) }
}

/** 读 profile patch 层文本（缺失按空文档计）。 */
export function readProfilePatchText(home: string, profile: string): string {
  return readPatchText(home, profile)
}

/** 文本级整行 config 解析（无行 → 报错；无 config → {}）。 */
function rowConfigOfText(text: string, id: string): ConfigRowResult {
  const lines = text.split('\n')
  const row = findRow(lines, id)
  if (row === undefined) return { ok: false, error: `patch 层没有 ${id} 行` }
  const rowLines = lines.slice(row.start, row.end)
  const block = findConfigBlock(rowLines, row.indent)
  if (block === undefined) return { ok: true, config: {} }
  const text0 = block.inline !== undefined
    ? block.inline
    : rowLines.slice(block.start + 1, block.end).map(line => line.slice(block.indent.length + 2)).join('\n')
  const parsed = yaml.load(text0) as unknown
  if (parsed === undefined || parsed === null) return { ok: true, config: {} }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `${id} 行 config 不是对象` }
  }
  return { ok: true, config: parsed as Record<string, unknown> }
}

/** 读目标插件行的整行 config（无行 → 报错；无 config → {}）。 */
export function readRowConfig(home: string, profile: string, id: string): ConfigRowResult {
  let path: string
  try {
    path = resolvePatchPath(home, profile)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (!existsSync(path)) return { ok: false, error: `profile patch 层不存在：${path}` }
  const parsed = rowConfigOfText(readFileSync(path, 'utf8'), id)
  if (!parsed.ok) return parsed
  const key = rowRevisionKey(home, profile, id)
  const fingerprint = configFingerprint(parsed.config ?? {})
  return { ...parsed, revision: rowRevisionOf(key, fingerprint) }
}

/** 读行 config revision（行缺失按空 config / revision 0，供面板 API 使用）。 */
export function readRowConfigRevision(home: string, profile: string, id: string): ConfigRowRevision {
  let path: string
  try {
    path = resolvePatchPath(home, profile)
  } catch (error) {
    return {
      ok: false,
      config: undefined,
      revision: rowRevisions.get(rowRevisionKey(home, profile, id))?.revision ?? 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  return rowRevisionOfText(home, profile, id, text)
}

/** 浅合并写回整行 config（行无 config 则追加子块；行不存在报错）。 */
export function writeRowConfig(
  home: string,
  profile: string,
  id: string,
  patch: Record<string, unknown>,
  expectedRevision?: number,
): ConfigRowResult {
  let path: string
  try {
    path = resolvePatchPath(home, profile)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  let result: ConfigRowResult = { ok: false, error: 'patch 写盘未执行' }
  const key = rowRevisionKey(home, profile, id)
  mutatePatchFile(home, profile, (text, exists) => {
    if (!exists) {
      result = { ok: false, error: `profile patch 层不存在：${path}` }
      return undefined
    }
    const lines = text.split('\n')
    const row = findRow(lines, id)
    if (row === undefined) {
      result = { ok: false, error: `patch 层没有 ${id} 行` }
      return undefined
    }
    const current = rowConfigOfText(text, id)
    if (!current.ok) {
      result = current
      return undefined
    }
    const currentFingerprint = configFingerprint(current.config ?? {})
    const actual = rowRevisionOf(key, currentFingerprint)
    if (expectedRevision !== undefined && expectedRevision !== actual) {
      result = {
        ok: false,
        error: `${id} 行 config 已变化（expected revision ${expectedRevision}, actual ${actual}）`,
        revision: actual,
        revisionConflict: { expected: expectedRevision, actual },
      }
      return undefined
    }
    const merged = { ...current.config, ...patch }
    const nextFingerprint = configFingerprint(merged)
    const revision = advanceRowRevision(key, currentFingerprint, nextFingerprint)
    const dumped = yaml.dump(merged, { lineWidth: -1, noRefs: true }).trimEnd()
    const rowLines = lines.slice(row.start, row.end)
    // 行尾空行不进 config 追加位置（追加必须紧贴行末内容行）。
    while (rowLines.length > 0 && (rowLines[rowLines.length - 1] ?? '').trim() === '') rowLines.pop()
    const block = findConfigBlock(rowLines, row.indent)
    const configLines = dumped.split('\n').map(line => `${row.indent}  ${line}`)
    let nextRow: string[]
    if (block === undefined) {
      nextRow = [...rowLines, `${row.indent}  config:`, ...configLines.map(line => `  ${line}`)]
    } else {
      nextRow = [
        ...rowLines.slice(0, block.start),
        `${block.indent}config:`,
        ...configLines.map(line => `  ${line}`),
        ...rowLines.slice(block.end),
      ]
    }
    result = { ok: true, config: merged, revision }
    return [...lines.slice(0, row.start), ...nextRow, ...lines.slice(row.end)].join('\n')
  })
  return result
}

/**
 * 行不存在则追加 id 定向覆盖行的写回（r6）：bundle 行的 config 首次从
 * 用户层覆盖时 patch 文件里无既有行，追加
 * `- id: <id>\n  config: {...}` 到文末（官方 id 定向 override 形态；
 * 宿主 watchUserPatches 重载后生效）。行存在时与 writeRowConfig 同语义。
 */
export function upsertRowConfig(
  home: string,
  profile: string,
  id: string,
  patch: Record<string, unknown>,
  expectedRevision?: number,
): ConfigRowResult {
  const text = readProfilePatchText(home, profile)
  const lines = text.split('\n')
  if (findRow(lines, id) !== undefined) return writeRowConfig(home, profile, id, patch, expectedRevision)
  const key = rowRevisionKey(home, profile, id)
  const dumped = yaml.dump(patch, { lineWidth: -1, noRefs: true }).trimEnd()
  const entry = [`- id: ${id}`, '  config:', ...dumped.split('\n').map(line => `    ${line}`)].join('\n')
  let result: ConfigRowResult = { ok: false, error: 'patch 写盘未执行' }
  mutatePatchFile(home, profile, (current) => {
    const currentFingerprint = configFingerprint(undefined)
    const actual = rowRevisionOf(key, currentFingerprint)
    if (expectedRevision !== undefined && expectedRevision !== actual) {
      result = {
        ok: false,
        error: `${id} 行 config 已变化（expected revision ${expectedRevision}, actual ${actual}）`,
        revision: actual,
        revisionConflict: { expected: expectedRevision, actual },
      }
      return undefined
    }
    const revision = advanceRowRevision(key, currentFingerprint, configFingerprint(patch))
    // 空用户层（无行且恰含独立 `[]` 占位行）：替换占位行而非追加——追加会在
    // `[]` 之后产出非法 YAML（rc.4 同形态教训，e2e 实测抓出）。
    if (/^\[\]\s*$/m.test(current) && listPatchRowIds(current).length === 0) {
      result = { ok: true, config: patch, revision }
      return current.replace(/^\[\]\s*$/m, `${entry}\n`)
    }
    const head = current.trimEnd()
    result = { ok: true, config: patch, revision }
    return head === '' ? `${entry}\n` : `${head}\n\n${entry}\n`
  })
  return result
}

export interface RemovePatchRowsResult {
  readonly ok: boolean
  /** 实际被移除的行 id（存在才计，按入参序去重）。 */
  readonly removed: readonly string[]
  readonly error?: string | undefined
}

/**
 * 卸载清理（rc.6 残留 bugfix）：移除 patch 层内指定 id 的定向行（r6
 * upsert 写入的 config 覆盖行）、mygo 受管 disable 块、bundle-rail
 * companion 块（disable/enable/host，块内 rowId 可能不止一个，整块剥
 * 才不留孤儿行）与 live rail 受管块（r7；块标记携带包名，按 id 精确或
 * scope 末段匹配），其余用户内容不动；移除后无内容行时回落 `[]`——host
 * 要求顶层合法 YAML 数组，仅注释/空白的文件解析为 null 会 fail-loud
 * （rc.3 同形态）。幂等；文件缺失按无行计。
 */
export function removePatchRows(home: string, profile: string, ids: readonly string[]): RemovePatchRowsResult {
  let path: string
  try {
    path = resolvePatchPath(home, profile)
  } catch (error) {
    return { ok: false, removed: [], error: error instanceof Error ? error.message : String(error) }
  }
  if (!existsSync(path)) return { ok: true, removed: [] }
  const removed: string[] = []
  const mark = (id: string): void => {
    if (!removed.includes(id)) removed.push(id)
  }
  mutatePatchFile(home, profile, (text) => {
    let current = text
    // live rail 受管块整块剥（r7 兜底；正常卸载路径 liveUninstall 已剥，
    // 这里是崩溃残留/旁路写入的清理）。包名 = id 或任意 scope 末段。
    current = current.replace(LIVE_BLOCK_PATTERN, (whole, pkg: string) => {
      const hit = ids.find(candidate => pkg === candidate || pkg.endsWith(`/${candidate}`))
      if (hit === undefined) return whole
      mark(hit)
      return '\n'
    })
    for (const id of ids) {
      // 受管块先整块剥（块内含 - id 行，单剥行会留下不成对的标记）。
      const begin = `${DISABLE_BLOCK_BEGIN} (id:${id}) ---`
      const pattern = new RegExp(`\\n?${escapeRegExp(begin)}\\n(?:.*\\n)*?${escapeRegExp(DISABLE_BLOCK_END)}\\n?`)
      const stripped = current.replace(pattern, '\n')
      if (stripped !== current) {
        current = stripped
        mark(id)
      }
      for (const [start, end] of COMPANION_BLOCK_MARKERS(id)) {
        const blockPattern = new RegExp(`\\n?${escapeRegExp(start)}\\n[\\s\\S]*?${escapeRegExp(end)}\\n?`)
        const without = current.replace(blockPattern, '\n')
        if (without !== current) {
          current = without
          mark(id)
        }
      }
      // 定向行（findRow 取首个匹配，循环剥净同名行）。
      for (;;) {
        const lines = current.split('\n')
        const row = findRow(lines, id)
        if (row === undefined) break
        current = [...lines.slice(0, row.start), ...lines.slice(row.end)].join('\n')
        mark(id)
      }
    }
    if (removed.length === 0) return undefined
    const body = current.replace(/\n{3,}/g, '\n\n').trimEnd()
    return hasYamlContent(body) ? `${body}\n` : body === '' ? '[]\n' : `${body}\n[]\n`
  })
  for (const id of ids) rowRevisions.delete(rowRevisionKey(home, profile, id))
  return { ok: true, removed }
}
