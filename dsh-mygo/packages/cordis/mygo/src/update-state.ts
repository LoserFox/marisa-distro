/**
 * 热重载状态保持（P7-A5）：0812 `entry.update` 事务化重放路径的插件层
 * 接线。评估结论：**无需 host 缝**——cordis `fiber.update()` 在重启前先
 * 跑 `internal/update` 瀑布（vendor/cordis fiber.ts:728-752，注释明示
 * 「update hooks can veto or replace the restart」），插件在瀑布里
 * capture → next()（默认重启）→ 新代 apply 从暂存槽 restore 即可保有
 * 状态。本模块把该模式收敛为一个 helper。
 *
 * 适用面：config-only 更新（fiber.update 路径，模块不重新 import，
 * 模块级暂存槽有效）；name/inject/group 变更走 entry 的 dispose+start
 * 全替换路径，loader 按 URL 缓存模块时同样有效。
 * @module @r05en1cu/dsh-mygo/src/update-state
 */

/** 状态交接钩子：capture 在重启前调用，restore 在新代 apply 时调用。 */
export interface UpdateStateHooks<T> {
  /** 暂存槽键（插件 id；同一模块实例内唯一）。 */
  readonly key: string
  /** 重启前捕获当前代状态。 */
  capture(): T
  /** 新代启动时恢复（仅在有暂存状态时调用一次）。 */
  restore(state: T): void
}

/** `internal/update` 监听面的最小结构（cordis Context 的 on 子集）。 */
export interface UpdateStateHost {
  on(
    event: 'internal/update',
    listener: (config: unknown, noSave: boolean, next: () => void | Promise<void>) => unknown,
  ): unknown
}

/** 模块级暂存槽（fiber.update 路径模块不重 import，槽跨代存活）。 */
const SAVED = new Map<string, unknown>()

/**
 * 在插件 apply 内调用：有暂存状态则先行 restore（消费即删），并注册
 * `internal/update` 监听——重启前 capture 入槽；重启失败（回滚旧代）
 * 时若槽已被失败的新代消费则回补，保证回滚代仍能拿到状态。
 */
export function preserveStateAcrossUpdate<T>(ctx: UpdateStateHost, hooks: UpdateStateHooks<T>): void {
  const pending = SAVED.get(hooks.key)
  if (pending !== undefined) {
    SAVED.delete(hooks.key)
    hooks.restore(pending as T)
  }
  ctx.on('internal/update', async (_config, _noSave, next) => {
    const captured = hooks.capture()
    SAVED.set(hooks.key, captured)
    try {
      await next()
    } catch (error) {
      if (!SAVED.has(hooks.key)) SAVED.set(hooks.key, captured)
      throw error
    }
  })
}
