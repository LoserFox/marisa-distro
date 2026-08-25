#!/usr/bin/env node
// verify-mirror-purity — 核验 mirror 组件 vendored 树与上游 baseline 零差异。
//
// 目的：mirror 插件（以及 harness）要转 git submodule，前提是本地 vendored 树
// 与上游 baseline commit 内容一致（否则 submodule 化会丢本地改动）。本脚本把
// 每个候选组件克隆到临时目录、checkout 登记 baseline，再与本地树逐文件对比
// （忽略构建产物目录与行尾差异）。
//
// 用法：
//   node scripts/verify-mirror-purity.mjs            # 全部 git mirror + harness
//   node scripts/verify-mirror-purity.mjs --ids a,b  # 指定组件
//   node scripts/verify-mirror-purity.mjs --report docs/RESEARCH-mirror-purity.md
//
// 退出码：全部 clean = 0；有 dirty = 1；clone 失败 = 2。

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'maintenance', 'upstreams.json'), 'utf8'))
const argv = process.argv.slice(2)
const idsArg = argv.find(a => a === '--ids')
const ids = idsArg ? argv[argv.indexOf(idsArg) + 1].split(',').map(s => s.trim()).filter(Boolean) : null
const reportArg = argv.indexOf('--report')
const reportPath = reportArg >= 0 ? resolve(argv[reportArg + 1]) : null

// 构建产物/与上游无关的目录与文件，不参与内容对比。
// '.git' 同时匹配目录（嵌套仓库）与文件（submodule gitlink 元数据）。
const IGNORED_DIRS = new Set(['node_modules', 'lib', 'dist', '.dsh-build', '.git', '.claude', '.mnemon', 'coverage'])
const IGNORED_FILES = new Set(['.git', '.gitignore', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'])
const IGNORED_FILE_PATTERNS = [/\.tsbuildinfo$/]

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
}

function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function hashFile(path) {
  return createHash('sha256').update(normalize(readFileSync(path, 'utf8'))).digest('hex')
}

// 列出树内参与对比的 {relPath, hash}（忽略构建产物）。
function collect(treeDir, prefix = '') {
  const out = []
  for (const entry of readdirSync(treeDir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = join(treeDir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      if (!IGNORED_FILES.has(entry.name)) out.push(...collect(full, rel))
    } else if (!IGNORED_FILES.has(entry.name) && !IGNORED_FILE_PATTERNS.some(pattern => pattern.test(entry.name))) {
      out.push({ rel, hash: hashFile(full) })
    }
  }
  return out
}

function compare(upstreamDir, localDir) {
  const upstream = collect(upstreamDir)
  const local = collect(localDir)
  const upstreamMap = new Map(upstream.map(f => [f.rel, f.hash]))
  const localMap = new Map(local.map(f => [f.rel, f.hash]))
  const dirty = []
  for (const [rel, hash] of localMap) {
    if (!upstreamMap.has(rel)) { dirty.push(`${rel} (local-only)`); continue }
    if (upstreamMap.get(rel) !== hash) dirty.push(`${rel} (content differs)`)
  }
  for (const rel of upstreamMap.keys()) {
    if (!localMap.has(rel)) dirty.push(`${rel} (missing locally)`)
  }
  return { files: upstream.length, dirty }
}

async function checkComponent(component, localPath) {
  const repo = component.repository
  if (!repo) return { id: component.id, status: 'SKIP', reason: 'no git repository' }
  const work = join(tmpdir(), `marisa-purity-${component.id.replace(/[^\w-]/g, '_')}`)
  rmSync(work, { recursive: true, force: true })
  try {
    sh('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', repo, work], root)
    sh('git', ['-C', work, 'checkout', '--quiet', component.baseline], root)
    const result = compare(work, localPath)
    return {
      id: component.id,
      mode: component.mode,
      baseline: component.baseline.slice(0, 12),
      repo,
      files: result.files,
      dirty: result.dirty,
      status: result.dirty.length ? 'DIRTY' : 'CLEAN',
    }
  } catch (error) {
    return { id: component.id, mode: component.mode, baseline: component.baseline?.slice(0, 12), repo, status: 'ERROR', reason: String(error.message).split('\n')[0].slice(0, 300) }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const components = []
for (const plugin of manifest.plugins) {
  if (ids && !ids.includes(plugin.id)) continue
  if ((plugin.source ?? 'git') !== 'git') continue
  if (plugin.mode !== 'mirror') continue
  components.push({ id: plugin.id, repository: plugin.repository, baseline: plugin.baseline, mode: 'mirror' })
}
if (!ids || ids.includes('harness')) {
  components.push({ id: 'harness', repository: manifest.harness.repository, baseline: manifest.harness.baseline, mode: 'mirror' })
}

const results = []
for (const component of components) {
  const localPath = component.id === 'harness' ? join(root, 'harness') : join(root, 'plugins', component.id)
  process.stdout.write(`checking ${component.id} ...\n`)
  results.push(await checkComponent(component, localPath))
}

const lines = []
lines.push('# Mirror 干净度核验报告')
lines.push('')
lines.push(`> 生成：\`node scripts/verify-mirror-purity.mjs\`。对比对象：本地 vendored 树 vs 上游 baseline commit（忽略 node_modules/lib/dist/.dsh-build 等构建产物与行尾差异）。`)
lines.push('')
lines.push('| 组件 | baseline | 结果 | 差异文件 |')
lines.push('|---|---|---|---|')
let dirtyCount = 0
for (const r of results) {
  const badge = r.status === 'CLEAN' ? '✅ CLEAN' : r.status === 'DIRTY' ? '❌ DIRTY' : `⚠️ ${r.status}`
  lines.push(`| ${r.id} | \`${r.baseline ?? '—'}\` | ${badge} | ${r.dirty ? r.dirty.join('<br>') : (r.reason ?? '—')} |`)
  if (r.status === 'DIRTY') dirtyCount++
}
lines.push('')
lines.push(`共 ${results.length} 个组件，${dirtyCount} 个存在本地差异（DIRTY 组件转 submodule 前必须先消除差异：反馈上游或降级 fork）。`)
const report = lines.join('\n') + '\n'

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, report, 'utf8')
  process.stdout.write(`report written: ${relative(root, reportPath)}\n`)
} else {
  process.stdout.write(report)
}
process.exit(dirtyCount ? 1 : 0)
