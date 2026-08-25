#!/usr/bin/env node
/**
 * model-proxy — 零依赖本地模型请求转发代理（仅 Node 标准库）。
 *
 * 用途：让 DSH / 任意 OpenAI 兼容客户端的模型请求走本地 socks5/http 代理。
 * 两种工作模式（同一端口）：
 *   1. relay 模式（默认）：
 *      - 请求行是相对路径（如 /v1/chat/completions）→ 转发到 --target 的 origin；
 *      - 请求行是绝对 URL（正向代理风格）→ 原样转发到该 URL。
 *      DSH 侧只需把 DEEPSEEK_BASE_URL 指向本代理即可，路径/查询/请求头/流式
 *      SSE/文件上传全部透传。
 *   2. CONNECT 模式：任何 HTTP 客户端把本代理当作普通正向代理使用（隧道直通）。
 *
 * 上游代理取值优先级：--proxy 参数 > $MODEL_PROXY > $ALL_PROXY > $HTTPS_PROXY
 * > $HTTP_PROXY。支持 socks5://、socks5h://、http://、https://（可带 user:pass），
 * 或 direct/none 表示直连。目标主机命中 $NO_PROXY（逗号分隔，支持 .后缀 与
 * host:port）时直连。
 *
 * 仅监听 127.0.0.1（--host 可改，但对外暴露=局域网内任意机器可用本代理）。
 */

import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { URL } from 'node:url'

const VERSION = '1.0.0'
const DEFAULT_TARGET = 'https://api.deepseek.com'
const HANDSHAKE_TIMEOUT_MS = 15_000

// ────────────────────────── 配置解析 ──────────────────────────

function env(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`)
      return argv[++i]
    }
    switch (arg) {
      case '--port': out.port = Number(value()); break
      case '--host': out.host = value(); break
      case '--target': out.target = value(); break
      case '--proxy': out.proxy = value(); break
      case '--quiet': out.quiet = true; break
      case '--status': out.status = true; break
      case '--check': out.check = true; break
      case '--help':
      case '-h': out.help = true; break
      default: throw new Error(`unknown argument: ${arg}`)
    }
  }
  return out
}

function parseProxy(raw) {
  if (!raw) return { direct: true }
  if (/^(direct|none|off)$/i.test(raw.trim())) return { direct: true }
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error(`invalid proxy URL: ${raw}`)
  }
  const scheme = u.protocol.slice(0, -1).toLowerCase()
  if (!['socks5', 'socks5h', 'http', 'https'].includes(scheme)) {
    throw new Error(
      `unsupported proxy scheme "${scheme}" in ${raw} (use socks5://, http://, https://, or direct)`,
    )
  }
  const defaultPort = scheme === 'https' ? 443 : scheme.startsWith('socks') ? 1080 : 80
  return {
    scheme,
    host: u.hostname,
    port: u.port ? Number(u.port) : defaultPort,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  }
}

function resolveProxy(cliProxy) {
  if (cliProxy !== undefined) return parseProxy(cliProxy)
  return parseProxy(env('MODEL_PROXY', 'ALL_PROXY', 'all_proxy', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'))
}

function proxyDisplay(proxy) {
  if (!proxy || proxy.direct) return 'direct'
  const auth = proxy.username ? `${proxy.username}:***@` : ''
  return `${proxy.scheme}://${auth}${proxy.host}:${proxy.port}`
}

function inNoProxy(host, port) {
  const raw = env('NO_PROXY', 'no_proxy')
  if (!raw) return false
  if (raw.trim() === '*') return true
  for (const entry of raw.split(',')) {
    const e = entry.trim().toLowerCase()
    if (!e) continue
    let eHost = e
    let ePort
    const colon = e.lastIndexOf(':')
    if (colon > 0 && !e.includes(']')) {
      eHost = e.slice(0, colon)
      ePort = e.slice(colon + 1)
    }
    const h = host.toLowerCase()
    const hostMatch = eHost === h || (eHost.startsWith('.') && h.endsWith(eHost))
    if (hostMatch && (ePort === undefined || String(ePort) === String(port))) return true
  }
  return false
}

// ────────────────────────── 隧道建立 ──────────────────────────

const debug = !!env('MODEL_PROXY_DEBUG')
function dbg(...args) {
  if (debug) console.log('[model-proxy:debug]', ...args)
}

/** 精确读取 n 字节（带超时），用于握手阶段；多读的字节留给下一次 read。 */
function makeReader(sock, timeoutMs = HANDSHAKE_TIMEOUT_MS) {
  let buffer = Buffer.alloc(0)
  let waiter = null
  const failAll = (err) => {
    if (!waiter) return
    const w = waiter
    waiter = null
    clearTimeout(w.timer)
    w.reject(err)
  }
  const onData = (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    if (!waiter || buffer.length < waiter.n) return
    const w = waiter
    waiter = null
    clearTimeout(w.timer)
    const out = buffer.subarray(0, w.n)
    buffer = buffer.subarray(w.n)
    w.resolve(out)
  }
  sock.on('data', onData)
  sock.on('error', failAll)
  sock.on('end', () => failAll(new Error('proxy closed during handshake')))
  return {
    read(n) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => failAll(new Error('tunnel handshake timeout')), timeoutMs)
        waiter = { n, resolve, reject, timer }
        onData(Buffer.alloc(0)) // 先尝试用已缓冲的字节
      })
    },
    destroy() {
      sock.removeListener('data', onData)
      sock.removeListener('error', failAll)
      sock.removeListener('end', failAll)
    },
  }
}

