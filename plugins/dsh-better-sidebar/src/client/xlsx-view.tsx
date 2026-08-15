/**
 * The .xlsx preview component: renders via the Univer sheets preset (data +
 * formulas + formatting). Lives in its own module (split out of the former
 * office-view.tsx) so it builds as a standalone lazy chunk
 * (`lib/client-xlsx.js`) — the Univer family and SheetJS pull in several MB
 * but are loaded only when a .xlsx is first opened. The docx stack never
 * shares this script.
 *
 * Errors degrade to the shared download-button affordance, so a corrupted /
 * encrypted / oversized file always leaves the user with a way to get it.
 */
import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from './api.ts'
import { isZh, t } from './locales.ts'
import { BinaryFallback, type LoadState, type OfficeViewProps } from './office-shared.tsx'
import { xlsxWorkbookToUniver } from './xlsx-to-univer.ts'
import css from './sidebar.module.css'
// Univer's stylesheets ride the same dsh-css-inline pipeline as xterm's CSS
// (one <style data-plugin-css> tag, idempotent). Static import so the styles
// are present before the first .xlsx opens.
import '@univerjs/preset-sheets-core/lib/index.css'

/**
 * Render a .xlsx file via Univer. The sheets preset creates a canvas-based
 * spreadsheet (formula bar, sheet tabs, formula engine) sized to its
 * container, so the host fills the pane. Unmounting calls `univer.dispose()`
 * — without it the canvas, workers, and DOM listeners leak (mirrors the
 * xterm dispose discipline in TerminalView).
 */
export function XlsxView(props: OfficeViewProps): JSX.Element {
  const { scope, path, title } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<{ dispose: () => void } | null>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (host === null) return
    void (async () => {
      try {
        const response = await fetch(mediaUrl(scope, path))
        if (cancelled) return
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const buf = await response.arrayBuffer()
        if (cancelled) return

        // Dynamic imports — collapsed into the chunk by codeSplitting:false.
        // The dynamic form keeps the source readable: each lib is only pulled
        // in when an .xlsx is actually opened (semantically; the chunk still
        // contains all of them — the chunk itself only loads on first .xlsx).
        const XLSX = await import('xlsx')
        const { createUniver, LocaleType, mergeLocales } = await import('@univerjs/presets')
        const { UniverSheetsCorePreset } = await import('@univerjs/preset-sheets-core')
        // Locales follow the DSH i18n system (the active locale); falls
        // back to the browser language, then en-US.
        const localePack = await (isZh()
          ? import('@univerjs/preset-sheets-core/locales/zh-CN').then(m => m.default).catch(() => null)
          : import('@univerjs/preset-sheets-core/locales/en-US').then(m => m.default).catch(() => null))

        const wb = XLSX.read(buf, { type: 'array' })
        const locale = isZh() ? LocaleType.ZH_CN : LocaleType.EN_US
        const workbookData = xlsxWorkbookToUniver(wb, '0.25.1', locale)

        if (cancelled) return
        const { univer, univerAPI } = createUniver({
          locale,
          locales: localePack !== null ? { [locale]: mergeLocales(localePack) } : {},
          presets: [UniverSheetsCorePreset({ container: host })],
        })
        univerRef.current = univer
        univerAPI.createWorkbook(workbookData)
        if (!cancelled) setLoad({ status: 'ready' })
      } catch (error) {
        if (!cancelled) {
          try {
            univerRef.current?.dispose()
          } catch {
            // Partially initialized instance — ignore disposal errors.
          }
          univerRef.current = null
          host.innerHTML = ''
          setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }
    })()
    return () => {
      cancelled = true
      // Critical: dispose the Univer instance (canvas + workers + listeners).
      try {
        univerRef.current?.dispose()
      } catch {
        // Already torn down — ignore.
      }
      univerRef.current = null
      // Clear the host in case dispose left DOM behind.
      if (host !== null) host.innerHTML = ''
    }
  }, [scope.sessionId, scope.cwd, path])

  return (
    <div className={css.editorXlsx} aria-label={title}>
      {/* Univer exclusively owns this element's descendants. React only owns
          the sibling overlay, so Univer cannot remove a React child. */}
      <div className={css.editorUniverHost} ref={hostRef} />
      {load.status !== 'ready' && (
        <div className={css.editorOfficeOverlay}>
          {load.status === 'loading' && <div className={css.editorPlaceholder}>{t('loading')}</div>}
          {load.status === 'error' && <BinaryFallback scope={scope} path={path} message={load.message} />}
        </div>
      )}
    </div>
  )
}
