/** Browser settings card for the model-proxy Host namespace. */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import React, { useEffect, useState, useSyncExternalStore } from 'react'

const NS = 'model-proxy'

const zh = {
  title: '模型代理',
  description: '通过 HTTP_PROXY 代理模型与网页请求，并让 Agent 启动的 PowerShell 继承同一代理。',
  proxy: '代理地址',
  proxyHint: '留空：HTTP_PROXY → HTTPS_PROXY → ALL_PROXY → http://127.0.0.1:10808；填写 direct 可直连。带账号密码的代理请通过环境变量配置。',
  noProxy: '直连主机',
  noProxyHint: '每行或逗号分隔；会追加到 NO_PROXY。localhost、127.0.0.1、::1 始终直连。',
  endpoint: 'DeepSeek API 地址始终保持 https://api.deepseek.com；这里只改变传输路径。',
  save: '保存并立即应用',
  saving: '保存中…',
  discard: '放弃修改',
  failed: '保存失败，请检查配置后重试。',
  unavailable: '当前连接不能修改 Host 设置。',
} as const

type ModelProxyLocaleKey = keyof typeof zh

const en = {
  title: 'Model proxy',
  description: 'Routes model and Web requests through HTTP_PROXY and exports the same proxy to PowerShell launched by the agent.',
  proxy: 'Proxy URL',
  proxyHint: 'Blank: HTTP_PROXY → HTTPS_PROXY → ALL_PROXY → http://127.0.0.1:10808. Enter direct to bypass it; use environment variables for authenticated proxies.',
  noProxy: 'Direct hosts',
  noProxyHint: 'One per line or comma-separated; appended to NO_PROXY. localhost, 127.0.0.1, and ::1 always connect directly.',
  endpoint: 'The DeepSeek API endpoint remains https://api.deepseek.com; this changes only the transport path.',
  save: 'Save and apply now',
  saving: 'Saving…',
  discard: 'Discard changes',
  failed: 'Save failed. Check the configuration and try again.',
  unavailable: 'This connection cannot modify Host settings.',
} satisfies Record<ModelProxyLocaleKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'model-proxy': ModelProxyLocaleKey
  }
}

interface ModelProxySettings {
  proxy?: string
  noProxy?: string[]
}

type ModelProxyCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'model-proxy'>

const colors = {
  panel: 'var(--dsw-alias-bg-layer-1, #111820)',
  raised: 'var(--dsw-alias-bg-layer-2, #18222c)',
  text: 'var(--dsw-alias-label-primary, #e7edf4)',
  muted: 'var(--dsw-alias-label-secondary, #8d9bab)',
  border: 'var(--dsw-alias-border-l2, rgba(150,180,210,.14))',
  cyan: '#43c6d9',
  danger: '#ef6a6a',
} as const

function parseNoProxy(text: string): string[] {
  return [...new Set(text.split(/[\n,]+/).map(value => value.trim()).filter(Boolean))]
}

