/**
 * 内置 mixin 引擎（《第二轮增强》10/11/12/13 条，v1 内置于 mygo，不作为插件
 * 分发）：patch 必须在目标模块“已加载”前注册；引擎为目标模块生成符号级
 * facade（CJS/ESM 均可，工作在编译后的 npm lib 产物上，不依赖 tsx/源码），
 * 消费者经 facade 取到被插桩的导出符号。锚点一律是 `module#filePath#symbol`
 * 导出符号路径，禁止行号/语句位置。
 * @module @r05en1cu/dsh-mygo/src/package/mixin-engine
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { patchTargetKey, type DeclaredPatch } from './patch-table.ts'
import { PatchLateRegistrationError } from './mount-orchestrator.ts'

export type MixinOperation = 'before' | 'after' | 'around' | 'replace'

export interface MixinTargetSpec {
  readonly module: string
  readonly filePath?: string
  readonly symbol: string
}

export interface MixinPatchSpec extends DeclaredPatch {
  readonly operation: MixinOperation
}

export interface MixinCall {
  readonly arguments: unknown[]
  readonly self: unknown
}

export type MixinInvoke = () => unknown
export type MixinHandler = (call: MixinCall, invoke: MixinInvoke) => unknown

/** Resolve a target module to its original entry URL. */
export interface MixinModuleResolver {
  (module: string, filePath?: string): Promise<{ readonly entryPath: string }>
}

/** Deterministic engine log (byte-identical for identical inputs). */
export interface MixinEngineTrace {
  readonly registrations: string[]
  readonly facades: string[]
  readonly handlers: string[]
}

/**
 * The built-in mixin engine (v1). Patch application order is deterministic:
 * registration order after the orchestrator's phase0 ordering.
 */
export class BuiltinMixinEngine {
  private readonly patches = new Map<string, MixinPatchSpec>()
  private readonly handlers = new Map<string, MixinHandler>()
  private readonly loaded = new Set<string>()
  private readonly facadeUrls = new Map<string, string>()
  private readonly trace: MixinEngineTrace = { registrations: [], facades: [], handlers: [] }
  private nextOrder = 0
  private readonly globalKey: string

  constructor(
    private readonly resolveModule: MixinModuleResolver,
    private readonly tmpRoot: string,
  ) {
    this.globalKey = `__MYGO_MIXIN_ENGINE__${randomUUID().replace(/-/g, '')}`
    ;(globalThis as Record<string, unknown>)[this.globalKey] = this
  }

  targetKey(target: MixinTargetSpec): string {
    return patchTargetKey({
      module: target.module,
      symbol: target.symbol,
      ...(target.filePath === undefined ? {} : { filePath: target.filePath }),
    })
  }

  /** Register one patch; late registration (target loaded) errors loudly. */
  registerPatch(patch: MixinPatchSpec, handler?: MixinHandler): void {
    const key = this.targetKey(patch.target)
    if (this.loaded.has(key)) throw new PatchLateRegistrationError(key)
    const existing = this.patches.get(key)
    if (existing !== undefined && existing.plugin !== patch.plugin) {
      throw new Error(
        `mixin patch 目标冲突：${existing.plugin} 与 ${patch.plugin} 改写同一目标 ${key}（phase0 应已拦截）`,
      )
    }
    this.patches.set(key, { ...patch, operation: patch.operation })
    this.trace.registrations.push(`${this.nextOrder++}#${key}@${patch.plugin}#${patch.patchId}`)
    if (handler !== undefined) {
      this.handlers.set(key, handler)
      this.trace.handlers.push(`${key}@${patch.plugin}#${patch.patchId}`)
    }
  }

  /** Register/replace a runtime handler for an already-registered patch. */
  registerHandler(key: string, handler: MixinHandler): void {
    if (!this.patches.has(key)) throw new Error(`未注册 patch：${key}`)
    this.handlers.set(key, handler)
    this.trace.handlers.push(`${key}@handler`)
  }

  /** Dispatch one instrumented call through the current handler. */
  dispatch(key: string, call: MixinCall, invoke: MixinInvoke): unknown {
    const handler = this.handlers.get(key)
    if (handler === undefined) return invoke()
    return handler(call, invoke)
  }

  /**
   * Build (once) the instrumented facade for a target. This is phase 1's
   * transform: it runs before any consumer imports the facade, and anchors
   * on the compiled artifact's export symbol path.
   */
  async buildFacade(target: MixinTargetSpec): Promise<string> {
    const key = this.targetKey(target)
    if (this.loaded.has(key)) {
      const cached = this.facadeUrls.get(key)
      if (cached !== undefined) return cached
    }
    const patch = this.patches.get(key)
    if (patch === undefined) throw new Error(`目标 ${key} 没有已注册 patch（phase0 收集缺失）`)
    const { entryPath } = await this.resolveModule(target.module, target.filePath)
    const facadeDir = join(this.tmpRoot, 'facades')
    await mkdir(facadeDir, { recursive: true })
    const facadePath = join(facadeDir, `${randomUUID()}.cjs`)
    const symbol = JSON.stringify(target.symbol)
    const keyLiteral = JSON.stringify(key)
    const source = [
      "'use strict'",
      `const __engine = globalThis[${JSON.stringify(this.globalKey)}]`,
      `if (!__engine) throw new Error('mygo mixin engine 未在全局注册')`,
      `module.exports = (async () => {`,
      `  const __mod = await import(${JSON.stringify(pathToFileURL(entryPath).href)})`,
      `  const __base = (__mod.default && typeof __mod.default === 'object') ? __mod.default : __mod`,
      `  const __wrapped = function (...args) {`,
      `    const invoke = () => { const fn = __base[${symbol}]; return typeof fn === 'function' ? fn.apply(this, args) : undefined }`,
      `    return __engine.dispatch(${keyLiteral}, { arguments: args, self: this }, invoke)`,
      `  }`,
      `  return new Proxy(__base, {`,
      `    get(target, prop) {`,
      `      if (prop === ${symbol}) return __wrapped`,
      `      const value = Reflect.get(target, prop)`,
      `      return typeof value === 'function' ? value.bind(target) : value`,
      `    },`,
      `    set(target, prop, value) { Reflect.set(target, prop, value); return true },`,
      `  })`,
      `})()`,
    ].join('\n')
    await writeFile(facadePath, source, 'utf8')
    const url = pathToFileURL(facadePath).href
    this.loaded.add(key)
    this.facadeUrls.set(key, url)
    this.trace.facades.push(`${key}@${patch.plugin}#${patch.patchId} -> ${dirname(facadePath).split(sep).pop() ?? ''}`)
    return url
  }

  /** Consumer entry: import the instrumented facade (returns Proxy). */
  async importTarget(target: MixinTargetSpec): Promise<unknown> {
    const url = await this.buildFacade(target)
    return import(url)
  }

  /** Deterministic trace JSON. */
  traceJson(): string {
    return JSON.stringify(this.trace)
  }
}
