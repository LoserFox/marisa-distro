/**
 * Mermaid render engine — the HEAVY half. This module imports mermaid and is
 * bundled ONLY into the lazy asset bundle `lib/assets/mermaid.js`, loaded on
 * demand by the mermaid-lazy loader when a spec contains a `mermaid` node;
 * the main client bundle stays small.
 *
 * Whitelist: only a fixed set of diagram kinds render; anything else throws
 * so the caller shows its fallback. mermaid runs client-side with its own
 * sanitizer; we additionally refuse `securityLevel: 'loose'`-style inputs by
 * only initializing with the strict default, AND we re-check the rendered SVG
 * before it is injected (see `assertSafeSvg` in mermaid-safe): the injection
 * point is the only place in GenUI that uses `dangerouslySetInnerHTML`, so
 * the last line of defense lives here, not inside mermaid.
 * @module @deepseek-ai/dsh-genui/client/mermaid-core
 */
import { assertSafeSvg, repairMermaidSource } from './mermaid-safe.ts'

let mermaidPromise: Promise<typeof import('mermaid')> | null = null

/** Monotonic render id (replaces Math.random): no collisions, no entropy. */
let renderSeq = 0

function loadMermaid(): Promise<typeof import('mermaid')> {
  mermaidPromise ??= import('mermaid').then(async m => {
    const api = m.default
    // Follow the host theme: boot-theme sets colorScheme on <html>; a
    // dark-forced diagram on a light chat looked broken.
    const dark = typeof document !== 'undefined'
      && document.documentElement.style.colorScheme === 'dark'
    api.initialize({
      startOnLoad: false,
      // Strict default: mermaid escapes/sanitizes; we never enable htmlLabels.
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      // Fail loudly: with suppressErrorRendering false (the default) mermaid
      // renders an "error" diagram on parse/draw failure — the caller then
      // receives a normal-looking SVG whose text is the raw engine error
      // ("Syntax error in text / mermaid version …"), which lands on the page
      // with no exception ever thrown. Suppressing the error diagram makes
      // every failure throw so the caller shows its own fallback instead.
      suppressErrorRendering: true,
    })
    return m
  })
  return mermaidPromise
}

/** Diagram kinds allowed through to the renderer. */
const ALLOWED_KINDS = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'gantt', 'pie', 'erDiagram', 'journey', 'gitGraph',
]

/** One render attempt into a private container. mermaid ≥ 11.16 resolves the
 * diagram element via `document.body` while drawing flowcharts
 * (`getDiagramElement`), so a DETACHED container makes every flowchart/graph
 * render throw on an empty d3 selection ("Cannot read properties of null").
 * The container is therefore mounted off-screen for the duration of the
 * render — NOT `display:none`, which zeroes label measurements and makes
 * dagre fail with "Could not find a suitable point" — and removed when done. */
async function renderInto(m: typeof import('mermaid'), id: string, code: string, container: HTMLDivElement): Promise<string> {
  container.style.position = 'fixed'
  container.style.left = '-100000px'
  container.style.top = '0'
  container.style.margin = '0'
  document.body?.appendChild(container)
  try {
    const { svg } = await m.default.render(id, code, container)
    assertSafeSvg(svg)
    return svg
  } finally {
    container.remove()
  }
}

/**
 * Render mermaid source to an SVG string.
 * @param code - the mermaid diagram source.
 * @returns the rendered SVG markup (verified free of script/event handlers).
 * @throws when the kind is not whitelisted, rendering fails, or the output
 *   fails the sanitization check.
 */
export async function renderMermaid(code: string): Promise<string> {
  const trimmed = code.trim()
  const firstLine = trimmed.split('\n', 1)[0] ?? ''
  const kind = /^([A-Za-z]+)/.exec(firstLine)?.[1] ?? ''
  if (!ALLOWED_KINDS.includes(kind)) {
    throw new Error(`mermaid kind '${kind}' is not allowed`)
  }
  const m = await loadMermaid()
  const container = document.createElement('div')
  try {
    try {
      return await renderInto(m, `genui-mermaid-${renderSeq++}`, trimmed, container)
    } catch (error) {
      // Retry once with the label-repair pass; a repaired source rendering
      // successfully beats a syntax-error fallback for the same content.
      const repaired = repairMermaidSource(trimmed)
      if (repaired !== trimmed) {
        return await renderInto(m, `genui-mermaid-${renderSeq++}`, repaired, container)
      }
      throw error
    }
  } finally {
    container.remove()
  }
}
