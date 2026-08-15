/**
 * Compat re-export shim for the historical `src/client/office-view.tsx`
 * path. The office preview views were split into docx-view.tsx /
 * xlsx-view.tsx (+ office-shared.tsx) so the bundler can emit each library
 * as its own lazy chunk (see docs/plans/2026-08-12-lazy-chunks-design.md).
 * This module keeps deep imports of this path resolvable through the
 * `./src/*` exports subpath — it deliberately re-exports BOTH views, so it
 * must never be imported from the core bundle or a chunk entry (it would
 * drag both libraries into that bundle).
 */
export { DocxView } from './docx-view.tsx'
export { XlsxView } from './xlsx-view.tsx'
