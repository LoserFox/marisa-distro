/**
 * 版本比较逻辑：v 前缀归一化、缺失段补 0、prerelease 后缀排序
 * （无后缀 > 有后缀；数字标识 < 字母标识）。
 */
import { describe, expect, it } from 'vitest'
import { compareVersions, hasUpdate, normalizeVersion } from '../src/semver.ts'

describe('normalizeVersion', () => {
  it('strips the v prefix (both cases) and surrounding whitespace', () => {
    expect(normalizeVersion('v0.1.6')).toBe('0.1.6')
    expect(normalizeVersion('V1.2.3')).toBe('1.2.3')
    expect(normalizeVersion(' 0.1.6 ')).toBe('0.1.6')
    expect(normalizeVersion('0.1.6')).toBe('0.1.6')
    expect(normalizeVersion('v0.1.7-rc.1')).toBe('0.1.7-rc.1')
  })
})

describe('compareVersions', () => {
  it('compares numeric segments', () => {
    expect(compareVersions('0.1.6', '0.1.6')).toBe(0)
    expect(compareVersions('0.1.6', '0.1.7')).toBeLessThan(0)
    expect(compareVersions('0.1.7', '0.1.6')).toBeGreaterThan(0)
    expect(compareVersions('0.9', '0.10')).toBeLessThan(0)
  })

  it('treats v-prefixed and bare forms as equal', () => {
    expect(compareVersions('v0.1.6', '0.1.6')).toBe(0)
    expect(compareVersions('0.1.7', 'v0.1.6')).toBeGreaterThan(0)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('0.1', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.6', '0.1')).toBeGreaterThan(0)
  })

  it('orders prerelease suffixes below the release', () => {
    expect(compareVersions('0.1.7-rc.1', '0.1.7')).toBeLessThan(0)
    expect(compareVersions('0.1.7', '0.1.7-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('0.1.7-rc.1', '0.1.7-rc.2')).toBeLessThan(0)
    expect(compareVersions('0.1.7-rc.2', '0.1.7-rc.1')).toBeGreaterThan(0)
  })

  it('compares numeric vs alphanumeric prerelease identifiers per semver', () => {
    expect(compareVersions('0.1.7-1', '0.1.7-alpha')).toBeLessThan(0)
    expect(compareVersions('0.1.7-rc.1', '0.1.7-rc.1.1')).toBeLessThan(0)
  })

  it('falls back to lexical comparison for non-semver inputs', () => {
    expect(compareVersions('dirty', '0.1.6')).toBeGreaterThan(0)
    expect(compareVersions('0.1.6', '0.1.6')).toBe(0)
  })
})

describe('hasUpdate', () => {
  it('detects a newer latest across v-prefix normalization', () => {
    expect(hasUpdate('0.1.6', 'v0.1.7')).toBe(true)
    expect(hasUpdate('0.1.7', '0.1.6')).toBe(false)
    expect(hasUpdate('0.1.6', '0.1.6')).toBe(false)
    expect(hasUpdate('0.1.6', '0.1.7-rc.1')).toBe(true)
  })
})
