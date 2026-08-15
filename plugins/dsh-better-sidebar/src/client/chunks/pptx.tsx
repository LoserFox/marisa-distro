/**
 * Lazy chunk entry: the .pptx preview (pptx-renderer). Built as
 * `lib/client-pptx.js` and registered under `dsh-better-sidebar/pptx` —
 * fetched only when a .pptx is first opened (see chunk-loader.ts and
 * docs/plans/2026-08-12-lazy-chunks-design.md). Never import this module
 * from the core bundle: it pulls the renderer into the startup path.
 */
export { PptxView } from '../PptxView.tsx'