/** 建立到目标 host:port 的 socks5 隧道。socks5h 语义相同（域名交给代理解析）。 */
function socks5Connect(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(proxy.port, proxy.host)
    const reader = makeReader(sock)
    const fail = (err) => {
      reader.destroy()
      sock.destroy()
      reject(err)
    }
    sock.once('error', fail)
    sock.once('connect', () => {
      const withAuth = proxy.username !== undefined
      sock.write(Buffer.from([0x05, withAuth ? 0x02 : 0x01, 0x00, ...(withAuth ? [0x02] : [])]))
      reader.read(2)
        .then(([ver, method]) => {
          if (ver !== 0x05) throw new Error(`socks5: bad version ${ver}`)
          if (method === 0x02) {
            const user = Buffer.from(proxy.username, 'utf8')
            const pass = Buffer.from(proxy.password ?? '', 'utf8')
            sock.write(Buffer.concat([
              Buffer.from([0x01, user.length]),
              user,
              Buffer.from([pass.length]),
              pass,
            ]))
            return reader.read(2).then(([aVer, status]) => {
              if (aVer !== 0x01 || status !== 0x00) throw new Error(`socks5: auth failed (status ${status})`)
            })
          }
          if (method === 0x00) return
          throw new Error(`socks5: no acceptable auth method (${method})`)
        })
        .then(() => {
          let atyp
          let addr
          const ip = net.isIP(host)
          if (ip === 4) {
            atyp = 0x01
            addr = host.split('.').map(Number)
          } else if (ip === 6) {
            atyp = 0x04
            addr = [...Buffer.from(host, 'hex')]
          } else {
            atyp = 0x03
            addr = [host.length, ...Buffer.from(host, 'utf8')]
          }
          sock.write(Buffer.from([0x05, 0x01, 0x00, atyp, ...addr, (port >> 8) & 0xff, port & 0xff]))
          return reader.read(4)
        })
        .then(([ver, rep, , atyp]) => {
          if (ver !== 0x05) throw new Error(`socks5: bad reply version ${ver}`)
          if (rep !== 0x00) {
            const reasons = {
              0x01: 'general failure', 0x02: 'not allowed', 0x03: 'network unreachable',
              0x04: 'host unreachable', 0x05: 'connection refused', 0x06: 'ttl expired',
              0x07: 'command not supported', 0x08: 'address type not supported',
            }
            throw new Error(`socks5: connect failed (${reasons[rep] ?? rep})`)
          }
          const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : 1
          return reader.read(addrLen + 2)
        })
        .then((bound) => {
          let boundAddr = ''
          try {
            if (bound.length >= 3) {
              const atyp = bound[0]
              boundAddr = atyp === 0x01
                ? [...bound.subarray(1, 5)].join('.')
                : atyp === 0x03
                  ? bound.subarray(2, 2 + bound[1]).toString('utf8')
                  : `ipv6:${bound.subarray(1).toString('hex')}`
            }
          } catch {
            // 仅用于调试展示
          }
          reader.destroy()
          dbg(`socks5 CONNECT ${host}:${port} → bound ${boundAddr} (${proxy.host}:${proxy.port})`)
          // 握手完成；防止后续 error 无监听抛异常（真正的事件处理由调用方挂载）。
          sock.on('error', () => {})
          resolve(sock)
        })
        .catch(fail)
    })
  })
}

