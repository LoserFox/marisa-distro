/**
 * Rescue-mode control server — port of desktop/rescue_server.go +
 * rescue.go (executor) + rescue_bundles.go (per-bundle toggle).
 *
 * When the backend cannot boot in full/minimal composition, the window
 * switches to this local endpoint serving the SAME rescue.html the Wails
 * shell embeds (copied verbatim to res/rescue.html). Token-gated loopback
 * only; every endpoint is a 1:1 shape match with the Go implementation.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { APP_LOG_NAME, appLogDir, backupsRootDirLike } from './rescue-paths.ts'
import { readLogTail, ensureAndOpenFolder } from './logging.ts'

export const MARISA_PROFILE_NAME = 'marisa'
const DISABLED_BUNDLES_FILE = '.disabled-bundles.json'
const BUNDLE_NAME_RE = /^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/

export interface RescueContext {
  backendDir: string
  /** Re-extract the embedded bundle into a fresh tree; unavailable in dev builds. */
  reinstallBackend: () => Promise<void>
  log: (message: string) => void
  openFolder: (dir: string) => void
}

export interface RescueBundle { name: string; disabled: boolean }

function profileDir(ctx: RescueContext): string {
  return join(ctx.backendDir, '.dsh', 'profiles', MARISA_PROFILE_NAME)
}

function dshHome(ctx: RescueContext): string {
  return join(ctx.backendDir, '.dsh')
}

// ---------- rescue executor (rescue.go) ----------

const USER_CONFIG_REL = [
  'sessions', 'storages', 'cache', 'settings.yaml', '.credentials.yaml', '.anonymous-user-id', 'mygo-self.json',
]

export interface RescueRequest { backup: boolean; resetConfig: boolean; resetSource: boolean }

function readBackendVersionFile(backendDir: string): string | null {
  try {
    return readFileSync(join(backendDir, 'VERSION'), 'utf8').trim()
  } catch {
    return null
  }
}

function writeBackupInfo(backupDir: string, backendDir: string): void {
  const info: Record<string, string> = { backedUpAt: new Date().toISOString() }
  const v = readBackendVersionFile(backendDir)
  if (v !== null) info.backendVersion = v
  try { writeFileSync(join(backupDir, 'info.json'), JSON.stringify(info, null, 2) + '\n', 'utf8') } catch { /* logged by caller */ }
}

function resetUserConfig(ctx: RescueContext): void {
  const dsh = dshHome(ctx)
  for (const rel of USER_CONFIG_REL) {
    rmSync(join(dsh, rel), { recursive: true, force: true })
  }
  const profilesRoot = join(dsh, 'profiles')
  try {
    for (const pr of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!pr.isDirectory()) continue
      try { rmSync(join(profilesRoot, pr.name, 'cordis.patch.yml'), { force: true }) } catch { /* absent */ }
    }
  } catch { /* no profiles dir */ }
  ctx.log('rescue: 用户配置已重置（sessions/storages/settings/凭据/profile 用户层）')
}

function restoreUserConfig(ctx: RescueContext, fromDsh: string): void {
  const toDsh = dshHome(ctx)
  for (const rel of USER_CONFIG_REL) {
    const src = join(fromDsh, rel)
    if (!existsSync(src)) continue
    const dst = join(toDsh, rel)
    rmSync(dst, { recursive: true, force: true })
    renameSync(src, dst)
  }
  const profilesRoot = join(fromDsh, 'profiles')
  try {
    for (const pr of readdirSync(profilesRoot, { withFileTypes: true })) {
      if (!pr.isDirectory()) continue
      const src = join(profilesRoot, pr.name, 'cordis.patch.yml')
      if (!existsSync(src)) continue
      const dst = join(toDsh, 'profiles', pr.name, 'cordis.patch.yml')
      rmSync(dst, { force: true })
      renameSync(src, dst)
    }
  } catch { /* no profiles in backup */ }
}

