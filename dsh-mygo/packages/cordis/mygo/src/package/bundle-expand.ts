/**
 * profile bundle patch 展开语义（design-r3 §5.3，B14）：`dsh.bundle.patch`
 * → `cordis.patch.yml` 的 insert/override 行展开为 entry 行；mygo 政策层
 * 作用于展开后的行；不新设分发层。纯函数，输入 YAML 文本 → 展开行。
 * @module @r05en1cu/dsh-mygo/src/package/bundle-expand
 */

import * as yaml from 'js-yaml'

/** 展开后的 loader entry 行（与 loader entry 字段对齐：id/name/config/disabled）。 */
export interface ExpandedEntryRow {
  readonly id: string
  readonly name?: string
  readonly config?: unknown
  readonly disabled?: boolean
  /** 展开来源：insert（bundle 新增）或 override（改写既有行）。 */
  readonly kind: 'insert' | 'override'
}

/** js-yaml schema tolerating the `!!js` expressions dsh patch files use. */
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (value: unknown) => value,
})
const PATCH_SCHEMA = yaml.JSON_SCHEMA.extend(JsExpr)

/** 把 cordis.patch.yml 文本展开为 entry 行（确定性顺序；政策作用于展开后行）。 */
export function expandBundlePatch(patchText: string): readonly ExpandedEntryRow[] {
  const rows: ExpandedEntryRow[] = []
  let parsed: unknown
  try {
    parsed = yaml.load(patchText, { schema: PATCH_SCHEMA })
  } catch {
    return rows
  }
  if (!Array.isArray(parsed)) return rows
  for (const raw of parsed) {
    if (typeof raw !== 'object' || raw === null) continue
    const record = raw as Record<string, unknown>
    const inserted = record.insert
    if (Array.isArray(inserted)) {
      for (const row of inserted) {
        if (typeof row !== 'object' || row === null) continue
        const entry = row as Record<string, unknown>
        if (typeof entry.id !== 'string' || entry.id === '') continue
        rows.push({
          id: entry.id,
          ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
          ...(entry.config === undefined ? {} : { config: entry.config }),
          ...(typeof entry.disabled === 'boolean' ? { disabled: entry.disabled } : {}),
          kind: 'insert',
        })
      }
    } else if (typeof record.id === 'string' && record.id !== '') {
      rows.push({
        id: record.id,
        ...(typeof record.name === 'string' ? { name: record.name } : {}),
        ...(record.config === undefined ? {} : { config: record.config }),
        ...(typeof record.disabled === 'boolean' ? { disabled: record.disabled } : {}),
        kind: 'override',
      })
    }
  }
  return rows
}
