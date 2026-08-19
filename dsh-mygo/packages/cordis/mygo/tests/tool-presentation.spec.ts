/**
 * Managed tool presentation surface: the facade must carry
 * `output.render` / `output.presentationMeta` / `presentCall` /
 * `presentResult` through to the host registry view, or tools like
 * dsh-visualize lose their replay meta (tool/result meta becomes null and
 * the browser falls back to generic text).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DispatchMachine, InMemoryRegistryStore, LifecycleEngine, resolvePluginManagerConfig } from '@r05en1cu/dsh-mygo'

describe('managed tool presentation surface', () => {
  it('forwards presentationMeta / render / presentResult to the host view', async () => {
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
    const raw = {
      name: 'present-tool',
      inject: ['tools'],
      apply(ctx: { tools: { register(tool: unknown): unknown } }): void {
        ctx.tools.register({
          name: 'present',
          description: 'presentation surface probe',
          parameters: {},
          output: {
            schema: { type: 'string' },
            render: (_args: unknown, value: unknown) => [{ type: 'text', text: `R:${String(value)}` }],
            presentationMeta: (_args: unknown, value: unknown) => ({ kind: 'viz', value }),
          },
          presentCall: () => ({ card: 'call' }),
          presentResult: () => ({ card: 'result' }),
          execute: () => 'ok',
        })
      },
    }
    await engine.adoptRaw(raw as never, {}, 'present-tool', { version: '1.0.0' })
    const view = captured.find(entry => entry.name === 'present') as {
      readonly output: {
        readonly presentationMeta?: (args: unknown, value: unknown) => unknown
        render(args: unknown, value: unknown): unknown
      }
      readonly presentCall?: (args: unknown) => unknown
      readonly presentResult?: (args: unknown, result: unknown) => unknown
    }
    expect(view).toBeDefined()
    expect(view.output.presentationMeta?.({}, 'v')).toEqual({ kind: 'viz', value: 'v' })
    expect(view.output.render({}, 'v')).toEqual([{ type: 'text', text: 'R:v' }])
    expect(view.presentCall?.({})).toEqual({ card: 'call' })
    expect(view.presentResult?.({}, {})).toEqual({ card: 'result' })
  })

  it('forwards timeoutMs / isConcurrencySafe / finalizeContent to the host view', async () => {
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
    const isConcurrencySafe = (args: unknown): boolean => args === 'parallel-ok'
    const finalizeContent = (): Array<{ type: 'text'; text: string }> => [{ type: 'text', text: 'finalized' }]
    const raw = {
      name: 'field-tool',
      inject: ['tools'],
      apply(ctx: { tools: { register(tool: unknown): unknown } }): void {
        ctx.tools.register({
          name: 'fields',
          description: 'field passthrough probe',
          parameters: {},
          output: { schema: { type: 'string' } },
          timeoutMs: 1234,
          isConcurrencySafe,
          finalizeContent,
          execute: () => 'ok',
        })
      },
    }
    await engine.adoptRaw(raw as never, {}, 'field-tool', { version: '1.0.0' })
    const view = captured.find(entry => entry.name === 'fields') as {
      readonly timeoutMs?: number
      readonly isConcurrencySafe?: (args: unknown) => boolean
      readonly finalizeContent?: (exec: unknown, result: unknown) => unknown[] | undefined
    }
    expect(view).toBeDefined()
    expect(view.timeoutMs).toBe(1234)
    expect(view.isConcurrencySafe?.('parallel-ok')).toBe(true)
    expect(view.isConcurrencySafe?.('other')).toBe(false)
    expect(view.finalizeContent?.({}, {})).toEqual([{ type: 'text', text: 'finalized' }])
  })
})
