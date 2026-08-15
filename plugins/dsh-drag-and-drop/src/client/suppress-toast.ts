/**
 * Suppress the DSH composer's built-in "unsupported image format" toast when
 * a file/folder drop (or paste) is not a supported image — that toast is
 * misleading for the drag-and-drop path plugin, which handles the same drop
 * by inserting the original filesystem path.
 *
 * Zero source intrusion: this module only observes the DOM at runtime. The
 * composer's Toast component (ui-primitives) portals a `[role="alert"]`
 * element into document.body; the same Toast component also reports prompt
 * send failures, so we must match by message text, not by element.
 *
 * Matching texts (localized by the composer):
 *   zh: 不支持的图片格式：{type}
 *   en: Unsupported image format: {type}
 *
 * When matched, a clarifying suffix is appended via CSS ::after — the
 * official message (including the MIME type) stays fully visible, with the
 * extra hint noting that the drag-and-drop plugin handled the drop.
 *
 * The observer and injected style are owned by the caller's effect lifetime:
 * dispose() disconnects and removes both.
 */

const ALERT_SELECTOR = '[role="alert"]'
const SUPPRESS_CLASS = 'dsh-file-drop-suppressed'

const MATCH_PATTERNS: ReadonlyArray<RegExp> = [
  /不支持的图片格式/,
  /Unsupported image format/,
]

export interface ToastSuppressor {
  dispose(): void
}

export function suppressImageFormatToast(): ToastSuppressor {
  const style = document.createElement('style')
  style.textContent = [
    `.${SUPPRESS_CLASS} .dsh-file-drop-original::after {`,
    `  content: "（已由拖拽插件插入文件路径）";`,
    `  font-size: inherit;`,
    `  font-weight: inherit;`,
    `  color: inherit;`,
    `  line-height: inherit;`,
    `}`,
  ].join('\n')
  document.head.append(style)

  const suppress = (alert: HTMLElement): void => {
    // Skip already-processed nodes and anything we own.
    if (alert.classList.contains(SUPPRESS_CLASS)) return
    const text = alert.textContent ?? ''
    if (!MATCH_PATTERNS.some(pattern => pattern.test(text))) return
    alert.classList.add(SUPPRESS_CLASS)
    // The composer Toast renders the message in the last text-bearing span
    // (icon span has no text); mark those so CSS hides them and ::after
    // supplies the clarifying copy.
    for (const span of alert.querySelectorAll('span')) {
      const own = span.textContent?.trim()
      if (own !== undefined && own !== '') span.classList.add('dsh-file-drop-original')
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches(ALERT_SELECTOR)) suppress(node)
        else if (node.querySelector(ALERT_SELECTOR) !== null) {
          for (const alert of node.querySelectorAll(ALERT_SELECTOR)) suppress(alert as HTMLElement)
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  return {
    dispose() {
      observer.disconnect()
      style.remove()
    },
  }
}
