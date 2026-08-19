/**
 * 配置导入导出工具（r7.1）：整 profile 配置的导出（GET /api/mygo/config-export
 * 下载）与导入（PUT /api/mygo/config-import，弹窗粘贴 JSON）。从聚合卡片
 * 迁入 mygo 面板头部，与 per-plugin 卡片合并拆分。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/ConfigTransfer
 */
import { useState } from 'react'
import css from './Panel.module.css'

export interface ConfigTransferProps {
  readonly onNotice: (message: string) => void
  readonly onError: (message: string) => void
}

interface ActionResult {
  readonly ok: boolean
  readonly error?: string
  readonly message?: string
  readonly applied?: readonly string[]
  readonly rejected?: readonly { readonly id: string; readonly reason: string }[]
}

export function ConfigTransfer(props: ConfigTransferProps): JSX.Element {
  const { onNotice, onError } = props
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const doImport = async (): Promise<void> => {
    setImporting(true)
    try {
      const parsed: unknown = JSON.parse(text)
      const res = await fetch('/api/mygo/config-import', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const result = (await res.json()) as ActionResult
      if (!result.ok) {
        const detail = (result.rejected ?? []).map(entry => entry.id + '（' + entry.reason + '）').join('；')
        onError('导入部分失败：' + (detail || result.error || '未知原因'))
        return
      }
      onNotice(result.message ?? '导入完成')
      setText('')
      setOpen(false)
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <a
        className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
        href="/api/mygo/config-export"
        download="mygo-configs.json"
      >
        导出配置
      </a>
      <button
        className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
        onClick={() => setOpen(true)}
      >
        导入配置
      </button>
      {open && (
        <div className={css.modalBackdrop} onClick={importing ? undefined : () => setOpen(false)}>
          <div className={css.modal} onClick={(event) => event.stopPropagation()}>
            <div className={css.modalHead}>
              <div className={css.modalTitle}>导入配置（整 profile）</div>
            </div>
            <div className={css.modalBody}>
              <div className={css.fieldHint}>
                粘贴导出的 JSON（格式 dsh.mygo-configs/v1，configs 为插件 id 到配置的映射）。
                bridge 轨经 HMR 生效，bundle 轨经 patch watcher 生效。
              </div>
              <textarea
                className={css.configTextarea}
                rows={8}
                spellCheck={false}
                placeholder='{"format":"dsh.mygo-configs/v1","configs":{...}}'
                value={text}
                disabled={importing}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className={css.modalFoot}>
              <button className={css.btn + ' ' + css.btnGhost} disabled={importing} onClick={() => setOpen(false)}>
                取消
              </button>
              <button className={css.btn} disabled={importing || text.trim() === ''} onClick={() => void doImport()}>
                {importing ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
