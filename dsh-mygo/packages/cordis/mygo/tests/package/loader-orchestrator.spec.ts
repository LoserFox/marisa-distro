/**
 * loader 契约与相位化挂载测试（《第二轮增强》9/10/11/13 条）：
 * 契约校验、patch 冲突硬阻断、目标加载后注册显式报错、确定性 trace。
 */

import { describe, expect, it } from 'vitest'
import { validateLoaderDeclaration } from '../../src/package/loader-registry.ts'
import { MountOrchestrator, PatchLateRegistrationError } from '../../src/package/mount-orchestrator.ts'
import { detectPatchConflicts, deterministicPatchOrder, patchTargetKey } from '../../src/package/patch-table.ts'

const target = { module: 'dsh-core', filePath: 'lib/session.js', symbol: 'Session.start' }

describe('loader contract', () => {
  it('validates built-in loader ranges', () => {
    expect(validateLoaderDeclaration({ id: 'mixin', range: '>=1.0.0 <2.0.0' }).ok).toBe(true)
    expect(validateLoaderDeclaration({ id: 'mixin', range: '>=2.0.0' }).ok).toBe(false)
    expect(validateLoaderDeclaration({ id: 'future', range: '*' }).ok).toBe(false)
  })
})

describe('patch table', () => {
  it('detects two plugins rewriting the same symbol', () => {
    const conflicts = detectPatchConflicts([
      { plugin: 'dsh-fabric', patchId: 'p1', target },
      { plugin: 'other', patchId: 'p2', target },
    ])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.plugins).toEqual(['dsh-fabric', 'other'])
    expect(patchTargetKey(target)).toBe('dsh-core#lib/session.js#Session.start')
  })

  it('orders patches deterministically (topo first, id lex fallback)', () => {
    const patches = [
      { plugin: 'b', patchId: 'p', target },
      { plugin: 'a', patchId: 'p', target: { module: 'm', symbol: 's' } },
    ]
    const first = deterministicPatchOrder(patches)
    const second = deterministicPatchOrder(patches)
    expect(first).toEqual(second)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

describe('mount orchestrator', () => {
  it('blocks conflicts in phase 0 before any transform', () => {
    const orchestrator = new MountOrchestrator()
    expect(() => orchestrator.collectMixinPatches([
      { plugin: 'dsh-fabric', patchId: 'p1', target },
      { plugin: 'other', patchId: 'p2', target },
    ])).toThrow(/目标冲突/)
  })

  it('errors loudly when a patch registers after its target loaded', () => {
    const orchestrator = new MountOrchestrator()
    orchestrator.collectMixinPatches([{ plugin: 'dsh-fabric', patchId: 'p1', target }])
    orchestrator.startPhase1()
    orchestrator.markTargetLoaded(target)
    expect(() => orchestrator.applyPatch({ plugin: 'dsh-fabric', patchId: 'p1', target }))
      .toThrow(PatchLateRegistrationError)
  })

  it('produces a byte-identical trace for identical input', () => {
    const run = () => {
      const orchestrator = new MountOrchestrator()
      orchestrator.collectMixinPatches([
        { plugin: 'dsh-fabric', patchId: 'p1', target },
        { plugin: 'extra', patchId: 'p2', target: { module: 'm2', symbol: 's2' } },
      ])
      orchestrator.startPhase1()
      orchestrator.applyPatch({ plugin: 'dsh-fabric', patchId: 'p1', target })
      orchestrator.startPhase2(['a', 'b'])
      return orchestrator.traceJson()
    }
    expect(run()).toBe(run())
  })
})
