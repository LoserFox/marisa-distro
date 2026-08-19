/**
 * 通用确认弹窗（r7）：危险操作 / 带 plan warnings 的操作统一走模态确认。
 * 展示计划错误与警告、宿主行改写提示；确认按钮支持 danger 与 busy 态。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/ConfirmDialog
 */
import { useEffect, type ReactNode } from 'react'
import css from './Panel.module.css'
import type { PlanShape } from './api'

export interface ConfirmDialogProps {
  readonly open: boolean
  readonly title: string
  readonly message?: string
  readonly plan?: PlanShape
  readonly hostConflicts?: readonly string[]
  /** 额外提示区（危险操作专有警告等），置于警告块之后。 */
  readonly extra?: ReactNode
  readonly confirmLabel: string
  readonly danger?: boolean
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  const { open, title, message, plan, hostConflicts, extra, confirmLabel, danger, busy, onConfirm, onCancel } = props

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null
  const warnings = plan?.warnings ?? []
  const planError = plan?.error
  return (
    <div className={css.modalBackdrop} onClick={busy ? undefined : onCancel}>
      <div className={css.modal} onClick={(event) => event.stopPropagation()}>
        <div className={css.modalHead}>
          <div className={css.modalTitle}>{title}</div>
        </div>
        <div className={css.modalBody}>
          {message !== undefined && <div>{message}</div>}
          {planError !== undefined && <div className={css.modalError}>{planError.message}</div>}
          {warnings.length > 0 && (
            <div className={css.modalWarn}>
              <div>执行前请确认以下警告：</div>
              {warnings.map((warning, index) => <div key={index}>- {warning}</div>)}
            </div>
          )}
          {(hostConflicts ?? []).length > 0 && (
            <div className={css.modalWarn}>
              <div>以下宿主行将被改写（停用/卸载会还原）：</div>
              {(hostConflicts ?? []).map((conflict, index) => <div key={index}>- {conflict}</div>)}
            </div>
          )}
          {extra}
        </div>
        <div className={css.modalFoot}>
          <button className={css.btn + ' ' + css.btnGhost} disabled={busy} onClick={onCancel}>取消</button>
          <button
            className={danger ? css.btn + ' ' + css.btnDanger : css.btn}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
