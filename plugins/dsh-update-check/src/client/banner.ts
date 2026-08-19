/** 启动横幅：顶部 fixed 最小 DOM 注入，发现新版本且未忽略时显示。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CHECK_ROUTE, DISMISS_ROUTE, STATE_ROUTE, type UpdateStatePayload } from '../protocol.ts'

const BANNER_ID = 'dsh-update-check-banner'
/** 首次拉取失败后的单次重试延迟（后端可能尚未就绪）。 */
const RETRY_DELAY_MS = 5_000

export interface UpdateBanner {
  dispose(): void
}

export function mountUpdateBanner(ctx: ClientContext): UpdateBanner {
  const t = ctx.locale.bind('update-check')
  let disposed = false
  let retried = false

  const root = document.createElement('div')
  root.id = BANNER_ID
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  Object.assign(root.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483646',
    display: 'none', alignItems: 'center', gap: '12px', boxSizing: 'border-box',
    maxWidth: 'min(640px, calc(100vw - 32px))', padding: '10px 14px',
    border: '1px solid var(--dsw-alias-border-l2-darkmode-thin, rgb(15 23 42 / 14%))',
    borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #1a1f2e)',
    boxShadow: 'var(--dsw-shadow-lv3, 0 12px 32px rgb(15 23 42 / 18%))',
    font: '400 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif', letterSpacing: '0',
  })
  const message = document.createElement('div')
  Object.assign(message.style, { flex: '1', minWidth: '0', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })
  const actions = document.createElement('div')
  Object.assign(actions.style, { display: 'flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' })
  root.append(message, actions)
  document.body.append(root)

  const linkStyle = (): Partial<CSSStyleDeclaration> => ({
    padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', textDecoration: 'none',
    font: '400 12px/1.4 -apple-system, BlinkMacSystemFont, sans-serif',
    border: '1px solid var(--dsw-alias-border-l2, rgb(15 23 42 / 14%))',
    background: 'transparent', color: 'var(--dsw-alias-label-primary, #1a1f2e)',
  })

  const hide = (): void => { root.style.display = 'none' }

  const dismiss = async (version: string): Promise<void> => {
    // 关闭失败不阻塞：横幅本地隐藏即可，下次启动仍会按 dismissedVersion 判定。
    try {
      await fetch(DISMISS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version }),
      })
    } catch { /* network failure — ignore */ }
    hide()
  }

  const show = (payload: UpdateStatePayload): void => {
    if (disposed) return
    if (!payload.hasUpdate || payload.latest === null) return
    if (payload.dismissedVersion === payload.latest) return
    message.textContent = t('banner.text', { latest: payload.latest, current: payload.currentVersion || '—' })
    actions.replaceChildren()
    const view = document.createElement('a')
    view.textContent = t('banner.view')
    view.href = payload.assets.releasePage ?? payload.assets.download ?? '#'
    view.target = '_blank'
    view.rel = 'noreferrer'
    Object.assign(view.style, linkStyle())
    if (payload.assets.download !== null) {
      const download = document.createElement('a')
      download.textContent = t('banner.download')
      download.href = payload.assets.download
      download.target = '_blank'
      download.rel = 'noreferrer'
      Object.assign(download.style, linkStyle(), {
        borderColor: 'var(--dsw-alias-state-business-primary, #3964fe)',
        color: 'var(--dsw-alias-state-business-primary, #3964fe)',
      })
      actions.append(view, download)
    } else {
      actions.append(view)
    }
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = '×'
    close.setAttribute('aria-label', t('banner.close'))
    Object.assign(close.style, linkStyle(), {
      width: '26px', height: '26px', padding: '0', border: '0', borderRadius: '4px',
      font: '400 18px/1 -apple-system, BlinkMacSystemFont, sans-serif',
    })
    close.addEventListener('click', () => { void dismiss(payload.latest as string) })
    actions.append(close)
    root.style.display = 'flex'
  }

  const applyPayload = (payload: UpdateStatePayload): void => {
    if (payload.lastCheckAt === null && payload.autoCheck) {
      // 首次运行：主动触发一次检查（与宿主 30s 定时检查共用缓存窗口），
      // 成功后重读状态——否则首次启动的横幅要等下一次检查才有数据。
      void fetch(CHECK_ROUTE, { method: 'POST' })
        .then(async response => {
          if (!response.ok) return
          show(await response.json() as UpdateStatePayload)
        })
        .catch(() => { /* network failure — banner skipped silently */ })
      return
    }
    show(payload)
  }

  const load = async (): Promise<void> => {
    try {
      const response = await fetch(STATE_ROUTE)
      if (!response.ok) return
      applyPayload(await response.json() as UpdateStatePayload)
    } catch {
      // 模块加载可能早于后端就绪：失败静默，仅重试一次。
      if (!disposed && !retried) {
        retried = true
        setTimeout(() => { void load() }, RETRY_DELAY_MS)
      }
    }
  }
  void load()

  return {
    dispose() {
      disposed = true
      root.remove()
    },
  }
}
