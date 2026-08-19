/**
 * Hub 目录标签页（P0 迁移自 omdsh-plughub 的 Available catalog 体验）：
 * 搜索 + kind/风险筛选 + 条目卡片 + 安装/更新动作。条目来自 bound
 * mygo-loader-hub registry，风险与维护状态来自 hub 治理元数据。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/HubCatalog
 */
import { useEffect, useMemo, useState } from 'react'
import css from './Panel.module.css'
import type { HubCatalogEntry, HubCatalogResult, HubSourceConfig, HubSourceReport } from './api'
import { CatalogSourcesPanel } from './CatalogSourcesPanel'

/** P2 operation 事件帧（与 node 半 live-events.ts 同形）。 */
interface PanelOperation {
  readonly id: number
  readonly kind: 'install' | 'update' | 'uninstall' | 'enable' | 'disable' | 'config'
  readonly name: string
  readonly status: 'running' | 'ok' | 'failed'
  readonly error?: string
  readonly log: readonly string[]
}

type PanelEvent =
  | { readonly type: 'operation'; readonly operation: PanelOperation; readonly restartRequired: boolean }
  | { readonly type: 'snapshot'; readonly operations: readonly PanelOperation[]; readonly restartRequired: boolean }

export interface HubCatalogProps {
  readonly catalog: HubCatalogResult | null
  readonly loading: boolean
  readonly busy: boolean
  readonly sourcesBusy: boolean
  readonly reports: readonly HubSourceReport[]
  readonly sourceConfig: HubSourceConfig | null
  readonly onRefresh: () => void
  readonly onSaveSources: (patch: Partial<HubSourceConfig>) => void
  readonly onInstall: (id: string) => void
  readonly onUpdate: (id: string) => void
}

const RISK_LABEL: Record<HubCatalogEntry['risk']['level'], string> = {
  unknown: '风险未知',
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险',
}

function riskClass(level: HubCatalogEntry['risk']['level']): string {
  switch (level) {
    case 'low': return css.badgeOk
    case 'medium': return css.badgeWarn
    case 'high':
    case 'critical': return css.badgeDanger
    default: return css.badgeOff
  }
}

