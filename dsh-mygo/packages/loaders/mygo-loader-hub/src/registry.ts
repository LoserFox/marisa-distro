/**
 * dsh-hub registry 客户端（P5）：`omdsh-registry/v1` 静态 JSON 的拉取
 * （双 origin 故障转移）、本地快照降级（file:// 路径或 vendored 快照）、
 * snapshotId 摘要校验（canonical JSON 键排序递归序列化的 sha256）与
 * Ed25519 验签（签名非 null 时强制；公钥内置常量 + 轮换窗口结构）。
 *
 * 事实来源：dsh-hub scripts/src/registry-core.ts（canonical 算法与 payload
 * 口径）与 scripts/sign-registry.mjs（payload = {schema, revision,
 * generatedAt, origins, entries, collections}；Ed25519 签名 base64）。
 * git 中产物 signature 为 null（签名在部署环境发生）。
 * @module @r05en1cu/dsh-mygo-loader-hub/registry
 */

import { createHash, createPublicKey, verify as ed25519Verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HUB_REGISTRY_SCHEMA = 'omdsh-registry/v1'

/** 官方双 origin（registry-core.ts ORIGINS 同序）。 */
export const HUB_REGISTRY_ORIGINS = [
  'https://hub.omdsh.dev/registry-v1.json',
  'https://hub.0.org.cn/registry-v1.json',
] as const

/** 验签公钥（轮换窗口结构：按 keyId 查找，新旧并存期多把共存）。 */
export interface HubRegistryKey {
  readonly keyId: string
  /** PEM 或 DER base64 均可（createPublicKey 直接消费）。 */
  readonly publicKey: string
}

/**
 * 内置公钥常量：官方签名在部署环境发生，公钥尚未公布（dsh-hub git 产物
 * signature 为 null）；本常量留空 + 轮换窗口结构预留，官方公布后按
 * keyId 填入。运行时可用 loadHubRegistry 的 keys 选项注入（测试/内网）。
 */
export const HUB_BUILTIN_KEYS: readonly HubRegistryKey[] = []

// ---------------------------------------------------------------------------
// 类型面（只声明消费字段；其余字段透传宽容）
// ---------------------------------------------------------------------------

export type HubInstallIntent =
  | {
    readonly mode: 'profile-bundle'
    readonly adapter: 'official-profile/v1'
    readonly packageName: string
    /** 精确 semver 或钉 40 位 commit 的 git spec（registry-core isExactPackageSpec）。 */
    readonly spec: string
  }
  | {
    readonly mode: 'repository-plugin'
    readonly adapter: 'official-repository/v1'
    /** `github:owner/repo#<40hex>[&path:/.../.dsh-plugin]`。 */
    readonly spec: string
  }
  | { readonly mode: 'guided'; readonly method: string }

export interface HubRelease {
  readonly id: string
  readonly version: string | null
  readonly ref: string
  readonly updatedAt: string
  readonly channel: string
  readonly install: HubInstallIntent
  readonly compatibility?: { readonly declared?: string | null }
  /** catalog 源有、registry 快照暂未释放的维度；防御性可选消费。 */
  readonly capabilities?: {
    readonly requiresFabric?: boolean
    readonly deepHook?: boolean
    readonly restartRequired?: boolean
  }
  readonly relations?: {
    readonly required?: readonly { readonly projectId: string; readonly releaseId: string }[]
    readonly optional?: readonly { readonly projectId: string; readonly releaseId: string }[]
  }
}

export interface HubEntry {
  readonly id: string
  readonly displayName: string
  readonly description: string
  readonly kind: string
  readonly tags: readonly string[]
  readonly author: { readonly name: string; readonly url?: string }
  readonly version: string | null
  readonly license: string
  readonly compatibility?: { readonly declared?: string | null }
  readonly risk: {
    readonly level: 'unknown' | 'low' | 'medium' | 'high' | 'critical'
    readonly facts: {
      readonly sourcePinned?: boolean
      readonly vulnerabilityScan?: 'unknown' | 'passed' | 'findings'
      readonly permissions?: 'unknown' | 'declared' | 'reviewed'
      readonly nativeCode?: 'unknown' | 'present' | 'absent'
      readonly installScripts?: 'unknown' | 'present' | 'absent'
    }
  }
  readonly listing: {
    readonly state: 'auto-listed' | 'review-required' | 'reviewed' | 'blocked'
    readonly catalogStatus?: string
    readonly trustedPublisher?: string
  }
  readonly maintenance: {
    readonly state: 'active' | 'deprecated' | 'archived'
    readonly notice?: string | null
    readonly successor?: string | null
  }
  readonly install: HubInstallIntent
  readonly latestRelease: string
  readonly releases: readonly HubRelease[]
  readonly links?: { readonly atlas?: string; readonly repository?: string }
  /** catalog 源有、registry 快照暂未释放；防御性可选消费。 */
  readonly relations?: HubRelease['relations']
}

export interface HubCollectionItem {
  readonly projectId: string
  readonly releaseId: string
  readonly packageName: string
  readonly spec: string
}

export interface HubCollection {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly featured?: boolean
  readonly items: readonly HubCollectionItem[]
}

export interface HubSignature {
  readonly algorithm: 'Ed25519'
  readonly keyId: string
  /** base64。 */
  readonly value: string
}

export interface HubRegistry {
  readonly schema: typeof HUB_REGISTRY_SCHEMA
  readonly revision: number
  readonly generatedAt: string
  readonly origins: readonly string[]
  readonly entries: readonly HubEntry[]
  readonly collections: readonly HubCollection[]
  readonly snapshotId: string
  readonly signature: HubSignature | null
}

// ---------------------------------------------------------------------------
// canonical JSON（registry-core.ts 同算法：键排序递归序列化）
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot contain non-finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`
  }
  throw new TypeError(`canonical JSON cannot encode ${typeof value}`)
}

/** 签名/摘要 payload（sign-registry.mjs 口径：六字段固定集合）。 */
function payloadOf(registry: HubRegistry): Record<string, unknown> {
  return {
    schema: registry.schema,
    revision: registry.revision,
    generatedAt: registry.generatedAt,
    origins: registry.origins,
    entries: registry.entries,
    collections: registry.collections,
  }
}

// ---------------------------------------------------------------------------
// 解析与校验
// ---------------------------------------------------------------------------

export class HubRegistryError extends Error {}

/** 解析并做最小结构校验（schema/entries/collections/snapshotId/signature 形状）。 */
export function parseHubRegistry(raw: unknown): HubRegistry {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HubRegistryError('hub registry 不是 JSON 对象')
  }
  const doc = raw as Record<string, unknown>
  if (doc.schema !== HUB_REGISTRY_SCHEMA) {
    throw new HubRegistryError(`hub registry schema 不符：期望 ${HUB_REGISTRY_SCHEMA}，实际 ${String(doc.schema)}`)
  }
  if (typeof doc.revision !== 'number' || typeof doc.generatedAt !== 'string') {
    throw new HubRegistryError('hub registry 缺 revision/generatedAt')
  }
  if (!Array.isArray(doc.entries) || !Array.isArray(doc.collections)) {
    throw new HubRegistryError('hub registry 缺 entries/collections 数组')
  }
  if (typeof doc.snapshotId !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(doc.snapshotId)) {
    throw new HubRegistryError('hub registry snapshotId 形状非法（期望 sha256:<64hex>）')
  }
  const signature = doc.signature
  if (signature !== null && signature !== undefined) {
    const sig = signature as Record<string, unknown>
    if (sig.algorithm !== 'Ed25519' || typeof sig.keyId !== 'string' || typeof sig.value !== 'string') {
      throw new HubRegistryError('hub registry signature 形状非法（期望 {algorithm: Ed25519, keyId, value}）')
    }
  }
  return doc as unknown as HubRegistry
}

export interface HubVerifyOptions {
  /** 验签公钥（与内置常量取并集；轮换窗口按 keyId 查找）。 */
  readonly keys?: readonly HubRegistryKey[]
  /** 跳过摘要/验签——只允许本地快照（source='local'），远程使用直接拒绝。 */
  readonly insecureNoVerify?: boolean
  readonly source: 'remote' | 'local'
}

export interface HubVerification {
  /** 摘要校验是否执行且通过。 */
  readonly snapshotVerified: boolean
  /** 是否携带签名且验签通过。 */
  readonly signed: boolean
  readonly keyId?: string
}

/**
 * 校验 registry：snapshotId 摘要（canonical payload sha256）默认强制；
 * signature 非 null 时强制 Ed25519 验签（keyId 未知/验签失败一律拒绝）。
 * `--insecure-no-verify` 只允许本地快照（远程使用直接抛错）。
 */
export function verifyHubRegistry(registry: HubRegistry, options: HubVerifyOptions): HubVerification {
  if (options.insecureNoVerify === true && options.source === 'remote') {
    throw new HubRegistryError('--insecure-no-verify 只允许对本地快照生效（远程 registry 必须校验）')
  }
  if (options.insecureNoVerify === true) {
    return { snapshotVerified: false, signed: false }
  }
  const payload = Buffer.from(canonicalJson(payloadOf(registry)))
  const digest = `sha256:${createHash('sha256').update(payload).digest('hex')}`
  if (digest !== registry.snapshotId) {
    throw new HubRegistryError(
      `hub registry 摘要校验失败（snapshotId 失配：声明 ${registry.snapshotId.slice(0, 19)}…，实算 ${digest.slice(0, 19)}…）`,
    )
  }
  if (registry.signature === null) {
    return { snapshotVerified: true, signed: false }
  }
  const keys = [...HUB_BUILTIN_KEYS, ...(options.keys ?? [])]
  const key = keys.find(candidate => candidate.keyId === (registry.signature as HubSignature).keyId)
  if (key === undefined) {
    throw new HubRegistryError(
      `hub registry 签名 keyId 未知：${(registry.signature as HubSignature).keyId}（内置/注入公钥中无此 key）`,
    )
  }
  const valid = ed25519Verify(
    null,
    payload,
    createPublicKey(key.publicKey),
    Buffer.from((registry.signature as HubSignature).value, 'base64'),
  )
  if (!valid) {
    throw new HubRegistryError(`hub registry Ed25519 验签失败（keyId ${key.keyId}）`)
  }
  return { snapshotVerified: true, signed: true, keyId: key.keyId }
}

// ---------------------------------------------------------------------------
// 拉取 / 降级
// ---------------------------------------------------------------------------

/** fetch 最小结构面（测试注入桩）。 */
export interface HubFetchResponse {
  readonly ok: boolean
  readonly status: number
  text(): Promise<string>
}

export type HubFetch = (url: string) => Promise<HubFetchResponse>

export type HubRegistrySource =
  | { readonly kind: 'remote'; readonly origin: string }
  | { readonly kind: 'snapshot'; readonly path: string }
  | { readonly kind: 'vendored' }

export interface HubLoadOptions {
  /** 显式本地快照（路径或 file:// URL）；给出时不拉远程。 */
  readonly snapshotPath?: string
  /** 跳过校验——仅本地快照生效（远程使用直接报错）。 */
  readonly insecureNoVerify?: boolean
  readonly fetchImpl?: HubFetch
  readonly origins?: readonly string[]
  readonly keys?: readonly HubRegistryKey[]
  /** 远程全部失败时降级 vendored 快照（默认 true）。 */
  readonly vendoredFallback?: boolean
}

export interface HubLoadResult {
  readonly registry: HubRegistry
  readonly source: HubRegistrySource
  readonly verification: HubVerification
  readonly warnings: readonly string[]
}

/** 包内 vendored 快照路径（assets/ 随包发布；src 与 lib 均距包根一级）。 */
export function vendoredSnapshotPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'registry-v1.json')
}

async function readSnapshot(path: string): Promise<string> {
  const file = path.startsWith('file://') ? fileURLToPath(path) : path
  return readFile(file, 'utf8')
}

/**
 * 加载 hub registry：显式本地快照优先；否则双 origin 依次拉取（首个
 * 校验通过者胜）；远程全部失败（含 NDA 期 OAuth 门禁 404）降级 vendored
 * 快照并告警。所有来源默认强制摘要/验签。
 */
export async function loadHubRegistry(options: HubLoadOptions = {}): Promise<HubLoadResult> {
  const keys = options.keys === undefined ? {} : { keys: options.keys }
  if (options.snapshotPath !== undefined) {
    const registry = parseHubRegistry(JSON.parse(await readSnapshot(options.snapshotPath)))
    const verification = verifyHubRegistry(registry, {
      ...keys,
      ...(options.insecureNoVerify === undefined ? {} : { insecureNoVerify: options.insecureNoVerify }),
      source: 'local',
    })
    return { registry, source: { kind: 'snapshot', path: options.snapshotPath }, verification, warnings: [] }
  }
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as HubFetch)
  const origins = options.origins ?? HUB_REGISTRY_ORIGINS
  const failures: string[] = []
  for (const origin of origins) {
    try {
      const response = await fetchImpl(origin)
      if (!response.ok) {
        failures.push(`${origin} → HTTP ${response.status}`)
        continue
      }
      const registry = parseHubRegistry(JSON.parse(await response.text()))
      const verification = verifyHubRegistry(registry, {
        ...keys,
        ...(options.insecureNoVerify === undefined ? {} : { insecureNoVerify: options.insecureNoVerify }),
        source: 'remote',
      })
      return { registry, source: { kind: 'remote', origin }, verification, warnings: [] }
    } catch (error) {
      failures.push(`${origin} → ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (options.vendoredFallback === false) {
    throw new HubRegistryError(`hub registry 拉取失败且已禁用 vendored 降级：${failures.join('；')}`)
  }
  const registry = parseHubRegistry(JSON.parse(await readSnapshot(vendoredSnapshotPath())))
  const verification = verifyHubRegistry(registry, { ...keys, source: 'local' })
  return {
    registry,
    source: { kind: 'vendored' },
    verification,
    warnings: [`远程 origin 全部不可达（${failures.join('；')}），降级 vendored 快照（revision ${registry.revision}）`],
  }
}

/** 同步加载包内 vendored 快照（插件激活面用；本地快照校验口径）。 */
export function loadVendoredHubSnapshot(): HubRegistry {
  // 同步读取仅服务激活路径（一次性本地文件）；校验与异步路径同规则。
  const registry = parseHubRegistry(JSON.parse(readFileSync(vendoredSnapshotPath(), 'utf8')))
  verifyHubRegistry(registry, { source: 'local' })
  return registry
}
