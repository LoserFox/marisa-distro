/**
 * Host-independent Electron recovery window — port of anywhere
 * dsh-plugin-desktop src/startup-recovery-window.ts (MIT), adapted to
 * marisa's vanilla (no-build) recovery page.
 *
 * Key properties preserved from anywhere:
 *  - The renderer has NO Node, IPC, or network capability (sandbox +
 *    contextIsolation, no preload, custom partition, window-open denied,
 *    webview attach denied).
 *  - State enters via a size-bounded base64url query parameter; actions leave
 *    via navigation attempts to `marisa-recovery://<action>` which the main
 *    process intercepts on will-navigate/will-redirect.
 *  - Destructive operations go through preview → native confirm dialog →
 *    execute (the main process re-validates the preview id).
 *  - The window resolves 'restart' (relaunch the app) or 'quit'.
 */

import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RecoveryController,
  RecoveryControllerError,
  type RecoverySnapshot,
} from './recovery-controller.ts'
import { readLogTail } from './logging.ts'
import { APP_LOG_NAME, appLogDir } from './paths.ts'

const RECOVERY_SCHEME = 'marisa-recovery:'
const RECOVERY_DOCUMENT = fileURLToPath(new URL('../res/recovery.html', import.meta.url))
const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 720
const MIN_WIDTH = 680
const MIN_HEIGHT = 560

export type RecoveryWindowResult = 'restart' | 'quit'
type NoticeTone = 'info' | 'success' | 'warning' | 'error'

interface RecoveryNotice {
  readonly tone: NoticeTone
  readonly title: string
  readonly body: string
}

export interface RecoveryWindowOptions {
  controller?: RecoveryController
  failureStage: string
  failureDetail: string
  /** True when the user intentionally entered recovery before backend boot. */
  requested?: boolean
  /** Diagnostics export (log tail + versions); returns a summary string. */
  exportDiagnostics: () => Promise<string>
  embeddedAvailable: boolean
}

interface RecoveryViewModel {
  locale: 'zh'
  failureStage: string
  failureDetail: string
  requested?: boolean
  snapshot?: RecoverySnapshot
  snapshotError?: string
  diagnostics: { status: 'saving' | 'saved' | 'failed'; filename?: string }
  diagnosticsTail?: string
  notice?: RecoveryNotice
  busy: boolean
  restartReady: boolean
  activeTab: 'plugins' | 'backups' | 'diagnostics'
  reExtractAvailable: boolean
}

function parseAction(href: string): { action: string; id?: string } | undefined {
  if (!href.startsWith(RECOVERY_SCHEME)) return undefined
  const url = new URL(href)
  const action = url.host || url.pathname.replace(/^\/+/, '')
  if (action === '') return undefined
  const id = url.searchParams.get('id') ?? undefined
  return { action, ...(id !== undefined ? { id } : {}) }
}

export class RecoveryWindow {
  private window: BrowserWindow | undefined
  private busy = false
  private settled = false
  private restartReady = false
  private activeTab: RecoveryViewModel['activeTab'] = 'plugins'
  private snapshot: RecoverySnapshot | undefined
  private snapshotError: string | undefined
  private notice: RecoveryNotice | undefined
  private diagnostics: RecoveryViewModel['diagnostics'] = { status: 'saved' }
  private diagnosticsTail = ''
  private resolveResult: ((r: RecoveryWindowResult) => void) | undefined

  constructor(private readonly options: RecoveryWindowOptions) {}

