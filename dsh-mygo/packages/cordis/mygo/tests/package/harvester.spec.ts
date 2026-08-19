/**
 * 收割器 + 双存在检测测试（B11/B12/T12/T13）：三原则只读/告警级/永不阻断；
 * EXT-1 锚定；dsh-cc-tui / dsh-vibe-mode 现实样本形态。
 */

import { describe, expect, it } from 'vitest'
import { harvestPackageMetadata, CORDIS_DSH_ANCHORS } from '../../src/package/harvester.ts'
import { detectDualPresence } from '../../src/package/dual-presence.ts'

describe('npm metadata harvester (B11/T13)', () => {
  it('normalizes engines.dsh directly to the core range', () => {
    const result = harvestPackageMetadata({
      name: 'zotero-wave-rag',
      version: '0.1.0',
      engines: { dsh: '>=0.0.1' },
    })
    expect(result.coreRange).toBe('*')
    expect(result.signals[0]).toMatchObject({ kind: 'engines.dsh', raw: '>=0.0.1' })
  })

  it('maps the known cordis peer anchor via EXT-1 and warns on unmappable peers', () => {
    expect(CORDIS_DSH_ANCHORS[0]).toEqual({ dsh: '0.0.1-rc.1', cordis: '4.0.1-rc.1', npm: '^4.0.0-rc.7' })
    const anchored = harvestPackageMetadata({
      name: 'p',
      peerDependencies: { cordis: '^4.0.0-rc.7' },
    })
    expect(anchored.coreRange).toBe('0.0.1-rc.1')
    const unmappable = harvestPackageMetadata({
      name: 'p',
      peerDependencies: { cordis: '^4.1.0' },
    })
    expect(unmappable.coreRange).toBeUndefined()
    expect(unmappable.warnings.some(line => line.includes('EXT-1'))).toBe(true)
  })

  it('falls back to dsh-tools / service peers and never blocks', () => {
    const result = harvestPackageMetadata({
      name: 'p',
      peerDependencies: {
        '@deepseek-ai/dsh-tools': '^0.0.1',
        '@deepseek-ai/dsh-skill': '*',
      },
    })
    expect(result.coreRange).toBe('*')
    expect(result.signals.map(item => item.kind)).toEqual(['dsh-tools-peer', 'dsh-service-peer'])
    expect(result.warnings).toEqual([])
  })
})

describe('dual presence detection (B12/T12)', () => {
  it('warns on npm-nested registered plugins without blocking (dsh-cc-tui 样本形态)', () => {
    const warnings = detectDualPresence({
      pluginId: 'dsh-cc-tui',
      dependencies: { '@deepseek-ai/dsh-working-activity': 'workspace:^' },
      registeredIds: new Set(['dsh-cc-tui', '@deepseek-ai/dsh-working-activity']),
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      kind: 'npm-nested-plugin',
      target: '@deepseek-ai/dsh-working-activity',
    })
  })

  it('warns on service-requirement overlaps with plugin ids (dsh-vibe-mode 样本形态)', () => {
    const warnings = detectDualPresence({
      pluginId: 'dsh-vibe-mode',
      serviceRequirements: { 'voice-chat': '>=0.1.0', 'dsh-voice-chat': '>=0.1.0' },
      registeredIds: new Set(['dsh-voice-chat']),
    })
    expect(warnings.some(item => item.kind === 'service-requirement' && item.target === 'dsh-voice-chat')).toBe(true)
  })

  it('is silent when nothing overlaps', () => {
    expect(detectDualPresence({
      pluginId: 'p',
      dependencies: { lodash: '^4.0.0' },
      registeredIds: new Set(['q']),
    })).toEqual([])
  })
})
