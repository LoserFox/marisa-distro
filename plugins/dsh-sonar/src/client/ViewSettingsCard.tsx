import React, { useEffect, useState } from 'react'
import type { ViewClientState, ViewController } from './controller.ts'
import { translator } from './i18n.ts'
import type { ViewUiConfig } from '../types.ts'

export interface ViewSettingsCardProps {
  controller: ViewController
}

const colors = {
  panel: 'var(--dsw-alias-bg-layer-1, #111820)',
  raised: 'var(--dsw-alias-bg-layer-2, #18222c)',
  input: 'var(--dsw-specific-input-major, #0b1117)',
  text: 'var(--dsw-alias-label-primary, #e7edf4)',
  muted: 'var(--dsw-alias-label-secondary, #8d9bab)',
  faint: 'var(--dsw-alias-label-tertiary, #5f6d7b)',
  border: 'var(--dsw-alias-border-l2, rgba(150,180,210,.14))',
  cyan: '#43c6d9',
  green: '#52c77a',
  amber: '#d7a84d',
} as const

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: 6,
  background: colors.input, color: colors.text, padding: '8px 9px', outline: 'none', fontSize: 12,
}

function useControllerState(controller: ViewController): ViewClientState {
  const [state, setState] = useState(() => controller.getSnapshot())
  useEffect(() => {
    setState(controller.getSnapshot())
    const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()))
    void controller.load(true)
    return unsubscribe
  }, [controller])
  return state
}

export function ViewSettingsCard({ controller }: ViewSettingsCardProps): React.ReactElement | null {
  const state = useControllerState(controller)
  const effective = state.data?.ui
  const configuration = state.data?.configuration
  const t = translator(effective?.locale ?? 'zh-CN')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ViewUiConfig | null>(effective ?? null)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== null && effective !== undefined && JSON.stringify(draft) !== JSON.stringify(effective)

  useEffect(() => {
    if (effective !== undefined) setDraft(effective)
  }, [configuration?.revision, effective?.locale, effective?.refreshIntervalMs, effective?.motion, effective?.backgroundReviewEnabled, effective?.backgroundReviewIntervalMs])

  if (effective === undefined || configuration === undefined || !configuration.available) return null
  const overridden = Object.keys(configuration.user).length > 0
  const disabled = !configuration.writable || saving
  const update = <K extends keyof ViewUiConfig>(key: K, value: ViewUiConfig[K]): void => {
    setDraft(current => current === null ? current : { ...current, [key]: value })
  }
  const save = async (): Promise<void> => {
    if (!draft || disabled || !dirty) return
    setSaving(true)
    await controller.saveSettings(draft)
    setSaving(false)
  }
  const reset = async (): Promise<void> => {
    if (disabled) return
    setSaving(true)
    await controller.resetSettings()
    setSaving(false)
  }

  return <section style={{ border: `1px solid ${open ? `${colors.cyan}66` : colors.border}`, borderRadius: 8, background: colors.panel, overflow: 'hidden' }}>
    <button
      aria-label={`${open ? t('collapseSettings') : t('expandSettings')}: ${t('settingsCardTitle')}`}
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
      style={{ width: '100%', border: 0, background: 'transparent', color: colors.text, padding: '13px 14px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, textAlign: 'left', cursor: 'pointer' }}
    >
      <span><strong>{t('settingsCardTitle')}</strong><span style={{ display: 'block', color: colors.muted, fontSize: 11, marginTop: 4 }}>{t('settingsCardDescription')}</span></span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ color: overridden ? colors.amber : colors.faint, fontSize: 9 }}>{overridden ? t('overriddenConfig') : t('inheritedConfig')}</span><span style={{ color: colors.cyan }}>{open ? '⌃' : '⌄'}</span></span>
    </button>
    {open && draft && <div style={{ borderTop: `1px solid ${colors.border}`, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, color: colors.faint, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em' }}><span>{t('effectiveConfig')}</span><span style={{ color: colors.green }}>{t('appliesLive')}</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ color: colors.muted, fontSize: 10 }}>{t('locale')}<select aria-label={`${t('settingsCardTitle')} · ${t('locale')}`} disabled={disabled} style={{ ...inputStyle, marginTop: 5 }} value={draft.locale} onChange={event => update('locale', event.target.value as ViewUiConfig['locale'])}><option value="zh-CN">中文 · zh-CN</option><option value="en-US">English · en-US</option></select></label>
        <label style={{ color: colors.muted, fontSize: 10 }}>{t('motion')}<select aria-label={`${t('settingsCardTitle')} · ${t('motion')}`} disabled={disabled} style={{ ...inputStyle, marginTop: 5 }} value={draft.motion} onChange={event => update('motion', event.target.value as ViewUiConfig['motion'])}><option value="full">{t('full')}</option><option value="reduced">{t('reduced')}</option></select></label>
        <label style={{ color: colors.muted, fontSize: 10 }}>{t('refreshMs')}<input aria-label={`${t('settingsCardTitle')} · ${t('refreshMs')}`} disabled={disabled} type="number" min={500} max={30000} step={100} style={{ ...inputStyle, marginTop: 5 }} value={draft.refreshIntervalMs} onChange={event => update('refreshIntervalMs', Number(event.target.value))} /></label>
        <label style={{ color: colors.muted, fontSize: 10 }}>{t('backgroundIntervalMs')}<input aria-label={`${t('settingsCardTitle')} · ${t('backgroundIntervalMs')}`} disabled={disabled} type="number" min={2000} max={3600000} step={1000} style={{ ...inputStyle, marginTop: 5 }} value={draft.backgroundReviewIntervalMs} onChange={event => update('backgroundReviewIntervalMs', Number(event.target.value))} /></label>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, color: colors.muted, fontSize: 11 }}><input aria-label={`${t('settingsCardTitle')} · ${t('background')}`} disabled={disabled} type="checkbox" checked={draft.backgroundReviewEnabled} onChange={event => update('backgroundReviewEnabled', event.target.checked)} />{t('background')}</label>
      {state.error && <div style={{ color: '#ef6a6a', fontSize: 10, marginTop: 9 }}>{state.error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 13 }}><button disabled={disabled || !overridden} onClick={() => void reset()} style={{ border: `1px solid ${colors.border}`, borderRadius: 5, background: colors.raised, color: disabled || !overridden ? colors.faint : colors.muted, padding: '7px 10px', cursor: 'pointer', fontSize: 9 }}>{t('resetSettings')}</button><button disabled={disabled || !dirty} onClick={() => void save()} style={{ border: `1px solid ${dirty ? colors.cyan : colors.border}`, borderRadius: 5, background: dirty ? colors.cyan : colors.raised, color: dirty ? '#071015' : colors.faint, padding: '7px 12px', cursor: 'pointer', fontSize: 9 }}>{saving ? t('savingSettings') : t('saveSettings')}</button></div>
    </div>}
  </section>
}
