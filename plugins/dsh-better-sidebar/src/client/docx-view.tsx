/**
 * The .docx preview component: renders via docx-preview (preserved
 * styles/images/tables). Lives in its own module (split out of the former
 * office-view.tsx) so it builds as a standalone lazy chunk
 * (`lib/client-docx.js`) — the library is loaded only when a .docx is first
 * opened, and never pulls in the Univer/xlsx stack.
 *
 * Errors degrade to the shared download-button affordance, so a corrupted /
 * encrypted / oversized file always leaves the user with a way to get it.
 */
import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from './api.ts'
import { t } from './locales.ts'
import { BinaryFallback, type LoadState, type OfficeViewProps } from './office-shared.tsx'
import css from './sidebar.module.css'

/**
 * Render a .docx file via docx-preview. The library renders into a container
 * div (no canvas); images and styles are inlined. Unmounting clears the
 * container's innerHTML — docx-preview has no dispose API, but tearing down
 * the DOM is enough.
 */
export function DocxView(props: OfficeViewProps): JSX.Element {
  const { scope, path, title } = props
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    let cancelled = false
    const container = viewportRef.current
    const wrap = wrapRef.current
    if (container === null || wrap === null) return
    setZoom(100)
    void (async () => {
      try {
        const response = await fetch(mediaUrl(scope, path))
        if (cancelled) return
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const buf = await response.arrayBuffer()
        if (cancelled) return
        // docx-preview ships its own CSS through the className option; the
        // wrapper div scopes its render output.
        const { renderAsync } = await import('docx-preview')
        await renderAsync(buf, wrap, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          experimental: false,
        })
        if (!cancelled) setLoad({ status: 'ready' })
      } catch (error) {
        if (!cancelled) {
          setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }
    })()
    return () => {
      cancelled = true
      // Tear down the rendered DOM so a reopen starts clean.
      if (wrap !== null) wrap.innerHTML = ''
    }
  }, [scope.sessionId, scope.cwd, path])

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.altKey) return
      event.preventDefault()
      const delta = event.deltaY < 0 ? 10 : -10
      setZoom(current => Math.max(50, Math.min(200, current + delta)))
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => { viewport.removeEventListener('wheel', onWheel) }
  }, [])

  return (
    <div className={css.editorDocx}>
      <div className={css.editorDocxViewport} ref={viewportRef}>
        {load.status === 'loading' && <div className={css.editorPlaceholder}>{t('loading')}</div>}
        {load.status === 'error' && <BinaryFallback scope={scope} path={path} message={load.message} />}
        {load.status !== 'error' && (
          <div
            className={css.editorDocxWrap}
            ref={wrapRef}
            aria-label={title}
            style={{ zoom: zoom / 100 }}
          />
        )}
      </div>
      <div className={css.editorDocxZoom}>
        <span className={css.editorDocxZoomHint}>{t('zoomHint')}</span>
        <input
          className={css.editorDocxZoomRange}
          type="range"
          min={50}
          max={200}
          step={10}
          value={zoom}
          aria-label={t('zoom')}
          onChange={(event) => { setZoom(Number(event.currentTarget.value)) }}
        />
        <span className={css.editorDocxZoomValue}>{zoom}%</span>
      </div>
    </div>
  )
}
