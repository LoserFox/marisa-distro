/**
 * Pre-Host recovery authority over the current backend tree — port of
 * anywhere dsh-plugin-desktop src/startup-recovery-controller.ts (MIT),
 * adapted to marisa's bundle layout (profile package.json bundle list +
 * embedded re-extract instead of yarn/npm workspaces).
 *
 * Key property preserved from anywhere: recovery actions go through a TWO
 * PHASE protocol. Preview returns an opaque one-time preview id with a TTL;
 * execute() re-checks the id. The renderer never sees filesystem paths.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The recovery operations target the marisa profile (Go: marisaProfileName). */
export const MARISA_PROFILE_NAME = 'marisa'

const PREVIEW_TTL_MS = 5 * 60 * 1000
const MAX_PREVIEWS = 256
const PREVIEW_ID_PATTERN = /^prev_[A-Za-z0-9_-]{43}$/
const BUNDLE_NAME_PATTERN = /^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/

export type RecoveryErrorCode =
  | 'invalid-target'
  | 'operation-failed'
  | 'preview-expired'
  | 'state-unavailable'

export class RecoveryControllerError extends Error {
  constructor(
    readonly code: RecoveryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RecoveryControllerError'
  }
}

export interface RecoveryBundle {
  readonly name: string
  readonly status: 'active' | 'disabled'
  /** uninstall = removable from the composition; null = bundled-only (toggle only). */
  readonly action: 'disable' | null
}

export interface RecoveryBackup {
  readonly name: string
  readonly capturedAt: string
  readonly backendVersion?: string
  readonly totalBytes: number
}

export interface RecoverySnapshot {
  readonly profileName: string
  readonly backendDirExists: boolean
  readonly bundles: readonly RecoveryBundle[]
  readonly backups: readonly RecoveryBackup[]
}

export interface RecoveryPreview {
  readonly previewId: string
  readonly kind: 'disable-bundle' | 'enable-bundle' | 're-extract'
  readonly target: string
  readonly expiresAt: string
}

interface PreviewRecord {
  readonly kind: 'disable-bundle' | 'enable-bundle' | 're-extract'
  readonly target: string
  readonly expiresAt: number
}

export interface RecoveryControllerDeps {
  backendDir: string
  log: (message: string) => void
  /** Re-extract the embedded bundle into a fresh tree (embedded builds only). */
  reinstallBackend: () => Promise<void>
  /** Whether re-extract is available (EMBEDDED_BUNDLE / installed form). */
  reinstallAvailable: () => boolean
}

function profileDir(deps: RecoveryControllerDeps): string {
  return join(deps.backendDir, '.dsh', 'profiles', MARISA_PROFILE_NAME)
}

function readProfileBundles(deps: RecoveryControllerDeps): string[] {
  try {
    const manifest = JSON.parse(
      readFileSync(join(profileDir(deps), 'package.json'), 'utf8'),
    ) as { dsh?: { profile?: { bundles?: string[] } } }
    return manifest.dsh?.profile?.bundles ?? []
  } catch {
    throw new RecoveryControllerError('state-unavailable', 'profile package.json 不可读')
  }
}

function writeProfileBundles(deps: RecoveryControllerDeps, bundles: string[]): void {
  const pkgPath = join(profileDir(deps), 'package.json')
  const root = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
  const dsh = (root.dsh ?? {}) as Record<string, unknown>
  const profile = (dsh.profile ?? {}) as Record<string, unknown>
  profile.bundles = bundles
  dsh.profile = profile
  root.dsh = dsh
  writeFileSync(pkgPath, JSON.stringify(root, null, 2) + '\n', 'utf8')
}

