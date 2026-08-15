/**
 * Office file type dispatch — pure functions mapping file extensions to
 * preview kinds. Kept separate from the editor host so the mapping is
 * unit-testable without mounting React or pulling in docx-preview / Univer.
 *
 * The host side never inspects Office extensions: the binary NUL probe in
 * {@link ../index.ts} (readText) tags every Office file as binary, and the
 * /sidebar/file media route serves raw bytes for any extension. This module
 * is the client's sole source of truth for "is this previewable here".
 */

/** Extensions rendered with docx-preview (preserved styles/images/tables). */
export const OFFICE_DOCX_EXT = '.docx' as const

/** Extensions rendered with Univer (sheets: data + formulas + formatting). */
export const OFFICE_XLSX_EXT = '.xlsx' as const

/** Extensions rendered with the browser-native PPTX viewer. */
export const OFFICE_PPTX_EXT = '.pptx' as const

/** Extensions that get a download-only affordance (no client-side renderer). */
export const OFFICE_DOWNLOAD_ONLY_EXT = ['.doc', '.xls', '.ppt'] as readonly string[]

/**
 * The preview strategy for one path's extension.
 * - `'docx'` — render via docx-preview.
 * - `'xlsx'` — render via Univer.
 * - `'pptx'` — render via pptx-renderer.
 * - `'download-only'` — show the binary download button (no preview renderer
 *   covers legacy OLE .doc/.xls/.ppt on the client).
 * - `null` — not an Office file; the caller's existing image / md / text / binary
 *   pipeline handles it.
 */
export type OfficeKind = 'docx' | 'xlsx' | 'pptx' | 'download-only' | null

/**
 * Map a lowercased extension (with leading dot) to its preview kind.
 *
 * @param ext - the path extension (with leading dot) (`.docx`,
 *   `.xlsx`, `.pptx`, `.doc`, `.xls`, `.ppt`, …); `''` when the path has none.
 */
export function officeKindForExt(ext: string): OfficeKind {
  if (ext === OFFICE_DOCX_EXT) return 'docx'
  if (ext === OFFICE_XLSX_EXT) return 'xlsx'
  if (ext === OFFICE_PPTX_EXT) return 'pptx'
  if (OFFICE_DOWNLOAD_ONLY_EXT.includes(ext)) return 'download-only'
  return null
}
