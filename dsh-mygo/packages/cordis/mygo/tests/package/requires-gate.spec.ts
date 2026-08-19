/**
 * requires 政策闸测试（B6/T15/T20）：service-missing / provider-version-mismatch /
 * symbol-missing + INACTIVE 自动激活；不进依赖图、安装期不阻断；候选集来自观测。
 */

import { describe, expect, it } from 'vitest'
import { evaluateRequiresGate, requiresGateReport } from '../../src/package/requires-gate.ts'
import type { ProviderSymbolSnapshot } from '../../src/package/fine-epoch.ts'
import { ProviderObservationRegistry } from '../../src/package/provider-observations.ts'

describe('requires policy gate', () => {
  const snapshot = (version: string, exports: string[], aliases?: Record<string, string>): ProviderSymbolSnapshot => ({
    pluginId: 'voice-provider',
    version,
    exports,
    ...(aliases === undefined ? {} : { aliases }),
  })

  it('reports service-missing with the B19 candidate list and never blocks install-time resolution (T20)', () => {
    const observations = new ProviderObservationRegistry()
    observations.observe('voice-chat', 'voice-provider', '0.1.0', 1)
    const result = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.1.0' },
      snapshots: {},
      observations: { 'voice-chat': observations.candidates('voice-chat') },
    })
    expect(result.ok).toBe(false)
    expect(result.violations[0]).toMatchObject({
      kind: 'service-missing',
      service: 'voice-chat',
      range: '>=0.1.0',
    })
    expect(result.violations[0]?.candidates.map(item => item.pluginId)).toEqual(['voice-provider'])
  })

  it('detects provider-version-mismatch against the provider manifest version', () => {
    const result = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.2.0' },
      snapshots: { 'voice-chat': snapshot('0.1.0', ['speak']) },
      observations: {},
    })
    expect(result.ok).toBe(false)
    expect(result.violations[0]).toMatchObject({
      kind: 'provider-version-mismatch',
      providerVersion: '0.1.0',
    })
  })

  it('detects symbol-missing via the mount-time export snapshot and honors aliases (EB-D19)', () => {
    const withAlias = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.1.0' },
      snapshots: { 'voice-chat': snapshot('0.2.0', ['speak', 'stop'], { listen: 'speak' }) },
      observations: {},
      consumerSymbols: { 'voice-chat': ['speak', 'listen'] },
    })
    expect(withAlias.ok).toBe(true)
    const missing = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.1.0' },
      snapshots: { 'voice-chat': snapshot('0.2.0', ['speak']) },
      observations: {},
      consumerSymbols: { 'voice-chat': ['sing'] },
    })
    expect(missing.ok).toBe(false)
    expect(missing.violations[0]).toMatchObject({
      kind: 'symbol-missing',
      missingSymbols: ['sing'],
    })
  })

  it('accepts OR ranges and multiple services, requiring all of them', () => {
    const ok = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': ['>=0.1.0', '<0.3.0'], 'file-watch': '>=1.0.0' },
      snapshots: {
        'voice-chat': snapshot('0.2.0', ['speak']),
        'file-watch': snapshot('1.2.0', ['watch']),
      },
      observations: {},
    })
    expect(ok.ok).toBe(true)
    const oneMissing = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.1.0', 'file-watch': '>=2.0.0' },
      snapshots: {
        'voice-chat': snapshot('0.2.0', ['speak']),
        'file-watch': snapshot('1.2.0', ['watch']),
      },
      observations: {},
    })
    expect(oneMissing.ok).toBe(false)
    expect(oneMissing.violations[0]?.service).toBe('file-watch')
  })

  it('renders a service-scoped structured report with candidates and actions (B7/T1)', () => {
    const observations = new ProviderObservationRegistry()
    observations.observe('voice-chat', 'voice-provider', '0.1.0', 1)
    observations.updateState('voice-chat', 'voice-provider', 'inactive', 2)
    const result = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { 'voice-chat': '>=0.2.0' },
      snapshots: {},
      observations: { 'voice-chat': observations.candidates('voice-chat') },
    })
    const report = requiresGateReport(result)
    expect(report.code).toBe('policy-rejected')
    expect(report.scope).toBe('service')
    expect(report.conflicts[0]).toMatchObject({
      service: 'voice-chat',
      constraint: { kind: 'requires', range: '>=0.2.0' },
      chain: ['consumer', 'voice-chat'],
    })
    expect(report.conflicts[0]?.candidates[0]).toMatchObject({
      plugin: 'voice-provider',
      version: '0.1.0',
      state: 'inactive',
    })
    expect(report.conflicts[0]?.actions.join()).toContain('voice-provider')
  })
})

describe('原型安全查表（修复批次 2 / review#1 A1）', () => {
  const snapshot = (version: string, exports: string[]): ProviderSymbolSnapshot => ({
    pluginId: 'voice-provider',
    version,
    exports,
  })

  it('服务名 toString 无提供者 → service-missing（不命中 Object.prototype、不崩溃）', () => {
    const result = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { toString: '>=1.0.0' },
      snapshots: {},
      observations: {},
    })
    expect(result.ok).toBe(false)
    expect(result.violations[0]).toMatchObject({ kind: 'service-missing', service: 'toString' })
  })

  it('服务名 toString 有提供者且版本满足 → ok（自有键正常命中）', () => {
    const withProvider = evaluateRequiresGate({
      pluginId: 'consumer',
      requires: { toString: '>=1.0.0' },
      snapshots: { toString: snapshot('1.0.0', ['x']) },
      observations: {},
    })
    expect(withProvider.ok).toBe(true)
    expect(withProvider.violations).toEqual([])
  })
})
