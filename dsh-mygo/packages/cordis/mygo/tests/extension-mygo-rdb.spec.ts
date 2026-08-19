/**
 * mygo-rdb extension plugin: capability dependency on the implicit manager
 * provider (`service:mygo-core`) and the three-format session readers wired
 * through mygo's tool surface.
 */

import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DispatchMachine, InMemoryRegistryStore, LifecycleEngine, resolvePluginManagerConfig } from '@deepseek-ai/dsh-mygo'

function harness(): { readonly engine: LifecycleEngine; readonly captured: Array<Record<string, unknown>> } {
  const ctx = new Context()
  const store = new InMemoryRegistryStore()
  const captured: Array<Record<string, unknown>> = []
  const machine = new DispatchMachine(ctx, { vocabulary: new Map() })
  machine.start()
  const engine = new LifecycleEngine({
    ctx,
    dispatch: machine,
    store,
    config: resolvePluginManagerConfig({ swapTimeoutMs: 40, historyKeep: 2 }),
    toolRegistry: {
      register: (definition) => {
        captured.push(definition as Record<string, unknown>)
        return () => {}
      },
      get: () => undefined,
    },
  })
  return { engine, captured }
}

describe('mygo-rdb extension capability dependency', () => {
  it('accepts depends service:mygo-core and rejects a too-new manager', async () => {
    const { engine } = harness()
    const accepted = await engine.planInstall({
      id: 'mygo-rdb',
      version: '0.1.0',
      compatibility: { depends: { 'service:mygo-core': '>=0.1.0' } },
      provides: ['service:mygo-session-reader'],
    })
    expect(accepted.accepted).toBe(true)
    const rejected = await engine.planInstall({
      id: 'mygo-rdb-future',
      version: '0.1.0',
      compatibility: { depends: { 'service:mygo-core': '>=9.0.0' } },
    })
    expect(rejected.accepted).toBe(false)
    expect(rejected.error?.code).toBe('compatibility-conflict')
  })

  it('adopts the real extension and reads a jsonl session through its tools', async () => {
    const dshHome = mkdtempSync(join(tmpdir(), 'mygo-rdb-ext-'))
    const dir = join(dshHome, 'sessions', '--proj--', 'session-ext-1')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'session.jsonl'), [
      JSON.stringify({ type: 'session', version: 0, id: 'session-ext-1', createdAt: 1786000000000, cwd: '/tmp', delegationDepth: 0 }),
      JSON.stringify({ type: 'user/message', seq: 0, time: 1786000001000, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'ext hi' }] } }, surfaceOp: 'append' }),
      JSON.stringify({ type: 'tool/call', seq: 1, time: 1786000002000, data: { turn: 1, step: 2, callId: 'c1', name: 'bash', arguments: 'ls' } }),
    ].join('\n') + '\n')
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = dshHome
    let installDir = ''
    try {
      const { engine, captured } = harness()
      installDir = mkdtempSync(join(process.cwd(), 'packages/cordis/mygo/tests/fixtures', 'mygo-rdb-ext-'))
      cpSync('/home/rosen/workspace/dsh_dev/dsh-mygo/extension/mygo-rdb', join(installDir, 'mygo-rdb'), { recursive: true })
      mkdirSync(join(installDir, 'mygo-rdb', 'node_modules', '@deepseek-ai'), { recursive: true })
      symlinkSync(
        '/home/rosen/workspace/dsh_dev/test-r05En1cU-0809/packages/cordis/mygo',
        join(installDir, 'mygo-rdb', 'node_modules', '@deepseek-ai', 'dsh-mygo'),
        'dir',
      )
      const raw = await import(
        pathToFileURL(join(installDir, 'mygo-rdb', 'lib', 'index.js')).href + `?t=${Date.now()}`
      )
      await engine.adoptRaw(raw as never, {}, 'mygo-rdb', {
        version: '0.1.0',
        compatibility: { depends: { 'service:mygo-core': '>=0.1.0' } },
        provides: ['service:mygo-session-reader'],
      })
      const listTool = captured.find(entry => entry.name === 'session_list') as {
        execute?: (args: unknown) => Promise<unknown>
      }
      const readTool = captured.find(entry => entry.name === 'session_read') as {
        execute?: (args: unknown) => Promise<unknown>
      }
      expect(listTool).toBeDefined()
      expect(readTool).toBeDefined()
      const listed = String(await listTool?.execute?.({}))
      expect(listed).toContain('[jsonl] 1 个会话')
      expect(listed).toContain('session-ext-1')
      const read = String(await readTool?.execute?.({ id: 'session-ext-1' }))
      expect(read).toContain('事件 2 条')
      expect(read).toContain('消息 1（首条：ext hi')
      expect(read).toContain('工具调用 1：bash')
    } finally {
      process.env.DSH_HOME = previousHome
      rmSync(dshHome, { recursive: true, force: true })
      rmSync(installDir, { recursive: true, force: true })
    }
  })
})
