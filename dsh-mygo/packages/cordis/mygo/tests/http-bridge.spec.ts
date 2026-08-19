/**
 * Raw-facade HTTP bridge: the managed route pipeline must carry node:http
 * semantics ecosystem handlers rely on — `createReadStream().pipe(response)`
 * (dsh-stickers), SSE `write()`-without-`end()` streams (dsh-remote-web-ui /
 * dsh-git-graph / dsh-opencode-server), `flushHeaders`/`statusMessage`, and
 * the `for await (const chunk of req)` body reader.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DispatchMachine, InMemoryRegistryStore, LifecycleEngine, resolvePluginManagerConfig } from '@r05en1cu/dsh-mygo'

interface HostRoute {
  readonly kind?: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (req: unknown, res: unknown) => void | Promise<void>
}

class FakeHttpServer {
  readonly routes: HostRoute[] = []

  register(route: unknown): () => void {
    this.routes.push(route as HostRoute)
    return () => {}
  }
}

interface FakeRes {
  readonly res: unknown
  readonly statusCode: number
  readonly headers: Record<string, string>
  readonly writes: Buffer[]
  readonly ended: Buffer | undefined
  readonly events: string[]
}

function fakeRes(): FakeRes {
  const state = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    writes: [] as Buffer[],
    ended: undefined as Buffer | undefined,
    events: [] as string[],
  }
  const res = {
    get statusCode(): number { return state.statusCode },
    set statusCode(value: number) { state.statusCode = value },
    setHeader(name: string, value: string): void { state.headers[name] = value },
    write(chunk: string | Buffer): boolean {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      state.writes.push(buffer)
      state.events.push(`write@${Date.now()}`)
      return true
    },
    end(body?: string | Buffer): void {
      if (body !== undefined) state.writes.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body)))
      state.ended = Buffer.concat(state.writes)
      state.events.push(`end@${Date.now()}`)
    },
  }
  return {
    res,
    get statusCode(): number { return state.statusCode },
    get headers(): Record<string, string> { return state.headers },
    get writes(): Buffer[] { return state.writes },
    get ended(): Buffer | undefined { return state.ended },
    get events(): string[] { return state.events },
  }
}

function fakeReq(url: string): unknown {
  return {
    method: 'GET',
    url,
    headers: {},
    on(event: string, listener: (...args: unknown[]) => void): void {
      if (event === 'end') listener()
    },
  }
}

async function boot(): Promise<{ engine: LifecycleEngine; server: FakeHttpServer }> {
  const ctx = new Context()
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  const server = new FakeHttpServer()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store: new InMemoryRegistryStore(),
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    eventVocabulary: [],
    httpServer: server,
  })
  return { engine, server }
}

async function routeOf(server: FakeHttpServer, path: string): Promise<HostRoute> {
  const route = server.routes.find(candidate => candidate.path === path)
  if (route === undefined) throw new Error(`route ${path} not registered`)
  return route
}

describe('raw facade HTTP bridge', () => {
  it('delivers a static JSON response through writeHead + end', async () => {
    const { engine, server } = await boot()
    await engine.adoptRaw({
      name: 'http-routes',
      apply(ctx: { httpServer: { register(route: unknown): () => void } }): void {
        ctx.httpServer.register({
          kind: 'exact',
          path: '/json',
          handler(_req: unknown, res: unknown): void {
            const response = res as {
              writeHead(status: number, headers: Record<string, string>): void
              end(body: string): void
            }
            response.writeHead(200, { 'content-type': 'application/json' })
            response.end(JSON.stringify({ ok: true }))
          },
        })
      },
    } as never, {}, 'http-routes')
    const res = fakeRes()
    await (await routeOf(server, '/json')).handler(fakeReq('/json'), res.res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.ended?.toString('utf8')).toBe('{"ok":true}')
    expect(res.events.at(-1)).toMatch(/^end@/)
  })

  it('streams createReadStream().pipe(response) (dsh-stickers route)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mygo-bridge-'))
    const file = join(root, 'sticker.png')
    const payload = Buffer.from(Array.from({ length: 256 }, (_, index) => index))
    await writeFile(file, payload)
    try {
      const { engine, server } = await boot()
      await engine.adoptRaw({
        name: 'http-routes',
        apply(ctx: { httpServer: { register(route: unknown): () => void } }): void {
          ctx.httpServer.register({
            kind: 'exact',
            path: '/sticker',
            handler(_req: unknown, res: unknown): void {
              const response = res as {
                writeHead(status: number, headers: Record<string, string>): void
                pipe(source: unknown): unknown
              }
              response.writeHead(200, {
                'content-type': 'image/png',
                'cache-control': 'public, max-age=86400',
              })
              createReadStream(file).pipe(response as unknown as import('node:stream').Writable)
            },
          })
        },
      } as never, {}, 'http-routes')
      const res = fakeRes()
      await (await routeOf(server, '/sticker')).handler(fakeReq('/sticker'), res.res)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('image/png')
      expect(res.ended?.equals(payload)).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('streams SSE frames live and ends when the handler calls res.end()', async () => {
    const { engine, server } = await boot()
    await engine.adoptRaw({
      name: 'http-routes',
      apply(ctx: { httpServer: { register(route: unknown): () => void } }): void {
        ctx.httpServer.register({
          kind: 'exact',
          path: '/events',
          streamIdleMs: 500,
          handler(_req: unknown, res: unknown): void {
            const response = res as {
              writeHead(status: number, headers: Record<string, string>): void
              write(frame: string): boolean
              end(): void
            }
            response.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache',
            })
            response.write('retry: 2000\n\n')
            response.write('event: change\ndata: {"n":1}\n\n')
            setTimeout(() => response.end(), 40)
          },
        })
      },
    } as never, {}, 'http-routes')
    const res = fakeRes()
    await (await routeOf(server, '/events')).handler(fakeReq('/events'), res.res)
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(res.ended?.toString('utf8')).toBe('retry: 2000\n\nevent: change\ndata: {"n":1}\n\n')
    // Frames must be forwarded live, before the final end.
    expect(res.events[0]).toMatch(/^write@/)
    expect(res.events.at(-1)).toMatch(/^end@/)
  })

  it('closes an open SSE stream after the idle timeout instead of hanging', async () => {
    const { engine, server } = await boot()
    await engine.adoptRaw({
      name: 'http-routes',
      apply(ctx: { httpServer: { register(route: unknown): () => void } }): void {
        ctx.httpServer.register({
          kind: 'exact',
          path: '/open',
          streamIdleMs: 60,
          handler(_req: unknown, res: unknown): void {
            const response = res as { writeHead(status: number, headers: Record<string, string>): void; write(frame: string): boolean }
            response.writeHead(200, { 'content-type': 'text/event-stream' })
            response.write('data: hello\n\n')
            // Never end: the idle timeout must close the response.
          },
        })
      },
    } as never, {}, 'http-routes')
    const res = fakeRes()
    const started = Date.now()
    await (await routeOf(server, '/open')).handler(fakeReq('/open'), res.res)
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
    expect(res.ended?.toString('utf8')).toBe('data: hello\n\n')
  })

  it('supports statusMessage, flushHeaders, and the async-iterable request body', async () => {
    const { engine, server } = await boot()
    await engine.adoptRaw({
      name: 'http-routes',
      apply(ctx: { httpServer: { register(route: unknown): () => void } }): void {
        ctx.httpServer.register({
          kind: 'exact',
          path: '/echo',
          async handler(req: unknown, res: unknown): Promise<void> {
            const incoming = req as { [Symbol.asyncIterator](): AsyncGenerator<Buffer> }
            const response = res as {
              statusMessage: string
              writeHead(status: number): void
              flushHeaders(): void
              write(chunk: string): boolean
              end(): void
            }
            let body = ''
            for await (const chunk of incoming) body += chunk.toString('utf8')
            response.statusMessage = 'OK'
            response.writeHead(200)
            response.flushHeaders()
            response.write(body)
            response.end()
          },
        })
      },
    } as never, {}, 'http-routes')
    const res = fakeRes()
    const req = {
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'text/plain' },
      on(event: string, listener: (...args: unknown[]) => void): void {
        if (event === 'data') listener(Buffer.from('hello-from-body'))
        if (event === 'end') listener()
      },
    }
    await (await routeOf(server, '/echo')).handler(req, res.res)
    expect(res.statusCode).toBe(200)
    expect(res.ended?.toString('utf8')).toBe('hello-from-body')
  })
})
