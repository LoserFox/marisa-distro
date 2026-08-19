/**
 * 插件入口动态加载（npm 发版兼容约束 1）：lib 产物 / bundler 处理后仍可用，
 * 不依赖 tsx；ESM 与 CJS 入口统一经 `import(fileURL)` 加载。
 * @module @r05en1cu/dsh-mygo/src/package/entry-loader
 */

import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

/** Load a plugin entry from an installed package dir. */
export async function loadPluginEntry<T = unknown>(
  packageDirPath: string,
  entry: string,
): Promise<T> {
  const absolute = join(packageDirPath, entry)
  const url = pathToFileURL(absolute).href
  const loaded = await import(url)
  // ESM default export (mygo service / plugin default) or CJS module.exports
  // (interop default). Namespace plugins (name/inject/apply) pass through.
  return (loaded.default ?? loaded) as T
}

/** Extract a Cordis plugin from a loaded module namespace. */
export function extractPlugin(module: unknown): unknown {
  if (module === null || module === undefined) return undefined
  if (typeof module === 'function') return module
  if (typeof module === 'object') {
    const record = module as Record<string, unknown>
    if (typeof record.apply === 'function') return module
    if (typeof record.default === 'function') return record.default
    if (typeof record.default === 'object' && record.default !== null
      && typeof (record.default as Record<string, unknown>).apply === 'function') {
      return record.default
    }
  }
  return undefined
}
