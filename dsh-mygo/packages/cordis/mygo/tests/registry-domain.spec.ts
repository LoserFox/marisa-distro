/**
 * Registry domain declaration (#17, §22.1): profile-name sanitization with
 * the spec's written rules and the per-profile `gens`/`status` opaque-TEXT
 * domain spec.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fnv1a, pluginRegistryDomainSpec, sanitizeProfileName } from '@r05en1cu/dsh-mygo'

describe('sanitizeProfileName', () => {
  it('lowercases and replaces illegal characters with underscores', () => {
    expect(sanitizeProfileName('My Profile')).toBe('my_profile')
    expect(sanitizeProfileName('UPPER_Ä')).toBe('upper__')
  })

  it('prefixes a non-letter first character with p_', () => {
    expect(sanitizeProfileName('123abc')).toBe('p_123abc')
    expect(sanitizeProfileName('_')).toBe('p__')
    expect(sanitizeProfileName('')).toBe('p_')
  })

  it('appends the fnv1a eight-hex suffix on a collision', () => {
    const expected = `abc_${fnv1a('abc').toString(16).padStart(8, '0')}`
    expect(sanitizeProfileName('abc', new Set(['abc']))).toBe(expected)
    expect(sanitizeProfileName('abc', new Set())).toBe('abc')
  })

  it('stays within UNIT_NAME_RE for every input', () => {
    for (const profile of ['A B', '9x', '_', 'a.b/c', '中文', '']) {
      expect(sanitizeProfileName(profile)).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })
})

describe('pluginRegistryDomainSpec', () => {
  it('declares the per-profile domain with opaque TEXT tables', () => {
    const spec = pluginRegistryDomainSpec('Main')
    expect(spec.name).toBe('plugin_registry_main')
    expect(spec.version).toBe(1)
    expect(Object.keys(spec.tables)).toEqual(['gens', 'status'])
    expect(spec.tables.gens?.valueSchema.parse('{"v":1}')).toBe('{"v":1}')
    expect(spec.tables.status?.valueSchema.parse('{"v":1}')).toBe('{"v":1}')
    expect(spec.tables.gens?.valueSchema.safeParse(42).success).toBe(false)
  })

  it('sanitizes the profile into the unit name', () => {
    expect(pluginRegistryDomainSpec('Dev Profile').name).toBe('plugin_registry_dev_profile')
    expect(pluginRegistryDomainSpec('1x', new Set(['p_1x'])).name)
      .toBe(`plugin_registry_p_1x_${fnv1a('1x').toString(16).padStart(8, '0')}`)
  })

  it('uses zod strings for the opaque record boundary', () => {
    const spec = pluginRegistryDomainSpec('x')
    expect(spec.tables.gens?.valueSchema).toBeInstanceOf(z.ZodString)
    expect(spec.tables.status?.valueSchema).toBeInstanceOf(z.ZodString)
  })
})
