/**
 * Panel stylesheet (browser half): the one CSS resource the sidechain panel
 * needs — the running-row shimmer keyframes. Inline styles cover everything
 * else, but `background-clip: text` sweeps need a real stylesheet, so this
 * installs a single idempotent `<style>` tag and hands back its disposer
 * (the plugin fiber removes it on unload — hot-unload discipline).
 */

/** The injected stylesheet body. */
export const SIDECHAIN_STYLE_CSS = `
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