function createModelProxyCard(scope: SettingsScope<ModelProxySettings>) {
  return function ModelProxyCard({ t }: ModelProxyCardProps): React.ReactElement | null {
    const snapshot = useSyncExternalStore(
      listener => scope.subscribe(listener),
      () => scope.getSnapshot(),
      () => scope.getSnapshot(),
    )
    const [proxy, setProxy] = useState('')
    const [noProxy, setNoProxy] = useState('')
    const [dirtyFields, setDirtyFields] = useState({ proxy: false, noProxy: false })
    const [saving, setSaving] = useState(false)
    const [failed, setFailed] = useState(false)

    const dirty = dirtyFields.proxy || dirtyFields.noProxy

    useEffect(() => {
      if (snapshot.status !== 'ready' || dirty) return
      setProxy(snapshot.value?.proxy ?? '')
      setNoProxy((snapshot.value?.noProxy ?? []).join('\n'))
    }, [snapshot, dirty])

    if (snapshot.status === 'unavailable') return null

    const discard = (): void => {
      setProxy(snapshot.value?.proxy ?? '')
      setNoProxy((snapshot.value?.noProxy ?? []).join('\n'))
      setDirtyFields({ proxy: false, noProxy: false })
      setFailed(false)
    }

    const save = async (): Promise<void> => {
      if (!snapshot.writable || saving || !dirty) return
      setSaving(true)
      setFailed(false)
      try {
        const proxyValue = proxy.trim()
        const directHosts = parseNoProxy(noProxy)
        let landed = true
        if (dirtyFields.proxy) {
          if (proxyValue === '') await scope.unset('proxy')
          else await scope.set('proxy', proxyValue)
          const user = scope.getSnapshot().user as ModelProxySettings | undefined
          landed = proxyValue === ''
            ? user === undefined || !Object.hasOwn(user, 'proxy')
            : user?.proxy === proxyValue
        }
        if (landed && dirtyFields.noProxy) {
          if (directHosts.length === 0) await scope.unset('noProxy')
          else await scope.set('noProxy', directHosts)
          const user = scope.getSnapshot().user as ModelProxySettings | undefined
          landed = directHosts.length === 0
            ? user === undefined || !Object.hasOwn(user, 'noProxy')
            : Array.isArray(user?.noProxy)
              && user.noProxy.length === directHosts.length
              && user.noProxy.every((value, index) => value === directHosts[index])
        }
        if (landed) setDirtyFields({ proxy: false, noProxy: false })
        else setFailed(true)
      } catch {
        setFailed(true)
      } finally {
        setSaving(false)
      }
    }

    const inputStyle: React.CSSProperties = {
      width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.border}`,
      borderRadius: 5, background: colors.raised, color: colors.text, padding: '7px 9px',
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 11,
    }

    return (
      <section style={{ border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.panel, overflow: 'hidden' }}>
        <div style={{ padding: '13px 14px 11px' }}>
          <strong style={{ color: colors.text, fontSize: 13 }}>{t('title')}</strong>
          <span style={{ display: 'block', color: colors.muted, fontSize: 11, marginTop: 4 }}>{t('description')}</span>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '12px 14px 14px', display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 5, color: colors.text, fontSize: 11 }}>
            {t('proxy')}
            <input
              aria-label={t('proxy')}
              value={proxy}
              disabled={!snapshot.writable || saving}
              placeholder="http://127.0.0.1:10808"
              onChange={(event) => { setProxy(event.target.value); setDirtyFields(current => ({ ...current, proxy: true })); setFailed(false) }}
              style={inputStyle}
            />
            <span style={{ color: colors.muted, fontSize: 10 }}>{t('proxyHint')}</span>
          </label>
          <label style={{ display: 'grid', gap: 5, color: colors.text, fontSize: 11 }}>
            {t('noProxy')}
            <textarea
              aria-label={t('noProxy')}
              value={noProxy}
              rows={3}
              disabled={!snapshot.writable || saving}
              onChange={(event) => { setNoProxy(event.target.value); setDirtyFields(current => ({ ...current, noProxy: true })); setFailed(false) }}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <span style={{ color: colors.muted, fontSize: 10 }}>{t('noProxyHint')}</span>
          </label>
          <div style={{ color: colors.cyan, fontSize: 10 }}>{t('endpoint')}</div>
          {!snapshot.writable && <div style={{ color: colors.danger, fontSize: 10 }}>{t('unavailable')}</div>}
          {failed && <div style={{ color: colors.danger, fontSize: 10 }}>{t('failed')}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={discard}
              style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid ${colors.border}`, background: colors.raised, color: colors.text }}
            >{t('discard')}</button>
            <button
              type="button"
              disabled={!snapshot.writable || !dirty || saving}
              onClick={() => { void save() }}
              style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid ${colors.cyan}`, background: colors.cyan, color: '#071015' }}
            >{saving ? t('saving') : t('save')}</button>
          </div>
        </div>
      </section>
    )
  }
}

export const inject = ['slots', 'locale', 'settingsScope']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-proxy: dictionaries')
  const scope = ctx.settingsScope.bind<ModelProxySettings>({ namespace: NS })
  const card = createModelProxyCard(scope)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    locale: NS,
  }, card))
}
