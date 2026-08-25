/**
 * dsh-model-proxy — route DSH model/web requests through a local proxy.
 *
 * The harness's LLM adapter (and web search, file uploads) call the global
 * `fetch`, which in Node 18+ is undici and honors the undici global
 * dispatcher (7.x: `Symbol.for('undici.globalDispatcher.2')`; `.1` is
 * legacy). This plugin swaps that dispatcher for an `undici.Agent` whose
 * custom `connect` (callback contract) opens a SOCKS5 or HTTP(S) CONNECT
 * tunnel to the upstream proxy — completing TLS itself for https targets —
 * so every global fetch goes through the proxy transparently: no
 * `DEEPSEEK_BASE_URL` redirect, no separate relay process. Loopback hosts
 * and `NO_PROXY` entries always connect directly.
 *
 * Proxy resolution: `config.proxy` (plugin config) → `$HTTP_PROXY` →
 * `$HTTPS_PROXY` → `$ALL_PROXY` → the Marisa desktop default. The resolved
 * proxy is also published as `HTTP_PROXY` for model-invoked shell children;
 * the model API endpoint itself is never rewritten.
 * @module dsh-model-proxy
 */

import { Agent, type Dispatcher } from 'undici'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import tls from 'node:tls'
import type { Socket } from 'node:net'
import { connectSocket, DEFAULT_NO_PROXY, displayProxy, firstEnv, parseProxy } from './tunnel.js'

export * from './tunnel.js'

export const name = 'dsh-model-proxy'

/** Marisa's local HTTP proxy endpoint when the launch environment has none. */
export const DEFAULT_PROXY_URL = 'http://127.0.0.1:10808'

export const Config = Schema.object({
  proxy: Schema.string()
    .description('上游代理 URL：socks5://、socks5h://、http://、https://（可带 user:pass），或 direct；留空则读 HTTP_PROXY → HTTPS_PROXY → ALL_PROXY，最后使用 Marisa 本地 HTTP 代理默认值')
    .default(''),
  noProxy: Schema.array(Schema.string())
    .description('命中则直连的主机（追加到环境变量 NO_PROXY 之上；localhost/127.0.0.1/::1 恒直连）')
    .default([]),
})

/** Validated plugin config. */
export interface Config {
  proxy?: string
  noProxy?: string[]
}

function publishShellProxy(proxyUrl: string): () => void {
  // PowerShell on Windows resolves environment names case-insensitively. On
  // POSIX publish both spellings because common CLI clients disagree on case.
  const keys = process.platform === 'win32' ? ['HTTP_PROXY'] : ['HTTP_PROXY', 'http_proxy']
  const previous = keys.map(key => process.env[key])
  for (const key of keys) process.env[key] = proxyUrl
  return () => {
    keys.forEach((key, index) => {
      const value = previous[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  }
}

/**
 * undici 的全局 dispatcher 符号是版本化的：7.x 用
 * `undici.globalDispatcher.2`，`.1` 是 legacy。Node ≥24 的内置 fetch 跟随
 * v2 符号（实测 Node 26.4：仅设 `.1` 时 fetch 忽略自定义 dispatcher）。
 * 两个都设，向后兼容旧内置 undici。
 */
const DISPATCHER_KEYS: readonly symbol[] = [
  Symbol.for('undici.globalDispatcher.2'),
  Symbol.for('undici.globalDispatcher.1'),
]

/**
 * Build a dispatcher whose connections go through `proxyUrl` (or directly
 * when `NO_PROXY`/`noProxyExtra` matches), install it as the undici global
 * dispatcher (v2 + legacy symbols), and return a `dispose` that restores the
 * previous dispatchers and closes the agent.
 * @throws when `proxyUrl` is not a valid proxy URL.
 */
export function createProxyDispatcher(proxyUrl: string, noProxyExtra: readonly string[] = []): { dispatcher: Dispatcher; display: string; dispose: () => Promise<void> } {
  const proxy = parseProxy(proxyUrl)
  const display = displayProxy(proxy)
  // undici 自定义 connector 是 (opts, callback) 回调契约（Options.port 为
  // string，Callback 是 rest 元组联合）；https 目标时由 connector 自己完成
  // TLS（undici 拿到 socket 后直接写 HTTP，不再包裹）。
  const connect = (
    opts: { hostname: string; protocol: string; port: string; servername?: string },
    callback: (err: Error | null, socket?: Socket | null) => void,
  ): void => {
    const port = opts.port ? Number(opts.port) : opts.protocol === 'https:' ? 443 : 80
    connectSocket(proxy, opts.hostname, port, noProxyExtra).then((raw) => {
      if (opts.protocol !== 'https:') return callback(null, raw)
      const tlsSock = tls.connect({ socket: raw, servername: opts.servername || opts.hostname })
      let done = false
      tlsSock.once('secureConnect', () => {
        done = true
        callback(null, tlsSock)
      })
      tlsSock.once('error', (err) => {
        if (done) return
        done = true
        tlsSock.destroy()
        callback(err, null)
      })
    }, (err) => callback(err, null))
  }
  // undici-types 的 connector.Callback 是 `(...args: [null, Socket] | [Error, null])`
  // 的 rest 元组形态，位置参数签名直接比较不兼容；经 unknown 断言（运行时契约一致）。
  const connectBound = connect as unknown as NonNullable<ConstructorParameters<typeof Agent>[0]>['connect']
  const dispatcher = new Agent({ connections: 16, connect: connectBound }) as Dispatcher
  const globals = globalThis as unknown as Record<symbol, unknown>
  const previous = DISPATCHER_KEYS.map(key => globals[key])
  for (const key of DISPATCHER_KEYS) globals[key] = dispatcher
  return {
    dispatcher,
    display,
    dispose: async () => {
      DISPATCHER_KEYS.forEach((key, index) => {
        if (globals[key] === dispatcher) globals[key] = previous[index]
      })
      await dispatcher.close()
    },
  }
}

/**
 * Install the proxying dispatcher as the undici global dispatcher, restoring
 * the previous value on dispose. No-op when no proxy is configured.
 */
export function apply(ctx: Context, config: Config): void {
  const logger = ctx.logger('model-proxy')
  const proxyUrl = (config.proxy ?? '').trim()
    || firstEnv('HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy')
    || DEFAULT_PROXY_URL
  if (!proxyUrl || /^(direct|none|off)$/i.test(proxyUrl)) {
    logger.info('no proxy configured — global fetch dispatcher untouched (direct)')
    return
  }

  let proxy: string
  try {
    parseProxy(proxyUrl) // 校验；非法则保持直连
    proxy = proxyUrl
  } catch (error) {
    logger.warn(`invalid proxy URL "${proxyUrl}": ${(error as Error).message} — staying direct`)
    return
  }

  const noProxyExtra = [
    ...DEFAULT_NO_PROXY,
    ...(config.noProxy ?? []),
    ...(firstEnv('NO_PROXY', 'no_proxy') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ]
  const { display, dispose } = createProxyDispatcher(proxy, noProxyExtra)
  const restoreShellProxy = publishShellProxy(proxy)
  logger.info(`global fetch dispatcher → via ${display}; shell HTTP_PROXY exported (noProxy: ${noProxyExtra.length} entries + loopback)`)

  ctx.effect(() => async () => {
    restoreShellProxy()
    await dispose()
  })
}
