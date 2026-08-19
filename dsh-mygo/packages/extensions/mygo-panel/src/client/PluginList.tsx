/**
 * 插件管理标签页（r7）：搜索 + 状态/轨道筛选 + 卡片列表 + 展开详情 +
 * 启用/停用/卸载确认弹窗。数据来自父级，操作结果经回调上报。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/PluginList
 */
import { useMemo, useState } from 'react'
import css from './Panel.module.css'
import { api, ApiError, COMPAT_EDGES, RAIL_LABEL, STATUS_LABEL, STATUS_TONE, type MygoPluginRow, type PlanShape } from './api'
import { ConfirmDialog } from './ConfirmDialog'

export interface PluginListProps {
  readonly plugins: readonly MygoPluginRow[]
  readonly loading: boolean
  /** 由操作失败 details.dependents 推导的高亮插件集。 */
  readonly highlighted?: ReadonlySet<string>
  readonly onRefresh: () => void
  readonly onError: (message: string, details?: Readonly<Record<string, unknown>>) => void
  readonly onNotice: (message: string) => void
  readonly onOpenConfig: (plugin: MygoPluginRow) => void
  readonly onAskHelper: (plugin: MygoPluginRow) => void
}

interface PendingState {
  readonly plugin: MygoPluginRow
  readonly action: 'enable' | 'disable' | 'uninstall'
  readonly plan?: PlanShape
}

const STATUS_FILTERS: readonly (string | undefined)[] = [undefined, 'enabled', 'disabled', 'quarantined', 'shadowed']
const STATUS_FILTER_LABEL: Record<string, string> = {
  enabled: '已启用',
  disabled: '已停用',
  quarantined: '隔离',
  shadowed: '遮蔽',
}
const RAIL_FILTERS: readonly (string | undefined)[] = [undefined, 'bridge', 'bundle', 'live']

