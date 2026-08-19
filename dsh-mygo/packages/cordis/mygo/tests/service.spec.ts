/**
 * PluginManagerService (#18): the pre-init guard fails loud when a caller
 * reaches the operation surface before `[Service.init]` settles.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { PluginManagerService, resolvePluginManagerConfig } from '@r05en1cu/dsh-mygo'

describe('PluginManagerService', () => {
  it('fails loud before initialization', async () => {
    const ctx = new Context()
    const service = new PluginManagerService(ctx, {
      ...resolvePluginManagerConfig(),
      profile: 'unit',
      cpuBudgetMs: 100,
    })
    expect(() => service.plugins()).toThrow(/not initialized/)
    await expect(service.plan({ op: 'uninstall', id: 'p' })).rejects.toThrow(/not initialized/)
    await expect(service.auditTail(1)).rejects.toThrow(/not initialized/)
  })
})