  /** Open the window and resolve with the user's final choice. */
  async run(): Promise<RecoveryWindowResult> {
    const result = new Promise<RecoveryWindowResult>(resolve => { this.resolveResult = resolve })
    if (this.options.controller !== undefined) this.refreshSnapshot()
    const window = new BrowserWindow({
      title: 'Marisa DSH 恢复模式',
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#202124',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        partition: 'marisa-recovery',
      },
    })
    this.window = window
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', event => { event.preventDefault() })
    const navigate = (_event: Electron.Event, href: string): void => {
      const action = parseAction(href)
      if (action !== undefined) {
        _event.preventDefault()
        void this.handleAction(action)
      } else if (href.startsWith('http')) {
        _event.preventDefault()
        void shell.openExternal(href)
      }
    }
    window.webContents.on('will-navigate', navigate)
    window.webContents.on('will-redirect', navigate)
    window.once('ready-to-show', () => window.show())
    window.on('closed', () => {
      this.window = undefined
      this.finish('quit')
    })
    await this.render()
    void this.exportDiagnostics().catch(() => {})
    return await result
  }

  show(): void {
    if (this.window === undefined || this.window.isDestroyed()) return
    this.window.show()
    this.window.focus()
  }

  private finish(result: RecoveryWindowResult): void {
    if (this.settled) return
    this.settled = true
    const window = this.window
    this.window = undefined
    if (window !== undefined && !window.isDestroyed()) window.destroy()
    this.resolveResult?.(result)
    this.resolveResult = undefined
  }

  private refreshSnapshot(): void {
    try {
      this.snapshot = this.requireController().snapshot()
      this.snapshotError = undefined
    } catch (cause) {
      this.snapshotError = cause instanceof Error ? cause.message : String(cause)
    }
  }

  private async exportDiagnostics(): Promise<void> {
    this.diagnostics = { status: 'saving' }
    await this.render()
    try {
      const summary = await this.options.exportDiagnostics()
      this.diagnosticsTail = summary
      this.diagnostics = { status: 'saved', filename: 'diagnostics（见下方日志尾部）' }
      await this.render()
    } catch {
      this.diagnostics = { status: 'failed' }
      this.notice = { tone: 'error', title: '诊断', body: '诊断导出失败' }
      await this.render()
    }
  }

  private async handleAction(action: { action: string; id?: string }): Promise<void> {
    if (this.busy || this.settled) return
    try {
      if (action.action === 'refresh') {
        this.refreshSnapshot()
      } else if (action.action === 'show-tab' && action.id !== undefined) {
        const tab = action.id as RecoveryViewModel['activeTab']
        if (tab === 'plugins' || tab === 'backups' || tab === 'diagnostics') this.activeTab = tab
      } else if (action.action === 'disable-bundle' && action.id !== undefined) {
        const preview = this.requireController().preview('disable-bundle', action.id)
        if (await this.confirmDestructive('禁用插件', preview.target, '该插件将从组合中移除（文件保留），重启后端后生效。')) {
          await this.runBusy(() => {
            this.requireController().execute(preview.previewId)
            this.notice = { tone: 'success', title: preview.target, body: '已禁用，重启后端后生效' }
            this.restartReady = true
            this.refreshSnapshot()
          })
        }
      } else if (action.action === 'enable-bundle' && action.id !== undefined) {
        await this.runBusy(() => {
          const preview = this.requireController().preview('enable-bundle', action.id!)
          this.requireController().execute(preview.previewId)
          this.notice = { tone: 'success', title: preview.target, body: '已启用，重启后端后生效' }
          this.restartReady = true
          this.refreshSnapshot()
        })
      } else if (action.action === 'preview-re-extract') {
        const preview = this.requireController().preview('re-extract', 'backend')
        if (await this.confirmDestructive('重新解包后端', 'backend', '将删除当前 backend 目录并从内嵌资源重新解包为全新出厂树。')) {
          await this.runBusy(async () => {
            // consume the preview synchronously, then run the async re-extract
            this.requireController().execute(preview.previewId)
            await this.requireController().executeReExtract()
            this.notice = { tone: 'success', title: 'backend', body: '已重新解包为全新出厂树' }
            this.restartReady = true
            this.refreshSnapshot()
          })
        }
      } else if (action.action === 'open-log') {
        await shell.openPath(appLogDir())
      } else if (action.action === 'show-log') {
        shell.showItemInFolder(join(appLogDir(), APP_LOG_NAME))
      } else if (action.action === 'export-diagnostics') {
        await this.exportDiagnostics()
      } else if (action.action === 'restart') {
        const window = this.window
        if (window === undefined || window.isDestroyed()) return
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          title: '重启应用',
          message: '重启 Marisa DSH？',
          detail: '将结束当前后端并以完整模式重新启动。',
          buttons: ['重启', '取消'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        if (result.response === 0) this.finish('restart')
        return
      } else if (action.action === 'quit') {
        this.finish('quit')
        return
      }
    } catch (cause) {
      const detail = cause instanceof RecoveryControllerError
        ? `[${cause.code}] ${cause.message}`
        : cause instanceof Error ? cause.message : String(cause)
      this.notice = { tone: 'error', title: '操作失败', body: detail }
      const window = this.window
      if (window !== undefined && !window.isDestroyed()) {
        void dialog.showMessageBox(window, {
          type: 'error',
          title: '操作失败',
          message: '恢复操作失败',
          detail,
          buttons: ['关闭'],
          noLink: true,
        })
      }
    }
    await this.render()
  }

  private async confirmDestructive(kind: string, target: string, body: string): Promise<boolean> {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return false
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: kind,
      message: target,
      detail: body,
      buttons: [kind, '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    return result.response === 0
  }

  private async runBusy(operation: () => void | Promise<void>): Promise<void> {
    this.busy = true
    await this.render()
    try { await operation() } finally { this.busy = false }
  }

  private requireController(): RecoveryController {
    if (this.options.controller === undefined) {
      throw new RecoveryControllerError('state-unavailable', '当前启动阶段没有可用的恢复控制器')
    }
    return this.options.controller
  }

  private async render(): Promise<void> {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    const notice = this.notice
    const model: RecoveryViewModel = {
      locale: 'zh',
      failureStage: this.options.failureStage,
      failureDetail: this.options.failureDetail,
      ...(this.options.requested === true ? { requested: true } : {}),
      ...(this.snapshot === undefined ? {} : { snapshot: this.snapshot }),
      ...(this.snapshotError === undefined ? {} : { snapshotError: this.snapshotError }),
      diagnostics: this.diagnostics,
      diagnosticsTail: this.diagnosticsTail,
      ...(notice === undefined ? {} : { notice }),
      busy: this.busy,
      restartReady: this.restartReady,
      activeTab: this.activeTab,
      reExtractAvailable: this.options.embeddedAvailable,
    }
    const state = Buffer.from(JSON.stringify(model), 'utf8').toString('base64url')
    await window.loadFile(RECOVERY_DOCUMENT, { query: { state } })
    if (this.notice === notice) this.notice = undefined
  }
}

export default RecoveryWindow
