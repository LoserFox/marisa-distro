/**
 * 符号级校验（《第二轮增强》第 7 条，最终事实源）：静态收集插件实际 import
 * 的外部具名符号，对照实际加载包版本的运行时 exports；符号缺失硬阻断，
 * 区间说谎但符号存在 → 警告放行。
 * @module @r05en1cu/dsh-mygo/src/package/symbol-verify
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** One external import reference with its named symbols. */
export interface ImportRef {
  readonly specifier: string
  readonly named: readonly string[]
  readonly file: string
}

/** Best-effort ESM/CJS named-import collector. */
export function collectNamedImports(source: string, file: string): ImportRef[] {
  const refs: ImportRef[] = []
  // 具名符号解析：`type X` / `X as Y` 归一为运行时符号名；纯 type 成员返回
  // null（类型在运行时不可探针，符号校验只能核验值导入）。
  const parseNamed = (list: string): string[] =>
    list.split(',').map(part => {
      const trimmed = part.trim()
      if (!trimmed) return null
      if (trimmed === 'type' || trimmed.startsWith('type ')) {
        // `type X` / `type X as Y`：整成员为类型导入，不参与运行时校验。
        return null
      }
      const alias = trimmed.split(/\s+as\s+/)
      return (alias[alias.length - 1] ?? trimmed).trim()
    }).filter((name): name is string => name !== null && name !== '')
  const esm = /(?:import|export)\s*(?:\{[^}]*\}\s*from\s*|[\w$*]+\s*from\s*)['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = esm.exec(source)) !== null) {
    const specifier = match[1] as string
    const head = match[0] ?? ''
    if (/^(?:import|export)\s+type\b/.test(head)) continue
    const brace = /\{([^}]*)\}/.exec(head)
    const named = brace === null ? [] : parseNamed(brace[1] ?? '')
    refs.push({ specifier, named, file })
  }
  // `import { a, b } from 'x'`（上面的正则要求 from 同行，兼容换行写法）。
  const multiline = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g
  while ((match = multiline.exec(source)) !== null) {
    const specifier = match[2] as string
    if (/^import\s+type\b/.test(match[0] ?? '')) continue
    if (refs.some(ref => ref.specifier === specifier)) continue
    const named = parseNamed(match[1] ?? '')
    refs.push({ specifier, named, file })
  }
  const cjs = /const\s*\{([^}]*)\}\s*=\s*require\(['"]([^'"]+)['"]\)/g
  while ((match = cjs.exec(source)) !== null) {
    const specifier = match[2] as string
    if (refs.some(ref => ref.specifier === specifier)) continue
    const named = (match[1] ?? '').split(',').map(part => part.trim().split(/\s*:\s*/)[1] ?? part.trim()).filter(Boolean)
    refs.push({ specifier, named, file })
  }
  return refs
}

/** Scan one plugin directory (excluding node_modules) for external imports. */
export async function scanPluginImports(
  dir: string,
  excludeDirs: readonly string[] = ['node_modules'],
): Promise<ImportRef[]> {
  const refs: ImportRef[] = []
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > 6) return
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (excludeDirs.includes(entry.name) || entry.name.startsWith('.')) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
        continue
      }
      if (!/\.[cm]?[jt]s$/.test(entry.name)) continue
      try {
        const source = await readFile(full, 'utf8')
        const file = relative(dir, full)
        for (const ref of collectNamedImports(source, file)) {
          if (ref.specifier.startsWith('.') || ref.specifier.startsWith('node:')) continue
          refs.push(ref)
        }
      } catch {
        // unreadable: skip
      }
    }
  }
  await walk(dir, 0)
  return refs
}

/** Probe a package entry's runtime exports (ESM namespace or CJS interop). */
export async function probePackageExports(entryPath: string): Promise<Set<string>> {
  const url = pathToFileURL(entryPath).href
  const loaded = await import(url)
  const names = new Set<string>(Object.keys(loaded))
  const def = (loaded as { default?: unknown }).default
  if (typeof def === 'object' && def !== null) {
    for (const key of Object.keys(def as Record<string, unknown>)) names.add(key)
  }
  return names
}

/** One symbol check result. */
export interface SymbolCheck {
  readonly specifier: string
  readonly file: string
  readonly symbol: string
  readonly missing: boolean
  /** 无法解析目标包 exports 时置位（不判缺失，按警告处理）。 */
  readonly unverified?: boolean
}

/** Compare collected imports against actual exports; missing = hard block. */
export function verifySymbols(
  imports: readonly ImportRef[],
  exportsOf: (specifier: string) => Promise<ReadonlySet<string> | undefined>,
): Promise<SymbolCheck[]> {
  return Promise.all(imports.map(async ref => {
    if (ref.named.length === 0) return []
    const exports = await exportsOf(ref.specifier)
    return ref.named.map(symbol => exports === undefined
      ? { specifier: ref.specifier, file: ref.file, symbol, missing: false, unverified: true }
      : { specifier: ref.specifier, file: ref.file, symbol, missing: !exports.has(symbol) })
  })).then(rows => rows.flat())
}

/** Verify one plugin directory's external imports against an exports provider. */
export async function verifyPluginSymbols(
  dir: string,
  exportsProvider: (specifier: string) => Promise<ReadonlySet<string> | undefined>,
): Promise<SymbolCheck[]> {
  const imports = await scanPluginImports(dir)
  return verifySymbols(imports, exportsProvider)
}
