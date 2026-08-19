/**
 * Minimal semver-range matcher: the vocabulary the compatibility checker
 * accepts, with the exact partial/wildcard shorthand the Fabric `depends`
 * ranges rely on.
 */

import { describe, expect, it } from 'vitest'
import { isValidRange, matchesVersionRange } from '@r05en1cu/dsh-mygo'
import { compareCodePoints, compareVersions, parseVersion } from '@r05en1cu/dsh-mygo'

describe('semver range matcher', () => {
  it('matches any-range and exact pins', () => {
    expect(matchesVersionRange('1.2.3', '*')).toBe(true)
    expect(matchesVersionRange('1.2.3', '1.2.3')).toBe(true)
    expect(matchesVersionRange('1.2.4', '1.2.3')).toBe(false)
    expect(matchesVersionRange('1.2.3', '=1.2.3')).toBe(true)
    expect(matchesVersionRange('1.2.4', '=1.2.3')).toBe(false)
  })

  it('matches comparison operators', () => {
    expect(matchesVersionRange('1.2.3', '>=0.4.0')).toBe(true)
    expect(matchesVersionRange('0.3.1', '>=0.4.0')).toBe(false)
    expect(matchesVersionRange('1.2.3', '>1.2.2')).toBe(true)
    expect(matchesVersionRange('1.2.2', '>1.2.2')).toBe(false)
    expect(matchesVersionRange('1.2.2', '<=1.2.2')).toBe(true)
    expect(matchesVersionRange('1.2.3', '<2.0.0')).toBe(true)
    expect(matchesVersionRange('2.0.0', '<2.0.0')).toBe(false)
  })

  it('matches partial exact shorthand as ranges', () => {
    expect(matchesVersionRange('1.8.0', '1')).toBe(true)
    expect(matchesVersionRange('2.0.0', '1')).toBe(false)
    expect(matchesVersionRange('1.2.9', '1.2')).toBe(true)
    expect(matchesVersionRange('1.3.0', '1.2')).toBe(false)
    expect(matchesVersionRange('1.2.9', '1.2.x')).toBe(true)
    expect(matchesVersionRange('1.3.0', '1.2.x')).toBe(false)
    expect(matchesVersionRange('1.9.0', '1.x')).toBe(true)
    expect(matchesVersionRange('2.0.0', '1.x')).toBe(false)
  })

  it('normalizes partial comparison operators the semver way', () => {
    expect(matchesVersionRange('1.2.0', '>1.2')).toBe(false)
    expect(matchesVersionRange('1.3.0', '>1.2')).toBe(true)
    expect(matchesVersionRange('1.2.0', '>1.2.0')).toBe(false)
    expect(matchesVersionRange('1.2.5', '>=1.2')).toBe(true)
    expect(matchesVersionRange('1.2.5', '<1.3')).toBe(true)
    expect(matchesVersionRange('1.3.0', '<1.3')).toBe(false)
    expect(matchesVersionRange('1.2.9', '<=1.2')).toBe(true)
    expect(matchesVersionRange('1.3.0', '<=1.2')).toBe(false)
    expect(matchesVersionRange('1.0.0', '>=1')).toBe(true)
    expect(matchesVersionRange('1.9.0', '<2')).toBe(true)
    expect(matchesVersionRange('2.0.0', '<2')).toBe(false)
  })

  it('matches caret and tilde ranges', () => {
    expect(matchesVersionRange('1.9.0', '^1.2.3')).toBe(true)
    expect(matchesVersionRange('2.0.0', '^1.2.3')).toBe(false)
    expect(matchesVersionRange('0.2.9', '^0.2.3')).toBe(true)
    expect(matchesVersionRange('0.3.0', '^0.2.3')).toBe(false)
    expect(matchesVersionRange('0.0.3', '^0.0.3')).toBe(true)
    expect(matchesVersionRange('0.0.4', '^0.0.3')).toBe(false)
    expect(matchesVersionRange('1.2.9', '~1.2.3')).toBe(true)
    expect(matchesVersionRange('1.3.0', '~1.2.3')).toBe(false)
    expect(matchesVersionRange('1.9.0', '~1')).toBe(true)
    expect(matchesVersionRange('2.0.0', '~1')).toBe(false)
    expect(matchesVersionRange('1.2.9', '~1.2')).toBe(true)
    expect(matchesVersionRange('1.3.0', '~1.2')).toBe(false)
  })

  it('supports AND and OR unions', () => {
    expect(matchesVersionRange('1.4.0', '>=0.4.0 <1.5.0')).toBe(true)
    expect(matchesVersionRange('1.6.0', '>=0.4.0 <1.5.0')).toBe(false)
    expect(matchesVersionRange('2.0.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(matchesVersionRange('1.5.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(matchesVersionRange('3.0.0', '^1.0.0 || ^2.0.0')).toBe(false)
  })

  it('compares prerelease identifiers', () => {
    expect(matchesVersionRange('1.2.3', '>=1.2.3-alpha')).toBe(true)
    expect(matchesVersionRange('1.2.3-alpha', '>=1.2.3-alpha')).toBe(true)
    expect(matchesVersionRange('1.2.3-alpha.1', '>=1.2.3-alpha')).toBe(true)
    expect(matchesVersionRange('1.2.3-beta', '>=1.2.3-alpha')).toBe(true)
    expect(matchesVersionRange('1.2.2', '>=1.2.3-alpha')).toBe(false)
  })

  it('gates prerelease candidates on explicit prerelease comparators (npm semver)', () => {
    expect(matchesVersionRange('1.0.1-rc.1', '>=1.0.0')).toBe(false)
    expect(matchesVersionRange('0.0.1-rc.2', '^0.0.1-rc.1')).toBe(true)
    expect(matchesVersionRange('0.0.2-rc.1', '^0.0.1-rc.1')).toBe(false)
    expect(matchesVersionRange('1.0.0', '>=1.0.0-rc.1')).toBe(true)
  })

  it('rejects unparsable versions and ranges', () => {
    expect(matchesVersionRange('abc', '>=1.0.0')).toBe(false)
    expect(matchesVersionRange('1.2.3', 'not-a-range')).toBe(false)
    expect(isValidRange('>=1.0.0')).toBe(true)
    expect(isValidRange('>=1.0.0 <2.0.0')).toBe(true)
    expect(isValidRange('not-a-range')).toBe(false)
    expect(isValidRange('')).toBe(false)
  })
})

describe('locale 确定性（修复批次 4 / review#1 A11 + review#2 A17）', () => {
  it('预发布标识符比较为码点序，与 locale 无关（tr 陷阱用例）', () => {
    const upper = parseVersion('1.0.0-I')
    const lower = parseVersion('1.0.0-i')
    const upperA = parseVersion('1.0.0-A')
    const lowerA = parseVersion('1.0.0-a')
    expect(upper).toBeDefined()
    expect(lower).toBeDefined()
    expect(upperA).toBeDefined()
    expect(lowerA).toBeDefined()
    // 陷阱存在性证据：ICU 显式 locale 下 'i' vs 'I' 顺序相反（tr=1 / en=-1）；
    // 'ı'（U+0131）不是合法 semver 标识符（parser 拒收），仅作 locale 陷阱演示，
    // 不参与版本比较。
    expect('i'.localeCompare('I', 'tr')).toBe(1)
    expect('i'.localeCompare('I', 'en')).toBe(-1)
    expect(parseVersion('1.0.0-ı')).toBeUndefined()
    // 我们的比较器与 locale 无关：码点序恒定（I 0x49 < i 0x69；A 0x41 < a 0x61）。
    expect(compareCodePoints('I', 'i')).toBeLessThan(0)
    expect(compareCodePoints('A', 'a')).toBeLessThan(0)
    const ordered = ['1.0.0-i', '1.0.0-a', '1.0.0-I', '1.0.0-A']
      .map(version => ({ version, parsed: parseVersion(version) as NonNullable<ReturnType<typeof parseVersion>> }))
      .sort((left, right) => compareVersions(left.parsed, right.parsed))
      .map(entry => entry.version)
    expect(ordered).toEqual(['1.0.0-A', '1.0.0-I', '1.0.0-a', '1.0.0-i'])
    // 排序结果不依赖 localeCompare：比较器无 locale 面，任何 locale 下字节级一致。
    expect(JSON.stringify(ordered)).toBe(JSON.stringify(['1.0.0-A', '1.0.0-I', '1.0.0-a', '1.0.0-i']))
  })
})
