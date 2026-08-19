/**
 * 配置编辑器（r7）：抽屉形态，表单/JSON 双模式、字段级错误、重置模板、
 * 复制 JSON。插件配置与安装配置模板共用同一编辑体验。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/ConfigEditor
 */
import { useEffect, useState } from 'react'
import css from './Panel.module.css'
import { ConfigFieldEditor, editableOf, isPlainObject, type ConfigFieldShape } from './ConfigFields'
import type { PlanShape } from './api'

export interface ConfigEditorProps {
  readonly title: string
  readonly description?: string
  readonly fields: readonly ConfigFieldShape[]
  readonly current: unknown
  readonly template?: unknown
  readonly saveLabel?: string
  readonly busy?: boolean
  readonly error?: string
  readonly notice?: string
  /** 表单/JSON 中解析出的配置对象（未保存）；null = 当前不可保存。 */
  readonly onCommit: (config: Record<string, unknown>) => void
  readonly onClose: () => void
  /** 保存失败（走父级错误面）时父级置空此字段。 */
}

export function ConfigEditor(props: ConfigEditorProps): JSX.Element {
  const {
    title, description, fields, current, template, saveLabel, busy,
    error, notice, onCommit, onClose,
  } = props
  const [mode, setMode] = useState<'form' | 'json'>(fields.length > 0 ? 'form' : 'json')
  const [editable, setEditable] = useState<Record<string, unknown>>(() => {
    const base = isPlainObject(current) ? current : {}
    const out: Record<string, unknown> = {}
    for (const field of fields) out[field.name] = editableOf(field, base[field.name])
    return out
  })
  const [text, setText] = useState<string>(() => JSON.stringify(isPlainObject(current) ? current : {}, null, 2))
  const [parseError, setParseError] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  // revision 冲突后父级会重读并传入新的 current/fields；本地草稿必须同步，
  // 否则界面显示的仍是触发冲突的旧快照。
  useEffect(() => {
    const base = isPlainObject(current) ? current : {}
    const out: Record<string, unknown> = {}
    for (const field of fields) out[field.name] = editableOf(field, base[field.name])
    setEditable(out)
    setText(JSON.stringify(base, null, 2))
    setParseError(undefined)
  }, [current, fields])

  const parsedJson = (): Record<string, unknown> | undefined => {
    if (mode !== 'json') return undefined
    try {
      const value: unknown = JSON.parse(text)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        setParseError('配置必须是 JSON 对象')
        return undefined
      }
      setParseError(undefined)
      return value as Record<string, unknown>
    } catch (caught) {
      setParseError(caught instanceof Error ? caught.message : String(caught))
      return undefined
    }
  }

  const commit = (): void => {
    const config = mode === 'form' ? editable : parsedJson()
    if (config !== undefined) onCommit(config)
  }

  const copyJson = (): void => {
    const config = mode === 'form' ? editable : parsedJson()
    if (config === undefined) return
    const payload = JSON.stringify(config, null, 2)
    void navigator.clipboard?.writeText(payload).catch(() => {
      // clipboard 不可用（非安全上下文）时回退 textarea 选择复制
      const node = document.createElement('textarea')
      node.value = payload
      document.body.appendChild(node)
      node.select()
      document.execCommand('copy')
      document.body.removeChild(node)
    })
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const resetTemplate = (): void => {
    const next = isPlainObject(template) ? template : {}
    setEditable(() => {
      const out: Record<string, unknown> = {}
      for (const field of fields) out[field.name] = editableOf(field, next[field.name])
      return out
    })
    setText(JSON.stringify(next, null, 2))
    setParseError(undefined)
  }

  const changeField = (name: string, next: unknown): void => {
    setEditable(currentEditable => ({ ...currentEditable, [name]: next }))
  }

  return (
    <div className={css.drawerBackdrop} onClick={busy ? undefined : onClose}>
      <div className={css.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={css.drawerHead}>
          <div className={css.drawerTitle}>{title}</div>
          <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={onClose} disabled={busy}>
            关闭
          </button>
        </div>
        <div className={css.drawerBody}>
          {description !== undefined && description !== '' && (
            <div className={css.fieldHint}>schema：{description}</div>
          )}
          <div className={css.rowInline}>
            <div className={css.segmented}>
              <button
                className={mode === 'form' ? css.segBtn + ' ' + css.segActive : css.segBtn}
                onClick={() => { setMode('form'); setParseError(undefined) }}
                disabled={fields.length === 0}
              >
                表单模式
              </button>
              <button
                className={mode === 'json' ? css.segBtn + ' ' + css.segActive : css.segBtn}
                onClick={() => { setMode('json'); setParseError(undefined) }}
              >
                JSON 模式
              </button>
            </div>
            <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={copyJson} disabled={busy}>
              {copied ? '已复制' : '复制 JSON'}
            </button>
            {template !== undefined && (
              <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={resetTemplate} disabled={busy}>
                重置为模板
              </button>
            )}
          </div>
          {mode === 'form' && fields.length > 0 && (
            <div className={css.configFields}>
              {fields.map(field => (
                <ConfigFieldEditor
                  key={field.name}
                  field={field}
                  value={editable[field.name]}
                  onChange={(next) => changeField(field.name, next)}
                />
              ))}
            </div>
          )}
          {mode === 'form' && fields.length === 0 && (
            <div className={css.fieldHint}>插件未暴露可表单化的字段，请切换 JSON 模式编辑。</div>
          )}
          {mode === 'json' && (
            <textarea
              className={css.configTextarea}
              rows={14}
              spellCheck={false}
              value={text}
              disabled={busy}
              onChange={(event) => { setText(event.target.value); setParseError(undefined) }}
            />
          )}
          {mode === 'json' && parseError !== undefined && <div className={css.fieldError}>JSON 无效：{parseError}</div>}
          {error !== undefined && <div className={css.fieldError}>{error}</div>}
          {notice !== undefined && <div className={css.fieldHint}>{notice}</div>}
        </div>
        <div className={css.drawerFoot}>
          <div className={css.rowInline}>
            <button className={css.btn} disabled={busy} onClick={commit}>
              {busy ? '保存中…' : (saveLabel ?? '保存配置')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export interface ConfigDrawerState {
  readonly id: string
  readonly current: unknown
  readonly description?: string
  readonly fields: readonly ConfigFieldShape[]
  readonly template?: unknown
  /** 当前 config revision；保存时作为 expectedRevision 回传。 */
  readonly revision?: number
}

export type { PlanShape }
