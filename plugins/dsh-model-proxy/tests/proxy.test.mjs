/**
 * dsh-model-proxy tests: unit (parse/noProxy) + integration over the REAL
 * undici global dispatcher with in-process fake SOCKS5 / HTTP proxies and a
 * fake upstream. No external network.
 * Run after build: node --test tests/*.test.mjs
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import http from 'node:http'
import { createProxyDispatcher, apply, parseProxy, displayProxy, inNoProxy } from '../dist/index.js'

const DISPATCHER_KEY = Symbol.for('undici.globalDispatcher.2')
const originalDispatcher = globalThis[DISPATCHER_KEY]
const installed = []

afterEach(async () => {
  for (const { dispatcher, dispose } of installed.splice(0)) {
    globalThis[DISPATCHER_KEY] = originalDispatcher
    await dispose()
  }
})

function install(dispatcher, dispose) {
  installed.push({ dispatcher, dispose })
  globalThis[DISPATCHER_KEY] = dispatcher
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

// ── 假上游 ──
async function fakeUpstream() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ path: req.url, via: 'upstream' }))
  })
  const port = await listen(server)
  return { server, port }
}

// ── 假 SOCKS5 代理（no-auth，域名/IP 直连目标） ──
async function fakeSocks5() {
  let connections = 0
  const server = net.createServer((client) => {
    connections++
    let buf = Buffer.alloc(0)
    let stage = 0
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (stage === 0 && buf.length >= 2) {
        const nmethods = buf[1]
        if (buf.length < 2 + nmethods) return
        buf = buf.subarray(2 + nmethods)
        client.write(Buffer.from([0x05, 0x00]))
        stage = 1
      }
      if (stage === 1 && buf.length >= 4) {
        const atyp = buf[3]
        const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : buf[4] + 1
        if (buf.length < 4 + addrLen + 2) return
        const host = atyp === 0x01
          ? [...buf.subarray(4, 8)].join('.')
          : atyp === 0x03 ? buf.subarray(5, 5 + buf[4]).toString('utf8') : '::1'
        const port = buf.readUInt16BE(4 + addrLen)
        buf = Buffer.alloc(0)
        stage = 2
        const up = net.connect(port, host, () => {
          client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0, 0]))
          client.pipe(up)
          up.pipe(client)
        })
        up.on('error', () => client.destroy())
        client.removeListener('data', onData)
      }
    }
    client.on('data', onData)
    client.on('error', () => {})
  })
  const port = await listen(server)
  return { server, port, connections: () => connections }
}

// ── 假 HTTP 代理（CONNECT 隧道） ──
async function fakeHttpProxy() {
  let connections = 0
  const server = net.createServer((client) => {
    connections++
    let buf = Buffer.alloc(0)
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const idx = buf.indexOf('\r\n\r\n')
      if (idx < 0) return
      const head = buf.toString('latin1', 0, idx)
      const m = /^CONNECT ([^ ]+):(\d+) HTTP\/1\.[01]/.exec(head)
      if (!m) return client.destroy()
      const rest = buf.subarray(idx + 4)
      const up = net.connect(Number(m[2]), m[1], () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (rest.length) up.write(rest)
        client.pipe(up)
        up.pipe(client)
      })
      up.on('error', () => client.destroy())
      client.removeListener('data', onData)
    }
    client.on('data', onData)
    client.on('error', () => {})
  })
  const port = await listen(server)
  return { server, port, connections: () => connections }
}

// ── 单元 ──
test('parseProxy: schemes, ports, credentials', () => {
  const socks = parseProxy('socks5://127.0.0.1:10808')
  assert.equal(socks.scheme, 'socks5')
  assert.equal(socks.port, 10808)
  assert.equal(parseProxy('socks5h://h').port, 1080)
  assert.equal(parseProxy('http://h').port, 80)
  assert.equal(parseProxy('https://h').port, 443)
  const auth = parseProxy('socks5://user:p%40ss@proxy.example:9999')
  assert.equal(auth.username, 'user')
  assert.equal(auth.password, 'p@ss')
  assert.throws(() => parseProxy('ftp://x'))
  assert.throws(() => parseProxy('not a url'))
})

test('displayProxy hides credentials', () => {
  const d = displayProxy(parseProxy('socks5://u:secret@127.0.0.1:10808'))
  assert.ok(d.includes('u:***@'))
  assert.ok(!d.includes('secret'))
})

test('inNoProxy: suffix, host:port, env, wildcard', () => {
  assert.equal(inNoProxy('api.deepseek.com', 443, []), false)
  assert.equal(inNoProxy('api.deepseek.com', 443, ['.deepseek.com']), true)
  assert.equal(inNoProxy('api.deepseek.com', 443, ['.deepseek.com:443']), true)
  assert.equal(inNoProxy('api.deepseek.com', 80, ['.deepseek.com:443']), false)
  assert.equal(inNoProxy('example.com', 80, ['example.com']), true)
  assert.equal(inNoProxy('anything', 80, ['*']), true)
})

test('inNoProxy: NO_PROXY env participates', () => {
  const saved = process.env.NO_PROXY
  try {
    delete process.env.NO_PROXY
    assert.equal(inNoProxy('foo.internal', 443, []), false)
    process.env.NO_PROXY = '.internal'
    assert.equal(inNoProxy('bar.internal', 443, []), true)
  } finally {
    if (saved === undefined) delete process.env.NO_PROXY
    else process.env.NO_PROXY = saved
  }
})

// ── 集成：真实全局 dispatcher ──

function withNoProxyCleared(run) {
  const savedU = process.env.NO_PROXY
  const savedL = process.env.no_proxy
  delete process.env.NO_PROXY
  delete process.env.no_proxy
  return run().finally(() => {
    if (savedU === undefined) delete process.env.NO_PROXY
    else process.env.NO_PROXY = savedU
    if (savedL === undefined) delete process.env.no_proxy
    else process.env.no_proxy = savedL
  })
}

test('global fetch goes through SOCKS5 tunnel', async () => {
  const upstream = await fakeUpstream()
  const socks = await fakeSocks5()
  const { dispatcher, dispose } = createProxyDispatcher(`socks5://127.0.0.1:${socks.port}`, [])
  install(dispatcher, dispose)
  try {
    await withNoProxyCleared(async () => {
      const res = await fetch(`http://127.0.0.1:${upstream.port}/hello`, { signal: AbortSignal.timeout(10_000) })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.deepEqual(body, { path: '/hello', via: 'upstream' })
      assert.ok(socks.connections() > 0, 'SOCKS proxy must have been contacted')
    })
  } finally {
    upstream.server.close()
    socks.server.close()
  }
})

test('global fetch goes through HTTP CONNECT proxy', async () => {
  const upstream = await fakeUpstream()
  const proxy = await fakeHttpProxy()
  const { dispatcher, dispose } = createProxyDispatcher(`http://127.0.0.1:${proxy.port}`, [])
  install(dispatcher, dispose)
  try {
    await withNoProxyCleared(async () => {
      const res = await fetch(`http://127.0.0.1:${upstream.port}/via-http-proxy`, { signal: AbortSignal.timeout(10_000) })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.path, '/via-http-proxy')
      assert.ok(proxy.connections() > 0, 'HTTP proxy must have been contacted')
    })
  } finally {
    upstream.server.close()
    proxy.server.close()
  }
})

test('NO_PROXY entries bypass a dead proxy', async () => {
  const upstream = await fakeUpstream()
  // 代理端口指向一个不存在的端口：若走代理必然失败。
  const dead = await new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
  const { dispatcher, dispose } = createProxyDispatcher(`socks5://127.0.0.1:${dead}`, ['127.0.0.1'])
  install(dispatcher, dispose)
  try {
    const res = await fetch(`http://127.0.0.1:${upstream.port}/direct`, { signal: AbortSignal.timeout(10_000) })
    assert.equal(res.status, 200)
  } finally {
    upstream.server.close()
  }
})

test('dispose restores the previous dispatcher', async () => {
  const socks = await fakeSocks5()
  const { dispatcher, dispose } = createProxyDispatcher(`socks5://127.0.0.1:${socks.port}`, [])
  globalThis[DISPATCHER_KEY] = dispatcher
  assert.equal(globalThis[DISPATCHER_KEY], dispatcher)
  await dispose()
  assert.equal(globalThis[DISPATCHER_KEY], originalDispatcher)
  socks.server.close()
})

test('apply: env-driven install + dispose restore', async () => {
  const upstream = await fakeUpstream()
  const socks = await fakeSocks5()
  const saved = process.env.MODEL_PROXY
  process.env.MODEL_PROXY = `socks5://127.0.0.1:${socks.port}`
  const events = []
  let disposer
  const ctx = {
    logger: () => ({ info: (m) => events.push(['info', m]), warn: (m) => events.push(['warn', m]) }),
    effect: (cb) => { disposer = cb(); return disposer ?? (() => {}) },
  }
  try {
    apply(ctx, {})
    assert.ok(events.some(([kind, msg]) => kind === 'info' && msg.includes('global fetch dispatcher')))
    const res = await fetch(`http://127.0.0.1:${upstream.port}/env-driven`, { signal: AbortSignal.timeout(10_000) })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.path, '/env-driven')
  } finally {
    process.env.MODEL_PROXY = saved ?? ''
    disposer?.()
    if (globalThis[DISPATCHER_KEY] !== originalDispatcher) globalThis[DISPATCHER_KEY] = originalDispatcher
    upstream.server.close()
    socks.server.close()
  }
})

test('apply: direct / invalid values leave the dispatcher untouched', () => {
  for (const value of ['', 'direct', 'none', 'ftp://x']) {
    const saved = process.env.MODEL_PROXY
    process.env.MODEL_PROXY = value
    const events = []
    const ctx = { logger: () => ({ info: (m) => events.push(m), warn: (m) => events.push(m) }), effect: () => () => {} }
    try {
      apply(ctx, {})
      assert.equal(globalThis[DISPATCHER_KEY], originalDispatcher, `value: ${JSON.stringify(value)}`)
      if (value === 'ftp://x') {
        assert.ok(events.some((m) => m.includes('invalid proxy URL')))
      } else {
        assert.ok(events.some((m) => m.includes('direct')))
      }
    } finally {
      process.env.MODEL_PROXY = saved ?? ''
    }
  }
})

// ── 真机 https 冒烟（可选）：设置了 MODEL_PROXY 时打真实 API，断言 4xx ──
// 覆盖自定义 connector 的 https 分支（隧道 + TLS 包裹 + SNI）。
test('https fetch through the configured MODEL_PROXY reaches the API', { skip: !process.env.MODEL_PROXY }, async () => {
  const { dispatcher, dispose } = createProxyDispatcher(process.env.MODEL_PROXY, ['localhost', '127.0.0.1', '::1'])
  globalThis[DISPATCHER_KEY] = dispatcher
  try {
    const res = await fetch('https://api.deepseek.com/v1/models', { signal: AbortSignal.timeout(20_000) })
    assert.ok(res.status >= 400 && res.status < 500, `expected 4xx from API, got ${res.status}`)
  } finally {
    await dispose()
  }
})
