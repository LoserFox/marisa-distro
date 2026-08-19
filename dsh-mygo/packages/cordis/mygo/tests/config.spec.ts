/**
 * Manager Config contract: T6 defaults, the stateRoot harness default, and
 * loud rejection of invalid input. Permission grants are gone.
 */

import { describe, expect, it } from 'vitest'
import { resolvePluginManagerConfig } from '@r05en1cu/dsh-mygo'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

describe('resolvePluginManagerConfig', () => {
  it('applies the T6 defaults for an absent input', () => {
    const config = resolvePluginManagerConfig()
    expect(config).toMatchObject({
      maxCodeBytes: 256 * 1024,
      maxRegistryBytes: 64 * 1024 * 1024,
      maxDynamicPlugins: 1000,
      auditMaxBytes: 50 * 1024 * 1024,
      auditKeepFiles: 5,
      historyKeep: 2,
      swapTimeoutMs: 30_000,
      protectedFields: [],
    })
    expect(config.stateRoot).toBe(dshHomePath('plugin-state'))
  })

  it('honors explicit scalars and deployment fields', () => {
    const config = resolvePluginManagerConfig({
      maxCodeBytes: 1024,
      swapTimeoutMs: 500,
      stateRoot: '/srv/plugin-state',
      protectedFields: ['tools/post-execute.result'],
    })
    expect(config.maxCodeBytes).toBe(1024)
    expect(config.swapTimeoutMs).toBe(500)
    expect(config.stateRoot).toBe('/srv/plugin-state')
    expect(config.protectedFields).toEqual(['tools/post-execute.result'])
  })

  it('rejects invalid quota values', () => {
    expect(() => resolvePluginManagerConfig({ maxCodeBytes: 0 })).toThrow()
    expect(() => resolvePluginManagerConfig({ historyKeep: 0 })).toThrow()
    expect(() => resolvePluginManagerConfig({ swapTimeoutMs: 0 })).toThrow()
  })
})
