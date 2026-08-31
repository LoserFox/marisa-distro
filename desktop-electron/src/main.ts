/**
 * Marisa DSH Desktop — Electron shell main process.
 *
 * Replaces the Wails/WebView2 shell (desktop/main.go) with an Electron
 * BrowserWindow loading the same `dsh web` backend URL. Everything else keeps
 * parity: backend supervision with the 3-stage boot ladder, embedded backend
 * materialization (EMBEDDED_BUNDLE=1 builds), tray residency, single-instance
 * focus, orphan reaper, rescue page, desktop log.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, Notification as ElectronNotification } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chdir } from 'node:process'
import { setupLogging, ensureAndOpenFolder, parseLogLevel, readLogTail, type DesktopLog } from './logging.ts'
import { backendRootDir, appLogDir, APP_LOG_NAME } from './paths.ts'
import { supervise, type SuperviseRun } from './supervisor.ts'
import { startRescueServer } from './rescue-server.ts'
import { rescueBackendDirLike } from './rescue-paths.ts'
import { ensureBackend } from './extract.ts'
import { spawnBackendForStage, type ActiveHandle } from './backend-adapter.ts'
import { routeDesktopStartupFailure, type DesktopStartupFailureStage } from './startup-failure-routing.ts'
import { beginDesktopRun } from './crash-evidence.ts'
import { RecoveryController } from './recovery-controller.ts'
import { RecoveryWindow } from './recovery-window.ts'
import { SetupWizardWindow } from './setup-wizard-window.ts'
import { windowsBuildNumber, effectiveDesktopWindowMaterial, materialIsTransparent, type DesktopWindowMaterial } from './window-material.ts'
import { readDesktopSettings, writeDesktopSettings } from './desktop-settings.ts'
import { startToastBridge, type NotificationOutcome } from './notifications.ts'
import { AttentionManager } from './attention.ts'
import { installElectronNodeRuntime, type NodeRuntimeInstallation } from './electron-node.ts'

let toastBridgeClose: (() => void) | null = null
let attentionRef: { clear(): void } | null = null
/** Electron-as-Node runtime shims (PATH install); disposed on quit. */
let nodeRuntime: NodeRuntimeInstallation | null = null

/**
 * Main window construction with platform material (window-options.ts
 * customChromeWindowOptions port): custom frame + titleBarOverlay on
 * Windows, hiddenInset + vibrancy on macOS, plain on Linux. Transparent
 * materials get an inset drag strip injected into remote pages.
 */
function createMainWindow(material: DesktopWindowMaterial): BrowserWindow {
  const transparent = materialIsTransparent(material)
  const base: Electron.BrowserWindowConstructorOptions = {
    title: APP_NAME,
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: transparent ? '#00000000' : '#f5f6f8',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
    },
  }
  let options: Electron.BrowserWindowConstructorOptions = base
  if (process.platform === 'win32') {
    options = {
      ...base,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: 36,
      },
      ...(transparent ? { backgroundMaterial: material === 'mica' ? 'mica' : 'acrylic' } : {}),
      hasShadow: true,
      roundedCorners: true,
      thickFrame: true,
    }
  } else if (process.platform === 'darwin') {
    options = {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 12 },
      ...(material === 'transparent'
        ? { transparent: true, vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const }
        : {}),
    }
  }
  const window = new BrowserWindow(options)
  if (transparent) {
    // Remote pages paint an opaque body: inject an inset drag strip + body
    // transparency hints so the material shows through the top 36px frame.
    window.webContents.on('did-finish-load', () => {
      void window.webContents.insertCSS(
        'html, body { background: transparent !important; }' +
        '::backdrop { background: transparent; }',
      ).catch(() => {})
      window.webContents.executeJavaScript(
        '(() => {' +
        'if (document.getElementById("marisa-drag-strip")) return;' +
        'const strip = document.createElement("div");' +
        'strip.id = "marisa-drag-strip";' +
        'strip.style.cssText = "position:fixed;top:0;left:0;right:0;height:36px;-webkit-app-region:drag;z-index:2147483647";' +
        'document.body ? document.body.append(strip) : document.addEventListener("DOMContentLoaded", () => document.body.append(strip));' +
        '})()',
      ).catch(() => {})
    })
  }
  return window
}

const here = dirname(fileURLToPath(import.meta.url))
const APP_NAME = 'Marisa DSH'
const APP_VERSION = '0.1.0-electron.1'

