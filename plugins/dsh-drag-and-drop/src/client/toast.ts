import { createToastTimer } from './toast-timer.ts'

const TOAST_ID = 'dsh-file-drop-toast'
const AUTO_DISMISS_MS = 8000

export interface FileDropToast {
  showError(message: string): void
  dispose(): void
}

export function createFileDropToast(): FileDropToast {
  const root = document.createElement('div')
  root.id = TOAST_ID
  root.setAttribute('role', 'alert')
  root.setAttribute('aria-live', 'assertive')
  Object.assign(root.style, {
    position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483646',
    display: 'none', alignItems: 'flex-start', gap: '10px', width: 'min(420px, calc(100vw - 32px))',
    boxSizing: 'border-box', padding: '12px 12px 12px 14px',
    border: '1px solid var(--dsw-alias-border-l2-darkmode-thin, rgb(15 23 42 / 14%))',
    borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'var(--dsw-alias-state-error-primary, #d92d20)',
    boxShadow: 'var(--dsw-shadow-lv3, 0 12px 32px rgb(15 23 42 / 18%))',
    font: '400 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif', letterSpacing: '0',
  })
  const message = document.createElement('div')
  Object.assign(message.style, { flex: '1', minWidth: '0', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })
  const close = document.createElement('button')
  close.type = 'button'
  close.setAttribute('aria-label', '关闭')
  close.title = '关闭'
  close.textContent = '×'
  Object.assign(close.style, {
    flex: '0 0 24px', width: '24px', height: '24px', margin: '-3px -3px 0 0', padding: '0',
    border: '0', borderRadius: '4px', background: 'transparent', color: 'currentColor', cursor: 'pointer',
    font: '400 20px/22px -apple-system, BlinkMacSystemFont, sans-serif', letterSpacing: '0',
  })
  root.append(message, close)
  document.body.append(root)

  const hide = (): void => { root.style.display = 'none' }
  const timer = createToastTimer(AUTO_DISMISS_MS, hide, {
    now: () => Date.now(),
    set: (callback, delay) => setTimeout(callback, delay),
    clear: handle => { clearTimeout(handle as ReturnType<typeof setTimeout>) },
  })
  const closeToast = (): void => { timer.cancel(); hide() }
  close.addEventListener('click', closeToast)
  root.addEventListener('mouseenter', () => { timer.pause() })
  root.addEventListener('mouseleave', () => { if (root.style.display !== 'none') timer.resume() })

  return {
    showError(text) {
      message.textContent = text
      root.style.display = 'flex'
      timer.arm()
    },
    dispose() { timer.cancel(); root.remove() },
  }
}
