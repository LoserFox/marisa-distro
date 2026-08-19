/**
 * extension 登记表（P6）：mygo 治理层的扩展登记面。扩展（如 fabric）登记
 * `{id, kind:'extension', 来源, 受管块标记, 包清单}`；启用态从 profile
 * patch 层的受管块标记推导（pnpm/patch 文件为唯一真相源，表内不存状态），
 * 版本视图取 profile manifest dependencies 子集。启停由扩展包经受管块
 * 写入/移除机制执行（如 @r05en1cu/dsh-mygo-ext-fabric）。
 * @module @r05en1cu/dsh-mygo/src/extensions
 */

/** 一条扩展登记（事实载体；不存启用态——启用态由 patch 层受管块推导）。 */
export interface ExtensionRegistration {
  /** 扩展 id（与受管块标记同源；`/^[a-z][a-z0-9-]*$/`）。 */
  readonly id: string
  readonly kind: 'extension'
  /** 分发来源说明（git spec 白名单 / 包名 / 本地路径）。 */
  readonly source: string
  /** profile patch 层受管块的起始标记注释（启用态推导锚）。 */
  readonly blockMarker: string
  /** 版本视图的包名清单（对照 profile dependencies）。 */
  readonly packages: readonly string[]
  readonly description?: string
}

/** 扩展治理视图（登记事实 + 推导的启用态与版本）。 */
export interface ExtensionView extends ExtensionRegistration {
  /** 启用态：profile patch 层含受管块标记。 */
  readonly enabled: boolean
  /** 已装版本（profile dependencies ∩ packages）。 */
  readonly versions: Readonly<Record<string, string>>
}

const EXTENSION_ID_RE = /^[a-z][a-z0-9-]*$/

/** extension 登记表（进程内；register 返回幂等注销器，随插件 fiber 清理）。 */
export class ExtensionRegistry {
  private readonly registrations = new Map<string, ExtensionRegistration>()

  register(registration: ExtensionRegistration): () => void {
    if (!EXTENSION_ID_RE.test(registration.id)) {
      throw new Error(`非法 extension id（须匹配 ${EXTENSION_ID_RE.source}）：${JSON.stringify(registration.id)}`)
    }
    if (registration.kind !== 'extension') {
      throw new Error(`非法 extension kind：${JSON.stringify(registration.kind)}`)
    }
    if (registration.blockMarker === '') {
      throw new Error(`extension ${registration.id} 缺 blockMarker（启用态推导锚）`)
    }
    if (this.registrations.has(registration.id)) {
      throw new Error(`extension ${registration.id} 已登记（重复登记拒绝）`)
    }
    this.registrations.set(registration.id, registration)
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (this.registrations.get(registration.id) === registration) {
        this.registrations.delete(registration.id)
      }
    }
  }

  get(id: string): ExtensionRegistration | undefined {
    return this.registrations.get(id)
  }

  /** 按 id 字典序（确定性）。 */
  list(): readonly ExtensionRegistration[] {
    return [...this.registrations.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  }
}

/** 由登记事实 + profile 治理事实推导扩展视图（纯函数）。 */
export function extensionViews(
  registrations: readonly ExtensionRegistration[],
  facts: { readonly patchText: string; readonly dependencies: Readonly<Record<string, string>> },
): readonly ExtensionView[] {
  return registrations.map(registration => {
    const versions: Record<string, string> = {}
    for (const name of registration.packages) {
      const spec = facts.dependencies[name]
      if (spec !== undefined) versions[name] = spec
    }
    return {
      ...registration,
      enabled: facts.patchText.includes(registration.blockMarker),
      versions,
    }
  })
}
