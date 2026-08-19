/**
 * 目录来源卡片（P0 续）：逐源报告 + mygo 原生源配置
 * （localSources / hubOrigins / githubUpstream / 限流与缓存）。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/CatalogSourcesPanel
 */
import { useEffect, useState } from 'react'
import css from './Panel.module.css'
import type { HubSourceConfig, HubSourceReport } from './api'

const KIND_LABEL: Record<HubSourceReport['kind'], string> = {
  local: 'local',
  market: 'market',
  hub: 'hub',
  github: 'github',
}

export interface CatalogSourcesPanelProps {
  readonly reports: readonly HubSourceReport[]
  readonly config: HubSourceConfig | null
  readonly busy: boolean
  readonly onSave: (patch: Partial<HubSourceConfig>) => void
}

export function CatalogSourcesPanel(props: CatalogSourcesPanelProps): JSX.Element {
  const { reports, config, busy, onSave } = props
  const [open, setOpen] = useState(false)
  const [localText, setLocalText] = useState('')
  const [originsText, setOriginsText] = useState('')
  const [marketUrl, setMarketUrl] = useState('')
  const [marketMaxPages, setMarketMaxPages] = useState(10)
  const [githubUpstream, setGithubUpstream] = useState('')
  const [maxRepos, setMaxRepos] = useState(30)
  const [timeoutMs, setTimeoutMs] = useState(10_000)
  const [cacheTtlMs, setCacheTtlMs] = useState(300_000)

  useEffect(() => {
    if (config === null) return
    setLocalText(config.localSources.join('\n'))
    setOriginsText(config.hubOrigins.join('\n'))
    setMarketUrl(config.marketUrl)
    setMarketMaxPages(config.marketMaxPages)
    setGithubUpstream(config.githubUpstream)
    setMaxRepos(config.maxRepos)
    setTimeoutMs(config.timeoutMs)
    setCacheTtlMs(config.cacheTtlMs)
  }, [config])

  const save = (): void => {
    onSave({
      localSources: localText.split('\n').map(line => line.trim()).filter(line => line !== ''),
      hubOrigins: originsText.split('\n').map(line => line.trim()).filter(line => line.startsWith('https://')),
      marketUrl: marketUrl.trim(),
      marketMaxPages,
      githubUpstream: githubUpstream.trim(),
      maxRepos,
      timeoutMs,
      cacheTtlMs,
    })
  }

  const failed = reports.filter(report => !report.ok)

  return (
    <div className={css.card}>
      <button
        type="button"
        className={css.sourcesToggle}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className={css.cardTitle}>目录来源</span>
        <span className={css.cardMeta}>
          {reports.map(report => (
            <span key={report.kind} className={report.ok ? css.badge + ' ' + css.badgeOk : css.badge + ' ' + css.badgeDanger}>
              {KIND_LABEL[report.kind]} {report.ok ? report.count : '失败'}
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div className={css.cardBody}>
          {reports.length === 0 && <div className={css.fieldHint}>暂无来源报告。</div>}
          {reports.map(report => (
            <div key={report.kind} className={report.ok ? css.inlineLine : css.cardWarn}>
              [{KIND_LABEL[report.kind]}] {report.origin} - {report.ok ? `ok · ${report.count} 条` : `不可用：${report.error ?? ''}`}
            </div>
          ))}
          {failed.length > 0 && (
            <div className={css.cardWarn}>来源失败不会被隐藏；hub 失败时已回落 vendored 快照。</div>
          )}
          <div className={css.fieldGroup}>
            <div className={css.fieldLabel}>localSources（每行一个目录；local 优先于 hub/github）</div>
            <textarea className={css.configTextarea} rows={3} value={localText} onChange={event => setLocalText(event.target.value)} />
            <div className={css.fieldHint}>一层深扫描，目录内 package.json 需声明 dsh.bundle.patch。</div>
          </div>
          <div className={css.fieldGroup}>
            <div className={css.fieldLabel}>hubOrigins（每行一个 https registry URL）</div>
            <textarea className={css.configTextarea} rows={3} value={originsText} onChange={event => setOriginsText(event.target.value)} />
            <div className={css.fieldHint}>由 mygo-loader-hub 拉取/验签；全部失败时回落内置快照。</div>
          </div>
          <div className={css.fieldGroup}>
            <div className={css.fieldLabel}>marketUrl（默认插件市场端点）</div>
            <input className={css.input} value={marketUrl} onChange={event => setMarketUrl(event.target.value)} placeholder="https://api.dshfind.com/v1/plugins" />
          </div>
          <div className={css.row}>
            <div className={css.fieldGroup}>
              <div className={css.fieldLabel}>marketMaxPages</div>
              <input className={css.input} type="number" min={1} max={100} value={marketMaxPages} onChange={event => setMarketMaxPages(Number(event.target.value))} />
            </div>
            <div className={css.fieldGroup}>
              <div className={css.fieldLabel}>githubUpstream</div>
              <input className={css.input} value={githubUpstream} onChange={event => setGithubUpstream(event.target.value)} placeholder="留空关闭账号枚举" />
            </div>
          </div>
          <div className={css.row}>
            <div className={css.fieldGroup}>
              <div className={css.fieldLabel}>maxRepos</div>
              <input className={css.input} type="number" min={1} max={100} value={maxRepos} onChange={event => setMaxRepos(Number(event.target.value))} />
            </div>
            <div className={css.fieldGroup}>
              <div className={css.fieldLabel}>timeoutMs</div>
              <input className={css.input} type="number" min={1000} max={120000} value={timeoutMs} onChange={event => setTimeoutMs(Number(event.target.value))} />
            </div>
            <div className={css.fieldGroup}>
              <div className={css.fieldLabel}>cacheTtlMs</div>
              <input className={css.input} type="number" min={0} max={3600000} value={cacheTtlMs} onChange={event => setCacheTtlMs(Number(event.target.value))} />
            </div>
          </div>
          <div className={css.rowInline}>
            <button className={css.btn} disabled={busy || config === null} onClick={save}>
              {busy ? '保存中…' : '保存来源配置'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
