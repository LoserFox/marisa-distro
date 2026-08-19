/**
 * 通用配置表单组件（r6 提取共享，P1 对齐 plughub schema-form 体验）：
 * 标量控件 + 嵌套对象组 + string list/dict 行编辑器 + secret 只写字段 +
 * unsupported 只读 JSON。文本字段本地 draft，blur/Enter 提交；数值非法
 * 不写；secret 空值不写（保留已存值）。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/ConfigFields
 */

import { useState } from 'react'
import css from './Panel.module.css'

/** One configurable field surfaced by the panel (mirrors the server shape). */
export interface ConfigFieldShape {
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly description?: string
  readonly role?: string
  readonly extra?: unknown
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly pattern?: string
  readonly default?: unknown
  readonly literal?: unknown
  readonly enumValues?: readonly unknown[]
  readonly children?: readonly ConfigFieldShape[]
  readonly secret?: boolean
  readonly secretSet?: boolean
  readonly items?: string
  readonly values?: string
  readonly unsupported?: boolean
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Starter value for one field (schema default first, then type placeholder). */
export function defaultValueOf(field: ConfigFieldShape): unknown {
  if (field.default !== undefined) return field.default
  if (field.secret === true) return ''
  switch (field.type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'const':
      return field.literal
    case 'union':
      return field.enumValues?.[0]
    case 'array':
      return []
    case 'dict':
      return {}
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const child of field.children ?? []) out[child.name] = defaultValueOf(child)
      return out
    }
    default:
      return undefined
  }
}

/** Current value merged with schema defaults, one level per field. */
export function editableOf(field: ConfigFieldShape, current: unknown): unknown {
  if (field.type === 'object') {
    const base = isPlainObject(current) ? current : {}
    const out: Record<string, unknown> = {}
    for (const child of field.children ?? []) out[child.name] = editableOf(child, base[child.name])
    return out
  }
  if (field.secret === true) return ''
  return current === undefined ? defaultValueOf(field) : current
}

/** Dirty check for a staged form: secret fields count only when a new value was typed. */
export function isDraftDirty(
  fields: readonly ConfigFieldShape[],
  draft: Record<string, unknown>,
  current: unknown,
): boolean {
  const stored = isPlainObject(current) ? current : {}
  for (const field of fields) {
    const next = draft[field.name]
    const prev = stored[field.name]
    if (field.type === 'object' && field.children !== undefined) {
      if (isDraftDirty(
        field.children,
        isPlainObject(next) ? next : {},
        prev,
      )) return true
      continue
    }
    if (field.secret === true) {
      if (next !== undefined && next !== '') return true
      continue
    }
    if (JSON.stringify(next) !== JSON.stringify(prev)) return true
  }
  return false
}

/** A property name as a title: `maxRepos` → `Max repos`. */
export function titleForKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLocaleLowerCase()
  return words === '' ? key : words.charAt(0).toLocaleUpperCase() + words.slice(1)
}

/** Local draft that follows the authoritative value except while typing. */
function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  return [draft, setDraft]
}

/** Row chrome shared by every control. */
function FieldShell(props: {
  readonly field: ConfigFieldShape
  readonly children: React.ReactNode
}): JSX.Element {
  const { field, children } = props
  const label = titleForKey(field.name)
  return (
    <div className={css.configField}>
      <div className={css.row}>
        <span className={css.configFieldName}>{label}</span>
        {label.toLocaleLowerCase() !== field.name.toLocaleLowerCase() && (
          <code className={css.configFieldType}>{field.name}</code>
        )}
        <span className={css.configFieldType}>
          {field.type}{field.required ? ' · 必填' : ' · 可选'}
          {field.literal !== undefined ? ` · ${String(field.literal)}` : ''}
        </span>
        {field.default !== undefined && (
          <span className={css.configFieldDefault}>默认 {JSON.stringify(field.default)}</span>
        )}
      </div>
      {field.description !== undefined && <div className={css.inlineText}>{field.description}</div>}
      {children}
    </div>
  )
}

/** One line of text; commits on blur or Enter. */
function StringField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const current = typeof props.value === 'string' ? props.value : ''
  const [draft, setDraft] = useDraft(current)
  return (
    <FieldShell field={props.field}>
      <input
        className={css.input}
        type="text"
        value={draft}
        pattern={props.field.pattern}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== current) props.onChange(draft) }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </FieldShell>
  )
}

/** Write-only secret: blank draft writes nothing and keeps the stored value. */
function SecretField(props: {
  readonly field: ConfigFieldShape
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const { field, onChange } = props
  const [draft, setDraft] = useState('')
  return (
    <FieldShell field={field}>
      <input
        className={css.input}
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft === '') return
          onChange(draft)
          setDraft('')
        }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <div className={css.fieldHint}>
        {field.secretSet === true ? '已存有取值，输入新值可覆盖。' : '尚未设置。'}
      </div>
    </FieldShell>
  )
}

/** Number with schema bounds; invalid input is refused rather than coerced. */
function NumberField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const current = typeof props.value === 'number' ? String(props.value) : ''
  const [draft, setDraft] = useDraft(current)
  const commit = (): void => {
    if (draft === current) return
    if (draft === '') return
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) props.onChange(parsed)
  }
  return (
    <FieldShell field={props.field}>
      <input
        className={css.input}
        type="number"
        value={draft}
        min={props.field.min}
        max={props.field.max}
        step={props.field.step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    </FieldShell>
  )
}

