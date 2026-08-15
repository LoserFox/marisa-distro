#!/usr/bin/env node
/**
 * prepack-cordis-rewrite.mjs — 微型复刻官方发布管线：把构建产物里的裸 `cordis`
 * 类型引用改写为 npm 生态真名 `@deepseek-ai/cordis`。
 *
 * 背景（2026-08-11 迁移）：官方 20260811 快照起源码与 npm 生态均使用
 * `@deepseek-ai/cordis`（仓库内 919 处裸 `cordis` 导入全部迁移），dsh-track 源码
 * 也已改为直接 import 真名。本脚本保留为**幂等安全网**：仅清理构建产物里可能残留的
 * 旧裸名引用（lib/types/**\/*.d.ts 的 `from 'cordis'` → `from '@deepseek-ai/cordis'`），
 * 新构建产物本应已全为真名，重复执行无副作用。
 *
 * 幂等：重复执行安全（已经改写过的不会再改）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const TYPES_DIR = join(ROOT, 'lib', 'types')

/** 递归收集 .d.ts */
function collectDts(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectDts(full))
    else if (entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

let changed = 0
let scanned = 0
for (const file of collectDts(TYPES_DIR)) {
  const before = readFileSync(file, 'utf8')
  // 只改写 import 语句里的裸 cordis 模块说明符；declare module 'cordis' 与
  // 其它文本引用（注释/文档）保持原样，避免误伤。
  const after = before.replace(
    /(\bfrom\s+['"])cordis(['"])/g,
    "$1@deepseek-ai/cordis$2",
  )
  if (after !== before) {
    writeFileSync(file, after)
    changed++
    console.log(`  rewrite: ${relative(ROOT, file)}`)
  }
  scanned++
}

console.log(`prepack-cordis-rewrite: scanned ${scanned} .d.ts, rewrote ${changed}`)
if (changed === 0 && scanned === 0) {
  console.warn('  (no lib/types found — run build first)')
  process.exit(1)
}
