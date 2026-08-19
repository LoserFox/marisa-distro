/** 设置页卡片（settings.plugin.item，key = update-check 命名空间）。 */

import React, { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CHECK_ROUTE, SETTINGS_ROUTE, STATE_ROUTE, type UpdateStatePayload } from '../protocol.ts'

export interface UpdateCheckCardProps extends PropsRuntime<'settings.plugin.item'>, PropsLocale<'update-check'> {}

const colors = {
  panel: 'var(--dsw-alias-bg-layer-1, #111820)',
  raised: 'var(--dsw-alias-bg-layer-2, #18222c)',
  text: 'var(--dsw-alias-label-primary, #e7edf4)',
  muted: 'var(--dsw-alias-label-secondary, #8d9bab)',
  border: 'var(--dsw-alias-border-l2, rgba(150,180,210,.14))',
  cyan: '#43c6d9',
  green: '#52c77a',
  amber: '#d7a84d',
  danger: '#ef6a6a',
} as const

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

/**
 * 更新检查卡片：当前/最新版本、changelog、立即检查、自动检查开关与按
 * 安装形态选出的下载按钮。数据全部来自 host 的 state 路由。
 */
export function UpdateCheckCard({ t }: UpdateCheckCardProps): React.ReactElement | null {
  const [state, setState] = useState<UpdateStatePayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(STATE_ROUTE)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(await response.json() as UpdateStatePayload)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const checkNow = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(CHECK_ROUTE, { method: 'POST' })
      if (response.status === 429) {
        setError(t('card.checkTooFrequent'))
        await load()
        return
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(await response.json() as UpdateStatePayload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const toggleAutoCheck = async (autoCheck: boolean): Promise<void> => {
    try {
      const response = await fetch(SETTINGS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoCheck }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setState(current => current === null ? current : { ...current, autoCheck })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (state === null) return null

  return (
    <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.panel, overflow: 'hidden' }}>
      <div style={{ padding: '13px 14px 11px' }}>
        <strong style={{ color: colors.text, fontSize: 13 }}>{t('card.title')}</strong>
        <span style={{ display: 'block', color: colors.muted, fontSize: 11, marginTop: 4 }}>{t('card.description')}</span>
      </div>
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: '12px 14px 14px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: colors.muted, fontSize: 11 }}>
          <span>{t('card.current')}：<span style={{ color: colors.text }}>{state.currentVersion || '—'}</span></span>
          <span>{t('card.latest')}：<span style={{ color: colors.text }}>{state.latest ?? '—'}</span></span>
          <span style={{ color: state.hasUpdate ? colors.amber : colors.green, fontWeight: 600 }}>
            {state.latest === null ? t('card.noRelease') : state.hasUpdate ? t('card.hasUpdate') : t('card.upToDate')}
          </span>
        </div>
        {state.lastCheckAt !== null && (
          <div style={{ color: colors.muted, fontSize: 10 }}>{t('card.lastChecked', { time: formatTime(state.lastCheckAt) })}</div>
        )}
        {state.changelog !== '' && (
          <div>
            <div style={{ color: colors.muted, fontSize: 10, marginBottom: 5 }}>{t('card.changelog')}</div>
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: colors.text,
              fontSize: 11, lineHeight: 1.6, maxHeight: 240, overflowY: 'auto', fontFamily: 'inherit',
            }}>{state.changelog}</pre>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.muted, fontSize: 11 }}>
          <input
            aria-label={t('card.autoCheck')}
            type="checkbox"
            checked={state.autoCheck}
            onChange={event => { void toggleAutoCheck(event.target.checked) }}
          />
          {t('card.autoCheck')}
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          {error !== null && <span style={{ color: colors.danger, fontSize: 10, flex: '1' }}>{error}</span>}
          {state.assets.download !== null && (
            <a
              href={state.assets.download}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '6px 12px', borderRadius: 5, textDecoration: 'none', fontSize: 11,
                border: `1px solid ${colors.cyan}`, background: colors.cyan, color: '#071015',
              }}
            >{t('card.download')}</a>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => { void checkNow() }}
            style={{
              padding: '6px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
              border: `1px solid ${colors.border}`, background: colors.raised, color: colors.text,
            }}
          >{busy ? t('card.checking') : t('card.checkNow')}</button>
        </div>
      </div>
    </section>
  )
}
