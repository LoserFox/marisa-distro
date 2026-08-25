#!/usr/bin/env node
/**
 * model-proxy 自测：本地假上游 + 直接模式，验证 relay（JSON/SSE/POST/绝对 URL）、
 * /__status 与 CONNECT 隧道。不依赖外网，也不依赖任何真实代理。
 * 用法:
 *   node test.mjs                                  # 本地假上游全测
 *   node test.mjs --tunnel <proxy-url> <target>    # 额外对真实 target 做隧道 e2e
 */

import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
let failures = 0

function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
  if (!cond) failures++
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

// ── 假上游 ──
const upstream = http.createServer((req, res) => {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ models: ['fake-model'] }))
    return
  }
  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    let i = 0
    const timer = setInterval(() => {
      i++
      res.write(`data: {"chunk":${i}}\n\n`)
      if (i === 3) {
        clearInterval(timer)
        res.end('data: [DONE]\n\n')
      }
    }, 40)
    req.resume()
    return
  }
  if (req.url === '/v1/echo' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ echoed: body }))
    })
    return
  }
  res.writeHead(404).end('nope')
})

const upstreamPort = await listen(upstream)

// ── 代理（直接模式，随机空闲端口）──
function freePort() {
  return new Promise((resolve) => {
    const s = http.createServer()
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
}

const port = await freePort()
const child = spawn(process.execPath, [
  join(root, 'model-proxy.mjs'),
  '--port', String(port),
  '--target', `http://127.0.0.1:${upstreamPort}`,
  '--quiet',
], { stdio: ['ignore', 'pipe', 'pipe'] })
child.stderr.on('data', (d) => process.stderr.write(`[proxy] ${d}`))
child.stdout.on('data', (d) => process.stderr.write(`[proxy] ${d}`))
await new Promise((r) => setTimeout(r, 400))

const base = `http://127.0.0.1:${port}`

// ── 1. JSON relay ──
{
  const res = await fetch(`${base}/v1/models`)
  const body = await res.json()
  ok('relay GET JSON', res.status === 200 && body.models?.[0] === 'fake-model', `status=${res.status}`)
}

// ── 2. POST echo（请求体透传）──
{
  const res = await fetch(`${base}/v1/echo`, { method: 'POST', body: 'hello-body' })
  const body = await res.json()
  ok('relay POST body', res.status === 200 && body.echoed === 'hello-body', JSON.stringify(body))
}

// ── 3. SSE 流式（多块、带间隔）──
{
  const res = await fetch(`${base}/v1/chat/completions`, { method: 'POST' })
  const text = await res.text()
  const chunks = (text.match(/data: \{"chunk":\d\}/g) ?? []).length
  ok('relay SSE stream', res.status === 200 && chunks === 3 && text.includes('[DONE]'),
    `chunks=${chunks}, len=${text.length}`)
}

// ── 4. 绝对 URL（正向代理风格，裸 socket 发请求行）──
{
  const viaAbsolute = await new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1')
    let data = ''
    sock.on('data', (c) => (data += c))
    sock.on('end', () => resolve(data))
    sock.on('error', reject)
    sock.write(`GET http://127.0.0.1:${upstreamPort}/v1/models HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`)
  })
  ok('absolute URL relay', viaAbsolute.includes('200 OK') && viaAbsolute.includes('fake-model'),
    viaAbsolute.split('\r\n')[0])
}

// ── 5. /__status ──
{
  const res = await fetch(`${base}/__status`)
  const body = await res.json()
  ok('__status endpoint', res.status === 200 && body.ok === true && body.proxy === 'direct',
    JSON.stringify(body))
}

// ── 6. CONNECT 隧道 ──
{
  const tunneled = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: `127.0.0.1:${upstreamPort}` })
    req.on('connect', (res, sock) => {
      if (res.statusCode !== 200) return reject(new Error(`CONNECT ${res.statusCode}`))
      sock.write('GET /v1/models HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
      let data = ''
      sock.on('data', (c) => (data += c))
      sock.on('end', () => resolve(data))
      sock.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
  ok('CONNECT tunnel GET', tunneled.includes('200 OK') && tunneled.includes('fake-model'),
    tunneled.split('\r\n')[0])
}

// ── 清理 ──
child.kill()
upstream.close()

// ── 7.（可选）真实隧道 e2e：node test.mjs --tunnel socks5://127.0.0.1:10808 https://api.deepseek.com ──
const tunnelIdx = process.argv.indexOf('--tunnel')
if (tunnelIdx >= 0 && process.argv[tunnelIdx + 1] && process.argv[tunnelIdx + 2]) {
  const proxyUrl = process.argv[tunnelIdx + 1]
  const target = process.argv[tunnelIdx + 2]
  const tport = await freePort()
  const tchild = spawn(process.execPath, [
    join(root, 'model-proxy.mjs'),
    '--port', String(tport),
    '--target', target,
    '--proxy', proxyUrl,
    '--quiet',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  tchild.stderr.on('data', (d) => process.stderr.write(`[tunnel-proxy] ${d}`))
  await new Promise((r) => setTimeout(r, 500))
  const tbase = `http://127.0.0.1:${tport}`
  try {
    const res = await fetch(`${tbase}/v1/models`, { signal: AbortSignal.timeout(20_000) })
    const body = await res.text()
    const okStatus = res.status >= 200 && res.status < 500
    ok(`tunnel relay ${proxyUrl} → ${target}`, okStatus, `status=${res.status} body=${body.slice(0, 60)}`)
  } catch (err) {
    ok(`tunnel relay ${proxyUrl} → ${target}`, false, String(err))
  }
  tchild.kill()
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
