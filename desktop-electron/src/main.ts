/**
 * Marisa DSH Desktop — Electron shell main process.
 *
 * Replaces the Wails/WebView2 shell (desktop/main.go) with an Electron
 * BrowserWindow loading the same `dsh web` backend URL. Everything else keeps
 * parity: backend supervision with the 3-stage boot ladder, embedded backend
 * materialization (EMBEDDED_BUNDLE=1 builds), tray residency, single-instance
 * focus, orphan reaper, rescue page, desktop log.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chdir } from 'node:process'
import { setupLogging, ensureAndOpenFolder, parseLogLevel, type DesktopLog } from './logging.ts'
import { backendRootDir, appLogDir } from './paths.ts'
import { supervise, type SuperviseRun } from './supervisor.ts'
import { startRescueServer } from './rescue-server.ts'
import { rescueBackendDirLike } from './rescue-paths.ts'
import { ensureBackend } from './extract.ts'
import { spawnBackendForStage, type ActiveHandle } from './backend-adapter.ts'

const here = dirname(fileURLToPath(import.meta.url))
const APP_NAME = 'Marisa DSH'

let log: DesktopLog
let tray: Tray | null = null
let win: BrowserWindow | null = null
let supervisor: SuperviseRun | null = null
let activeBackend: ActiveHandle | null = null
let quitting = false

const isEmbedded =
  process.env.EMBEDDED_BUNDLE === '1' ||
  existsSync(join(dirname(process.execPath), 'backend', 'launcher.cmd'))

/** Single-instance: second launch focuses the existing window and exits. */
if (!app.requestSingleInstanceLock()) {
  process.exit(0)
}
app.on('second-instance', () => {
  showMainWindow()
})

function showMainWindow(): void {
  if (win === null || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Window-to-tray on close (registerCloseToTray): hide instead of quitting. */
function registerCloseToTray(window: BrowserWindow): void {
  window.on('close', event => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })
}

/** External-link guard: app URLs stay in-window, http(s) elsewhere opens the browser. */
function registerNavigationGuard(window: BrowserWindow): void {
  const appUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!appUrl.test(url)) {
      event.preventDefault()
      if (url.startsWith('http')) void shell.openExternal(url)
    }
  })
}

/** Tray menu — mirrors setupTray(). */
function setupTray(): void {
  const iconPath = join(here, '..', 'build', 'icon.png')
  const icon = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip(APP_NAME)
  tray.on('click', () => showMainWindow())
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 Marisa DSH', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '打开日志目录', click: () => ensureAndOpenFolder(appLogDir()) },
      { label: '重启后端', click: () => {
          if (supervisor?.restartBackend() !== true) log.log('backend restart requested but no backend is running')
          else log.log('backend restart requested; supervise will relaunch it')
        } },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit() } },
    ]),
  )
}

/** Materialize the embedded backend and point DSH_WEB_CMD at its launcher. */
async function materializeBackend(): Promise<void> {
  const bundlePath = join(here, '..', 'bundle', 'backend.tar.zst')
  if (!existsSync(bundlePath)) throw new Error(`embedded bundle missing: ${bundlePath}`)
  await ensureBackend({
    bundle: new Uint8Array(readFileSync(bundlePath)),
    dest: backendRootDir(),
    log: m => log.log(m),
  })
  const launcher = join(backendRootDir(), process.platform === 'win32' ? 'launcher.cmd' : 'launcher.sh')
  if (!existsSync(launcher)) throw new Error(`backend launcher missing: ${launcher}`)
  process.env.DSH_WEB_CMD =
    process.platform === 'win32' ? `"${launcher}"` : `sh "${launcher}"`
  log.log(`DSH_WEB_CMD set to backend launcher: ${process.env.DSH_WEB_CMD}`)
}

