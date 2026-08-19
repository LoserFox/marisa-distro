/**
 * 面板事件通道（rc8 + P2 plughub operation 体验）：`/api/mygo/events`
 * SSE 端点承载 live rail 装卸帧与安装/更新/卸载操作状态帧。连接时先发
 * snapshot，之后每次操作状态变化广播。帧格式为 `data: <json>\n\n`。
 * live 轨装卸成功（含运行期 dispose 验证通过）后向打开中的页面推
 * `{ type: 'live-rail', op, id, url? }` 帧——浏览器半据此页内挂载/拆卸
 * client 行，打开中的页面免刷新。帧格式与 host `/plugins/events` 同款
 * （`data: <json>\n\n`）；host graph 帧不广播（EXT-4 提案未合入），本通道
 * 只承载 mygo 自己 live 轨的操作，与 EXT-4 合入后的 graph 帧并存不冲突
 * （graph 帧管全量图，本帧只管 live 轨操作）。
 * @module @r05en1cu/dsh-mygo-ext-panel/live-events
 */

/** 一帧 live rail 事件（id = graph 行 id = 包名；url = client bundle 地址）。 */
export interface LiveRailFrame {
  readonly type: 'live-rail'
  readonly op: 'mount' | 'unmount'
  readonly id: string
  readonly url?: string
}

/** 操作类别（P2：目录/配置/操作体验迁移）。 */
export type PanelOperationKind = 'install' | 'update' | 'uninstall' | 'enable' | 'disable' | 'config'

/** 一条操作状态。日志为错误/输出尾部，边界固定。 */
export interface PanelOperation {
  readonly id: number
  readonly kind: PanelOperationKind
  readonly name: string
  readonly status: 'running' | 'ok' | 'failed'
  readonly error?: string
  readonly log: readonly string[]
}

/** 面板事件帧全集。 */
export type PanelEvent =
  | LiveRailFrame
  | { readonly type: 'operation'; readonly operation: PanelOperation; readonly restartRequired: boolean }
  | { readonly type: 'snapshot'; readonly operations: readonly PanelOperation[]; readonly restartRequired: boolean }

/** SSE 连接的最小响应面（面板 RawResponse 之外的写/关闭面）。 */
interface SseResponse {
  writeHead(status: number, headers: Record<string, string>): void
  write(chunk: string): unknown
  on(event: 'close', listener: () => void): void
}

/** 面板 webServer 注册面（与 index.ts 的 WebServerLike 同形）。 */
interface WebServerLike {
  register(route: {
    kind?: 'exact' | 'prefix'
    path: string
    handler(req: unknown, res: unknown): void | Promise<void>
  }): () => void
}

/** live rail 事件端点路径（client 半订阅同址）。 */
export const LIVE_EVENTS_PATH = '/api/mygo/events'

const connections = new Set<SseResponse>()
const operations: PanelOperation[] = []
let nextOperationId = 1
let restartRequired = false

/** 当前挂接的 SSE 连接数（测试断言用）。 */
export function liveEventsConnectionCount(): number {
  return connections.size
}

/** 当前操作快照（测试断言用）。 */
export function panelOperationsSnapshot(): readonly PanelOperation[] {
  return [...operations]
}

/** 重启横幅状态（测试断言用）。 */
export function panelRestartRequired(): boolean {
  return restartRequired
}

/** 广播任意事件帧。 */
export function broadcastEvent(event: PanelEvent): void {
  const line = `data: ${JSON.stringify(event)}\n\n`
  for (const res of connections) res.write(line)
}

/** 开始一条操作并广播 running 帧。 */
export function beginPanelOperation(kind: PanelOperationKind, name: string): PanelOperation {
  const operation: PanelOperation = { id: nextOperationId, kind, name, status: 'running', log: [] }
  nextOperationId += 1
  operations.push(operation)
  if (operations.length > 30) operations.splice(0, operations.length - 30)
  broadcastEvent({ type: 'operation', operation, restartRequired })
  return operation
}

/** 结束一条操作并广播 ok/failed 帧。 */
export function finishPanelOperation(
  operation: PanelOperation,
  status: 'ok' | 'failed',
  error?: string,
  needsRestart = false,
): void {
  const next: PanelOperation = {
    ...operation,
    status,
    ...(error === undefined ? {} : { error }),
    log: error === undefined ? [] : [error.slice(0, 500)],
  }
  const index = operations.findIndex(candidate => candidate.id === operation.id)
  if (index === -1) operations.push(next)
  else operations[index] = next
  if (needsRestart) restartRequired = true
  broadcastEvent({ type: 'operation', operation: next, restartRequired })
}

/** 清除重启横幅（刷新/重启后由客户端或下一次启动自然重置）。 */
export function clearPanelRestartRequired(): void {
  restartRequired = false
}

/** 从 host clientModules 图取行 url（服务不可达/行不在图/读图失败 → undefined）。 */
export function liveRowUrlOf(get: (name: string) => unknown, id: string): string | undefined {
  try {
    const modules = get('clientModules') as {
      graph(): { readonly entries: readonly { readonly id: string; readonly url: string }[] }
    } | undefined
    return modules?.graph().entries.find(entry => entry.id === id)?.url
  } catch {
    return undefined
  }
}

/** 广播一帧 live rail 到全部打开中的页面（无连接时 no-op）。 */
export function broadcastLiveRail(frame: LiveRailFrame): void {
  broadcastEvent(frame)
}

/** 读栅栏签名：SSE 是 GET，只接受同源/受信 Host。 */
export type LiveEventsReadGuard = (req: unknown) => boolean

/** 注册 `/api/mygo/events` SSE 端点（exact 先于 /api/mygo prefix 匹配）。 */
export function registerLiveEventsRoute(
  webServer: WebServerLike,
  readGuard: LiveEventsReadGuard = () => true,
): void {
  webServer.register({
    kind: 'exact',
    path: LIVE_EVENTS_PATH,
    handler: (req: unknown, res: unknown) => {
      const method = (req as { readonly method?: unknown }).method
      const response = res as SseResponse
      if (!readGuard(req)) {
        response.writeHead(403, { 'content-type': 'application/json' })
        response.write(JSON.stringify({ ok: false, error: 'forbidden' }))
        return
      }
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, {})
        return
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        'connection': 'keep-alive',
      })
      // 注释行开路：无帧期间连接也可被客户端/代理视为存活（EventSource
      // 解析天然跳过注释行；与 host /plugins/events 同形态）。
      response.write(': connected\n\n')
      response.write(`data: ${JSON.stringify({ type: 'snapshot', operations: [...operations], restartRequired })}\n\n`)
      connections.add(response)
      response.on('close', () => { connections.delete(response) })
    },
  })
}
