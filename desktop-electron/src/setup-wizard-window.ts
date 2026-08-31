/**
 * One-shot native Setup Wizard window — port of anywhere dsh-plugin-desktop
 * src/setup-wizard-window.ts (MIT), vanilla-page variant.
 *
 * Same skeleton as anywhere: sandbox renderer, no IPC, state via base64url
 * query, result via strict scheme navigation, close ≠ skip (quit resolves
 * separately), one-shot guard, Windows shows immediately (ready-to-show can
 * race a hidden HWND).
 */

import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import {
  parseSetupWizardAction,
  SETUP_WIZARD_SCHEME,
  type SetupWizardResult,
} from './setup-wizard-contract.ts'

export interface SetupWizardInput {
  platform: NodeJS.Platform
  /** NT build on Windows (undefined elsewhere) for the mica/acrylic gate. */
  windowsBuild?: number
  /** Backend version for the welcome copy. */
  backendVersion?: string
}

const SETUP_WIZARD_DOCUMENT = fileURLToPath(new URL('../res/setup-wizard.html', import.meta.url))

/** One-shot native Setup Wizard; close is distinct from the explicit Skip action. */
export class SetupWizardWindow {
  private started = false
  private window: BrowserWindow | undefined

  constructor(private readonly options: { input: SetupWizardInput }) {}

  show(): void {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    window.show()
    window.focus()
  }

  async run(): Promise<SetupWizardResult> {
    if (this.started) throw new Error('marisa-desktop: Setup Wizard can only run once')
    this.started = true
    const { input } = this.options
    const state = Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
    const window = new BrowserWindow({
      title: 'Marisa DSH 初始设置',
      width: 880,
      height: 720,
      minWidth: 680,
      minHeight: 560,
      useContentSize: true,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      // Windows: ready-to-show can emit before the hidden HWND accepts show();
      // create visibly so startup never waits behind an unreachable surface.
      show: input.platform === 'win32',
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
        partition: 'marisa-setup-wizard',
      },
    })
    this.window = window
    window.removeMenu()
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-attach-webview', event => { event.preventDefault() })

    return await new Promise<SetupWizardResult>((resolve, reject) => {
      let settled = false
      const finish = (result: SetupWizardResult): void => {
        if (settled) return
        settled = true
        if (this.window === window) this.window = undefined
        if (!window.isDestroyed()) window.destroy()
        resolve(result)
      }
      const navigate = (event: Electron.Event, href: string): void => {
        event.preventDefault()
        if (!href.startsWith(SETUP_WIZARD_SCHEME)) return
        const action = parseSetupWizardAction(href)
        if (action !== undefined) finish(action)
      }
      window.webContents.on('will-navigate', navigate)
      window.webContents.on('will-redirect', navigate)
      window.once('ready-to-show', () => {
        if (!settled && this.window === window && !window.isDestroyed()) {
          window.show()
          window.focus()
        }
      })
      window.on('closed', () => {
        if (this.window === window) this.window = undefined
        finish(Object.freeze({ action: 'quit' }))
      })
      void window.loadFile(SETUP_WIZARD_DOCUMENT, { query: { state } }).catch((cause: unknown) => {
        if (settled) return
        settled = true
        if (this.window === window) this.window = undefined
        if (!window.isDestroyed()) window.destroy()
        reject(cause)
      })
    })
  }
}
