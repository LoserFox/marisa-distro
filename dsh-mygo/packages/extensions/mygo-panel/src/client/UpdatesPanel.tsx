/**
 * 远程更新标签页（r7）：mygo 自身 + 远程安装插件，逐条更新 + 批量「全部
 * 更新」（POST /updates/plugins，单条失败不中断）。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/UpdatesPanel
 */
import { useCallback, useState } from 'react'
import css from './Panel.module.css'
import { api, ApiError, type RemoteUpdateRow } from './api'

export interface UpdatesPanelProps {
  readonly updates: readonly RemoteUpdateRow[] | null
  readonly busy: boolean
  readonly onCheck: () => void
  readonly onRefresh: () => void
  readonly onError: (message: string, details?: Readonly<Record<string, unknown>>) => void
  readonly onNotice: (message: string) => void
}

export function UpdatesPanel(props: UpdatesPanelProps): JSX.Element {
  const { updates, busy, onCheck, onRefresh, onError, onNotice } = props
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)

  const updatable = (updates ?? []).filter(row => row.upToDate !== true && row.error === undefined)

  const updateOne = useCallback(async (row: RemoteUpdateRow): Promise<void> => {
    setRunningIds(current => new Set(current).add(row.id))
    try {
      const result = row.kind === 'mygo'
        ? await api.updateMygo()
        : await api.updatePlugin(row.id)
      onNotice(result.message)
      onRefresh()
    } catch (caught) {
      if (caught instanceof ApiError) onError(caught.message, caught.details)
      else onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunningIds(current => {
        const next = new Set(current)
        next.delete(row.id)
        return next
      })
    }
  }, [onRefresh, onError, onNotice])

  const updateAll = useCallback(async (): Promise<void> => {
    if (updatable.length === 0) return
    setBatchBusy(true)
    try {
      const result = await api.updateAll(updatable.map(row => row.id))
      onNotice(result.message)
      onRefresh()
    } catch (caught) {
      if (caught instanceof ApiError) onError(caught.message, caught.details)
      else onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBatchBusy(false)
    }
  }, [updatable, onRefresh, onError, onNotice])

  const anyBusy = busy || batchBusy

  return (
    <div className={css.toolbar}>
      <div className={css.searchRow}>
        <button className={css.btn + ' ' + css.btnGhost} disabled={anyBusy} onClick={onCheck}>
          {busy ? '检查中…' : '检查更新'}
        </button>
        <button
          className={css.btn}
          disabled={anyBusy || updatable.length === 0}
          onClick={() => void updateAll()}
        >
          {batchBusy ? '批量更新中…' : `全部更新（${updatable.length}）`}
        </button>
        {batchBusy && (
          <div className={css.progressRow}>
            <span className={css.spinner} />
            <span>正在依次更新，单条失败不中断…</span>
          </div>
        )}
      </div>
      {updates === null && (
        <div className={css.list}>
          {[0, 1].map(index => <div key={index} className={css.skeletonRow} />)}
        </div>
      )}
      {updates !== null && updates.length === 0 && (
        <div className={css.listEmpty}>
          <div className={css.emptyTitle}>暂无远程安装的插件/应用</div>
          <div className={css.emptyText}>从 GitHub 安装的插件与 mygo 自身会出现在这里。</div>
        </div>
      )}
      {updates !== null && updates.length > 0 && (
        <div className={css.list}>
          {updates.map(row => {
            const running = runningIds.has(row.id)
            const isUpToDate = row.upToDate === true
            const hasError = row.error !== undefined
            return (
              <div key={row.kind + ':' + row.id} className={css.updateRow}>
                <div className={css.updateMain}>
                  <div className={css.updateId}>
                    {row.id}
                    <span className={css.railChip}>{row.kind === 'mygo' ? 'mygo 自身' : '插件'}</span>
                  </div>
                  <div className={css.updateMeta}>
                    <span className={css.commitOld}>{row.currentCommit.slice(0, 8)}</span>
                    {row.latestCommit !== undefined && (
                      <>
                        <span className={css.commitArrow}>→</span>
                        <span className={css.commitNew}>{row.latestCommit.slice(0, 8)}</span>
                      </>
                    )}
                    {row.url !== '' && <span className={css.metaChip}>{row.url}</span>}
                    {row.ref !== '' && <span className={css.metaChip}>ref {row.ref}</span>}
                  </div>
                  {hasError && <div className={css.updateError}>{row.error}</div>}
                </div>
                <div className={css.cardActions}>
                  {hasError
                    ? <span className={css.pill + ' ' + css.pillErr}>检查失败</span>
                    : isUpToDate
                      ? <span className={css.pill + ' ' + css.pillOn}>已最新</span>
                      : (
                        <>
                          <span className={css.pill}>可更新</span>
                          <button
                            className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                            disabled={anyBusy || running}
                            onClick={() => void updateOne(row)}
                          >
                            {running ? '更新中…' : '更新'}
                          </button>
                        </>
                      )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