/** 建立到目标 host:port 的 http(s) 代理 CONNECT 隧道。 */
function httpProxyConnect(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const base = net.connect(proxy.port, proxy.host)
    const fail = (err) => {
      base.destroy()
      reject(err)
    }
    base.once('error', fail)
    const wrap = proxy.scheme === 'https'
      ? new Promise((res, rej) => {
          const tlsSock = tls.connect({ socket: base, servername: proxy.host })
          tlsSock.once('secureConnect', () => res(tlsSock))
          tlsSock.once('error', rej)
        })
      : Promise.resolve(base)
    wrap.then((sock) => {
      const reader = makeReader(sock)
      const auth = proxy.username !== undefined
        ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ''}`).toString('base64')}\r\n`
        : ''
      sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`)
      // 读头部：需要手动找 \r\n\r\n，reader 按字节数不够用，这里直接自己缓冲。
      let head = ''
      const onData = (chunk) => {
        head += chunk.toString('latin1')
        const idx = head.indexOf('\r\n\r\n')
        if (idx < 0) {
          if (head.length > 8192) fail(new Error('http proxy handshake response too large'))
          return
        }
        sock.removeListener('data', onData)
        const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(head)?.[1])
        if (!status || status < 200 || status >= 300) {
          return fail(new Error(`http proxy CONNECT failed (${status ?? 'bad response'})`))
        }
        reader.destroy()
        dbg(`http CONNECT ${host}:${port} → ${status} (${proxy.host}:${proxy.port})`)
        sock.on('error', () => {})
        resolve(sock)
      }
      sock.on('data', onData)
    }, fail)
  })
}

/** 依据代理类型建立隧道；direct 返回直连 socket。 */
function openTunnel(proxy, host, port) {
  if (proxy.direct) {
    return new Promise((resolve, reject) => {
      const sock = net.connect(port, host)
      sock.once('connect', () => resolve(sock))
      sock.once('error', reject)
    })
  }
  if (proxy.scheme === 'socks5' || proxy.scheme === 'socks5h') {
    return socks5Connect(proxy, host, port)
  }
  return httpProxyConnect(proxy, host, port)
}

// ────────────────────────── HTTP Agent（经隧道） ──────────────────────────

const agentCache = new Map()

// Node 的 http.Agent/https.Agent 构造函数**不会**把 options.createConnection
// 挂到实例上（实测 Node 26 忽略该选项），必须用子类覆盖实例方法。
class TunnelHttpAgent extends http.Agent {
  constructor(proxy) {
    super({ keepAlive: true, maxSockets: 16, maxFreeSockets: 8 })
    this.tunnelProxy = proxy
  }

  createConnection(opts, callback) {
    dbg('createConnection opts:', JSON.stringify({ host: opts.host, hostname: opts.hostname, port: opts.port }))
    openTunnel(this.tunnelProxy, opts.host, opts.port).then(
      (raw) => callback(null, raw),
      (err) => callback(err),
    )
  }
}

class TunnelHttpsAgent extends https.Agent {
  constructor(proxy) {
    super({ keepAlive: true, maxSockets: 16, maxFreeSockets: 8 })
    this.tunnelProxy = proxy
  }

  createConnection(opts, callback) {
    const proxy = this.tunnelProxy
    dbg('createConnection opts:', JSON.stringify({ host: opts.host, hostname: opts.hostname, port: opts.port, servername: opts.servername }))
    openTunnel(proxy, opts.host, opts.port).then((raw) => {
      const tlsSock = tls.connect({ socket: raw, servername: opts.host })
      let done = false
      tlsSock.once('secureConnect', () => {
        done = true
        try {
          const peer = tlsSock.getPeerCertificate()
          dbg('tls peer:', peer?.subject?.CN ?? '(none)')
        } catch {
          // 仅调试
        }
        callback(null, tlsSock)
      })
      tlsSock.once('error', (err) => {
        if (done) return
        done = true
        tlsSock.destroy()
        callback(err)
      })
    }, callback)
  }
}

function agentFor(isHttps, proxy) {
  if (!proxy || proxy.direct) return undefined
  const key = `${isHttps ? 'https' : 'http'}|${proxy.scheme}|${proxy.host}|${proxy.port}|${proxy.username ?? ''}`
  let agent = agentCache.get(key)
  if (agent) return agent
  agent = isHttps ? new TunnelHttpsAgent(proxy) : new TunnelHttpAgent(proxy)
  agentCache.set(key, agent)
  return agent
}

// ────────────────────────── 服务器 ──────────────────────────

// 逐跳头：不转发，由 Node 按本段连接重新计算。
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'expect',
])

const state = { requests: 0, startedAt: Date.now() }

let quiet = false

function log(arrow, method, target, via, ...rest) {
  if (quiet) return
  const time = new Date().toTimeString().slice(0, 8)
  console.log(`[${time}] ${arrow} ${method} ${target} via ${via}${rest.length ? ' · ' + rest.join(' · ') : ''}`)
}

function targetOrigin(cliTarget) {
  const raw = cliTarget ?? env('MODEL_PROXY_TARGET') ?? DEFAULT_TARGET
  const u = new URL(raw)
  return { raw, origin: `${u.protocol}//${u.host}` }
}

function writeError(res, code, message) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

function handleRequest(cliProxy, cliTarget) {
  return (req, res) => {
    // 状态端点。
    if (req.url === '/__status' && req.method === 'GET') {
      const proxy = resolveProxy(cliProxy)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        ok: true, version: VERSION, proxy: proxyDisplay(proxy), target: targetOrigin(cliTarget).raw,
        uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000), requests: state.requests,
      }))
      return
    }

    const started = Date.now()
    let target
    try {
      target = req.url.startsWith('http://') || req.url.startsWith('https://')
        ? new URL(req.url)
        : new URL(req.url, targetOrigin(cliTarget).origin)
    } catch (err) {
      writeError(res, 400, `bad request URL: ${err.message}`)
      return
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      writeError(res, 400, `unsupported target protocol: ${target.protocol}`)
      return
    }

    const isHttps = target.protocol === 'https:'
    const hostname = target.hostname
    const port = target.port ? Number(target.port) : isHttps ? 443 : 80
    const proxy = resolveProxy(cliProxy)
    const viaProxy = !inNoProxy(hostname, port)
    const agent = viaProxy ? agentFor(isHttps, proxy) : undefined
    dbg(`relay ${req.method} ${target.href}: isHttps=${isHttps} viaProxy=${viaProxy} agent=${agent ? agent.constructor.name : 'undefined'}`)

    const headers = { host: target.host }
    for (const [key, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue
      if (value !== undefined) headers[key] = value
    }

    const upstream = (isHttps ? https : http).request(
      {
        hostname, port,
        path: target.pathname + target.search,
        method: req.method,
        headers,
        agent,
      },
      (upRes) => {
        dbg('upstream socket remote:', upRes.socket?.remoteAddress, 'local:', upRes.socket?.localAddress)
        const outHeaders = {}
        for (const [key, value] of Object.entries(upRes.headers)) {
          if (HOP_BY_HOP.has(key.toLowerCase())) continue
          outHeaders[key] = value
        }
        const code = upRes.statusCode ?? 502
        if (upRes.statusMessage) {
          res.writeHead(code, upRes.statusMessage, outHeaders)
        } else {
          res.writeHead(code, outHeaders)
        }
        upRes.pipe(res)
        upRes.on('error', () => res.destroy())
        state.requests++
        log('→', req.method, target.href, viaProxy ? proxyDisplay(proxy) : 'direct',
          code, `${Date.now() - started}ms`)
      },
    )
    upstream.on('error', (err) => {
      if (!res.headersSent) {
        writeError(res, 502, `upstream ${hostname}:${port} failed: ${err.message}`)
      } else {
        res.destroy()
      }
      log('✗', req.method, target.href, viaProxy ? proxyDisplay(proxy) : 'direct', err.message)
    })
    req.on('aborted', () => upstream.destroy())
    req.on('error', () => upstream.destroy())
    req.pipe(upstream)
  }
}