function readDisabledBundles(deps: RecoveryControllerDeps): Set<string> {
  try {
    const parsed = JSON.parse(
      readFileSync(join(profileDir(deps), '.disabled-bundles.json'), 'utf8'),
    )
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDisabledBundles(deps: RecoveryControllerDeps, names: Iterable<string>): void {
  mkdirSync(profileDir(deps), { recursive: true })
  writeFileSync(
    join(profileDir(deps), '.disabled-bundles.json'),
    JSON.stringify([...names], null, 2) + '\n',
    'utf8',
  )
}

function listBackups(deps: RecoveryControllerDeps): RecoveryBackup[] {
  const root = join(deps.backendDir, '..', 'backups')
  const out: RecoveryBackup[] = []
  let names: string[]
  try {
    names = statSync(root).isDirectory() ? readdirSync(root) : []
  } catch {
    return out
  }
  for (const name of names) {
    try {
      const dir = join(root, name)
      if (!statSync(dir).isDirectory()) continue
      let version: string | undefined
      let capturedAt = ''
      try {
        const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8')) as {
          backedUpAt?: string
          backendVersion?: string
        }
        capturedAt = info.backedUpAt ?? ''
        version = info.backendVersion
      } catch { /* no info file */ }
      out.push({ name, capturedAt, ...(version !== undefined ? { backendVersion: version } : {}), totalBytes: 0 })
    } catch { /* skip */ }
  }
  return out.sort((a, b) => b.name.localeCompare(a.name))
}

/**
 * One recovery authority for a fixed backend generation. The window holds it
 * only while recovery is up; any backend restart invalidates it (new
 * controller instance created by main).
 */
export class RecoveryController {
  private readonly previews = new Map<string, PreviewRecord>()

  constructor(private readonly deps: RecoveryControllerDeps) {}

  snapshot(): RecoverySnapshot {
    const deps = this.deps
    if (!existsSync(deps.backendDir)) {
      return { profileName: MARISA_PROFILE_NAME, backendDirExists: false, bundles: [], backups: [] }
    }
    const disabled = readDisabledBundles(deps)
    const bundles: RecoveryBundle[] = readProfileBundles(deps).map(name => ({
      name,
      status: disabled.has(name) ? 'disabled' : 'active',
      action: BUNDLE_NAME_PATTERN.test(name) ? 'disable' : null,
    }))
    return {
      profileName: MARISA_PROFILE_NAME,
      backendDirExists: true,
      bundles,
      backups: listBackups(deps),
    }
  }

  preview(kind: PreviewRecord['kind'], target: string): RecoveryPreview {
    if (this.previews.size >= MAX_PREVIEWS) {
      throw new RecoveryControllerError('operation-failed', '预览表已满，请重试')
    }
    if (kind !== 're-extract' && !BUNDLE_NAME_PATTERN.test(target)) {
      throw new RecoveryControllerError('invalid-target', `非法 bundle 名：${target}`)
    }
    if (kind === 're-extract' && !this.deps.reinstallAvailable()) {
      throw new RecoveryControllerError('operation-failed', '当前安装形态不支持从内置资源恢复源码')
    }
    const previewId = `prev_${randomBytes(32).toString('base64url')}`
    this.previews.set(previewId, { kind, target, expiresAt: Date.now() + PREVIEW_TTL_MS })
    return { previewId, kind, target, expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString() }
  }

  execute(previewId: string): { kind: PreviewRecord['kind']; target: string } {
    if (!PREVIEW_ID_PATTERN.test(previewId)) {
      throw new RecoveryControllerError('invalid-target', '预览 ID 非法')
    }
    const record = this.previews.get(previewId)
    if (record === undefined) {
      throw new RecoveryControllerError('invalid-target', '预览不存在或已使用')
    }
    this.previews.delete(previewId)
    if (Date.now() > record.expiresAt) {
      throw new RecoveryControllerError('preview-expired', '预览已过期（5 分钟），请重新操作')
    }
    const deps = this.deps
    try {
      if (record.kind === 're-extract') {
        // Synchronous wrapper is impossible; the window awaits via runBusy.
        // mark as pending and let the caller drive the async part separately
        // (see executeReExtract below).
        return { kind: record.kind, target: record.target }
      }
      const bundles = readProfileBundles(deps)
      const disabled = readDisabledBundles(deps)
      if (record.kind === 'disable-bundle') {
        writeProfileBundles(deps, bundles.filter(b => b !== record.target))
        disabled.add(record.target)
      } else {
        if (!bundles.includes(record.target)) {
          writeProfileBundles(deps, [...bundles, record.target])
        }
        disabled.delete(record.target)
      }
      writeDisabledBundles(deps, disabled)
      deps.log(`recovery: 已${record.kind === 'disable-bundle' ? '禁用' : '启用'} bundle ${record.target}（重启后生效）`)
      return { kind: record.kind, target: record.target }
    } catch (cause) {
      throw new RecoveryControllerError('operation-failed', cause instanceof Error ? cause.message : String(cause))
    }
  }

  /** Async half of the re-extract preview execution. */
  async executeReExtract(): Promise<void> {
    await this.deps.reinstallBackend()
  }
}
