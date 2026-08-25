// 验证：undici 全局 dispatcher + 自定义 socks5 connect → 全局 fetch 透明走代理
import net from 'node:net'
import { Agent } from 'undici'

const PROXY = { host: '127.0.0.1', port: 10808 }

// socks5 CONNECT 隧道（最小实现，仅 no-auth + 域名）
function socks5Tunnel(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PROXY.port, PROXY.host)
    const fail = (err) => { sock.destroy(); reject(err) }
    sock.once('error', fail)
    let buf = Buffer.alloc(0)
    let stage = 0
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      if (stage === 0 && buf.length >= 2) {
        stage = 1
        const ip = net.isIP(host)
        const atyp = ip === 4 ? 0x01 : ip === 6 ? 0x04 : 0x03
        const addr = ip === 4 ? host.split('.').map(Number)
          : ip === 6 ? [...Buffer.from(host, 'hex')]
          : [host.length, ...Buffer.from(host, 'utf8')]
        sock.write(Buffer.from([0x05, 0x01, 0x00, atyp, ...addr, (port >> 8) & 0xff, port & 0xff]))
        buf = Buffer.alloc(0)
      }
      if (stage === 1 && buf.length >= 4) {
        const atyp = buf[3]
        const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : 1
        if (buf.length >= 4 + addrLen + 2) {
          if (buf[1] !== 0x00) return fail(new Error(`socks5 rep=${buf[1]}`))
          sock.removeListener('data', onData)
          sock.on('error', () => {})
          resolve(sock)
        }
      }
    }
    sock.on('data', onData)
    sock.write(Buffer.from([0x05, 0x01, 0x00]))
  })
}

const dispatcher = new Agent({
  connect: (origin) => socks5Tunnel(origin.hostname, Number(origin.port || 443)),
})

// 挂到全局（undici 全局 dispatcher 符号）
globalThis[Symbol.for('undici.globalDispatcher.1')] = dispatcher

// 通过全局 fetch 打真实 API（无 key，期望 4xx 而非网络错误）
const started = Date.now()
try {
  const res = await fetch('https://api.deepseek.com/v1/models', { signal: AbortSignal.timeout(20000) })
  const body = await res.text()
  console.log(`RESULT status=${res.status} ms=${Date.now() - started} body=${body.slice(0, 80)}`)
} catch (err) {
  console.log(`RESULT FAILED ms=${Date.now() - started} err=${err.message}`)
  process.exit(1)
}
process.exit(0)
