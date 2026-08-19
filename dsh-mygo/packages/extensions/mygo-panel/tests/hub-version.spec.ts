/**
 * hub-version 测试（P0 迁移自 omdsh-plughub version.ts 的 semver 语义）。
 * @module @r05en1cu/dsh-mygo-ext-panel/tests/hub-version
 */

import { describe, expect, it } from 'vitest'
import { compareVersions, hubUpdateStateOf, parseVersion } from '../src/hub-version.ts'

describe('parseVersion / compareVersions', () => {
  it('semver 排序：0.10.0 > 0.9.0，release > prerelease', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0-rc.2')).toBe(1)
    expect(compareVersions('1.0.0-rc.10', '1.0.0-rc.2')).toBe(1)
  })

  it('前置 v 与 build metadata 可解析', () => {
    expect(parseVersion('v1.2.3')).toMatchObject({ core: [1, 2, 3] })
    expect(compareVersions('1.2.3+build.1', '1.2.3')).toBe(0)
  })

  it('非 semver 返回 unknown', () => {
    expect(compareVersions('2024.03', '2024.04')).toBeUndefined()
    expect(compareVersions('latest', '1.0.0')).toBeUndefined()
  })
})

describe('hubUpdateStateOf', () => {
  it('available / current / unknown 三态', () => {
    expect(hubUpdateStateOf('0.2.0', '0.1.0')).toBe('available')
    expect(hubUpdateStateOf('0.1.0', '0.1.0')).toBe('current')
    expect(hubUpdateStateOf(undefined, '0.1.0')).toBe('unknown')
    expect(hubUpdateStateOf('latest', '0.1.0')).toBe('unknown')
  })
})
