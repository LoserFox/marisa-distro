/**
 * Settings section for the suggested-replies master switch.
 *
 * @module @dsh-external/dsh-suggested-replies/client/SuggestedRepliesSection
 */

import { useEffect, useState, type CSSProperties } from 'react'
import type { ClientConnectionRpc, RpcResult } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsResponse } from '../rpc.ts'

/** Session-independent injected connection face. */
export interface SuggestedRepliesSectionInjected {
  /** RPC handle used to load and write the master switch. */
  readonly rpc: ClientConnectionRpc
}

type SuggestedRepliesSectionProps =
  & PropsRuntime<'settings.section'>
  & PropsLocale<'suggested-replies'>
  & SuggestedRepliesSectionInjected

type SettingsResult = RpcResult<SettingsResponse>

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column' }
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 24,
  padding: '14px 0',
  borderTop: '1px solid rgba(128, 128, 128, 0.22)',
}
const noteStyle: CSSProperties = {
  marginTop: 14,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(128, 128, 128, 0.12)',
  fontSize: 13,
  lineHeight: 1.6,
}
const errorStyle: CSSProperties = {
  marginBottom: 8,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(192, 64, 64, 0.12)',
  fontSize: 13,
}

/** Accessible switch with host-theme-neutral styling. */
function Toggle({ on, label, disabled, onToggle }: {
  readonly on: boolean
  readonly label: string
  readonly disabled: boolean
  readonly onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 44,
        height: 26,
        padding: 0,
        border: 0,
        borderRadius: 13,
        background: on ? '#2f6fed' : 'rgba(128, 128, 128, 0.35)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: on ? 21 : 3,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  )
}

/** Render and persist the master enable switch. */
export function SuggestedRepliesSection({ rpc, t }: SuggestedRepliesSectionProps) {
  const [enabled, setEnabled] = useState<boolean | undefined>()
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const result = await rpc.call('/suggested-replies', 'settings.get', {}) as SettingsResult
        if (!mounted) return
        if (result.ok) {
          setEnabled(result.value.enabled)
        } else {
          setEnabled(true)
          setError(result.error.message)
        }
      } catch (cause) {
        if (!mounted) return
        setEnabled(true)
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => { mounted = false }
  }, [rpc])

  const toggle = async (): Promise<void> => {
    if (enabled === undefined || writing) return
    setWriting(true)
    setError(undefined)
    try {
      const result = await rpc.call('/suggested-replies', 'settings.set', { enabled: !enabled }) as SettingsResult
      if (result.ok) setEnabled(result.value.enabled)
      else setError(result.error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setWriting(false)
    }
  }

  if (enabled === undefined) return <section style={sectionStyle}>...</section>

  return (
    <section style={sectionStyle}>
      {error !== undefined && <div style={errorStyle} role="alert">{error}</div>}
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: 15, lineHeight: 1.4 }}>{t('settings.enabled.label')}</div>
          <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.5, opacity: 0.62 }}>{t('settings.enabled.description')}</div>
        </div>
        <Toggle on={enabled} label={t('settings.enabled.label')} disabled={writing} onToggle={() => void toggle()} />
      </div>
      {!enabled && <div style={noteStyle}>{t('settings.disabled.note')}</div>}
    </section>
  )
}
