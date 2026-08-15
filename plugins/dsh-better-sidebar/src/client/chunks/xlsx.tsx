/**
 * Lazy chunk entry: the .xlsx preview (Univer family + SheetJS, several MB).
 * Built as `lib/client-xlsx.js` and registered under
 * `dsh-better-sidebar/xlsx` — fetched only when a .xlsx is first opened
 * (see chunk-loader.ts and docs/plans/2026-08-12-lazy-chunks-design.md).
 * Never import this module from the core bundle: it pulls Univer into the
 * startup path.
 */
export { XlsxView } from '../xlsx-view.tsx'
