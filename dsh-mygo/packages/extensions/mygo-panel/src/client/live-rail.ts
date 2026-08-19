/**
 * live rail 页内图变更（rc8）：订阅面板 SSE（/api/mygo/events），把
 * mount/unmount 帧页内应用为 client 行的挂载/拆卸——打开中的页面免刷新
 * 看到 live 装卸的插件 UI。动词全部复用 client-hmr 同款（reload 的
 * invalidate/prefetch 序与 registry-first 拆卸；EXT-4 提案同口径）：
 *
 * - mount：invalidate（清陈旧工厂/记录）→ prefetch（boot 图表内行）或
 *   直接 script 加载 bundle 注册工厂（新行不在 boot 图表——运行期新增的
 *   图行进不了浏览器静态表，工厂注册后 loader.create 经 internal.import
 *   的已注册工厂分支物化）→ `loader.create({ name })`（boot 路径同款）；
 * - unmount：registry-first 删 callback（避免 Loader 自处置分支把条目标
 *   disabled）→ drain inertia → 清 fiber → removeOwnedStyles（
 *   `style[data-plugin]` 属性逐字比较）→ `loader.remove`；
 * - 串行 queue（client-hmr 同款），失败 warn 并提示刷新页面兜底。
 *
 * loader/modules 服务不可达（headless 等环境）时不订阅、不报错。
 * @module @r05en1cu/dsh-mygo-ext-panel/client/live-rail
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** 一帧 live rail 事件（与 node 半 live-events.ts 同形，跨端各自声明）。 */
export interface LiveRailFrame {
  readonly type: 'live-rail'
  readonly op: 'mount' | 'unmount'
  readonly id: string
  readonly url?: string
}

interface FiberLike {
  readonly runtime: { readonly callback: unknown } | null
  readonly inertia?: Promise<unknown>
}

interface LoaderEntryLike {
  readonly id: string
  readonly options: { readonly name?: unknown }
  fiber?: FiberLike | undefined
  readonly ctx: { readonly registry: { delete(key: unknown): unknown } }
}

interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
  create(options: { readonly name: string }): Promise<string>
  remove(id: string): Promise<void>
}

interface ModulesLike {
  invalidate(id: string): void
  prefetch(id: string): Promise<void>
}

export interface LiveRailClientDeps {
  readonly loader: LoaderLike
  readonly modules: ModulesLike
  /** bundle 加载（缺省 script 标签注入；测试注入桩）。 */
  readonly loadBundle?: (url: string) => Promise<void>
  /** 撤样式（缺省 `style[data-plugin]` 逐字比较；测试注入桩）。 */
  readonly removeStyles?: (id: string) => void
  readonly warn?: (message: string) => void
}

/** 按 options.name 找 loader 条目（client-hmr findEntry 同款）。 */
function findEntry(loader: LoaderLike, id: string): LoaderEntryLike | undefined {
  for (const entry of loader.entries()) {
    if (entry.options.name === id) return entry
  }
  return undefined
}

/** 移除 id 拥有的全部 `style[data-plugin]` 标签（属性逐字比较）。 */
function removeOwnedStyles(id: string): void {
  for (const el of document.querySelectorAll('style[data-plugin]')) {
    if (el.getAttribute('data-plugin') === id) el.remove()
  }
}

/** 缺省 bundle 加载：script 标签注入（执行即注册工厂，副作用在物化期）。 */
function loadBundleViaScript(url: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const el = document.createElement('script')
    el.src = url
    el.onload = () => resolvePromise()
    el.onerror = () => reject(new Error(`client bundle 加载失败：${url}`))
    document.head.appendChild(el)
  })
}

/**
 * 构造 live rail 帧处理器（串行 queue；帧处理失败不阻断后续帧）。
 * 返回的函数喂给 EventSource message 事件。
 */
export function createLiveRailHandler(deps: LiveRailClientDeps): (frame: LiveRailFrame) => void {
  const { loader, modules } = deps
  const loadBundle = deps.loadBundle ?? loadBundleViaScript
  const removeStyles = deps.removeStyles ?? removeOwnedStyles
  const warn = deps.warn ?? ((message: string) => { console.warn(message) })

  async function mount(id: string, url?: string): Promise<void> {
    if (findEntry(loader, id) !== undefined) return // 已挂载：幂等
    modules.invalidate(id) // 防御：清陈旧工厂/物化记录（从未挂载时 no-op）
    try {
      await modules.prefetch(id) // boot 图表内行（卸载后重装等场景）
    } catch {
      // 新行不在 boot 图表（prefetch 对未知行 loud throw）：直接加载 bundle
      // 注册工厂，loader.create 的 import 走已注册工厂分支物化。
      await loadBundle(url ?? `/plugins/${id}/client.js`)
    }
    await loader.create({ name: id })
  }

  async function unmount(id: string): Promise<void> {
    const entry = findEntry(loader, id)
    if (entry === undefined) return // 未挂载：幂等
    const oldFiber = entry.fiber
    if (oldFiber !== undefined) {
      // registry-first：运行记录先删，fiber 拆卸的 internal/plugin 才不会
      // 把条目标 disabled（client-hmr 模块注释载明的顺序）。
      const runtime = oldFiber.runtime
      if (runtime !== null) entry.ctx.registry.delete(runtime.callback)
      while (oldFiber.inertia !== undefined) await oldFiber.inertia
      delete entry.fiber
    }
    removeStyles(id)
    await loader.remove(entry.id)
  }

  let queue: Promise<void> = Promise.resolve()
  return (frame) => {
    if (frame.type !== 'live-rail') return
    const task = frame.op === 'mount' ? mount(frame.id, frame.url) : unmount(frame.id)
    queue = queue.then(() => task).catch((error: unknown) => {
      warn(`[dsh-mygo-panel] live rail 页内${frame.op === 'mount' ? '挂载' : '拆卸'} ${frame.id} 失败（刷新页面可恢复）：${String(error)}`)
    })
  }
}

/**
 * 挂载 live rail 页内通道：loader/modules 任一不可达（headless 等）则
 * 整体不订阅、不报错。
 */
export function applyLiveRailHmr(ctx: ClientContext): void {
  const loader = ctx.get('loader') as LoaderLike | undefined
  const modules = ctx.get('modules') as ModulesLike | undefined
  if (loader === undefined || modules === undefined) return
  const handle = createLiveRailHandler({
    loader,
    modules,
    warn: message => console.warn(message),
  })
  ctx.effect(() => {
    const source = new EventSource('/api/mygo/events')
    source.addEventListener('message', (event: MessageEvent<string>) => {
      let frame: LiveRailFrame
      try {
        frame = JSON.parse(event.data) as LiveRailFrame
      } catch {
        console.warn('[dsh-mygo-panel] 无法解析的 live rail 事件帧：', event.data)
        return
      }
      handle(frame)
    })
    return () => { source.close() }
  }, 'mygo-panel: live rail events')
}