let log: DesktopLog
let tray: Tray | null = null
let win: BrowserWindow | null = null
let supervisor: SuperviseRun | null = null
let activeBackend: ActiveHandle | null = null
let quitting = false
/** Current startup stage for failure routing (anywhere: startupStage). */
let startupStage: DesktopStartupFailureStage = 'electron-ready'
/** Run marker: detects an unclean previous exit (crash evidence). */
let desktopRun: ReturnType<typeof beginDesktopRun> | null = null

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
      { label: '恢复模式…', click: () => {
          void openRecoveryWindow(startupStage, '用户从托盘主动进入恢复模式', true).then(result => {
            if (result === 'restart') {
              quitting = true
              app.relaunch()
              app.exit(0)
            }
          })
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
  // Electron-as-Node runtime (anywhere desktop-runtime-environment port):
  // generate pnpm/node shims that run the Electron executable with
  // ELECTRON_RUN_AS_NODE=1, and prepend them to PATH so payload-side
  // `pnpm` (mygo `pnpm add`, `dsh plugin`) resolves to them instead of the
  // payload's node.exe-dependent pnpm.cmd. No bundled node.exe needed.
  const pnpmEntry = join(
    backendRootDir(),
    'marisa-distro', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs',
  )
  if (existsSync(pnpmEntry)) {
    try {
      nodeRuntime = installElectronNodeRuntime({
        appExecutable: process.execPath,
        pnpmBinPath: pnpmEntry,
        electronVersion: process.versions.electron,
        stateDir: join(appLogDir(), 'runtime'),
        platform: process.platform,
      })
      log.log(`electron-as-node runtime installed: ${nodeRuntime.pnpmShimPath}`)
    } catch (cause) {
      // Non-fatal: payload with bundled node.exe keeps working via launcher.
      log.log(`electron-as-node runtime unavailable, payload node.exe will serve: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  } else {
    log.log('payload has no hoisted pnpm entry; electron-as-node runtime skipped')
  }
}

/**
 * Recovery-mode window (anywhere dsh-plugin-desktop port): a dedicated
 * sandboxed window with the two-phase controller. Resolves the user's final
 * choice; 'restart' relaunches the whole app.
 */
async function openRecoveryWindow(failureStage: string, failureDetail: string, requested = false): Promise<'restart' | 'quit' | 'unavailable'> {
  if (!app.isReady()) return 'unavailable'
  try {
    const backendDir = rescueBackendDirLike(dirname(process.execPath)) ?? ''
    const controller = backendDir !== ''
      ? new RecoveryController({
          backendDir,
          log: m => log.log(m),
          reinstallAvailable: () => isEmbedded,
          reinstallBackend: async () => {
            if (!isEmbedded) throw new Error('当前安装形态不支持从内置资源恢复源码，请通过安装程序修复')
            rmSync(backendRootDir(), { recursive: true, force: true })
            rmSync(backendRootDir() + '.extracting', { recursive: true, force: true })
            await materializeBackend()
          },
        })
      : undefined
    const window = new RecoveryWindow({
      ...(controller !== undefined ? { controller } : {}),
      failureStage,
      failureDetail,
      ...(requested ? { requested: true } : {}),
      embeddedAvailable: isEmbedded,
      exportDiagnostics: async () => {
        const lines = [
          `app: ${APP_NAME} ${APP_VERSION} (electron ${process.versions.electron}, node ${process.versions.node})`,
          `platform: ${process.platform} ${process.arch}`,
          `embedded: ${String(isEmbedded)}`,
          `startupStage: ${startupStage}`,
          `--- ${APP_LOG_NAME} (tail) ---`,
          readLogTail(join(appLogDir(), APP_LOG_NAME), 16 << 10),
        ]
        return lines.join('\n')
      },
    })
    return await window.run()
  } catch (cause) {
    log.log(`failed to open recovery window: ${cause instanceof Error ? cause.message : String(cause)}`)
    return 'unavailable'
  }
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

  // Crash evidence: a leftover run marker means the previous launch exited
  // uncleanly (hard kill / crash) — logged and shown in recovery diagnostics.
  desktopRun = beginDesktopRun(join(appLogDir(), 'desktop-run.json'), {
    startedAt: new Date().toISOString(),
    pid: process.pid,
    version: APP_VERSION,
  })
  if (desktopRun.previousRun !== undefined) {
    const detail = 'unreadable' in desktopRun.previousRun
      ? 'unreadable marker'
      : `pid ${desktopRun.previousRun.pid} started ${desktopRun.previousRun.startedAt}`
    log.log(`previous launch exited uncleanly (${detail})`)
  }

  const workspace = process.env.DSH_APP_WORKSPACE
  if (workspace !== undefined && workspace !== '') {
    try { chdir(workspace) } catch (err) { log.log(`chdir failed: ${String(err)}`) }
  }

  if (isEmbedded) {
    try {
      startupStage = 'backend-extract'
      await materializeBackend()
    } catch (err) {
      // Failure routing (anywhere): app not ready → stderr-only path.
      const detail = err instanceof Error ? err.message : String(err)
      log.log(`backend extract failed: ${detail}`)
      dialog.showErrorBox(APP_NAME, `内嵌后端解包失败：${detail}`)
      app.exit(1)
      return
    }
  }

  await app.whenReady()

  // ---- Setup Wizard (anywhere port): first launch only, before the window.
  let settings = readDesktopSettings()
  if (!settings.setupComplete) {
    try {
      const wizard = new SetupWizardWindow({
        input: {
          platform: process.platform,
          ...(process.platform === 'win32' ? { windowsBuild: windowsBuildNumber() } : {}),
        },
      })
      const result = await wizard.run()
      if (result.action === 'complete') {
        settings = {
          ...settings,
          macosMaterial: result.selection.macosMaterial,
          windowsMaterial: result.selection.windowsMaterial,
          notifications: { ...result.selection.notifications },
          setupComplete: true,
        }
        writeDesktopSettings(settings)
        log.log(`setup wizard completed: windowsMaterial=${settings.windowsMaterial} macosMaterial=${settings.macosMaterial}`)
      } else if (result.action === 'skip') {
        settings = { ...settings, setupComplete: true }
        writeDesktopSettings(settings)
        log.log('setup wizard skipped')
      } else {
        // quit: user closed the wizard — respect it as an app exit.
        log.log('setup wizard closed; exiting')
        app.exit(0)
        return
      }
    } catch (cause) {
      log.log(`setup wizard failed (continuing with defaults): ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  // ---- Toast bridge (Wails-shell MARISA_TOAST_PORT protocol, anywhere
  // decision table): start BEFORE the backend so the port env is inherited.
  {
    const notificationSender = {
      show: (n: { title: string; body: string }) => {
        const notification = new ElectronNotification({ title: n.title, body: n.body })
        notification.once('click', () => showMainWindow())
        notification.show()
      },
      isSupported: () => ElectronNotification.isSupported(),
    }
    const outcomeOf = (intent: { title: string }): NotificationOutcome | null => {
      if (/回合|turn/i.test(intent.title)) return /失败|未能|fail/i.test(intent.title) ? 'turn-failed' : 'turn-completed'
      if (/任务|job/i.test(intent.title)) return /失败|未能|fail/i.test(intent.title) ? 'job-failed' : 'job-completed'
      return null
    }
    // anywhere attention escalation: focused window suppresses everything;
    // unfocused → flash (win32) / dock badge (else) + native toast.
    const attention = new AttentionManager(
      process.platform,
      {
        isFocused: () => win !== null && !win.isDestroyed() && win.isFocused(),
        flashFrame: (flash: boolean) => { if (win !== null && !win.isDestroyed()) win.flashFrame(flash) },
      },
      { setBadgeCount: (count: number) => app.setBadgeCount(count) },
    )
    attentionRef = attention
    const bridge = await startToastBridge(notificationSender, () => settings.notifications, outcomeOf, m => log.log(m), attention)
    if (bridge.port > 0) {
      process.env.MARISA_TOAST_PORT = String(bridge.port)
      log.log(`toast bridge on 127.0.0.1:${bridge.port} (MARISA_TOAST_PORT)`)
      toastBridgeClose = bridge.close
    } else {
      log.log('toast bridge unavailable (native toasts disabled)')
    }
  }

  // ---- Main window with the resolved material (window-options.ts port).
  const material = effectiveDesktopWindowMaterial(
    process.platform,
    settings.macosMaterial,
    settings.windowsMaterial,
    windowsBuildNumber(),
  )
  log.log(`window material: ${material}`)
  win = createMainWindow(material)
  registerCloseToTray(win)
  registerNavigationGuard(win)
  win.once('ready-to-show', () => win?.show())
  // anywhere clearAttention wiring: refocus/show/destroy clears flash+badge.
  win.on('focus', () => attentionRef?.clear())
  win.on('show', () => attentionRef?.clear())
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

  // Supervision: stage transitions feed startupStage; rescue keeps the Go
  // shell's rescue.html (backend-side fallback), while the anywhere-style
  // recovery window is available from the tray and after unclean exits.
  startupStage = 'backend-boot'
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
        startupStage = 'backend-ready'
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
  quitting = true
  desktopRun?.markClean()
  toastBridgeClose?.()
  attentionRef?.clear()
  nodeRuntime?.dispose()
  // The supervisor's cleanup kills the backend tree on its own exit path;
  // force-kill anything left, then stop the reaper.
  if (activeBackend !== null) void activeBackend.stop()
  reaperProc?.kill()
  log?.close()
})

void main()