/** Execute one rescue action sequence (rescue.go run). */
export async function runRescue(ctx: RescueContext, req: RescueRequest): Promise<string> {
  if (!req.backup && !req.resetConfig && !req.resetSource) {
    throw new Error('请至少勾选一项初始化动作')
  }
  const backupsRoot = backupsRootDirLike()
  let backupDir = ''
  if (req.backup) {
    const ts = new Date().toISOString().replaceAll(/[-:T]/g, '').slice(0, 14)
    backupDir = join(backupsRoot, ts)
    mkdirSync(backupDir, { recursive: true })
    renameSync(ctx.backendDir, join(backupDir, 'backend'))
    writeBackupInfo(backupDir, ctx.backendDir)
    ctx.log(`rescue: 现场已备份到 ${join(backupDir, 'backend')}`)
  }
  try {
    if (req.resetSource) {
      await ctx.reinstallBackend()
      if (req.backup && !req.resetConfig) restoreUserConfig(ctx, join(backupDir, 'backend', '.dsh'))
    } else if (req.backup) {
      renameSync(join(backupDir, 'backend'), ctx.backendDir)
      try { rmSync(backupDir, { recursive: true, force: true }) } catch { /* keep on failure */ }
      backupDir = ''
    }
    if (req.resetConfig) resetUserConfig(ctx)
  } catch (err) {
    try { writeFileSync(join(backupDir, 'error.txt'), String(err) + '\n', 'utf8') } catch { /* best effort */ }
    throw err
  }
  return backupDir
}

// ---------- bundle toggle (rescue_bundles.go) ----------

function listBundles(ctx: RescueContext): RescueBundle[] {
  const pkgPath = join(profileDir(ctx), 'package.json')
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const disabled = new Set(readDisabledBundles(ctx))
  return bundles.map(name => ({ name, disabled: disabled.has(name) }))
}

function readDisabledBundles(ctx: RescueContext): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(profileDir(ctx), DISABLED_BUNDLES_FILE), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

function writeDisabledBundles(ctx: RescueContext, names: string[]): void {
  writeFileSync(join(profileDir(ctx), DISABLED_BUNDLES_FILE), JSON.stringify(names, null, 2) + '\n', 'utf8')
}

function writeProfileBundles(ctx: RescueContext, bundles: string[]): void {
  const pkgPath = join(profileDir(ctx), 'package.json')
  const root = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
  const dsh = (root.dsh ?? {}) as Record<string, unknown>
  const profile = (dsh.profile ?? {}) as Record<string, unknown>
  profile.bundles = bundles
  dsh.profile = profile
  root.dsh = dsh
  writeFileSync(pkgPath, JSON.stringify(root, null, 2) + '\n', 'utf8')
}

/**
 * Set one bundle's disabled state (rescue_bundles.go setDisabled). The Go
 * version wraps this in the install-WAL transaction; the WAL itself is not
 * ported in stage 1 — a plain pre-write snapshot of package.json is kept
 * beside the profile instead (documented gap in docs/desktop-electron.md).
 */
export function setBundleDisabled(ctx: RescueContext, name: string, disable: boolean): void {
  if (!BUNDLE_NAME_RE.test(name)) throw new Error('非法 bundle 名')
  const pkgPath = join(profileDir(ctx), 'package.json')
  // Cheap safety net in place of the WAL: package.json.bak-<ts> snapshot.
  try { writeFileSync(pkgPath + '.bak-' + Date.now(), readFileSync(pkgPath)) } catch { /* best effort */ }
  const bundles = readProfileBundles(ctx)
  const disabled = new Set(readDisabledBundles(ctx))
  let next = bundles
  if (disable) {
    next = bundles.filter(b => b !== name)
    disabled.add(name)
  } else {
    if (!bundles.includes(name)) next = [...bundles, name]
    disabled.delete(name)
  }
  writeProfileBundles(ctx, next)
  writeDisabledBundles(ctx, [...disabled])
  ctx.log(`rescue: 已${disable ? '禁用' : '启用'} bundle ${name}（重启后生效）`)
}

