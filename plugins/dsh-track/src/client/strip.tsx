/**
 * TrackStrip: the composer-dock strip surfacing capture-wall state. Styles
 * are inline (no CSS modules) so the client bundle needs no CSS pipeline.
 *
 * The count is fetched from the host API and re-polled while the app is
 * open (same cadence as the right panel's auto-refresh), so the badge never
 * lies — the previous version hardcoded `captures: 0` and always showed
 * "暂无捕获 / No captures" (2026-08-13).
 * @module @deepseek-ai/dsh-track/client/strip
 */

import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TrackStripProps } from './strip-contract.ts'
import type { TrackKey } from './locales.ts'
import type { Capture } from '../types.ts'

const style = {
  strip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '2px 8px',
    border: '1px solid rgba(128, 128, 128, 0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  } as const,
  label: { fontWeight: 600 } as const,
  badge: {
    padding: '0 6px',
    borderRadius: 999,
    background: '#4c8dff',
    color: '#fff',
    fontSize: 11,
    lineHeight: '16px',
  } as const,
  muted: { opacity: 0.7 } as const,
  empty: { opacity: 0.55, fontStyle: 'italic' } as const,
}

const REFRESH_MS = 20_000

/** Track strip component: label + live open capture count, click opens the panel. */
export function TrackStrip({ captures: initial, onClick, t }: TrackStripProps & PropsLocale<'track'>) {
  const [captures, setCaptures] = useState(initial ?? 0)
  useEffect(() => {
    let alive = true
    const load = (): void => {
      fetch('/api/track/captures')
        .then((r) => r.json())
        .then((data: { captures?: Capture[] }) => {
          if (!alive) return
          const open = (data.captures ?? []).filter((c) => c.status === 'open').length
          setCaptures(open)
        })
        .catch(() => { /* the strip is best-effort; never break the dock */ })
    }
    load()
    const id = window.setInterval(load, REFRESH_MS)
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.clearInterval(id)
      window.removeEventListener('focus', load)
    }
  }, [])

  return (
    <button type="button" style={style.strip} data-testid="track-strip" onClick={onClick} title={t('strip.title')}>
      <span style={style.label}>{t('strip.label')}</span>
      {captures > 0 ? (
        <span style={style.badge}>{t(captures === 1 ? 'strip.captures.one' : 'strip.captures', { n: captures })}</span>
      ) : (
        <span style={style.empty}>{t('strip.empty')}</span>
      )}
    </button>
  )
}
