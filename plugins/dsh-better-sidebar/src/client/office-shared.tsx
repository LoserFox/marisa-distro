/**
 * Shared pieces of the Office preview views (docx / xlsx): the load-state
 * union, the shared props, and the download fallback. The two views live in
 * their own modules (docx-view.tsx / xlsx-view.tsx) so the bundler can emit
 * them as separate lazy chunks — docx-preview and the Univer family (several
 * MB) must never share a script (see docs/plans/2026-08-12-lazy-chunks-design.md).
 */
import { downloadUrl, type SessionScope } from './api.ts'
import { t } from './locales.ts'
import css from './sidebar.module.css'

/** Loading / ready / error state shared by both views. */
export type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

/** Shared props. */
export interface OfficeViewProps {
  scope: SessionScope
  path: string
  title: string
}

/**
 * The shared error / fallback affordance: the failure reason plus a download
 * link, so the user always has a path to the file. Used by both DocxView and
 * XlsxView, and matches the binary placeholder download link.
 */
export function BinaryFallback(props: { scope: SessionScope; path: string; message: string }): JSX.Element {
  const { scope, path, message } = props
  return (
    <div className={css.editorBinary}>
      <span className={css.editorBinaryNotice}>{message}</span>
      <a className={css.editorDownloadLink} href={downloadUrl(scope, path)} download>
        {t('downloadToView')}
      </a>
    </div>
  )
}