function readProfileBundles(ctx: RescueContext): string[] {
  const pkgPath = join(profileDir(ctx), 'package.json')
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dsh?: { profile?: { bundles?: string[] } }
  }
  return manifest.dsh?.profile?.bundles ?? []
}

// ---------- HTTP server ----------

interface StatePayload {
  stage: 'rescue'
  lastError: string
  logPath: string
  logTail: string
  backupsRoot: string
  capabilities: { resetSource: boolean }
}

export interface RescueServerHandle {
  url: string
  done: Promise<void>
  close: () => void
}

/** Create and start the token-gated loopback rescue server. */
export function startRescueServer(
  rescueHtml: string,
  ctx: RescueContext,
  lastError: string,
  opts: { sourceAvailable?: boolean } = {},
): Promise<RescueServerHandle> {
  return new Promise(resolvePromise => {
    const token = randomBytes(16).toString('hex')
    let resolveDone: () => void = () => {}
    const done = new Promise<void>(r => { resolveDone = r })
    let settled = false
    const signalDone = () => {
      if (settled) return
      settled = true
      resolveDone()
    }

    const json = (res: ServerResponse, body: unknown): void => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.searchParams.get('token') !== token && req.headers['x-rescue-token'] !== token) {
        res.statusCode = 403
        res.end('forbidden')
        return
      }
      void handle(req, res, url)
    })

    async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
      const route = `${req.method ?? 'GET'} ${url.pathname}`
      try {
        if (route === 'GET /') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(rescueHtml)
          return
        }
        if (route === 'GET /api/state') {
          const logPath = join(appLogDir(), APP_LOG_NAME)
          json(res, {
            stage: 'rescue',
            lastError,
            logPath,
            logTail: readLogTail(logPath, 8 << 10),
            backupsRoot: backupsRootDirLike(),
            capabilities: { resetSource: opts.sourceAvailable ?? false },
          } satisfies StatePayload)
          return
        }
        if (route === 'GET /api/backups') {
          const root = backupsRootDirLike()
          let ok = false
          try { ok = statSync(root).isDirectory() } catch { ok = false }
          json(res, { exists: ok })
          return
        }
        if (route === 'POST /api/rescue') {
          const body = await readBody(req)
          const parsed = JSON.parse(body) as Partial<RescueRequest>
          const backupDir = await runRescue(ctx, {
            backup: parsed.backup === true,
            resetConfig: parsed.resetConfig === true,
            resetSource: parsed.resetSource === true,
          })
          signalDone()
          json(res, { ok: true, backupDir })
          return
        }
        if (route === 'POST /api/retry') {
          ctx.log('rescue: 用户选择重试完整启动（不恢复）')
          signalDone()
          json(res, { ok: true })
          return
        }
        if (route === 'POST /api/open-log') {
          ensureAndOpenFolder(appLogDir())
          json(res, { ok: true })
          return
        }
        if (route === 'POST /api/open-backups') {
          ensureAndOpenFolder(backupsRootDirLike())
          json(res, { ok: true })
          return
        }
        if (route === 'GET /api/bundles') {
          json(res, { ok: true, profile: MARISA_PROFILE_NAME, bundles: listBundles(ctx) })
          return
        }
        if (route === 'POST /api/disable-bundle' || route === 'POST /api/enable-bundle') {
          const body = await readBody(req)
          const parsed = JSON.parse(body) as { name?: string }
          if (typeof parsed.name !== 'string' || parsed.name === '') {
            json(res, { ok: false, error: '请求格式错误' })
            return
          }
          setBundleDisabled(ctx, parsed.name, url.pathname.endsWith('/disable-bundle'))
          json(res, { ok: true, message: '操作成功，重启后端后生效（仅跳过加载，不卸载文件）', restartNeeded: true })
          return
        }
        res.statusCode = 404
        res.end('not found')
      } catch (err) {
        json(res, { ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        throw new Error('rescue server listen failed')
      }
      const url = `http://127.0.0.1:${addr.port}/?token=${token}`
      resolvePromise({ url, done, close: () => server.close() })
    })
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
