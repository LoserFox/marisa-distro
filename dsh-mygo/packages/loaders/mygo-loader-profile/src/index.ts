/**
 * mygo profile LoaderAdapter（P5 默认 loader）：P3 安装执行面（profile
 * 目录 pnpm + dsh.bundle 对账 + patch 层启停块）收敛为 LoaderAdapter
 * 契约实现；所有其他 loader 的最终执行面。
 * @module @r05en1cu/dsh-mygo-loader-profile
 */

export {
  detectIgnoredBuildKeys,
  ensureProfilePnpmSettings,
  isBuildPolicyBlock,
  isExoticSubdepBlock,
  profileInstall,
  profileSetEnabled,
  profileUninstall,
} from './face.ts'
export type { ProfileExecOptions, ProfileExecResult } from './face.ts'
export { createProfileLoaderAdapter, resolveProfileSpec } from './adapter.ts'
export type { ProfileInstallReceipt, ProfileLoaderAdapter } from './adapter.ts'
