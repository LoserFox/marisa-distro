/**
 * mixin 引擎实测（《第二轮增强》测试场景修正）：以真实插件 id `dsh-fabric`
 * 为测试主体，目标为编译后的 npm lib 产物（纯 JS，无 tsx/源码）。
 * 覆盖：相位化流程 + 可观测行为、同符号冲突、目标加载后注册报错、确定性。
 */

import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BuiltinMixinEngine, type MixinPatchSpec } from '../../src/package/mixin-engine.ts'
import { MountOrchestrator, PatchLateRegistrationError } from '../../src/package/mount-orchestrator.ts'
import { parsePackageManifest } from '../../src/package/manifest-v2.ts'
import { validateLoaderDeclaration } from '../../src/package/loader-registry.ts'

const FABRIC_TARGET = { module: 'host-target', filePath: 'lib/index.js', symbol: 'greet' }

function fabricPatch(): MixinPatchSpec {
  return { plugin: 'dsh-fabric', patchId: 'fabric-greet', target: FABRIC_TARGET, operation: 'before' }
}

describe('dsh-fabric mixin engine (npm lib mode)', () => {
  let root: string
  let moduleRoot: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mygo-fabric-'))
    moduleRoot = join(root, 'node_modules')
    // 编译后的 npm lib 产物（CJS，纯 JS，无 tsx/源码树）。
    await mkdir(join(moduleRoot, 'host-target', 'lib'), { recursive: true })
    await writeFile(join(moduleRoot, 'host-target', 'package.json'), JSON.stringify({
      name: 'host-target',
      version: '1.0.0',
      main: 'lib/index.js',
    }))
    await writeFile(
      join(moduleRoot, 'host-target', 'lib', 'index.js'),
      "function greet(name) { return 'hello ' + name }\nexports.greet = greet\nexports.NAME = 'host'\n",
    )
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function createEngine(): BuiltinMixinEngine {
    const req = createRequire(join(moduleRoot, 'noop.js'))
    return new BuiltinMixinEngine(async (module, filePath) => {
      const pkgPath = req.resolve(`${module}/package.json`)
      const pkgDir = dirname(pkgPath)
      const entry = filePath ?? 'lib/index.js'
      return { entryPath: join(pkgDir, entry) }
    }, join(root, 'tmp'))
  }

  it('fabric declares loader=mixin with patch target declarations', () => {
    const parsed = parsePackageManifest({
      name: '@deepseek-ai/dsh-cordis-fabric',
      version: '0.0.2',
      main: 'lib/index.js',
      dsh: {
        mygo: {
          entry: 'lib/index.js',
          core: '*',
          loader: { id: 'mixin', range: '>=1.0.0 <2.0.0' },
          patches: [{
            id: 'fabric-greet',
            target: { module: 'host-target', filePath: 'lib/index.js', symbol: 'greet', operation: 'before' },
          }],
        },
      },
    })
    expect(parsed.problems).toEqual([])
    expect(parsed.value?.loader).toEqual({ id: 'mixin', range: '>=1.0.0 <2.0.0' })
    expect(validateLoaderDeclaration(parsed.value?.loader).ok).toBe(true)
  })

  it('phase0 collect -> phase1 transform -> phase2 mount, and the observable behavior changes', async () => {
    const engine = createEngine()
    const orchestrator = new MountOrchestrator()
    orchestrator.collectMixinPatches([fabricPatch()])
    orchestrator.startPhase1()
    engine.registerPatch(fabricPatch())
    const key = engine.targetKey(FABRIC_TARGET)
    engine.registerHandler(key, (call, invoke) => {
      call.arguments[0] = `fabric:${String(call.arguments[0])}`
      return invoke()
    })
    const facadeUrl = await engine.buildFacade(FABRIC_TARGET) // transform 在目标使用前完成
    orchestrator.startPhase2(['dsh-fabric'])
    const loaded = await import(facadeUrl)
    const proxy = await (loaded.default ?? loaded) as { greet(name: string): string; NAME: string }
    expect(proxy.greet('world')).toBe('hello fabric:world')
    expect(proxy.NAME).toBe('host') // 未打补丁的导出原样透传
  })

  it('hard-blocks two plugins patching the same host symbol, naming fabric and the target', () => {
    const orchestrator = new MountOrchestrator()
    expect(() => orchestrator.collectMixinPatches([
      fabricPatch(),
      { plugin: 'other', patchId: 'p2', target: FABRIC_TARGET },
    ])).toThrow(/目标冲突/)
    expect(() => orchestrator.collectMixinPatches([
      fabricPatch(),
      { plugin: 'other', patchId: 'p2', target: FABRIC_TARGET },
    ])).toThrow(/dsh-fabric/)
  })

  it('errors loudly when a patch registers after the target is loaded', async () => {
    const engine = createEngine()
    engine.registerPatch(fabricPatch())
    await engine.buildFacade(FABRIC_TARGET)
    expect(() => engine.registerPatch({ ...fabricPatch(), patchId: 'late' }))
      .toThrow(PatchLateRegistrationError)
  })

  it('is deterministic: two runs produce byte-identical traces and behavior', async () => {
    const run = async (): Promise<{ readonly trace: string; readonly result: string }> => {
      const engine = createEngine()
      const orchestrator = new MountOrchestrator()
      orchestrator.collectMixinPatches([fabricPatch()])
      orchestrator.startPhase1()
      engine.registerPatch(fabricPatch())
      const key = engine.targetKey(FABRIC_TARGET)
      engine.registerHandler(key, (call, invoke) => {
        call.arguments[0] = `fabric:${String(call.arguments[0])}`
        return invoke()
      })
      const facadeUrl = await engine.buildFacade(FABRIC_TARGET)
      orchestrator.startPhase2(['dsh-fabric'])
      const loaded = await import(facadeUrl)
      const proxy = await (loaded.default ?? loaded) as { greet(name: string): string }
      return { trace: engine.traceJson(), result: proxy.greet('world') }
    }
    const first = await run()
    const second = await run()
    expect(first.trace).toBe(second.trace)
    expect(first.result).toBe(second.result)
  })
})