function handleConnect(cliProxy) {
  return (req, clientSock, head) => {
    const started = Date.now()
    const colon = req.url.lastIndexOf(':')
    const host = req.url.slice(0, colon)
    const port = Number(req.url.slice(colon + 1))
    const proxy = resolveProxy(cliProxy)
    const viaProxy = !inNoProxy(host, port)
    const open = viaProxy
      ? openTunnel(proxy, host, port)
      : openTunnel({ direct: true }, host, port)
    open.then((tunnel) => {
      clientSock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) tunnel.write(head)
      tunnel.pipe(clientSock)
      clientSock.pipe(tunnel)
      tunnel.on('error', () => clientSock.destroy())
      clientSock.on('error', () => tunnel.destroy())
      log('→', 'CONNECT', `${host}:${port}`, viaProxy ? proxyDisplay(proxy) : 'direct',
        '200', `${Date.now() - started}ms`)
    }).catch((err) => {
      clientSock.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      clientSock.destroy()
      log('✗', 'CONNECT', `${host}:${port}`, viaProxy ? proxyDisplay(proxy) : 'direct', err.message)
    })
  }
}

// ────────────────────────── 连通性自检 ──────────────────────────

async function check(cliProxy, cliTarget) {
  const { raw, origin } = targetOrigin(cliTarget)
  const u = new URL(origin)
  const hostname = u.hostname
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
  const isHttps = u.protocol === 'https:'
  const proxy = resolveProxy(cliProxy)
  const viaProxy = !inNoProxy(hostname, port)
  const started = Date.now()
  try {
    const agent = viaProxy ? agentFor(isHttps, proxy) : undefined
    const status = await new Promise((resolve, reject) => {
      const req = (isHttps ? https : http).get(
        { hostname, port, path: '/', agent },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.setTimeout(10_000, () => req.destroy(new Error('timeout')))
      req.on('error', reject)
    })
    const ms = Date.now() - started
    console.log(`OK  ${raw} → ${status} (${ms}ms) via ${viaProxy ? proxyDisplay(proxy) : 'direct'}`)
    return 0
  } catch (err) {
    const ms = Date.now() - started
    console.error(`FAIL ${raw} → ${err.message} (${ms}ms) via ${viaProxy ? proxyDisplay(proxy) : 'direct'}`)
    return 1
  }
}

function printStatus(cliProxy, cliTarget) {
  const proxy = resolveProxy(cliProxy)
  const { raw } = targetOrigin(cliTarget)
  console.log(`model-proxy v${VERSION}`)
  console.log(`  proxy : ${proxyDisplay(proxy)}`)
  console.log(`  target: ${raw}`)
  console.log(`  no_proxy: ${env('NO_PROXY', 'no_proxy') ?? '(unset)'}`)
  console.log('  usage : node model-proxy.mjs [--port 8787] [--target <origin>] [--proxy <url>] [--quiet]')
}

function printHelp() {
  console.log(`model-proxy v${VERSION} — 零依赖本地模型请求转发代理

用法:
  node model-proxy.mjs [选项]

选项:
  --port <n>     监听端口（默认 8787，或 $env:MODEL_PROXY_PORT）
  --host <ip>    监听地址（默认 127.0.0.1；对外暴露请谨慎）
  --target <url> 上游 API origin（默认 $env:MODEL_PROXY_TARGET 或 https://api.deepseek.com）
  --proxy <url>  上游代理（socks5://、socks5h://、http://、https://，可带 user:pass；
                 默认 $env:MODEL_PROXY，回退 ALL_PROXY/HTTPS_PROXY/HTTP_PROXY；direct 直连）
  --quiet        关闭逐请求日志
  --status       打印当前生效配置后退出
  --check        经代理连通性自检（对 target 发一次 GET）后退出
  --help         显示本帮助

环境变量: MODEL_PROXY, MODEL_PROXY_TARGET, MODEL_PROXY_PORT, MODEL_PROXY_HOST,
          NO_PROXY（目标命中列表时直连）, 以及标准 ALL_PROXY/HTTPS_PROXY/HTTP_PROXY。

DSH 接线: 把 $env:DEEPSEEK_BASE_URL 设为 http://127.0.0.1:<port>/v1 即可
          （install-profile.ps1 一键完成）。`)
}

// ────────────────────────── 入口 ──────────────────────────

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printHelp()
  process.exit(0)
}

