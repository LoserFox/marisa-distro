/**
 * npm registry 客户端（《收敛任务》候选版本来源）：拉取元数据（含每个版本
 * 的 package.json，用于解析 dsh.mygo manifest）与 tarball；支持私有 scope
 * token（NPM_TOKEN 环境变量或显式注入）。
 * @module @r05en1cu/dsh-mygo/src/package/registry-client
 */

import { createHash } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, basename } from 'node:path'
import { parsePackageManifest, type PluginManifestV2 } from './manifest-v2.ts'

/** One published version's dist + best-effort manifest. */
export interface RegistryVersionInfo {
  readonly version: string
  readonly tarball: string
  readonly integrity?: string
  readonly manifest?: PluginManifestV2
  readonly manifestProblems?: readonly string[]
}

/** Full registry metadata for one package. */
export interface RegistryMetadata {
  readonly name: string
  readonly versions: readonly RegistryVersionInfo[]
  readonly distTags: Readonly<Record<string, string>>
}

export interface RegistryClientOptions {
  /** Registry base URL, default `https://registry.npmjs.org`. */
  readonly registry?: string
  /** Bearer token for private scopes. */
  readonly token?: string
}

/** Encode a package name for a registry path (`@scope/name` → `@scope%2fname`). */
export function encodeRegistryName(name: string): string {
  return name.replace('/', '%2f')
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token === undefined || token === ''
    ? {}
    : { Authorization: `Bearer ${token}` }
}

/** Fetch one package's full metadata from the registry. */
export async function fetchRegistryMetadata(
  name: string,
  options: RegistryClientOptions = {},
): Promise<RegistryMetadata> {
  const registry = (options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '')
  const url = `${registry}/${encodeRegistryName(name)}`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'dsh-mygo/0.3',
      ...authHeaders(options.token),
    },
  })
  if (!response.ok) {
    throw new Error(`registry 元数据请求失败 ${response.status}（${name} @ ${registry}）`)
  }
  const raw = await response.json() as {
    readonly name?: unknown
    readonly versions?: Readonly<Record<string, unknown>>
    readonly 'dist-tags'?: Readonly<Record<string, string>>
  }
  if (typeof raw.name !== 'string' || raw.versions === undefined) {
    throw new Error(`registry 返回异常元数据（${name}）`)
  }
  const versions: RegistryVersionInfo[] = []
  for (const [version, entry] of Object.entries(raw.versions)) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as {
      readonly version?: unknown
      readonly dist?: { readonly tarball?: unknown; readonly integrity?: unknown }
      readonly name?: unknown
      readonly main?: unknown
      readonly dsh?: unknown
    }
    const dist = record.dist
    const tarball = typeof dist?.tarball === 'string' ? dist.tarball : undefined
    if (tarball === undefined) continue
    const manifestResult = parsePackageManifest(record)
    versions.push({
      version,
      tarball,
      ...(typeof dist?.integrity === 'string' ? { integrity: dist.integrity } : {}),
      ...(manifestResult.value === undefined
        ? { manifestProblems: manifestResult.problems.map(problem => `${problem.path}: ${problem.message}`) }
        : { manifest: manifestResult.value }),
    })
  }
  return {
    name: raw.name,
    versions: versions.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0)),
    distTags: raw['dist-tags'] ?? {},
  }
}

/** Download a tarball to `dest`, verifying `integrity` (sha512/sha1) when present. */
export async function downloadTarball(
  url: string,
  dest: string,
  options: RegistryClientOptions & { readonly integrity?: string } = {},
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'dsh-mygo/0.3',
      ...authHeaders(options.token),
    },
  })
  if (!response.ok) {
    throw new Error(`tarball 下载失败 ${response.status}（${basename(url)}）`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (options.integrity !== undefined && options.integrity !== '') {
    const [algo, expected] = options.integrity.split('-') as [string, string | undefined]
    if (expected !== undefined && (algo === 'sha512' || algo === 'sha1')) {
      const actual = createHash(algo).update(bytes).digest('base64')
      if (actual !== expected) {
        throw new Error(`tarball 完整性校验失败（${algo}）`)
      }
    }
  }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, bytes)
}
