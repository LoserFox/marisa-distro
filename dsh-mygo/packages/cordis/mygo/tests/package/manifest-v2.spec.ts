/**
 * manifest v2 测试：五字段、预发布版本、区间强制、裸包名拒绝、legacy 别名。
 */

import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parsePackageManifest } from '../../src/package/manifest-v2.ts'

describe('manifest v2', () => {
  it('parses the required fields from dsh.mygo', () => {
    const result = parsePackageManifest({
      name: '@dsh-external/tool',
      version: '0.0.1-rc.1',
      main: 'lib/index.js',
      dsh: {
        mygo: {
          id: 'tool',
          version: '0.0.1-rc.2',
          entry: 'lib/index.js',
          core: '>=0.0.1-rc.1',
        },
      },
    })
    expect(result.problems).toEqual([])
    expect(result.value).toMatchObject({
      id: 'tool',
      version: '0.0.1-rc.2',
      entry: 'lib/index.js',
      core: '>=0.0.1-rc.1',
    })
  })

  it('defaults id/version/entry from package.json', () => {
    const result = parsePackageManifest({
      name: '@dsh-external/x',
      version: '1.2.3',
      main: 'main.js',
      dsh: { mygo: { core: '>=1.0.0' } },
    })
    expect(result.problems).toEqual([])
    expect(result.value).toMatchObject({ id: 'x', version: '1.2.3', entry: 'main.js', core: '>=1.0.0' })
  })

  it('rejects legacy top-level depends/breaks with rewrite guidance (2026-08-13 字段移除)', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: { mygo: { depends: { B: '>=1.0.0' }, breaks: { old: '<2.0.0' } } },
    })
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.depends'
      && problem.message.includes('compatibility'))).toBe(true)
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.breaks'
      && problem.message.includes('compatibility'))).toBe(true)
  })

  it('passes the compatibility block through read-only (no solving)', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      main: 'index.js',
      dsh: {
        mygo: {
          compatibility: {
            requires: { base: '>=2.0.0' },
            breaks: { old: '<2.0.0' },
          },
        },
      },
    })
    expect(result.problems).toEqual([])
    expect(result.value?.compatibility).toEqual({ requires: { base: '>=2.0.0' }, breaks: { old: '<2.0.0' } })
  })

  it('warns (not blocks) when core is undeclared', () => {
    const result = parsePackageManifest({ name: 'x', version: '1.0.0', main: 'index.js' })
    expect(result.problems).toEqual([])
    expect(result.warnings.some(line => line.includes('core'))).toBe(true)
    expect(result.value?.core).toBe('*')
  })

  it('rejects an entry escaping the package directory', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: { mygo: { entry: '../outside.js' } },
    })
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.entry')).toBe(true)
  })

  it('parses bundles, loader, patches and shared', () => {
    const result = parsePackageManifest({
      name: 'fabric',
      version: '0.0.2',
      main: 'lib/index.js',
      dsh: {
        mygo: {
          entry: 'lib/index.js',
          core: '*',
          shared: true,
          bundles: [{ id: 'transformer', version: '0.18.1', path: 'vendor/transformer' }],
          loader: { id: 'mixin', range: '>=1.0.0 <2.0.0' },
          patches: [{ id: 'p1', target: { module: 'dsh-core', symbol: 'Session.start', operation: 'before' } }],
        },
      },
    })
    expect(result.problems).toEqual([])
    expect(result.value?.bundles).toEqual([{ id: 'transformer', version: '0.18.1', path: 'vendor/transformer' }])
    expect(result.value?.loader).toEqual({ id: 'mixin', range: '>=1.0.0 <2.0.0' })
    expect(result.value?.patches?.[0]?.target.symbol).toBe('Session.start')
    expect(result.value?.shared).toBe(true)
  })

  it('rejects a bundle path escaping the package', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      main: 'index.js',
      dsh: { mygo: { bundles: [{ id: 'b', version: '1.0.0', path: '../outside' }] } },
    })
    expect(result.problems.some(problem => problem.path.includes('path'))).toBe(true)
  })

  it('parses the v3 field set (formatVersion/requires/recommends/symbolAliases/grants/environment)', () => {
    const result = parsePackageManifest({
      name: '@dsh-external/v3',
      version: '1.0.0',
      dsh: {
        mygo: {
          formatVersion: 1,
          entry: 'lib/index.js',
          core: '>=0.0.1-rc.1',
          requires: { 'voice-chat': '>=0.1.0', 'file-watch': ['>=1.0.0', '<2.0.0'] },
          recommends: { 'nice-to-have': '^0.1.0' },
          provides: ['alias-id'],
          symbolAliases: { b: 'c' },
          grants: { intercept: true, networkAccess: { allow: ['https://ok.dev'] } },
          environment: { platform: 'web' },
        },
      },
    })
    expect(result.problems).toEqual([])
    expect(result.value).toMatchObject({
      formatVersion: 1,
      requires: { 'voice-chat': '>=0.1.0', 'file-watch': ['>=1.0.0', '<2.0.0'] },
      recommends: { 'nice-to-have': '^0.1.0' },
      provides: ['alias-id'],
      symbolAliases: { b: 'c' },
      grants: { intercept: true, networkAccess: { allow: ['https://ok.dev'] } },
      environment: { platform: 'web' },
    })
  })

  it('rejects an unsupported formatVersion as manifest-invalid', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: { mygo: { formatVersion: 2, entry: 'index.js' } },
    })
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.formatVersion')).toBe(true)
  })

  it('strips service: keys of compatibility.requires into service-level requires; bare keys pass through', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      main: 'index.js',
      dsh: {
        mygo: {
          compatibility: {
            requires: {
              'dsh-voice-chat': '>=0.1.0',
              'service:voice-chat': '>=0.1.0',
            },
          },
        },
      },
    })
    expect(result.problems).toEqual([])
    expect(result.value?.compatibility).toEqual({ requires: { 'dsh-voice-chat': '>=0.1.0' } })
    expect(result.value?.requires).toEqual({ 'voice-chat': '>=0.1.0' })
  })

  it('rejects a service: prefix in the new requires namespace', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: { mygo: { requires: { 'service:voice-chat': '>=0.1.0' } } },
    })
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.requires.service:voice-chat')).toBe(true)
  })

  it('rejects same-name conflicts between new and compatibility declarations', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: {
        mygo: {
          requires: { 'voice-chat': '>=0.1.0' },
          compatibility: { requires: { 'service:voice-chat': '>=0.2.0' } },
        },
      },
    })
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.requires.voice-chat')).toBe(true)
  })

  it('rejects absolute, drive-letter and parent-traversal patch/bundle paths', () => {
    const result = parsePackageManifest({
      name: 'x',
      version: '1.0.0',
      dsh: {
        mygo: {
          entry: 'C:\\evil\\index.js',
          bundles: [{ id: 'b', version: '1.0.0', path: '/etc/outside' }],
          patches: [{ id: 'p1', file: '../../outside.patch', target: { module: 'm', symbol: 's', operation: 'before' } }],
        },
      },
    })
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.entry')).toBe(true)
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.bundles.b.path')).toBe(true)
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.patches.p1.file')).toBe(true)
  })

  it('rejects the legacy top-level depends in the dsh-vibe-mode reference implementation (T18/B2)', async () => {
    const raw = await readFile(
      '/home/rosen/workspace/dsh_dev/dsh-external-src/dsh-vibe-mode/package.json',
      'utf8',
    )
    const result = parsePackageManifest(JSON.parse(raw))
    // 存量语料的顶层 depends 按 2026-08-13 字段移除裁决显式拒绝（不改语料）。
    expect(result.value).toBeUndefined()
    expect(result.problems.some(problem => problem.path === 'dsh.mygo.depends')).toBe(true)
  })
})
