/**
 * Panel stylesheet (browser half): the one CSS resource the sidechain panel
 * needs — the running-row shimmer keyframes. Inline styles cover everything
 * else, but `background-clip: text` sweeps need a real stylesheet, so this
 * installs a single idempotent `<style>` tag and hands back its disposer
 * (the plugin fiber removes it on unload — hot-unload discipline).
 */

/** The injected stylesheet body. */
export const SIDECHAIN_STYLE_CSS = `
/* Marisa fork (2026-08-22): the panel styles consume Arco-style --ds-color-*
   variables that the DSH theme does not define, so every colour fell back to
   the light palette and the panel stayed light in dark mode. Map them to the
   DSH semantic aliases at :root — the page itself never defines --ds-color-*,
   so the mapping is sidechain-scoped in practice. */
:root {
  --ds-color-bg-1: var(--dsw-alias-bg-module-platform, #ffffff);
  --ds-color-bg-2: var(--dsw-alias-bg-layer-2, #f2f3f5);
  --ds-color-surface-2: var(--dsw-alias-bg-layer-1, #f2f3f5);
  --ds-color-text-1: var(--dsw-alias-label-primary, #1d2129);
  --ds-color-text-2: var(--dsw-alias-label-secondary, #4e5969);
  --ds-color-text-3: var(--dsw-alias-label-caption, #9ca3af);
  --ds-color-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  --ds-color-border-1: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12));
  --ds-color-primary: var(--dsw-alias-state-business-primary, #3370ff);
  --ds-color-danger: var(--dsw-alias-state-error-primary, #f53f3f);
}
@keyframes dsh-sidechain-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
.dsh-sidechain-shimmer {
  background-image: linear-gradient(
    100deg,
    var(--ds-color-primary, #3370ff) 25%,
    #a8c2ff 50%,
    var(--ds-color-primary, #3370ff) 75%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: dsh-sidechain-shimmer 1.6s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .dsh-sidechain-shimmer {
    animation: none;
    background: none;
    color: inherit;
  }
}
`

/** The stylesheet's fixed element id (also the double-apply guard). */
export const SIDECHAIN_STYLE_ID = 'dsh-sidechain-panel-style'

/**
 * Install the panel stylesheet once. Re-applying while a tag already exists
 * (a double apply in one page) is a no-op; the returned disposer removes the
 * tag the installer owns. Non-DOM environments (unit tests) get a no-op.
 * @returns the disposer removing the stylesheet.
 */
export function installSidechainStyle(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(SIDECHAIN_STYLE_ID)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.id = SIDECHAIN_STYLE_ID
  style.textContent = SIDECHAIN_STYLE_CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
