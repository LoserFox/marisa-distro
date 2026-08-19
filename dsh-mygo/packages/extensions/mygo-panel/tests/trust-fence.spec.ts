/**
 * trust-fence 测试（P0 迁移自 omdsh-plughub 的读/写栅栏语义）：
 * loopback/trusted-host 读门、写门只认 loopback、same-origin 标记。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/trust-fence
 */

import { describe, expect, it } from 'vitest'
import {
  isLoopbackHostname,
  isLoopbackRequest,
  isTrustedRequest,
} from '../src/trust-fence.ts'

describe('isLoopbackHostname', () => {
  it('认可 localhost、IPv6 loopback 与 127/8 字面量', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.253.1.9')).toBe(true)
  })

  it('拒绝普通主机名与非 127/8 地址', () => {
    expect(isLoopbackHostname('example.com')).toBe(false)
    expect(isLoopbackHostname('192.168.1.2')).toBe(false)
    expect(isLoopbackHostname('128.0.0.1')).toBe(false)
    expect(isLoopbackHostname('127.0.0.999')).toBe(false)
  })
})

describe('isTrustedRequest（读栅栏）', () => {
  const req = (headers: Record<string, string>) => ({ headers })

  it('loopback + 同源放行', () => {
    expect(isTrustedRequest(req({ host: '127.0.0.1:7788', origin: 'http://127.0.0.1:7788' }), [])).toBe(true)
    expect(isTrustedRequest(req({ host: 'localhost:7788', origin: 'http://localhost:7788' }), [])).toBe(true)
  })

  it('trusted-host 放行；未声明的主机拒绝', () => {
    const headers = { host: 'lan.local:7788', origin: 'http://lan.local:7788' }
    expect(isTrustedRequest(req(headers), ['lan.local'])).toBe(true)
    expect(isTrustedRequest(req(headers), [])).toBe(false)
  })

  it('cross-site 拒绝；缺失 host 拒绝', () => {
    expect(isTrustedRequest(req({ host: '127.0.0.1:7788', 'sec-fetch-site': 'cross-site' }), [])).toBe(false)
    expect(isTrustedRequest(req({ origin: 'http://127.0.0.1:7788' }), [])).toBe(false)
  })
})

describe('isLoopbackRequest（写栅栏）', () => {
  it('loopback 放行；trusted-host 也拒绝', () => {
    expect(isLoopbackRequest({ headers: { host: '127.0.0.1:7788', origin: 'http://127.0.0.1:7788' } })).toBe(true)
    expect(isLoopbackRequest({ headers: { host: 'lan.local:7788', origin: 'http://lan.local:7788' } })).toBe(false)
  })
})
