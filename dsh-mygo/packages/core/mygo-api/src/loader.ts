/**
 * LoaderAdapter 契约（P2 新增，为 P5 loader 扩展体系铺路）：一种安装来源
 * 一个适配器。`resolve` 把外部 spec 翻译成安装意图；`install` 执行落盘；
 * `list` 可选枚举来源侧条目。设计目标是最小面：InstallIntent 三态覆盖
 * pnpm spec / mygo-pack 文件 / 仅展示（不可安装）。
 * @module @r05en1cu/dsh-mygo-api/src/loader
 */

import type { PluginErrorCode } from './error.ts'

/**
 * 安装意图三态：pnpm spec（交给 pnpm/profile 机制）、pack 文件（mygo-pack/v1
 * 本地还原）、display（展示-only，不可安装——原因由 `reason` 携带）。
 */
export type InstallIntent =
  | { readonly kind: 'pnpm'; readonly spec: string }
  | { readonly kind: 'pack'; readonly path: string }
  | { readonly kind: 'display'; readonly reason: string }

/** 安装目标（profile 粒度的宿主事实）。 */
export interface InstallTarget {
  readonly home: string
  readonly profile: string
  /**
   * rc8 registry auth：调用方解析好的子进程 env 增量（profile `.npmrc`
   * 受管块 `${REF}` 占位经官方 credentials 服务按操作解析）；缺省透传
   * process.env。
   */
  readonly env?: Readonly<Record<string, string>>
}

/** 一次安装的回执。 */
export interface InstallReceipt {
  readonly ok: boolean
  /** 安装产物的插件 id（成功时）。 */
  readonly id?: string
  readonly version?: string
  /**
   * 激活态（r7 live rail）：live = 运行期已激活（host patch 重放）；
   * pending-restart = 下次 boot 物化。缺省 = 实现方未判定。
   */
  readonly activated?: 'live' | 'pending-restart'
  /** 非阻断告警（社区依赖、双存在等）。 */
  readonly warnings?: readonly string[]
  /** 失败时的结构化错误（code 取自 PluginError 闭表）。 */
  readonly error?: { readonly code: PluginErrorCode; readonly message: string }
}

/** 来源侧枚举条目（`list` 的最小展示面）。 */
export interface RegistryEntry {
  readonly name: string
  readonly version?: string
  readonly description?: string
}

/**
 * 一种安装来源的适配器（`'profile' | 'hub' | …`）。实现方 MUST 保持
 * 确定性：同一 spec 的 resolve 结果稳定；install 的失败不得留半成品。
 */
export interface LoaderAdapter {
  readonly id: string
  /** 把外部 spec 翻译为安装意图；不识别返回 null（交给下一个适配器）。 */
  resolve(spec: string): InstallIntent | null
  /** 执行安装意图；全部校验先于任何落盘写入。 */
  install(intent: InstallIntent, target: InstallTarget): Promise<InstallReceipt>
  /** 可选：枚举来源侧条目（registry/hub 检索面）。 */
  list?(query?: string): Promise<readonly RegistryEntry[]>
}