/** Closed union of constants as a select. */
function SelectField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const options = (props.field.extra as { readonly options?: readonly unknown[] } | undefined)?.options
    ?? props.field.enumValues
    ?? []
  const current = props.value === undefined ? '' : String(props.value)
  return (
    <FieldShell field={props.field}>
      <select
        className={css.input}
        value={current}
        onChange={(event) => {
          const chosen = options.find(option => String(option) === event.target.value)
          if (chosen === undefined) return
          if (typeof chosen === 'boolean') props.onChange(chosen)
          else if (typeof chosen === 'number') props.onChange(chosen)
          else props.onChange(chosen)
        }}
      >
        {options.some(option => String(option) === current) ? null : <option value="">—</option>}
        {options.map((option, index) => <option key={index} value={String(option)}>{String(option)}</option>)}
      </select>
    </FieldShell>
  )
}

/** Editable list of string rows. */
function StringListField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const items = Array.isArray(props.value) ? props.value.filter((item): item is string => typeof item === 'string') : []
  const write = (next: readonly string[]): void => { props.onChange([...next]) }
  return (
    <FieldShell field={props.field}>
      <div className={css.configFields}>
        {items.map((item, index) => (
          <div key={index} className={css.row}>
            <input
              className={css.input}
              value={item}
              aria-label={`${titleForKey(props.field.name)} ${index + 1}`}
              onChange={(event) => {
                const next = [...items]
                next[index] = event.target.value
                write(next)
              }}
            />
            <button
              className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
              onClick={() => { write(items.filter((_, at) => at !== index)) }}
            >
              删除
            </button>
          </div>
        ))}
        <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={() => { write([...items, '']) }}>
          添加
        </button>
      </div>
    </FieldShell>
  )
}

/** Editable key/value rows for `dict(string)`. */
function StringDictField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const source = isPlainObject(props.value)
    ? Object.entries(props.value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    : []
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const write = (next: readonly (readonly [string, string])[]): void => {
    props.onChange(Object.fromEntries(next))
  }
  return (
    <FieldShell field={props.field}>
      <div className={css.configFields}>
        {source.map(([entryKey, entryValue]) => (
          <div key={entryKey} className={css.row}>
            <code className={css.configFieldType}>{entryKey}</code>
            <input
              className={css.input}
              value={entryValue}
              onChange={(event) => {
                write(source.map(entry => entry[0] === entryKey ? [entryKey, event.target.value] as const : entry))
              }}
            />
            <button
              className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
              onClick={() => { write(source.filter(entry => entry[0] !== entryKey)) }}
            >
              删除
            </button>
          </div>
        ))}
        <div className={css.row}>
          <input className={css.input} placeholder="key" value={key} onChange={(event) => setKey(event.target.value)} />
          <input className={css.input} placeholder="value" value={value} onChange={(event) => setValue(event.target.value)} />
          <button
            className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
            disabled={key === ''}
            onClick={() => {
              write([...source.filter(entry => entry[0] !== key), [key, value]])
              setKey('')
              setValue('')
            }}
          >
            添加
          </button>
        </div>
      </div>
    </FieldShell>
  )
}

/** Schema type the generic editor refuses to guess at; shown read-only. */
function UnsupportedField(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
}): JSX.Element {
  return (
    <FieldShell field={props.field}>
      <pre className={css.configTextarea}>{JSON.stringify(props.value, undefined, 2) ?? 'undefined'}</pre>
      <div className={css.fieldHint}>该字段是 {props.field.type}；请切换 JSON 模式或到设置文件中修改。</div>
    </FieldShell>
  )
}

/** Schemastery-style field editor: scalar controls + nested object groups. */
export function ConfigFieldEditor(props: {
  readonly field: ConfigFieldShape
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const { field, value, onChange } = props
  if (field.secret === true) return <SecretField field={field} onChange={onChange} />
  if (field.unsupported === true) return <UnsupportedField field={field} value={value} />
  if (field.type === 'object') {
    return (
      <FieldShell field={field}>
        <div className={css.configFields}>
          {(field.children ?? []).map(child => (
            <ConfigFieldEditor
              key={child.name}
              field={child}
              value={isPlainObject(value) ? value[child.name] : defaultValueOf(child)}
              onChange={(next) => {
                const base = isPlainObject(value) ? { ...value } : {}
                onChange({ ...base, [child.name]: next })
              }}
            />
          ))}
        </div>
      </FieldShell>
    )
  }
  if (field.type === 'boolean') {
    return (
      <FieldShell field={field}>
        <input
          className={css.input}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      </FieldShell>
    )
  }
  if (field.type === 'number' || field.type === 'integer') {
    return <NumberField field={field} value={value} onChange={onChange} />
  }
  if (field.type === 'const') {
    return <FieldShell field={field}><span className={css.configFieldType}>{String(field.literal ?? '')}</span></FieldShell>
  }
  if (field.role === 'select' || (field.type === 'union' && (field.enumValues ?? []).length > 0)) {
    return <SelectField field={field} value={value} onChange={onChange} />
  }
  if (field.type === 'array' && field.items === 'string') {
    return <StringListField field={field} value={value} onChange={onChange} />
  }
  if (field.type === 'dict' && field.values === 'string') {
    return <StringDictField field={field} value={value} onChange={onChange} />
  }
  if (field.role === 'textarea') {
    return (
      <FieldShell field={field}>
        <textarea
          className={css.configTextarea}
          rows={3}
          spellCheck={false}
          defaultValue={typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2)}
          onBlur={(event) => { onChange(event.target.value) }}
        />
      </FieldShell>
    )
  }
  return <StringField field={field} value={value} onChange={onChange} />
}
