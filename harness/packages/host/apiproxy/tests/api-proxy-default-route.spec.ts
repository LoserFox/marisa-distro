/**
 * The `api-gateway` settings section over a REAL settings provider: the
 * composition entry as the base layer, the wholesale replace the gateway
 * persists with, and the fallback when the provider detaches. The other model
 * specs drive hand-rolled `defaultTarget`/`persistDefaultTarget` closures, so
 * this is the only place the layering itself is exercised.
 */

import { describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import { Settings, installSettingsSection } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { API_GATEWAY_SETTINGS_NAMESPACE, DEFAULT_ROUTE_SCHEMA } from '../src/index.ts'
import type { DefaultRouteSettings } from '../src/index.ts'

/** The smallest real provider: one in-memory document, always writable. */
class MemorySettings extends Settings {
  doc: Record<string, unknown> = {}

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc = { ...this.doc, [ns]: structuredClone(section) }
    return Promise.resolve()
  }
}

/** Mount the gateway's own section wiring over a live provider. */
async function boot(entry: DefaultRouteSettings) {
  const ctx = new Context()
  const fiber = ctx.plugin(MemorySettings)
  await fiber.await()
  let route: () => DefaultRouteSettings = () => entry
  const consumer = ctx.plugin(function section(child: Context) {
    installSettingsSection(child, API_GATEWAY_SETTINGS_NAMESPACE, DEFAULT_ROUTE_SCHEMA, entry, {
      setSource: (current) => { route = current },
      onChange: () => {},
    })
  })
  await consumer.await()
  const settings = ctx.get('settings')
  if (settings === undefined) throw new Error('settings provider did not mount')
  return { ctx, fiber, consumer, settings, read: () => route() }
}

describe('the api-gateway default-route section', () => {
  it('resolves the composition entry until the user layer overrides it', async () => {
    const bench = await boot({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    expect(bench.read()).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })

    await bench.settings.replace(API_GATEWAY_SETTINGS_NAMESPACE, {
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high',
    })
    expect(bench.read()).toEqual({
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high',
    })
    await bench.ctx.fiber.dispose()
  })

  it('clears a stored effort when the next switch has none', async () => {
    const bench = await boot({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    await bench.settings.replace(API_GATEWAY_SETTINGS_NAMESPACE, {
      provider: 'acme-gateway', model: 'acme-large', reasoningEffort: 'high',
    })
    expect(bench.read().reasoningEffort).toBe('high')

    // The whole reason the gateway persists with `replace` rather than a merge
    // patch — and the reason `Config` carries no effort for the base layer to
    // re-inherit here. A stranded effort would fail the next session's first
    // request against a model that does not support it.
    await bench.settings.replace(API_GATEWAY_SETTINGS_NAMESPACE, {
      provider: 'acme-gateway', model: 'acme-plain',
    })
    expect(bench.read()).toEqual({ provider: 'acme-gateway', model: 'acme-plain' })
    await bench.ctx.fiber.dispose()
  })

  it('layers a hand-written partial section over the entry', async () => {
    const bench = await boot({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    // Someone editing settings.yaml by hand may name only the model. The
    // entry supplies the provider, which is what makes this legal — and is
    // exactly why an effort in the entry could never be cleared, so there
    // is none to inherit.
    await bench.settings.replace(API_GATEWAY_SETTINGS_NAMESPACE, { model: 'deepseek-reasoner' })
    expect(bench.read()).toEqual({ provider: 'deepseek-official', model: 'deepseek-reasoner' })
    await bench.ctx.fiber.dispose()
  })

  it('falls back to the composition entry when the provider detaches', async () => {
    const bench = await boot({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    await bench.settings.replace(API_GATEWAY_SETTINGS_NAMESPACE, {
      provider: 'acme-gateway', model: 'acme-large',
    })
    expect(bench.read().provider).toBe('acme-gateway')

    // A deployment that loses its settings provider keeps serving the route it
    // was composed with rather than the one it can no longer read.
    await bench.fiber.dispose()
    expect(bench.read()).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    await bench.ctx.fiber.dispose()
  })
})