const cliTarget = args.target
const cliProxy = args.proxy
quiet = args.quiet ?? false

if (args.status) {
  printStatus(cliProxy, cliTarget)
  process.exit(0)
}

if (args.check) {
  process.exit(await check(cliProxy, cliTarget))
}

const port = args.port ?? Number(env('MODEL_PROXY_PORT') ?? 8787)
const host = args.host ?? env('MODEL_PROXY_HOST') ?? '127.0.0.1'

const server = http.createServer()
server.requestTimeout = 0 // 长流式（SSE）不能被默认 5 分钟超时掐断
server.headersTimeout = 30_000
server.keepAliveTimeout = 60_000
server.on('request', handleRequest(cliProxy, cliTarget))
server.on('connect', handleConnect(cliProxy))

server.listen(port, host, () => {
  const proxy = resolveProxy(cliProxy)
  const { raw } = targetOrigin(cliTarget)
  dbg(`env check: MODEL_PROXY_DEBUG=${JSON.stringify(process.env.MODEL_PROXY_DEBUG)} debug=${debug}`)
  console.log(`model-proxy v${VERSION} listening on http://${host}:${port}`)
  console.log(`  target: ${raw}  ·  upstream proxy: ${proxyDisplay(proxy)}`)
  console.log(`  DSH 接线: DEEPSEEK_BASE_URL=http://${host}:${port}/v1   ·  状态: GET /__status`)
})

process.on('SIGINT', () => {
  console.log(`\nmodel-proxy: ${state.requests} requests handled, exiting`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
})