export function PluginList(props: PluginListProps): JSX.Element {
  const { plugins, loading, highlighted, onRefresh, onError, onNotice, onOpenConfig, onAskHelper } = props
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [railFilter, setRailFilter] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<PendingState | undefined>()
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plugins.filter(plugin => {
      if (statusFilter !== undefined && plugin.status !== statusFilter) return false
      if (railFilter !== undefined && (plugin.rail ?? 'bridge') !== railFilter) return false
      if (query !== '') {
        const haystack = [plugin.id, plugin.version, plugin.origin, plugin.rail ?? ''].join(' ').toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [plugins, search, statusFilter, railFilter])

  const toggleExpanded = (id: string): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 启用/停用：先 plan 预览，accepted 直接执行，否则弹窗确认后 force。 */
  const act = async (plugin: MygoPluginRow, action: 'enable' | 'disable'): Promise<void> => {
    setBusy(true)
    try {
      const preview = await api.plan(action, plugin.id)
      const plan = preview.plan
      if (plan.accepted) {
        const result = action === 'enable'
          ? await api.enable(plugin.id)
          : await api.disable(plugin.id)
        onNotice(result.message)
        onRefresh()
        return
      }
      setPending({ plugin, action, plan })
    } catch (caught) {
      reportError(caught)
    } finally {
      setBusy(false)
    }
  }

  const requestUninstall = (plugin: MygoPluginRow): void => {
    setPending({ plugin, action: 'uninstall' })
  }

  const confirmPending = async (): Promise<void> => {
    if (pending === undefined) return
    const current = pending
    setPending(undefined)
    setBusy(true)
    try {
      if (current.action === 'uninstall') {
        const result = await api.uninstall(current.plugin.id, current.plugin.id === 'dsh-mygo')
        onNotice(result.message)
      } else if (current.action === 'disable') {
        const result = await api.disable(current.plugin.id, true)
        onNotice(result.message)
      } else {
        const result = await api.enable(current.plugin.id)
        onNotice(result.message)
      }
      onRefresh()
    } catch (caught) {
      reportError(caught)
    } finally {
      setBusy(false)
    }
  }

  const reportError = (caught: unknown): void => {
    if (caught instanceof ApiError) onError(caught.message, caught.details)
    else onError(caught instanceof Error ? caught.message : String(caught))
  }

  const pendingMessage = (): string | undefined => {
    if (pending === undefined) return undefined
    const { plugin, action, plan } = pending
    if (action === 'uninstall') {
      return `将删除安装目录与桥接行，且面板无法恢复该插件。确认卸载 ${plugin.id}？`
    }
    const rejected = plan !== undefined && !plan.accepted
    return rejected
      ? action === 'disable'
        ? `计划未自动通过停用 ${plugin.id}，确认后将以强制方式执行。`
        : `计划未自动通过启用 ${plugin.id}，确认后继续执行。`
      : undefined
  }

  const pendingTitle = (): string => {
    if (pending === undefined) return ''
    const { plugin, action } = pending
    if (action === 'uninstall') return `卸载 ${plugin.id}`
    return `${action === 'disable' ? '停用' : '启用'} ${plugin.id}`
  }

  const renderCompatibility = (plugin: MygoPluginRow): JSX.Element => {
    const compat = plugin.compatibility
    const edges = COMPAT_EDGES.filter(entry => {
      const map = compat?.[entry.key]
      return map !== undefined && Object.keys(map).length > 0
    })
    if (compat === undefined || edges.length === 0) {
      return <div className={css.compatNone}>无兼容性声明</div>
    }
    return (
      <div className={css.compatList}>
        {edges.map(entry => {
          const map = compat[entry.key] as Readonly<Record<string, string>> | undefined
          if (map === undefined) return null
          return Object.entries(map).map(([target, range]) => (
            <div key={entry.key + ':' + target} className={entry.hard ? css.compatLine + ' ' + css.compatHard : css.compatLine}>
              <span className={css.compatKind}>{entry.label}</span>
              <span className={css.compatTarget}>{target}</span>
              <span className={css.compatRange}>{range}</span>
            </div>
          ))
        })}
      </div>
    )
  }

  const toneClass = (status: string): string => {
    switch (STATUS_TONE[status] ?? 'dim') {
      case 'ok': return css.badgeOk
      case 'warn': return css.badgeWarn
      case 'danger': return css.badgeDanger
      default: return css.badgeOff
    }
  }

  return (
    <div className={css.toolbar}>
      <div className={css.searchRow}>
        <input
          className={css.searchInput}
          placeholder="搜索插件 id / 版本 / 来源…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className={css.filters}>
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter ?? 'all-status'}
            className={statusFilter === filter ? css.chip + ' ' + css.chipActive : css.chip}
            onClick={() => setStatusFilter(filter)}
          >
            {filter === undefined ? '全部状态' : STATUS_FILTER_LABEL[filter]}
          </button>
        ))}
        <span className={css.chipSep} />
        {RAIL_FILTERS.map(filter => (
          <button
            key={filter ?? 'all-rail'}
            className={railFilter === filter ? css.chip + ' ' + css.chipActive : css.chip}
            onClick={() => setRailFilter(filter)}
          >
            {filter === undefined ? '全部轨道' : RAIL_LABEL[filter] ?? filter}
          </button>
        ))}
      </div>
      {loading && (
        <div className={css.list}>
          {[0, 1, 2].map(index => <div key={index} className={css.skeletonRow} />)}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className={css.listEmpty}>
          <div className={css.emptyTitle}>{plugins.length === 0 ? '暂无受管插件' : '没有符合条件的插件'}</div>
          <div className={css.emptyText}>
            {plugins.length === 0
              ? '去「安装」页从 GitHub / 文件夹 / 压缩包 / bundle 安装第一个插件。'
              : '调整搜索词或筛选条件后再试。'}
          </div>
        </div>
      )}
      <div className={css.list}>
        {!loading && filtered.map(plugin => {
          const isBlocked = highlighted !== undefined && highlighted.has(plugin.id)
          const isExpanded = expanded.has(plugin.id)
          const rail = plugin.rail ?? 'bridge'
          return (
            <div key={plugin.id} className={isBlocked ? css.card + ' ' + css.cardBlocked : css.card}>
              <div className={css.cardBody}>
                <div className={css.cardMain}>
                  <div className={css.cardTitleRow}>
                    <div className={css.cardTitle}>{plugin.id}</div>
                    <div className={css.cardBadges}>
                      <span className={css.badge + ' ' + toneClass(plugin.status)}>
                        <span className={css.badgeDot} />
                        {STATUS_LABEL[plugin.status] ?? plugin.status}
                      </span>
                      <span className={css.railChip}>{rail}</span>
                    </div>
                  </div>
                  <div className={css.cardMeta}>
                    <span className={css.metaChip}>v{plugin.version}</span>
                    <span className={css.metaChip}>·</span>
                    <span className={css.metaChip}>{plugin.origin}</span>
                    <span className={css.metaChip}>·</span>
                    <span className={css.metaChip}>gen {plugin.generation}</span>
                  </div>
                  {plugin.policyStatus !== undefined && plugin.policyStatus !== 'active' && (
                    <div className={css.policyLine}>
                      政策状态：{plugin.policyStatus}
                      {plugin.reason !== undefined && plugin.reason !== '' ? `（${plugin.reason}）` : ''}
                    </div>
                  )}
                  {plugin.hostConflicts !== undefined && plugin.hostConflicts.length > 0 && (
                    <div className={css.cardWarn}>
                      宿主行改写：{plugin.hostConflicts.join('；')}（停用/卸载会还原）
                    </div>
                  )}
                </div>
                <div className={css.cardActions}>
                  <button
                    className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                    disabled={busy}
                    onClick={() => void act(plugin, plugin.status === 'enabled' ? 'disable' : 'enable')}
                  >
                    {plugin.status === 'enabled' ? '停用' : '启用'}
                  </button>
                  {rail === 'bridge' && (
                    <button
                      className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                      disabled={busy}
                      onClick={() => onOpenConfig(plugin)}
                    >
                      配置
                    </button>
                  )}
                  {rail === 'bridge' && (
                    <button
                      className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
                      onClick={() => onAskHelper(plugin)}
                    >
                      助手
                    </button>
                  )}
                  {plugin.id !== 'dsh-mygo-ext-panel' && (
                    <button
                      className={css.btn + ' ' + css.btnDanger + ' ' + css.btnSm}
                      disabled={busy}
                      onClick={() => requestUninstall(plugin)}
                    >
                      卸载
                    </button>
                  )}
                  <button className={css.expandBtn} onClick={() => toggleExpanded(plugin.id)}>
                    {isExpanded ? '收起详情' : '详情'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className={css.details}>
                  <div className={css.detailsSection}>
                    <div className={css.detailsTitle}>入口点 entrypoints</div>
                    {plugin.entrypoints !== undefined && plugin.entrypoints.length > 0
                      ? (
                        <div className={css.detailsGrid}>
                          {plugin.entrypoints.map(entry => (
                            <div key={entry} className={css.detailItem}>
                              <span className={css.detailValue}>{entry}</span>
                            </div>
                          ))}
                        </div>
                      )
                      : <div className={css.compatNone}>无声明（默认入口）</div>}
                  </div>
                  <div className={css.detailsSection}>
                    <div className={css.detailsTitle}>兼容性 compatibility</div>
                    {renderCompatibility(plugin)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={pending !== undefined}
        title={pendingTitle()}
        message={pendingMessage()}
        plan={pending?.action === 'uninstall' ? undefined : pending?.plan}
        danger={pending?.action === 'uninstall'}
        busy={busy}
        confirmLabel={pending?.action === 'uninstall' ? '确认卸载' : '确认执行'}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(undefined)}
        extra={pending?.action === 'uninstall' && pending?.plugin.id === 'dsh-mygo'
          ? (
            <div className={css.modalWarn}>
              卸载 dsh-mygo 核心会中断整个管理面，且面板无法恢复它。确认继续？
            </div>
          )
          : undefined}
      />
    </div>
  )
}