/** Rescue page host (reuses the Go shell's rescue.html verbatim). */
async function enterRescuePage(lastError: string): Promise<void> {
  const backendDir = rescueBackendDirLike(dirname(process.execPath)) ?? ''
  const rescueHtmlPath = join(here, '..', 'res', 'rescue.html')
  const rescueHtml = existsSync(rescueHtmlPath)
    ? readFileSync(rescueHtmlPath, 'utf8')
    : '<!doctype html><html><body><h1>Marisa DSH 急救模式</h1><p>rescue.html 缺失（打包遗漏）</p></body></html>'
  const handle = await startRescueServer(
    rescueHtml,
    {
      backendDir,
      log: m => log.log(m),
      reinstallBackend: async () => {
        if (!isEmbedded) throw new Error('当前安装形态不支持从内置资源恢复源码，请通过安装程序修复')
        rmSync(backendRootDir(), { recursive: true, force: true })
        rmSync(backendRootDir() + '.extracting', { recursive: true, force: true })
        await materializeBackend()
      },
      openFolder: d => ensureAndOpenFolder(d),
    },
    lastError,
    { sourceAvailable: isEmbedded },
  )
  log.log(`rescue 页面：${handle.url}`)
  if (win !== null && !win.isDestroyed()) await win.loadURL(handle.url)
  await handle.done
  handle.close()
}

/** Orphan reaper: Electron-as-Node child polling the main pid. */
function spawnReaper(): void {
  const reaperPath = join(here, 'reaper.js')
  if (!existsSync(reaperPath)) return
  const child = spawn(process.execPath, [reaperPath, String(process.pid), String(process.pid)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  })
  child.unref()
  // Note: the reaper's backend pid is a placeholder equal to the main pid at
  // boot (no backend exists yet). The backend is in the shell's process group
  // on POSIX (dies with the session) and taskkill /T-reachable on Windows via
  // the supervisor's stop path; the reaper is the hard-kill safety net for
  // the FIRST backend pid reported by the supervisor (updated via
  // updateReaperBackendPid on every spawn).
}

let reaperProc: import('node:child_process').ChildProcess | null = null

function updateReaperBackendPid(pid: number): void {
  if (reaperProc !== null) reaperProc.kill()
  const child = spawn(process.execPath, [join(here, 'reaper.js'), String(process.pid), String(pid)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  })
  child.unref()
  reaperProc = child
}

async function main(): Promise<void> {
  parseLogLevel()
  log = setupLogging()
  log.log(`${APP_NAME} electron shell starting (embedded=${String(isEmbedded)})`)

  const workspace = process.env.DSH_APP_WORKSPACE
  if (workspace !== undefined && workspace !== '') {
    try { chdir(workspace) } catch (err) { log.log(`chdir failed: ${String(err)}`) }
  }

  if (isEmbedded) {
    try {
      await materializeBackend()
    } catch (err) {
      dialog.showErrorBox(APP_NAME, `内嵌后端解包失败：${String(err)}`)
      app.exit(1)
      return
    }
  }

  await app.whenReady()
  win = new BrowserWindow({
    title: APP_NAME,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
    },
  })
  registerCloseToTray(win)
  registerNavigationGuard(win)
  win.once('ready-to-show', () => win?.show())
  const landingPath = join(here, '..', 'res', 'landing.html')
  if (existsSync(landingPath)) await win.loadFile(landingPath)
  else {
    await win.loadURL(
      'data:text/html,' +
      encodeURIComponent(
        '<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><p>Marisa DSH 启动中…</p></body></html>',
      ),
    )
  }

  setupTray()

  supervisor = await supervise(
    {
      spawn: async stage => {
        const handle = spawnBackendForStage(stage, {
          tee: chunk => log.backendLog(chunk),
          log: m => log.log(m),
        })
        activeBackend = handle
        updateReaperBackendPid(handle.pid)
        return handle
      },
      enterRescue: lastError => enterRescuePage(lastError),
      navigate: url => {
        if (win !== null && !win.isDestroyed()) void win.loadURL(url.href)
      },
      log: m => log.log(m),
    },
    () => quitting,
  )
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // Tray residency: closing the window hides it; quit happens via tray menu.
})

app.on('quit', () => {
  // The supervisor's cleanup kills the backend tree on its own exit path;
  // force-kill anything left, then stop the reaper.
  if (activeBackend !== null) void activeBackend.stop()
  reaperProc?.kill()
  log?.close()
})

void main()
