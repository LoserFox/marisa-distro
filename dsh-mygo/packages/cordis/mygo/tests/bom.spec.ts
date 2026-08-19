/**
 * P4 BOM（Plan B）：导出、只读对账、target 校验、Markdown 渲染、脚手架
 * 数据读取。全部为纯函数/文件测试，不启动 manager。
 * @module @deepseek-ai/dsh-mygo/tests/bom.spec
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildBom,
  checkBom,
  checkTarget,
  loadBomTarget,
  renderBomMarkdown,
  type BomDocument,
  type BomCurrentMember,
} from '../src/bom.ts'
import { MYGO_MANAGER_CAPABILITY, MYGO_MANAGER_ID } from '../src/lifecycle.ts'

function member(id: string, version: string): BomCurrentMember {
  return { id, version, status: 'enabled' }
}

describe('BOM build (export)', () => {
  it('includes self as a first-class member with the implicit capability', () => {
    const bom = buildBom({
      profile: 'web',
      bridgePlugins: [
        {
          id: 'dsh-better-sidebar',
          version: '0.3.0',
          generation: 1,
          origin: 'static',
          status: 'enabled',
          kinds: [],
          requires: [],
          provides: [],
          orderNeutral: false,
          source: { type: 'static' },
        },
      ],
      bundles: [{ id: 'dsh-tool-json', version: '0.0.1' }],
      apps: [{ id: 'whale-girl', version: '1.2.3' }],
    })
    expect(bom.format).toBe('dsh.bom/v1')
    const selfIntent = bom.intent.members.find(memberEntry => memberEntry.id === MYGO_MANAGER_ID)
    expect(selfIntent?.rail).toBe('self')
    expect(selfIntent?.provides).toContain(MYGO_MANAGER_CAPABILITY)
    expect(selfIntent?.version.startsWith('^')).toBe(true)
    const selfLock = bom.lock.members.find(memberEntry => memberEntry.id === MYGO_MANAGER_ID)
    expect(selfLock?.version).not.toContain('^')
    expect(bom.intent.members.map(memberEntry => memberEntry.id)).toEqual(
      expect.arrayContaining(['dsh-better-sidebar', 'dsh-tool-json', 'whale-girl']),
    )
  })

  it('renders a human-readable markdown reference page', () => {
    const bom = buildBom({
      profile: 'web',
      bridgePlugins: [
        {
          id: 'dsh-better-sidebar',
          version: '0.3.0',
          generation: 1,
          origin: 'static',
          status: 'enabled',
          kinds: [],
          requires: [],
          provides: ['service:sidebar'],
          orderNeutral: false,
          source: { type: 'static' },
          compatibility: { depends: { 'service:mygo-core': '>=0.1.0' } },
        },
      ],
    })
    const md = renderBomMarkdown(bom)
    expect(md).toContain('# dsh-mygo BOM（web）')
    expect(md).toContain('| id | rail | intent | lock | provides |')
    expect(md).toContain('dsh-better-sidebar')
    expect(md).toContain('depends service:mygo-core >=0.1.0')
  })
})

describe('BOM check (read-only reconcile)', () => {
  const bom = (overrides?: Partial<BomDocument>): BomDocument => {
    const base = buildBom({
      profile: 'web',
      bridgePlugins: [
        {
          id: 'dsh-better-sidebar',
          version: '0.3.0',
          generation: 1,
          origin: 'static',
          status: 'enabled',
          kinds: [],
          requires: [],
          provides: [],
          orderNeutral: false,
          source: { type: 'static' },
        },
      ],
      bundles: [{ id: 'dsh-tool-json', version: '0.0.1' }],
    })
    return overrides === undefined ? base : { ...base, ...overrides }
  }

  const cleanCurrent: BomCurrentMember[] = [
    member('dsh-better-sidebar', '0.3.0'),
    member('dsh-tool-json', '0.0.1'),
    member(MYGO_MANAGER_ID, bom().lock.members.find(entry => entry.rail === 'self')!.version),
  ]

  it('reports clean when the current set matches the lock', () => {
    const report = checkBom(bom(), cleanCurrent)
    expect(report.clean).toBe(true)
    expect(report.missing).toEqual([])
    expect(report.extra).toEqual([])
    expect(report.drift).toEqual([])
    expect(report.violations).toEqual([])
  })

  it('detects missing / extra / drift without mutating anything', () => {
    const current: BomCurrentMember[] = [
      member('dsh-better-sidebar', '0.4.0'),
      member(MYGO_MANAGER_ID, bom().lock.members.find(entry => entry.rail === 'self')!.version),
      member('dsh-something-else', '1.0.0'),
    ]
    const report = checkBom(bom(), current)
    expect(report.missing).toContain('dsh-tool-json')
    expect(report.extra).toContain('dsh-something-else')
    expect(report.drift).toEqual([
      { id: 'dsh-better-sidebar', locked: '0.3.0', current: '0.4.0' },
    ])
    expect(report.clean).toBe(false)
  })

  it('reports constraint-chain violations from the lock', () => {
    const locked: BomDocument = {
      format: 'dsh.bom/v1',
      generated: { by: 'dsh-mygo', version: '0.1.0', profile: 'web', at: 'now' },
      intent: {
        members: [
          { id: 'a', rail: 'bridge', version: '^1.0.0', compatibility: { depends: { b: '>=2.0.0' } } },
          { id: 'b', rail: 'bridge', version: '^1.5.0' },
        ],
      },
      lock: { members: [{ id: 'a', rail: 'bridge', version: '1.0.0' }, { id: 'b', rail: 'bridge', version: '1.5.0' }] },
    }
    const current = [member('a', '1.0.0'), member('b', '1.5.0')]
    const report = checkBom(locked, current)
    expect(report.clean).toBe(false)
    expect(report.violations.join('\n')).toContain('depends b ">=2.0.0"')
  })

  it('resolves capability depends against the implicit self provider', () => {
    const locked = buildBom({
      profile: 'web',
      bridgePlugins: [
        {
          id: 'mygo-rdb',
          version: '0.1.0',
          generation: 1,
          origin: 'static',
          status: 'enabled',
          kinds: [],
          requires: [],
          provides: ['service:mygo-session-reader'],
          orderNeutral: false,
          source: { type: 'static' },
          compatibility: { depends: { 'service:mygo-core': '>=0.1.0' } },
        },
      ],
    })
    // 调用方（service）会显式带上 self；即使漏带，checkBom 的回退 self 也
    // 必须能解析 service:mygo-core，否则 extension 的 depends 全部误报未安装。
    const report = checkBom(locked, [member('mygo-rdb', '0.1.0')])
    expect(report.violations).toEqual([])
    expect(report.missing).toContain(MYGO_MANAGER_ID)
  })
})

describe('BOM check --target (new plugin vs ecosystem)', () => {
  const bom: BomDocument = {
    format: 'dsh.bom/v1',
    generated: { by: 'dsh-mygo', version: '0.1.0', profile: 'web', at: 'now' },
    intent: {
      members: [
        { id: MYGO_MANAGER_ID, rail: 'self', version: '^0.1.0', provides: [MYGO_MANAGER_CAPABILITY] },
        { id: 'b', rail: 'bridge', version: '^1.5.0' },
      ],
    },
    lock: {
      members: [
        { id: MYGO_MANAGER_ID, rail: 'self', version: '0.1.0' },
        { id: 'b', rail: 'bridge', version: '1.5.0' },
      ],
    },
  }

  it('accepts a target whose ranges fall inside the ecosystem band', () => {
    const report = checkTarget(bom, {
      id: 'my-new-plugin',
      version: '0.1.0',
      compatibility: { depends: { b: '>=1.5.0 <2.0.0', 'service:mygo-core': '>=0.1.0' } },
    })
    expect(report.ok).toBe(true)
    expect(report.violations).toEqual([])
  })

  it('rejects out-of-band ranges and breaks hits with chain reports', () => {
    const outOfBand = checkTarget(bom, {
      id: 'my-new-plugin',
      version: '0.1.0',
      compatibility: { depends: { b: '>=2.0.0' } },
    })
    expect(outOfBand.ok).toBe(false)
    expect(outOfBand.violations.join('\n')).toContain('depends b ">=2.0.0"')

    const breaksHit = checkTarget(bom, {
      id: 'my-new-plugin',
      version: '0.1.0',
      compatibility: { breaks: { b: '<2.0.0' } },
    })
    expect(breaksHit.ok).toBe(false)
    expect(breaksHit.violations.join('\n')).toContain('breaks b "<2.0.0"')
  })
})

describe('BOM target loader', () => {
  it('reads dsh.mygo declarations from a plugin package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mygo-bom-target-'))
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({
        name: 'dsh-from-bom',
        version: '0.2.0',
        dsh: {
          mygo: {
            entrypoints: { 'skill:roots': ['./skills'] },
            compatibility: { depends: { 'service:mygo-core': '>=0.1.0' } },
          },
        },
      }))
      const target = await loadBomTarget(dir)
      expect(target.id).toBe('dsh-from-bom')
      expect(target.version).toBe('0.2.0')
      expect(target.compatibility?.depends?.['service:mygo-core']).toBe('>=0.1.0')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects a directory without a versioned package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mygo-bom-bad-'))
    try {
      await expect(loadBomTarget(dir)).rejects.toThrow(/package\.json/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
