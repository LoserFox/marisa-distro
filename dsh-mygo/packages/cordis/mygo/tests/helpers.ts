/**
 * Shared fixtures for the dsh-mygo suites.
 */

import z from '@deepseek-ai/schemastery'
import type { PluginDefinition } from '@r05en1cu/dsh-mygo-api'

/** A valid minimal plugin manifest; overrides replace whole fields. */
export function fixturePlugin(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return {
    id: 'fixture-plugin',
    version: '1.0.0',
    kinds: ['fixture'],
    requires: [],
    provides: [],
    permissions: {
      observe: [],
      transform: [],
      intercept: [],
      position: 'derived',
      claims: [],
    },
    stateful: false,
    swapPolicy: 'immediate',
    config: z.object({}),
    hooks: {
      activate: () => {},
    },
    ...overrides,
  }
}
