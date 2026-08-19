/**
 * Message-template contract: every §16.2 code's message must name every
 * "naming X" entity the spec attaches to that code. Each case supplies those
 * entities as details and asserts each appears in the generated message.
 *
 * CD-1 统一（2026-08-13）：零生产者死码（grant-missing / install-denied /
 * ceiling-exceeded / source-not-allowed / provenance-rejected / fs-denied /
 * network-denied / vars-denied / http-denied / emit-denied）已删除；
 * ResolutionReport 的报告码（组 7）并入本表。
 */

import { describe, expect, it } from 'vitest'
import { PluginError, formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type { PluginErrorCode } from '@r05en1cu/dsh-mygo-api'

interface MessageCase {
  readonly code: PluginErrorCode
  readonly details: Record<string, unknown>
  /** Rendered entities the §16.2 comment requires the message to name. */
  readonly named: readonly string[]
}

const CASES: readonly MessageCase[] = [
  {
    code: 'manifest-invalid',
    details: { field: 'permissions.observe', expected: 'string[]' },
    named: ['permissions.observe', 'string[]'],
  },
  {
    code: 'event-not-mountable',
    details: { event: 'internal/update', tier: 'harness' },
    named: ['internal/update', 'harness'],
  },
  {
    code: 'mode-ceiling-exceeded',
    details: { event: 'tools/pre-execute', mode: 'transform', ceiling: 'observe' },
    named: ['tools/pre-execute', 'transform', 'observe'],
  },
  {
    code: 'capability-range-reserved',
    details: { entry: 'loop-detection@2', note: 'v2 name@range' },
    named: ['loop-detection@2', 'v2 name@range'],
  },
  {
    code: 'unknown-property',
    details: { event: 'tools/post-execute', name: 'modle', valid: ['accept', 'deny'] },
    named: ['tools/post-execute', 'modle', 'accept, deny'],
  },
  {
    code: 'non-payload-name',
    details: { name: 'service:memory.pending', boundary: 'payload properties only' },
    named: ['service:memory.pending', 'payload properties only'],
  },
  {
    code: 'unsupported-event-option',
    details: { option: 'prepend' },
    named: ['prepend'],
  },
  {
    code: 'protected-field',
    details: { field: 'tools/post-execute.result' },
    named: ['tools/post-execute.result'],
  },
  {
    code: 'write-conflict',
    details: { a: 'plugin-a', b: 'plugin-b', property: 'decisions', scope: 'agent-7' },
    named: ['plugin-a', 'plugin-b', 'decisions', 'agent-7'],
  },
  {
    code: 'intercept-branch-conflict',
    details: { a: 'plugin-a', b: 'plugin-b', event: 'tools/post-execute', branch: 'allow' },
    named: ['plugin-a', 'plugin-b', 'tools/post-execute', 'allow'],
  },
  {
    code: 'ordering-cycle',
    details: { cycle: ['plugin-a', 'plugin-b', 'plugin-a'], scope: 'global' },
    named: ['plugin-a, plugin-b, plugin-a', 'global'],
  },
  {
    code: 'veto-position-conflict',
    details: { a: 'plugin-a', b: 'plugin-b' },
    named: ['plugin-a', 'plugin-b'],
  },
  {
    code: 'companion-conflict',
    details: { companion: 'plugin-c' },
    named: ['plugin-c'],
  },
  {
    code: 'compatibility-conflict',
    details: {
      plugin: 'memory-doctor',
      violations: [
        'requires old-memory-policy@<2.0.0: 已装 old-memory-policy@1.4.3（由 memory-doctor 声明）',
        'breaks acme-legacy@>=1.0.0: 已装 acme-legacy@1.2.0（由 memory-doctor 声明）',
      ],
    },
    named: ['memory-doctor', 'old-memory-policy@1.4.3', 'acme-legacy@1.2.0'],
  },
  {
    code: 'claims-unmanaged-incumbent',
    details: { slot: 'service:raw' },
    named: ['service:raw', 'manager authority covers only the set it registered'],
  },
  {
    code: 'shadow-undeclared',
    details: { tool: 'bash', holder: 'layer:user' },
    named: ['bash', 'layer:user'],
  },
  {
    code: 'claims-conflict',
    details: { a: 'plugin-a', b: 'plugin-b', slot: 'service:memory', scope: 'agent-1' },
    named: ['plugin-a', 'plugin-b', 'service:memory', 'agent-1'],
  },
  {
    code: 'dependent-exists',
    details: { dependents: ['plugin-b', 'plugin-c'] },
    named: ['plugin-b, plugin-c'],
  },
  {
    code: 'concurrent-operation',
    details: { id: 'plugin-a', operation: 'replace' },
    named: ['plugin-a', 'replace'],
  },
  {
    code: 'plugin-not-found',
    details: { id: 'plugin-a', operation: 'enable' },
    named: ['plugin-a', 'enable', 'caller bug'],
  },
  {
    code: 'swap-timeout',
    details: { policy: 'drain', waitedMs: 1200 },
    named: ['drain', '1200'],
  },
  {
    code: 'staging-failed',
    details: { stage: 'setup', cause: 'index build failed' },
    named: ['setup', 'index build failed'],
  },
  {
    code: 'persist-failed',
    details: { operation: 'install', table: 'gens' },
    named: ['install', 'gens'],
  },
  {
    code: 'quota-registry-exceeded',
    details: { limit: '64MB', current: '65MB' },
    named: ['64MB', '65MB', 'uninstall plugins to free capacity'],
  },
  {
    code: 'package-not-resolvable',
    details: { package: 'some-plugin', anchors: ['profile', 'pnpm'] },
    named: ['some-plugin', 'profile, pnpm'],
  },
  {
    code: 'setup-registration',
    details: { method: 'registerTool' },
    named: ['registerTool'],
  },
  {
    code: 'next-missing',
    details: { plugin: 'plugin-a', event: 'tools/pre-execute' },
    named: ['plugin-a', 'tools/pre-execute'],
  },
  {
    code: 'undeclared-veto',
    details: { plugin: 'plugin-a', event: 'agent/request-error' },
    named: ['plugin-a', 'agent/request-error'],
  },
  {
    code: 'undeclared-branch',
    details: { plugin: 'plugin-a', event: 'tools/post-execute', branch: 'maybe' },
    named: ['plugin-a', 'tools/post-execute', 'maybe'],
  },
  {
    code: 'quota-cpu-exceeded',
    details: {},
    named: [],
  },
  {
    code: 'quota-effects-exceeded',
    details: { kind: 'tool', limit: 50 },
    named: ['tool', '50'],
  },
  {
    code: 'llm-denied',
    details: { plugin: 'plugin-a', model: 'probe-model' },
    named: ['plugin-a', 'probe-model'],
  },
  {
    code: 'exec-denied',
    details: { plugin: 'plugin-a', command: 'gh' },
    named: ['plugin-a', 'gh'],
  },
  // 组 7：包治理报告码（CD-1 并入）
  {
    code: 'resolve-failed',
    details: { package: '@scope/pkg', reasons: ['没有候选版本满足区间 ^2.0.0'] },
    named: ['@scope/pkg', '没有候选版本满足区间 ^2.0.0'],
  },
  {
    code: 'bundle-invalid',
    details: { plugin: 'plugin-a', problems: ['bundles.x.path 逃逸'] },
    named: ['plugin-a', 'bundles.x.path 逃逸'],
  },
  {
    code: 'symbol-missing',
    details: { plugin: 'plugin-a', symbols: ['cordis#Context'] },
    named: ['plugin-a', 'cordis#Context'],
  },
  {
    code: 'policy-rejected',
    details: { plugin: 'plugin-a', violations: ['service-missing: voice-chat'] },
    named: ['plugin-a', 'service-missing: voice-chat'],
  },
  {
    code: 'pack-invalid',
    details: { problems: ['plugins 数组为空'] },
    named: ['plugins 数组为空'],
  },
  {
    code: 'pack-hash-mismatch',
    details: { files: ['files/0.tgz'] },
    named: ['files/0.tgz'],
  },
]

describe('PluginError message templates (§16.2)', () => {
  it('covers every transcribed code exactly once', () => {
    const codes = CASES.map(entry => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toHaveLength(39)
  })

  it('names every "naming X" entity for each code', () => {
    for (const entry of CASES) {
      const message = formatPluginError(entry.code, entry.details)
      expect(message, entry.code).not.toBe('')
      for (const name of entry.named) {
        expect(message, `${entry.code} must name ${JSON.stringify(name)}`).toContain(name)
      }
    }
  })
})

describe('PluginError', () => {
  it('carries name, code, details, and pluginId', () => {
    const error = new PluginError('pack-invalid', 'pack invalid', { problems: [] }, 'plugin-a')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(PluginError)
    expect(error.name).toBe('PluginError')
    expect(error.code).toBe('pack-invalid')
    expect(error.message).toBe('pack invalid')
    expect(error.details).toEqual({ problems: [] })
    expect(error.pluginId).toBe('plugin-a')
  })

  it('defaults details to an empty record and pluginId to undefined', () => {
    const error = new PluginError('resolve-failed', 'resolve failed')
    expect(error.details).toEqual({})
    expect(error.pluginId).toBeUndefined()
  })

  it('keeps the code stable on Error subclasses', () => {
    const error = new PluginError('manifest-invalid', 'manifest invalid')
    expect(Object.prototype.hasOwnProperty.call(error, 'code')).toBe(true)
    expect(error.toString()).toContain('PluginError')
  })
})
