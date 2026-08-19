/**
 * mygo 面板主壳（r7 重做）：头部概览（mygo 版本 / 状态统计 / BOM）+ 标签页
 * 导航（插件 / 安装 / 更新 / 助手 / 源与凭据）+ 全局通知条 + 配置抽屉 +
 * 助手会话轮询。数据全部经 /api/mygo/* JSON API。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/Panel
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import css from './Panel.module.css'
import {
  api, ApiError, STATUS_LABEL, formatTime,
  type HubCatalogResult, type HubSourceConfig, type MygoPluginRow, type RemoteUpdateRow, type StatusResult,
} from './api'
import type { ConfigFieldShape } from './ConfigFields'
import { PluginList } from './PluginList'
import { InstallPanel } from './InstallPanel'
import { UpdatesPanel } from './UpdatesPanel'
import { ConfigHelper, type HelperPanelState } from './ConfigHelper'
import { ConfigEditor, type ConfigDrawerState } from './ConfigEditor'
import { ConfigTransfer } from './ConfigTransfer'
import { RegistriesPanel } from './RegistriesPanel'
import { HubCatalog } from './HubCatalog'

export type { ConfigFieldShape } from './ConfigFields'
export type { MygoPluginRow, RemoteUpdateRow } from './api'

type TabId = 'plugins' | 'install' | 'hub' | 'updates' | 'helper' | 'registries'

interface NoticeState {
  readonly kind: 'error' | 'notice'
  readonly title?: string
  readonly text: string
  readonly details?: Readonly<Record<string, unknown>>
}

const TAB_LABEL: Record<TabId, string> = {
  plugins: '插件',
  install: '安装',
  hub: '目录',
  updates: '更新',
  helper: '助手',
  registries: '源与凭据',
}

export function Panel(): JSX.Element {
  const [status, setStatus] = useState<StatusResult | undefined>()
  const [plugins, setPlugins] = useState<readonly MygoPluginRow[] | null>(null)
  const [updates, setUpdates] = useState<readonly RemoteUpdateRow[] | null>(null)
  const [updatesBusy, setUpdatesBusy] = useState(false)
  const [tab, setTab] = useState<TabId>('plugins')
  const [notice, setNotice] = useState<NoticeState | undefined>()
  const [configDrawer, setConfigDrawer] = useState<ConfigDrawerState | undefined>()
  const [configBusy, setConfigBusy] = useState(false)
  const [configError, setConfigError] = useState<string | undefined>()
  const [configNotice, setConfigNotice] = useState<string | undefined>()
  const [helper, setHelper] = useState<HelperPanelState | undefined>()
  const [helperBusy, setHelperBusy] = useState(false)
  const [helperContext, setHelperContext] = useState<string | undefined>()
  const [hubCatalog, setHubCatalog] = useState<HubCatalogResult | null>(null)
  const [hubBusy, setHubBusy] = useState(false)
  const [hubFailed, setHubFailed] = useState(false)
  const [hubSources, setHubSources] = useState<HubSourceConfig | null>(null)
  const [hubSourcesBusy, setHubSourcesBusy] = useState(false)
  const helperTimer = useRef<ReturnType<typeof setInterval> | undefined>()
  useEffect(() => () => { if (helperTimer.current !== undefined) clearInterval(helperTimer.current) }, [])

  const refresh = useCallback(async (): Promise<void> => {
    // /plugins 与 /status 分开容错：任一失败不影响另一个的呈现；
    // 通知条由操作方显式设置/清除，刷新不主动清空。
    try {
      const result = await api.plugins()
      setPlugins(result.plugins)
    } catch (caught) {
      setNotice({
        kind: 'error',
        title: '加载失败',
        text: caught instanceof Error ? caught.message : String(caught),
      })
    }
    try {
      setStatus(await api.status())
    } catch {
      // status 为增强端点：失败仅降级头部统计，不阻断列表
    }
  }, [])

  const checkUpdates = useCallback(async (): Promise<void> => {
    setUpdatesBusy(true)
    try {
      const result = await api.updates()
      setUpdates(result.updates)
      setNotice({ kind: 'notice', text: '更新检查完成' })
    } catch (caught) {
      setNotice({
        kind: 'error',
        title: '更新检查失败',
        text: caught instanceof Error ? caught.message : String(caught),
      })
    } finally {
      setUpdatesBusy(false)
    }
  }, [])

  const loadHubCatalog = useCallback(async (refresh = false): Promise<void> => {
    setHubBusy(true)
    setHubFailed(false)
    try {
      setHubCatalog(await api.hubCatalog(refresh))
    } catch (caught) {
      setHubFailed(true)
      setNotice({
        kind: 'error',
        title: 'Hub 目录加载失败',
        text: caught instanceof Error ? caught.message : String(caught),
      })
    } finally {
      setHubBusy(false)
    }
  }, [])

  const loadHubSources = useCallback(async (): Promise<void> => {
    setHubSourcesBusy(true)
    try {
      const result = await api.hubSources()
      setHubSources(result.config)
    } catch (caught) {
      setNotice({
        kind: 'error',
        title: '目录源配置加载失败',
        text: caught instanceof Error ? caught.message : String(caught),
      })
    } finally {
      setHubSourcesBusy(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'hub') return
    if (hubCatalog === null) void loadHubCatalog()
    if (hubSources === null) void loadHubSources()
  }, [tab, hubCatalog, hubSources, loadHubCatalog, loadHubSources])

  useEffect(() => { void refresh() }, [refresh])

  const reportError = useCallback((message: string, details?: Readonly<Record<string, unknown>>): void => {
    setNotice({ kind: 'error', title: '操作失败', text: message, ...(details === undefined ? {} : { details }) })
  }, [])

  const saveHubSources = useCallback(async (patch: Partial<HubSourceConfig>): Promise<void> => {
    setHubSourcesBusy(true)
    try {
      const result = await api.saveHubSources(patch)
      setHubSources(result.config)
      setNotice({ kind: 'notice', text: result.message })
      await loadHubCatalog(true)
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setHubSourcesBusy(false)
    }
  }, [loadHubCatalog, reportError])

  const reportNotice = useCallback((message: string): void => {
    setNotice({ kind: 'notice', text: message })
  }, [])

  const runHubAction = useCallback(async (id: string, action: 'install' | 'update'): Promise<void> => {
    setHubBusy(true)
    try {
      const result = action === 'install' ? await api.hubInstall(id) : await api.hubUpdate(id)
      const advisories = result.advisories ?? []
      setNotice({
        kind: 'notice',
        text: result.message + (advisories.length === 0 ? '' : ' 提示：' + advisories.join('；')),
      })
      await loadHubCatalog()
      void refresh()
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setHubBusy(false)
    }
  }, [loadHubCatalog, refresh, reportError])

  const openConfig = useCallback(async (plugin: MygoPluginRow): Promise<void> => {
    setConfigError(undefined)
    setConfigNotice(undefined)
    try {
      const data = await api.pluginConfig(plugin.id)
      setConfigDrawer({
        id: plugin.id,
        current: data.current ?? {},
        revision: data.revision,
        ...(data.schema === undefined || data.schema.description === undefined
          ? {}
          : { description: data.schema.description }),
        fields: data.schema?.fields ?? [],
        ...(data.template === undefined ? {} : { template: data.template }),
      })
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [reportError])

  const saveConfig = useCallback(async (config: Record<string, unknown>): Promise<void> => {
    const drawer = configDrawer
    if (drawer === undefined) return
    setConfigBusy(true)
    setConfigError(undefined)
    setConfigNotice(undefined)
    try {
      const result = await api.saveConfig(drawer.id, config, drawer.revision)
      setConfigNotice(result.message)
      setConfigDrawer({ ...drawer, current: config })
      void refresh()
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setConfigError(caught.message)
        try {
          const fresh = await api.pluginConfig(drawer.id)
          setConfigDrawer({
            id: drawer.id,
            current: fresh.current ?? {},
            revision: fresh.revision,
            ...(fresh.schema === undefined || fresh.schema.description === undefined
              ? {}
              : { description: fresh.schema.description }),
            fields: fresh.schema?.fields ?? [],
            ...(fresh.template === undefined ? {} : { template: fresh.template }),
          })
        } catch {
          // 冲突后重读失败：保留原抽屉与错误文案
        }
      } else {
        setConfigError(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      setConfigBusy(false)
    }
  }, [configDrawer, refresh])

  // ---------------- 配置助手 ----------------

  const pollHelper = useCallback(async (): Promise<void> => {
    try {
      const state = await api.helperStatus()
      if (state.status === 'running') {
        setHelper(current => current === undefined
          ? { status: 'running', messages: state.messages ?? [] }
          : {
              ...current,
              status: 'running',
              ...(typeof state.startedAt === 'number' ? { startedAt: state.startedAt } : {}),
              messages: state.messages ?? current.messages,
            })
      } else if (state.status === 'done') {
        if (helperTimer.current !== undefined) clearInterval(helperTimer.current)
        setHelperBusy(false)
        setHelper({
          status: 'done',
          ...(typeof state.startedAt === 'number' ? { startedAt: state.startedAt } : {}),
          ...(typeof state.runId === 'string' ? { runId: state.runId } : {}),
          messages: state.messages ?? [],
        })
      } else if (state.status === 'error' || state.status === 'stopped') {
        if (helperTimer.current !== undefined) clearInterval(helperTimer.current)
        setHelperBusy(false)
        setHelper({
          status: state.status,
          messages: state.messages ?? [],
          ...(state.error === undefined ? {} : { error: state.error }),
        })
      }
    } catch (caught) {
      if (helperTimer.current !== undefined) clearInterval(helperTimer.current)
      setHelperBusy(false)
      setHelper(current => current === undefined
        ? undefined
        : {
            ...current,
            status: 'error',
            error: caught instanceof Error ? caught.message : String(caught),
          })
    }
  }, [])

  const startHelperPolling = useCallback((): void => {
    if (helperTimer.current !== undefined) clearInterval(helperTimer.current)
    helperTimer.current = setInterval(() => { void pollHelper() }, 2000)
  }, [pollHelper])

  const sendHelperMessage = useCallback((text: string): void => {
    const content = text.trim()
    if (content === '') return
    setHelperBusy(true)
    setHelper(current => ({
      status: 'running',
      ...(current?.startedAt === undefined ? {} : { startedAt: current.startedAt }),
      messages: [...(current?.messages ?? []), { role: 'user' as const, content }],
      error: undefined,
    }))
    void api.helperChat(content)
      .then(() => startHelperPolling())
      .catch((caught: unknown) => {
        setHelperBusy(false)
        setHelper(current => current === undefined
          ? undefined
          : {
              ...current,
              status: 'error',
              error: caught instanceof Error ? caught.message : String(caught),
            })
      })
  }, [startHelperPolling])

  const stopHelper = useCallback((): void => {
    const current = helper
    if (current === undefined) return
    if (helperTimer.current !== undefined) {
      clearInterval(helperTimer.current)
      helperTimer.current = undefined
    }
    setHelperBusy(true)
    void api.helperStop()
      .then(() => {
        setHelperBusy(false)
        setHelper(undefined)
        setHelperContext(undefined)
        setNotice({ kind: 'notice', text: '配置助手已关闭，记录已清空' })
      })
      .catch((caught: unknown) => {
        setHelperBusy(false)
        setHelper({
          messages: current.messages,
          status: 'error',
          error: caught instanceof Error ? caught.message : String(caught),
        })
      })
  }, [helper])

  const askHelper = useCallback((plugin: MygoPluginRow): void => {
    setHelperContext(plugin.id)
    setTab('helper')
    // 进入助手页后先同步一次服务端会话状态（恢复进行中的轮询）
    void api.helperStatus().then(state => {
      if (state.status === 'running') startHelperPolling()
    }).catch(() => { /* 服务端不可达：保持现状 */ })
  }, [startHelperPolling])

  // 助手页打开时恢复服务端会话（刷新/重进后）
  useEffect(() => {
    if (tab !== 'helper') return
    void (async () => {
      try {
        const state = await api.helperStatus()
        if (state.status === 'running') {
          setHelper(current => current === undefined
            ? { status: 'running', messages: state.messages ?? [] }
            : {
                ...current,
                status: 'running',
                ...(typeof state.startedAt === 'number' ? { startedAt: state.startedAt } : {}),
                messages: state.messages ?? current.messages,
              })
          startHelperPolling()
        } else if ((state.messages ?? []).length > 0) {
          setHelper(current => current === undefined || current.messages.length === 0
            ? { status: state.status as HelperPanelState['status'], messages: state.messages ?? [] }
            : current)
        }
      } catch {
        // server unreachable; keep the panel idle
      }
    })()
  }, [tab, startHelperPolling])

  const bomExport = useCallback((): void => {
    void api.bomExport()
      .then(result => {
        setNotice({ kind: 'notice', text: result.message ?? 'BOM 已导出' })
      })
      .catch((caught: unknown) => {
        reportError(caught instanceof Error ? caught.message : String(caught))
      })
  }, [reportError])

  // ---------------- 渲染 ----------------

  const updatesAvailable = (updates ?? []).filter(row => row.upToDate !== true && row.error === undefined).length
  const highlighted = new Set<string>(
    Array.isArray(notice?.details?.dependents)
      ? (notice.details.dependents as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [],
  )
  const counts = status?.plugins
  const hasBom = status?.bom.exists === true

  return (
    <div className={css.panel}>
      <div className={css.header}>
        <div className={css.headerRow}>
          <div className={css.headerTitle}>
            My 插件
            {status !== undefined && (
              <span className={css.railChip}>mygo {status.mygo.version}</span>
            )}
            {status?.mygo.selfCommit !== undefined && (
              <span className={css.headerSub} title={status.mygo.url}>
                {status.mygo.selfCommit.slice(0, 8)}
                {status.mygo.ref !== undefined && status.mygo.ref !== 'HEAD' ? ' @ ' + status.mygo.ref : ''}
              </span>
            )}
          </div>
          <div className={css.headerRight}>
            <div className={css.statChips}>
              {counts !== undefined && (
                <>
                  <span className={css.statChip + ' ' + css.statChipOk}>
                    <span className={css.statChipValue}>{counts.enabled}</span> 启用
                  </span>
                  <span className={css.statChip}>
                    <span className={css.statChipValue}>{counts.disabled}</span> 停用
                  </span>
                  {counts.quarantined > 0 && (
                    <span className={css.statChip + ' ' + css.statChipDanger}>
                      <span className={css.statChipValue}>{counts.quarantined}</span> 隔离
                    </span>
                  )}
                  {counts.shadowed > 0 && (
                    <span className={css.statChip + ' ' + css.statChipWarn}>
                      <span className={css.statChipValue}>{counts.shadowed}</span> 遮蔽
                    </span>
                  )}
                  <span className={css.statChip}>
                    <span className={css.statChipValue}>{counts.bridge}</span> bridge
                    <span className={css.statChipValue}> / {counts.bundle}</span> bundle
                  </span>
                  {status !== undefined && (
                    <span className={css.statChip} title={hasBom ? formatTime(status.bom.generatedAt) : undefined}>
                      {hasBom
                        ? 'BOM ' + (status.bom.members ?? 0) + ' 项'
                        : 'BOM 未导出'}
                    </span>
                  )}
                </>
              )}
              {updatesAvailable > 0 && (
                <span className={css.statChip + ' ' + css.statChipWarn}>
                  <span className={css.statChipValue}>{updatesAvailable}</span> 可更新
                </span>
              )}
            </div>
            <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={() => void refresh()}>
              刷新
            </button>
            <button
              className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm}
              disabled={updatesBusy}
              onClick={() => void checkUpdates()}
            >
              {updatesBusy ? '检查中…' : '检查更新'}
            </button>
            <button className={css.btn + ' ' + css.btnGhost + ' ' + css.btnSm} onClick={bomExport}>
              导出 BOM
            </button>
            <ConfigTransfer onNotice={reportNotice} onError={reportError} />
          </div>
        </div>
      </div>
      {notice !== undefined && (
        <div className={notice.kind === 'error' ? css.banner + ' ' + css.bannerError : css.banner + ' ' + css.bannerNotice}>
          <div className={css.bannerRow}>
            <div className={css.bannerText}>
              {notice.title !== undefined && <div className={css.bannerTitle}>{notice.title}</div>}
              <div>{notice.text}</div>
              {highlighted.size > 0 && (
                <div>涉及插件：{[...highlighted].sort().join('、')}（已在列表中高亮）</div>
              )}
            </div>
            <button className={css.bannerClose} onClick={() => setNotice(undefined)}>×</button>
          </div>
        </div>
      )}
      <div className={css.tabs}>
        {(Object.keys(TAB_LABEL) as TabId[]).map(entry => (
          <button
            key={entry}
            className={tab === entry ? css.tab + ' ' + css.tabActive : css.tab}
            onClick={() => setTab(entry)}
          >
            {TAB_LABEL[entry]}
            {entry === 'updates' && updatesAvailable > 0 && (
              <span className={css.tabBadge}>{updatesAvailable}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'plugins' && (
        <PluginList
          plugins={plugins ?? []}
          loading={plugins === null}
          highlighted={highlighted}
          onRefresh={() => void refresh()}
          onError={reportError}
          onNotice={reportNotice}
          onOpenConfig={(plugin) => void openConfig(plugin)}
          onAskHelper={askHelper}
        />
      )}
      {tab === 'install' && (
        <InstallPanel
          onRefresh={() => void refresh()}
          onError={reportError}
          onNotice={reportNotice}
        />
      )}
      {tab === 'hub' && (
        <HubCatalog
          catalog={hubCatalog}
          loading={hubCatalog === null && !hubFailed}
          busy={hubBusy}
          sourcesBusy={hubSourcesBusy}
          reports={hubCatalog?.reports ?? []}
          sourceConfig={hubSources}
          onRefresh={() => void loadHubCatalog(true)}
          onSaveSources={(patch) => void saveHubSources(patch)}
          onInstall={(id) => void runHubAction(id, 'install')}
          onUpdate={(id) => void runHubAction(id, 'update')}
        />
      )}
      {tab === 'updates' && (
        <UpdatesPanel
          updates={updates}
          busy={updatesBusy}
          onCheck={() => void checkUpdates()}
          onRefresh={() => void refresh()}
          onError={reportError}
          onNotice={reportNotice}
        />
      )}
      {tab === 'helper' && (
        <ConfigHelper
          helper={helper}
          busy={helperBusy}
          contextId={helperContext}
          onSend={sendHelperMessage}
          onStop={stopHelper}
          onClearContext={() => setHelperContext(undefined)}
        />
      )}
      {tab === 'registries' && (
        <RegistriesPanel
          onError={reportError}
          onNotice={reportNotice}
        />
      )}
      {configDrawer !== undefined && (
        <ConfigEditor
          key={configDrawer.id}
          title={'配置 · ' + configDrawer.id}
          description={configDrawer.description}
          fields={configDrawer.fields}
          current={configDrawer.current}
          template={configDrawer.template}
          busy={configBusy}
          error={configError}
          notice={configNotice}
          onCommit={(config) => void saveConfig(config)}
          onClose={() => setConfigDrawer(undefined)}
        />
      )}
    </div>
  )
}

export function statusLabelOf(status: string): string {
  return STATUS_LABEL[status] ?? status
}