export function HubCatalog(props: HubCatalogProps): JSX.Element {
  const { catalog, loading, busy, sourcesBusy, reports, sourceConfig, onRefresh, onSaveSources, onInstall, onUpdate } = props
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<string | undefined>(undefined)
  const [risk, setRisk] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [operations, setOperations] = useState<readonly PanelOperation[]>([])
  const [restartRequired, setRestartRequired] = useState(false)

  useEffect(() => {
    const source = new EventSource('/api/mygo/events')
    const apply = (event: PanelEvent): void => {
      if (event.type === 'snapshot') {
        setOperations(event.operations)
        setRestartRequired(event.restartRequired)
      } else if (event.type === 'operation') {
        setOperations(current => {
          const next = current.filter(entry => entry.id !== event.operation.id)
          next.push(event.operation)
          return next.slice(-30)
        })
        setRestartRequired(event.restartRequired)
      }
    }
    source.addEventListener('message', (message: MessageEvent<string>) => {
      try {
        apply(JSON.parse(message.data) as PanelEvent)
      } catch {
        // 忽略非 JSON 注释帧/坏帧；下一帧继续
      }
    })
    return () => { source.close() }
  }, [])

  const operationFor = (id: string): PanelOperation | undefined =>
    [...operations].reverse().find(entry => entry.name === id)

  const kinds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of catalog?.entries ?? []) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  }, [catalog])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (catalog?.entries ?? []).filter(entry => {
      if (kind !== undefined && entry.kind !== kind) return false
      if (risk !== undefined && entry.risk.level !== risk) return false
      if (needle !== '') {
        const haystack = [
          entry.id,
          entry.displayName,
          entry.description,
          entry.kind,
          entry.author.name,
          ...entry.tags,
        ].join(' ').toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [catalog, search, kind, risk])

  // hub registry 快照条目较多（150+），首屏只画前 80 条；继续筛选缩小集合。
  const visible = useMemo(() => filtered.slice(0, 80), [filtered])

  const toggle = (id: string): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={css.toolbar}>
      {restartRequired && (
        <div className={css.banner + ' ' + css.bannerNotice}>
          <div className={css.bannerRow}>
            <div className={css.bannerText}>
              <div className={css.bannerTitle}>重启后生效</div>
              <div>目录安装/更新/卸载已落到 profile 层；插件层在启动时组合，请重启 dsh 加载变更。</div>
            </div>
          </div>
        </div>
      )}
      <CatalogSourcesPanel
        reports={reports}
        config={sourceConfig}
        busy={sourcesBusy}
        onSave={onSaveSources}
      />
      <div className={css.searchRow}>
        <input
          className={css.searchInput}
          placeholder="搜索名称 / id / 描述 / 标签…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} disabled={loading} onClick={onRefresh}>
          刷新目录
        </button>
      </div>
      <div className={css.filters}>
        <button className={kind === undefined ? css.chip + ' ' + css.chipActive : css.chip} onClick={() => setKind(undefined)}>
          全部类型
        </button>
        {kinds.map(([entryKind]) => (
          <button key={entryKind} className={kind === entryKind ? css.chip + ' ' + css.chipActive : css.chip} onClick={() => setKind(entryKind)}>
            {entryKind}
          </button>
        ))}
        <span className={css.chipSep} />
        <button className={risk === undefined ? css.chip + ' ' + css.chipActive : css.chip} onClick={() => setRisk(undefined)}>
          全部风险
        </button>
        {(['low', 'medium', 'high', 'critical', 'unknown'] as const).map(level => (
          <button key={level} className={risk === level ? css.chip + ' ' + css.chipActive : css.chip} onClick={() => setRisk(level)}>
            {RISK_LABEL[level]}
          </button>
        ))}
      </div>
      {catalog === null && !loading && (
        <div className={css.listEmpty}>
          <div className={css.emptyTitle}>Hub 目录不可用</div>
          <div className={css.emptyText}>
            未注册 hub loader adapter。请确认 profile 已安装 dsh-mygo-loader-hub 并启用。
          </div>
        </div>
      )}
      {catalog !== null && !catalog.available && (
        <div className={css.listEmpty}>
          <div className={css.emptyTitle}>Hub 目录不可用</div>
          <div className={css.emptyText}>当前 profile 没有 bound hub registry 来源。</div>
        </div>
      )}
      {loading && (
        <div className={css.list}>
          {[0, 1, 2].map(index => <div key={index} className={css.skeletonRow} />)}
        </div>
      )}
      {!loading && catalog?.available === true && filtered.length === 0 && (
        <div className={css.listEmpty}>
          <div className={css.emptyTitle}>没有匹配的 hub 条目</div>
          <div className={css.emptyText}>调整搜索词或筛选条件后再试。</div>
        </div>
      )}
      {!loading && catalog?.available === true && filtered.length > visible.length && (
        <div className={css.fieldHint}>已显示前 {visible.length} 条，共 {filtered.length} 条；请搜索或筛选以缩小范围。</div>
      )}
      <div className={css.list}>
        {!loading && visible.map(entry => {
          const open = expanded.has(entry.id)
          const installed = entry.installed
          const installable = entry.assessment.installable && entry.listing.state !== 'blocked'
          const updatable = installed?.update === 'available'
          const operation = operationFor(entry.id)
          const running = operation?.status === 'running'
          const failed = operation?.status === 'failed'
          return (
            <div key={entry.id} className={css.card}>
              <div className={css.cardBody}>
                <div className={css.cardMain}>
                  <div className={css.cardTitleRow}>
                    <div className={css.cardTitle}>{entry.displayName || entry.id}</div>
                    <div className={css.cardBadges}>
                      <span className={css.badge + ' ' + riskClass(entry.risk.level)}>
                        <span className={css.badgeDot} />
                        {RISK_LABEL[entry.risk.level]}
                      </span>
                      <span className={css.railChip}>{entry.kind}</span>
                      {entry.source !== undefined && <span className={css.railChip}>{entry.source}</span>}
                      {entry.listing.state !== 'auto-listed' && entry.listing.state !== 'reviewed' && (
                        <span className={css.badge + ' ' + css.badgeWarn}>
                          <span className={css.badgeDot} />
                          {entry.listing.state}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={css.cardMeta}>
                    <code className={css.metaChip}>{entry.id}</code>
                    <span className={css.metaChip}>·</span>
                    <span className={css.metaChip}>
                      {entry.version === null
                        ? '版本未声明'
                        : installed?.update === 'available' && installed.version !== undefined
                          ? `${installed.version} -> ${entry.version}`
                          : `v${entry.version}`}
                    </span>
                    <span className={css.metaChip}>·</span>
                    <span className={css.metaChip}>{entry.author.name}</span>
                  </div>
                  {entry.description !== '' && <div className={css.inlineText}>{entry.description}</div>}
                  {entry.maintenance.state !== 'active' && (
                    <div className={css.cardWarn}>
                      维护状态：{entry.maintenance.state}
                      {entry.maintenance.notice === null || entry.maintenance.notice === undefined
                        ? ''
                        : `（${entry.maintenance.notice}）`}
                    </div>
                  )}
                  {entry.assessment.advisories.length > 0 && (
                    <div className={css.cardWarn}>提示：{entry.assessment.advisories.join('；')}</div>
                  )}
                  {failed && (
                    <div className={css.cardWarn} role="alert">
                      操作失败：{operation?.error ?? '未知错误'}
                    </div>
                  )}
                </div>
                <div className={css.cardActions}>
                  {installed === undefined ? (
                    <button
                      className={css.btn + ' ' + css.btnSm}
                      disabled={busy || running || !installable}
                      onClick={() => onInstall(entry.id)}
                    >
                      {running ? '处理中…' : busy ? '处理中…' : '安装'}
                    </button>
                  ) : (
                    <>
                      <button
                        className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                        disabled={busy || running || !updatable}
                        onClick={() => onUpdate(entry.id)}
                      >
                        {running ? '处理中…' : updatable ? '更新' : installed.update === 'current' ? '已是最新' : '版本未知'}
                      </button>
                      <span className={css.metaChip}>{installed.rail}</span>
                    </>
                  )}
                  <button className={css.expandBtn} onClick={() => toggle(entry.id)}>
                    {open ? '收起详情' : '详情'}
                  </button>
                </div>
              </div>
              {open && (
                <div className={css.details}>
                  <div className={css.detailsSection}>
                    <div className={css.detailsTitle}>来源与发布</div>
                    <div className={css.detailsGrid}>
                      <div className={css.detailItem}><span className={css.detailKey}>latestRelease</span><span className={css.detailValue}>{entry.latestRelease}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>license</span><span className={css.detailValue}>{entry.license}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>listing</span><span className={css.detailValue}>{entry.listing.state}{entry.listing.catalogStatus === undefined ? '' : ` · ${entry.listing.catalogStatus}`}</span></div>
                      {entry.links?.repository !== undefined && (
                        <div className={css.detailItem}><span className={css.detailKey}>repository</span><a className={css.inlineText} href={entry.links.repository} target="_blank" rel="noreferrer noopener">{entry.links.repository}</a></div>
                      )}
                    </div>
                  </div>
                  <div className={css.detailsSection}>
                    <div className={css.detailsTitle}>治理事实</div>
                    <div className={css.detailsGrid}>
                      <div className={css.detailItem}><span className={css.detailKey}>vulnerabilityScan</span><span className={css.detailValue}>{entry.risk.facts.vulnerabilityScan ?? 'unknown'}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>permissions</span><span className={css.detailValue}>{entry.risk.facts.permissions ?? 'unknown'}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>nativeCode</span><span className={css.detailValue}>{entry.risk.facts.nativeCode ?? 'unknown'}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>installScripts</span><span className={css.detailValue}>{entry.risk.facts.installScripts ?? 'unknown'}</span></div>
                      <div className={css.detailItem}><span className={css.detailKey}>tags</span><span className={css.detailValue}>{entry.tags.join('、') || '无'}</span></div>
                    </div>
                  </div>
                  {entry.assessment.blocks.length > 0 && (
                    <div className={css.detailsSection}>
                      <div className={css.detailsTitle}>不可安装原因</div>
                      <div className={css.cardWarn}>{entry.assessment.blocks.join('；')}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
