// pet 服务信号器（开放性窄缝）：轻量发布/订阅，供其他插件 ctx.pet.onSignal 消费。
// 零宿主依赖、可单测。契约：subscribe(fn) 返回退订；emit(signal, payload) 遍历订阅者，
// 订阅者异常隔离（单个订阅者抛错不影响其余与宠物本体）。
export function createSignals() {
  const listeners = new Set()
  return {
    /** 订阅信号；返回退订函数。fn(signal, payload)。 */
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    /** 广播信号；订阅者异常被隔离（不影响其他订阅者）。 */
    emit(signal, payload = {}) {
      for (const fn of [...listeners]) {
        try {
          fn(signal, payload)
        } catch {
          // 订阅者异常隔离
        }
      }
    },
    /** 当前订阅数（测试/诊断用）。 */
    size() {
      return listeners.size
    },
  }
}
