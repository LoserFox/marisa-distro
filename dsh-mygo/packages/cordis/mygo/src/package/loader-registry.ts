/**
 * loader 契约层（《第二轮增强》9/13 条）：mygo 核心只持有契约注册表，
 * 挂载语义（standard / mixin）经契约注入；v1 仅内置两个实现，禁止插件自举。
 * @module @r05en1cu/dsh-mygo/src/package/loader-registry
 */

import type { LoaderDeclaration } from './manifest-v2.ts'
import { isValidRange, matchesVersionRange } from '../semver-range.ts'

/** One mount/unmount capability set a loader provides. */
export interface LoaderContract {
  readonly id: string
  readonly version: string
  readonly capabilities: readonly string[]
}

/** Built-in loaders (v1; loader 插件化留 v2，本阶段禁止实现）。 */
export const BUILTIN_LOADERS: readonly LoaderContract[] = [
  { id: 'standard', version: '1.0.0', capabilities: ['mount', 'unmount'] },
  { id: 'mixin', version: '1.0.0', capabilities: ['mount', 'unmount', 'transform', 'patch'] },
]

export interface LoaderValidation {
  readonly ok: boolean
  readonly reason?: string
}

/** Validate a manifest loader declaration against the built-in registry. */
export function validateLoaderDeclaration(declaration: LoaderDeclaration | undefined): LoaderValidation {
  if (declaration === undefined) {
    // 缺省 standard；未声明兼容区间允许警告放行（与 core 一致）。
    return { ok: true }
  }
  const contract = BUILTIN_LOADERS.find(loader => loader.id === declaration.id)
  if (contract === undefined) {
    return { ok: false, reason: `未知 loader ${declaration.id}（v1 内置 standard/mixin）` }
  }
  if (!isValidRange(declaration.range)) {
    return { ok: false, reason: `loader ${declaration.id} 区间非法：${declaration.range}` }
  }
  if (!matchesVersionRange(contract.version, declaration.range)) {
    return {
      ok: false,
      reason: `loader ${declaration.id}@${contract.version} 不满足插件声明 ${declaration.range}`,
    }
  }
  return { ok: true }
}
