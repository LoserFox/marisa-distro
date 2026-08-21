/** General Settings row for the desktop-notification permission and display style. */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NotifyKey } from './locales.ts'
import { notificationStyle, STYLE_KEY, type NotifyStyle } from './notify.ts'
import css from './NotificationSettingsRow.module.css'

/** Full Settings-row props. */
export type NotificationSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'web-ui-notify'>

/** One of the browser Notification permission states, 'unsupported' when the API is absent. */
export type NotificationPermissionState = NotificationPermission | 'unsupported'

/** Read the current browser permission state (safe outside browsers). */
export function permissionState(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Locale key for a permission state, for the settings row copy. */
function statusKey(state: NotificationPermissionState): NotifyKey {
  switch (state) {
    case 'granted': return 'settings.status.granted'
    case 'denied': return 'settings.status.denied'
    case 'default': return 'settings.status.default'
    case 'unsupported': return 'settings.status.unsupported'
  }
}

/**
 * Render the desktop-notification preference row: current browser state plus
 * a request button (the user-gesture entry point the browser requires before
 * `new Notification` works), and a display-style selector (native Windows
 * toast vs the browser default UI) persisted to localStorage.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function NotificationSettingsRow({ t }: NotificationSettingsRowProps) {
  const [state, setState] = useState<NotificationPermissionState>(permissionState)
  const [style, setStyle] = useState<NotifyStyle>(notificationStyle)
  const request = async () => {
    if (typeof Notification === 'undefined') return
    const next = await Notification.requestPermission()
    setState(next)
  }
  const changeStyle = (next: NotifyStyle): void => {
    setStyle(next)
    try {
      localStorage.setItem(STYLE_KEY, next)
    } catch {
      // storage unavailable (private mode / restrictions): keep in-memory only
    }
  }
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
        <div className={css.status}>{t(statusKey(state))}</div>
        <div className={css.styleRow}>
          <span className={css.styleLabel}>{t('settings.style')}</span>
          <select
            className={css.styleSelect}
            value={style}
            aria-label={t('settings.style')}
            onChange={(event) => { changeStyle(event.target.value as NotifyStyle) }}
          >
            <option value="native">{t('settings.style.native')}</option>
            <option value="webview">{t('settings.style.webview')}</option>
          </select>
        </div>
        <div className={css.styleHint}>{t('settings.style.desc')}</div>
      </div>
      {state === 'granted' || state === 'unsupported' ? null : (
        <button
          type="button"
          className={css.button}
          onClick={() => { void request() }}
        >
          {t('settings.request')}
        </button>
      )}
    </div>
  )
}
