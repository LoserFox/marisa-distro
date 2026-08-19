/**
 * hub collections 原子安装（P5）：collection 的全部 items 作为单个
 * candidate 顺序安装；任一项失败 → 已装项逆序卸载，整组丢弃（对齐 hub
 * 语义：collections 只收录 profile-bundle 条目，registry-core 构建期已
 * 强制）。
 * @module @r05en1cu/dsh-mygo-loader-hub/collections
 */

import type { InstallIntent, InstallReceipt, InstallTarget } from '@r05en1cu/dsh-mygo-api'
import type { HubRegistry } from './registry.ts'
import { translateHubInstall } from './intent.ts'

/** collection 执行面（profile adapter 的 install/uninstall 子集）。 */
export interface HubCollectionExecutor {
  install(intent: InstallIntent, target: InstallTarget): Promise<InstallReceipt>
  uninstall(name: string, target: InstallTarget): { readonly ok: boolean; readonly error?: string | undefined } | Promise<{ readonly ok: boolean; readonly error?: string | undefined }>
}

export interface HubCollectionInstallResult {
  readonly ok: boolean
  readonly collection: string
  /** 已安装（ok 时）或已回滚（失败时）的包名清单。 */
  readonly installed: readonly string[]
  readonly error?: string
}

/**
 * 原子安装一个 collection：任一 item 失败即逆序回滚已装项，整组丢弃。
 * 回滚自身失败如实并入错误文案（不二次掩盖原始失败）。
 */
export async function installHubCollection(
  registry: HubRegistry,
  collectionId: string,
  executor: HubCollectionExecutor,
  target: InstallTarget,
  options: { readonly allowFileSpec?: boolean } = {},
): Promise<HubCollectionInstallResult> {
  const collection = registry.collections.find(candidate => candidate.id === collectionId)
  if (collection === undefined) {
    return { ok: false, collection: collectionId, installed: [], error: `collection 不存在：${collectionId}` }
  }
  const installed: string[] = []
  for (const item of collection.items) {
    const translated = await translateHubInstall(
      { mode: 'profile-bundle', adapter: 'official-profile/v1', packageName: item.packageName, spec: item.spec },
      options.allowFileSpec === undefined ? {} : { allowFileSpec: options.allowFileSpec },
    )
    if (translated.kind !== 'pnpm') {
      return { ok: false, collection: collectionId, installed, error: `${item.projectId}: ${translated.reason}` }
    }
    const receipt = await executor.install(
      { kind: 'pnpm', spec: translated.spec },
      target,
    )
    if (!receipt.ok) {
      const rollbackErrors: string[] = []
      for (const name of [...installed].reverse()) {
        const outcome = await executor.uninstall(name, target)
        if (!outcome.ok) rollbackErrors.push(`${name}: ${outcome.error ?? '卸载失败'}`)
      }
      return {
        ok: false,
        collection: collectionId,
        installed,
        error: `item ${item.projectId} 安装失败（${receipt.error?.message ?? '未知错误'}），整组已回滚${rollbackErrors.length === 0 ? '' : `；回滚残留：${rollbackErrors.join('；')}`}`,
      }
    }
    installed.push(item.packageName)
  }
  return { ok: true, collection: collectionId, installed }
}
