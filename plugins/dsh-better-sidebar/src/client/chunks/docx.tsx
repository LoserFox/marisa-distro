/**
 * Lazy chunk entry: the .docx preview (docx-preview + jszip). Built as
 * `lib/client-docx.js` and registered under `dsh-better-sidebar/docx` —
 * fetched only when a .docx is first opened (see chunk-loader.ts and
 * docs/plans/2026-08-12-lazy-chunks-design.md). Never import this module
 * from the core bundle: it pulls the office library into the startup path.
 */
export { DocxView } from '../docx-view.tsx'
