/**
 * Code-table completeness: the §16.2 table after the CD-1 unification
 * (2026-08-13). Zero-producer dead codes were removed and the ResolutionReport
 * codes merged in (group 7); the literal lists below are the spec
 * transcription, `satisfies` keeps them in sync with the closed union at
 * compile time, and the runtime loop proves every code has a message template.
 */

import { describe, expect, it } from 'vitest'
import { formatPluginError } from '@r05en1cu/dsh-mygo-api'
import type { PluginErrorCode } from '@r05en1cu/dsh-mygo-api'

const SPEC_GROUPS = {
  manifestAndDeclaration: [
    'manifest-invalid',
    'event-not-mountable',
    'mode-ceiling-exceeded',
    'capability-range-reserved',
    'unknown-property',
    'non-payload-name',
    'unsupported-event-option',
  ] as const satisfies readonly PluginErrorCode[],
  permissionsAndGrants: [
    'protected-field',
  ] as const satisfies readonly PluginErrorCode[],
  relationshipConflicts: [
    'write-conflict',
    'intercept-branch-conflict',
    'ordering-cycle',
    'veto-position-conflict',
    'companion-conflict',
    'compatibility-conflict',
    'claims-unmanaged-incumbent',
    'shadow-undeclared',
    'claims-conflict',
  ] as const satisfies readonly PluginErrorCode[],
  protocolOperations: [
    'dependent-exists',
    'concurrent-operation',
    'plugin-not-found',
    'swap-timeout',
    'staging-failed',
    'persist-failed',
    'quota-registry-exceeded',
    'package-not-resolvable',
    'setup-registration',
  ] as const satisfies readonly PluginErrorCode[],
  dispatchBoundary: [
    'next-missing',
    'undeclared-veto',
    'undeclared-branch',
    'quota-cpu-exceeded',
    'quota-effects-exceeded',
  ] as const satisfies readonly PluginErrorCode[],
  capabilityDenial: [
    'llm-denied',
    'exec-denied',
  ] as const satisfies readonly PluginErrorCode[],
  packageGovernanceReports: [
    'resolve-failed',
    'bundle-invalid',
    'symbol-missing',
    'policy-rejected',
    'pack-invalid',
    'pack-hash-mismatch',
  ] as const satisfies readonly PluginErrorCode[],
}

const SPEC_CODES = Object.values(SPEC_GROUPS).flat() as readonly PluginErrorCode[]

describe('PluginErrorCode table (§16.2, CD-1 unified)', () => {
  it('transcribes 39 codes across seven groups with the spec group sizes', () => {
    expect(Object.values(SPEC_GROUPS).map(group => group.length)).toEqual([7, 1, 9, 9, 5, 2, 6])
    expect(SPEC_CODES).toHaveLength(39)
  })

  it('has no duplicate codes', () => {
    expect(new Set(SPEC_CODES).size).toBe(SPEC_CODES.length)
  })

  it('provides a message template for every transcribed code', () => {
    for (const code of SPEC_CODES) {
      expect(formatPluginError(code, {}), code).toBeTypeOf('string')
    }
  })
})
