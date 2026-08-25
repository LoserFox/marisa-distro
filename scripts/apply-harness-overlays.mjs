#!/usr/bin/env node
// apply-harness-overlays — 把 Marisa 发行版增量以 overlay 形式应用到 harness 树。
//
// 动机：harness 以 submodule 形式跟踪上游 rc pin，必须保持 pristine；发行版
// 增量（anchored-standard 实验预设、品牌兜底字符串）不再直接改 harness 源码，
// 而由本脚本在构建（build.ps1）/打包（make-bundle.ps1）阶段应用，并在构建
// 结束后还原，保证工作树里 harness 与上游零差异。
//
// 用法：
//   node scripts/apply-harness-overlays.mjs apply   [--tree <dir>]  # 应用（幂等）
//   node scripts/apply-harness-overlays.mjs revert  [--tree <dir>]  # 还原（幂等）
//   node scripts/apply-harness-overlays.mjs verify  [--tree <dir>]  # 断言 pristine（非 0 = 失败）
//
// --tree 默认 <仓库根>/harness。
//
// overlay 内容（overlays/harness/）：
//   brand-replacements.json                    品牌兜底字符串替换表（只动源文件，不动测试）
//   agent-presets/anchored-standard/           锚定标准实验预设（CLI SHIPPED_PRESET_ROOT 消费，
//                                              目标路径 apps/cli/config/agent-presets/anchored-standard/）

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const overlayRoot = join(root, 'overlays', 'harness')
const tablePath = join(overlayRoot, 'brand-replacements.json')
const anchoredRel = join('apps', 'cli', 'config', 'agent-presets', 'anchored-standard')
const anchoredOverlay = join(overlayRoot, 'agent-presets', 'anchored-standard')

const argv = process.argv.slice(2)
const action = argv.find(a => a === 'apply' || a === 'revert' || a === 'verify')
if (!action) {
  console.error('usage: apply-harness-overlays.mjs <apply|revert|verify> [--tree <dir>]')
  process.exit(2)
}
const treeArg = argv.indexOf('--tree')
const tree = treeArg >= 0 && argv[treeArg + 1] ? resolve(argv[treeArg + 1]) : join(root, 'harness')

function fail(message) {
  console.error(`apply-harness-overlays: ${message}`)
  process.exit(1)
}

function readUtf8(path) {
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

function writeUtf8(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  // 无 BOM 的 UTF-8；整文件重写，保持字节稳定。
  writeFileSync(path, text, 'utf8')
}

function applyReplacement(content, from, to, fileRel, direction) {
  // direction: 'apply' | 'revert'
  const [source, target] = direction === 'apply' ? [from, to] : [to, from]
  if (content.includes(target) && !content.includes(source)) return { content, changed: false, state: 'already' }
  if (!content.includes(source)) {
    fail(`${fileRel}: neither ${JSON.stringify(from)} nor ${JSON.stringify(to)} present — upstream shape changed, overlay must be re-baselined`)
  }
  return { content: content.replace(source, target), changed: true, state: 'applied' }
}

function loadTable() {
  return JSON.parse(readFileSync(tablePath, 'utf8'))
}

function applyBrand(treeDir, direction) {
  const table = loadTable()
  const changed = []
  for (const [rel, rules] of Object.entries(table.files)) {
    const filePath = join(treeDir, rel)
    const original = readUtf8(filePath)
    if (original === null) fail(`${rel}: file missing in target tree`)
    let content = original
    let fileChanged = false
    for (const rule of rules) {
      const result = applyReplacement(content, rule.from, rule.to, rel, direction)
      content = result.content
      fileChanged = fileChanged || result.changed
    }
    if (fileChanged) {
      writeUtf8(filePath, content)
      changed.push(rel)
    }
  }
  return changed
}

function filesEqual(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false
  return readFileSync(a).equals(readFileSync(b))
}

function copyDirRecursive(src, dst) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(from, to)
    } else {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
  }
}

function dirMatchesOverlay(targetDir, overlayDir) {
  const overlayEntries = readdirSync(overlayDir)
  const targetEntries = readdirSync(targetDir)
  if (targetEntries.length !== overlayEntries.length) return false
  for (const name of overlayEntries) {
    const overlayPath = join(overlayDir, name)
    const targetPath = join(targetDir, name)
    if (statSync(overlayPath).isDirectory()) {
      if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) return false
      if (!dirMatchesOverlay(targetPath, overlayPath)) return false
    } else if (!filesEqual(overlayPath, targetPath)) {
      return false
    }
  }
  return true
}

function applyAnchored(treeDir) {
  const targetDir = join(treeDir, anchoredRel)
  copyDirRecursive(anchoredOverlay, targetDir)
  return anchoredRel
}

function revertAnchored(treeDir) {
  const targetDir = join(treeDir, anchoredRel)
  if (!existsSync(targetDir)) return null
  if (!dirMatchesOverlay(targetDir, anchoredOverlay)) {
    fail(`refusing to remove ${anchoredRel}: content differs from the overlay (may contain foreign edits)`)
  }
  rmSync(targetDir, { recursive: true, force: true })
  return anchoredRel
}

function verifyPristine(treeDir) {
  const problems = []
  const table = loadTable()
  for (const [rel, rules] of Object.entries(table.files)) {
    const content = readUtf8(join(treeDir, rel))
    if (content === null) {
      problems.push(`${rel}: missing in target tree`)
      continue
    }
    for (const rule of rules) {
      if (content.includes(rule.to)) problems.push(`${rel}: contains overlay string ${JSON.stringify(rule.to)}`)
      if (!content.includes(rule.from)) problems.push(`${rel}: no longer contains upstream string ${JSON.stringify(rule.from)}`)
    }
  }
  if (existsSync(join(treeDir, anchoredRel))) problems.push(`${anchoredRel}: overlay preset present in target tree`)
  if (problems.length) {
    for (const p of problems) console.error(`  - ${p}`)
    fail(`${problems.length} overlay artifacts found — harness tree is not pristine (run revert, or commit the change as an overlay instead)`)
  }
}

if (action === 'apply') {
  const brandChanged = applyBrand(tree, 'apply')
  const anchored = applyAnchored(tree)
  console.log(`harness overlays applied: ${brandChanged.length} brand file(s) rewritten, ${anchored} materialized`)
} else if (action === 'revert') {
  const brandChanged = applyBrand(tree, 'revert')
  const anchored = revertAnchored(tree)
  console.log(`harness overlays reverted: ${brandChanged.length} brand file(s) restored, ${anchored ?? 'no preset dir to remove'}`)
} else {
  verifyPristine(tree)
  console.log('harness tree is pristine (no marisa overlays applied)')
}
