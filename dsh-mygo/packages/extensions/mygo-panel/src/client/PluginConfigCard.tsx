/**
 * 受管插件配置卡片（r7.2 官方折叠形态）：settings.plugin.item 槽里每个
 * 受管插件一张卡片，外壳对齐官方 PluginCard——头部按钮折叠/展开、未保存
 * 徽章、chevron、放弃修改/保存 footer；标题旁带 "mygo" 小标。schema 与
 * 当前配置读 /api/mygo/config-cards，保存经 PUT /api/mygo/config ——
 * 统一走 mygo 核心方法（bridge 轨 HMR、bundle 轨 profile patch 层）。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/PluginConfigCard
 */
import { useCallback, useEffect, useState } from 'react'
import css from './Panel.module.css'
import { ConfigFieldEditor, editableOf, isDraftDirty, isPlainObject, type ConfigFieldShape } from './ConfigFields'

/** config-cards API 返回的一张卡片（注册时捕获的种子信息）。 */
export interface MygoPluginCardSeed {
  readonly id: string
  readonly kind: 'bridge' | 'bundle'
  readonly rowId: string
  readonly packageName: string
  readonly revision: number
  readonly enabled: boolean
}

interface ConfigCardRow extends MygoPluginCardSeed {
  readonly schema: {
    readonly description: string
    readonly fields: readonly ConfigFieldShape[]
    readonly template: unknown
  }
  readonly config: unknown
}

interface CardsResult {
  readonly ok: boolean
  readonly error?: string
  readonly cards?: readonly ConfigCardRow[]
}

interface ActionResult {
  readonly ok: boolean
  readonly error?: string
  readonly message?: string
}

async function fetchJson<T>(path: string, init?: { readonly method?: string; readonly body?: unknown }): Promise<T> {
  const res = await fetch('/api/mygo' + path, {
    method: init?.method ?? 'GET',
    ...(init?.body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
  })
  return (await res.json()) as T
}

/** 一张受管插件的官方折叠形态配置卡片（保存走 mygo 核心 API）。 */
export function MygoPluginConfigCard(props: { readonly seed: MygoPluginCardSeed }): JSX.Element {
  const { seed } = props
  const [open, setOpen] = useState(false)
  const [row, setRow] = useState<ConfigCardRow | undefined>()
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await fetchJson<CardsResult>('/config-cards')
      const mine = (result.cards ?? []).find(card => card.id === seed.id && card.kind === seed.kind)
      if (mine === undefined) {
        setError('卡片数据暂不可用（插件可能刚被卸载）')
        return
      }
      setRow(mine)
      const out: Record<string, unknown> = {}
      for (const field of mine.schema.fields) {
        out[field.name] = editableOf(field, (mine.config as Record<string, unknown> | undefined)?.[field.name])
      }
      setDraft(out)
      setFailed(false)
      setError(undefined)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [seed.id, seed.kind])

  useEffect(() => { void load() }, [load])

  const dirty = row !== undefined && isDraftDirty(row.schema.fields, draft, row.config)

  const save = useCallback(async (): Promise<void> => {
    setSaving(true)
    setFailed(false)
    setError(undefined)
    setNotice(undefined)
    try {
      const result = await fetchJson<ActionResult>('/config', {
        method: 'PUT',
        body: {
          id: seed.id,
          kind: seed.kind,
          ...(seed.kind === 'bundle' ? { rowId: seed.rowId } : {}),
          config: draft,
          expectedRevision: row?.revision ?? seed.revision,
        },
      })
      if (!result.ok) throw new Error(result.error ?? '保存失败')
      setNotice(result.message ?? '已保存')
      await load()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      // revision 冲突/拒绝后先重读到当前值，再保留失败文案供用户看到。
      await load()
      setFailed(true)
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [seed.id, seed.kind, seed.rowId, draft, load])

  const discard = useCallback((): void => {
    if (row === undefined) return
    const out: Record<string, unknown> = {}
    for (const field of row.schema.fields) {
      out[field.name] = editableOf(field, (row.config as Record<string, unknown> | undefined)?.[field.name])
    }
    setDraft(out)
    setFailed(false)
    setError(undefined)
    setNotice(undefined)
  }, [row])

  if (row === undefined && error === undefined) {
    return (
      <li className={css.oCard}>
        <div className={css.skeletonRow} style={{ height: '64px', border: '0', borderRadius: '12px' }} />
      </li>
    )
  }

  const description = row?.schema.description !== undefined && row.schema.description !== ''
    ? row.schema.description
    : '由 mygo 核心管理'
  const title = seed.id + (seed.enabled ? '' : '（已停用）')

  return (
    <li className={open ? css.oCard + ' ' + css.oCardOpen : css.oCard}>
      <button
        type="button"
        className={css.oHeader}
        aria-expanded={open}
        aria-label={(open ? '收起设置' : '展开设置') + '：' + title}
        onClick={() => setOpen(!open)}
      >
        <span className={css.oHeadText}>
          <span className={css.oName}>
            {title}
            <span className={css.oMygoBadge}>mygo</span>
          </span>
          <span className={css.oDescription}>{description}</span>
        </span>
        {dirty ? <span className={css.oPending}>未保存</span> : null}
        <span className={open ? css.oChevron + ' ' + css.oChevronOpen : css.oChevron} />
      </button>
      {open && row !== undefined && (
        <div className={css.oBody}>
          <div className={css.configFields}>
            {row.schema.fields.map(field => (
              <ConfigFieldEditor
                key={field.name}
                field={field}
                value={draft[field.name]}
                onChange={(next) => setDraft(current => ({ ...current, [field.name]: next }))}
              />
            ))}
            {row.schema.fields.length === 0 && (
              <p className={css.oHint}>插件未暴露可表单化的字段。</p>
            )}
          </div>
          {notice !== undefined && <p className={css.oHint}>{notice}</p>}
          {error !== undefined && !failed && <p className={css.oFailed}>{error}</p>}
          <div className={css.oFooter}>
            {failed ? <p className={css.oFailed}>本部署没有接受这些值，已保留供你修改。</p> : null}
            <button
              type="button"
              className={css.oDiscard}
              disabled={!dirty || saving}
              onClick={discard}
            >
              放弃修改
            </button>
            <button
              type="button"
              className={css.oSave}
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
