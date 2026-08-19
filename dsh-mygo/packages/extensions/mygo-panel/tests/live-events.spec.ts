/**
 * live rail 事件通道测试（rc8 node 半）：SSE 端点注册/连接生命周期、
 * 广播帧字节形态（host /plugins/events 同款 data: JSON\n\n）、
 * liveRowUrlOf 的 host 图查询与降级。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/live-events
 */

import { describe, expect, it } from 'vitest'
import {
  beginPanelOperation,
  broadcastLiveRail,
  finishPanelOperation,
  LIVE_EVENTS_PATH,
  liveEventsConnectionCount,
  liveRowUrlOf,
  panelOperationsSnapshot,
  panelRestartRequired,
  registerLiveEventsRoute,
} from '../src/live-events.ts'

interface FakeSseResponse {
  readonly chunks: string[]
  status?: number
  writeHead(status: number, headers: Record<string, string>): void
  write(chunk: string): unknown
  on(event: 'close', listener: () => void): void
  close(): void
}

function fakeSseResponse(): FakeSseResponse {
  const chunks: string[] = []
  let closeListener: (() => void) | undefined
  return {
    chunks,
    writeHead(status) { this.status = status },
    write(chunk) { chunks.push(chunk); return true },
    on(event, listener) { if (event === 'close') closeListener = listener },
    close() { closeListener?.() },
  }
}

function connect(): FakeSseResponse {
  let handler: ((req: unknown, res: unknown) => void) | undefined
  registerLiveEventsRoute({
    register(route) {
      expect(route.kind).toBe('exact')
      expect(route.path).toBe(LIVE_EVENTS_PATH)
      handler = route.handler as (req: unknown, res: unknown) => void
      return () => {}
    },
  })
  const res = fakeSseResponse()
  handler?.({ method: 'GET' }, res)
  return res
}

describe('live rail 事件通道（/api/mygo/events）', () => {
  it('连接即挂接，广播帧为 data: JSON 双换行形态，close 后摘除', () => {
    const res = connect()
    expect(res.status).toBe(200)
    expect(res.chunks[0]).toBe(': connected\n\n')
    expect(res.chunks[1]).toBe('data: {"type":"snapshot","operations":[],"restartRequired":false}\n\n')
    expect(liveEventsConnectionCount()).toBe(1)
    broadcastLiveRail({ type: 'live-rail', op: 'mount', id: '@test/pkg', url: '/plugins/@test/pkg/client.js?rev=abc' })
    expect(res.chunks[2]).toBe('data: {"type":"live-rail","op":"mount","id":"@test/pkg","url":"/plugins/@test/pkg/client.js?rev=abc"}\n\n')
    broadcastLiveRail({ type: 'live-rail', op: 'unmount', id: '@test/pkg' })
    expect(res.chunks[3]).toBe('data: {"type":"live-rail","op":"unmount","id":"@test/pkg"}\n\n')
    res.close()
    expect(liveEventsConnectionCount()).toBe(0)
    // 摘除后广播不再触达
    broadcastLiveRail({ type: 'live-rail', op: 'mount', id: '@test/pkg' })
    expect(res.chunks).toHaveLength(4)
  })

  it('非 GET/HEAD 拒绝 405 且不挂接', () => {
    let handler: ((req: unknown, res: unknown) => void) | undefined
    registerLiveEventsRoute({
      register(route) {
        handler = route.handler as (req: unknown, res: unknown) => void
        return () => {}
      },
    })
    const res = fakeSseResponse()
    handler?.({ method: 'POST' }, res)
    expect(res.status).toBe(405)
    expect(liveEventsConnectionCount()).toBe(0)
  })

  it('liveRowUrlOf：命中 host 图行返回 url；服务不可达/行不在图返回 undefined', () => {
    const get = (name: string): unknown => name === 'clientModules'
      ? { graph: () => ({ entries: [{ id: '@test/pkg', url: '/plugins/@test/pkg/client.js?rev=r1' }] }) }
      : undefined
    expect(liveRowUrlOf(get, '@test/pkg')).toBe('/plugins/@test/pkg/client.js?rev=r1')
    expect(liveRowUrlOf(get, '@test/other')).toBeUndefined()
    expect(liveRowUrlOf(() => undefined, '@test/pkg')).toBeUndefined()
    expect(liveRowUrlOf(() => { throw new Error('no ctx') }, '@test/pkg')).toBeUndefined()
  })
})

describe('P2 操作事件（/api/mygo/events）', () => {
  it('snapshot 先行，begin/finish 广播 running/ok/failed 帧', () => {
    const res = connect()
    expect(res.chunks[1]).toContain('"type":"snapshot"')
    const operation = beginPanelOperation('install', '@test/op')
    expect(panelOperationsSnapshot().at(-1)).toMatchObject({ status: 'running' })
    expect(res.chunks[2]).toContain('"status":"running"')
    finishPanelOperation(operation, 'ok', undefined, true)
    expect(panelRestartRequired()).toBe(true)
    expect(panelOperationsSnapshot().at(-1)).toMatchObject({ status: 'ok' })
    expect(res.chunks[3]).toContain('"status":"ok"')
    expect(res.chunks[3]).toContain('"restartRequired":true')
    res.close()
  })
})
