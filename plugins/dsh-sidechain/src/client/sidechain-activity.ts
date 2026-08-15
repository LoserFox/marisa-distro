/**
 * Activity-line derivation for running side-conversation rows (browser half).
 *
 * While a child is running, its catalog row shows one live preview line under
 * the label — the child's latest assistant text, or (while it only works) the
 * last tool call summarized as `🔧 <tool> · <salient arg>` — derived from a
 * light transcript-tail fetch. Pure module: everything here is unit-testable
 * without React or the runtime.
 */

import type { TranscriptRow } from './sidechain-view.ts'

/** Read one activity round and publish successful non-empty lines after containing sibling failures. */
export async function readActivityRound<Row>(
  rows: readonly Row[],
  read: (row: Row) => Promise<string | null>,
  publish: (row: Row, line: string) => void,
): Promise<void> {
  await Promise.allSettled(rows.map(async row => {
    const line = await read(row)
    if (line !== null) publish(row, line)
  }))
}

/** Argument fields that summarize each known tool best (first-wins priority). */
const TOOL_ARG_FIELDS: Readonly<Record<string, string>> = {
  bash: 'command',
  terminal: 'command',
  grep: 'pattern',
  glob: 'pattern',
  read: 'path',
  str_replace_editor: 'command',
  edit: 'file_path',
  subagent: 'description',
}

/** Maximum code points kept in one salient argument preview. */
const TOOL_ARG_MAX = 60
/** Maximum code points kept in one assistant-text activity line. */
const ACTIVITY_TEXT_MAX = 140

/** Collapse whitespace to single spaces and cap the code-point length. */
function collapse(text: string, max: number): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const chars = [...normalized]
  if (chars.length <= max) return normalized
  return chars.slice(0, max).join('') + '…'
}

/**
 * The single most informative argument of one tool call: a per-tool field
 * priority (bash → command, grep → pattern, …), falling back to the first
 * field of the parsed arguments, then to the raw string. The panel never
 * dumps full arguments into a one-line row preview.
 * @param name - tool name.
 * @param argumentsRaw - raw JSON arguments from the tool call.
 * @returns the collapsed preview, or undefined when there are no arguments.
 */
export function salientToolArg(name: string, argumentsRaw: string | undefined): string | undefined {
  if (argumentsRaw === undefined) return undefined
  let value: unknown
  try {
    value = JSON.parse(argumentsRaw)
  } catch {
    return collapse(argumentsRaw, TOOL_ARG_MAX)
  }
  if (value === null || typeof value !== 'object') return collapse(String(value), TOOL_ARG_MAX)
  const record = value as Record<string, unknown>
  const pick = TOOL_ARG_FIELDS[name]
  let chosen: unknown
  if (pick !== undefined && record[pick] !== undefined) {
    chosen = record[pick]
  } else {
    for (const key of Object.keys(record)) {
      chosen = record[key]
      break
    }
  }
  if (chosen === undefined) return undefined
  const text = typeof chosen === 'string' ? chosen : JSON.stringify(chosen)
  return collapse(text, TOOL_ARG_MAX)
}

/**
 * One live activity line for a running child: the latest assistant text when
 * present, else the last (non-failed) tool call summary. Failed calls never
 * speak for the child.
 * @param rows - the child's compact transcript rows (tail window).
 * @returns the line text, or undefined when the window carries nothing.
 */
export function lastActivity(rows: readonly TranscriptRow[]): string | undefined {
  let text: string | undefined
  let tool: string | undefined
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row === undefined) continue
    if (text === undefined && row.kind === 'assistant') {
      const collapsed = collapse(row.text, ACTIVITY_TEXT_MAX)
      if (collapsed !== '') text = collapsed
    } else if (tool === undefined && row.kind === 'tool' && !row.failed) {
      const args = salientToolArg(row.name, row.detail?.arguments)
      tool = `🔧 ${row.name}${args !== undefined ? ` · ${args}` : ''}`
    }
    if (text !== undefined && tool !== undefined) break
  }
  return text ?? tool
}
