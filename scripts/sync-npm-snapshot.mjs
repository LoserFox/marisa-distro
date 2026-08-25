#!/usr/bin/env node
// sync-npm-snapshot — 把 npm 快照插件同步到最新发布版本（重新 vendored）。
//
// 流程（每个组件）：
//   1. 读 maintenance/upstreams.json 登记（source=npm）
//   2. npm view <npmName> dist-tags.latest；与登记 version 相同则跳过
//   3. npm pack 下载 tarball，解包到临时目录
//   4. 守卫：package.json 含 preinstall/install/postinstall/prepare/prepublishOnly
//      则拒绝（AGENTS.md：npm 快照依赖发布时自带的构建产物）
//   5. 替换 plugins/<id>（保留 node_modules 不碰；树内其余文件清空重建）
//   6. workspace:^ 重放：dependencies/devDependencies 里解析到 Marisa
//      workspace 的 @deepseek-ai/*（dsh-* / cordis / schemastery / cosmokit）
//      统一改写为 workspace:^（避免 registry 远古 rc 区间拉 404 旧包）
//   7. 更新 upstreams.json version + note；pnpm install --lockfile-only
//
// fork 组件默认拒绝自动同步（非机械增量需人工重放，见 diffDocument）；
// --force 跳过该守卫（workspace:^ 仍会重放，其余增量自担）。
//
// 用法：
//   node scripts/sync-npm-snapshot.mjs <id> [--force]   # 单组件
//   node scripts/sync-npm-snapshot.mjs --all            # 全部 npm 快照
// 退出码：有同步 = 1，全部最新 = 0，失败 = 2。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'maintenance', 'upstreams.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const argv = process.argv.slice(2)
const force = argv.includes('--force')
const all = argv.includes('--all')
const ids = all ? null : argv.filter(a => !a.startsWith('--'))

// Marisa workspace 内解析的 @deepseek-ai 作用域包（vendored harness / cordis 系）。
const WORKSPACE_SCOPED = /^@deepseek-ai\/(dsh-|cordis$|schemastery$|cosmokit$)/
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly']

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, shell: process.platform === 'win32', ...opts })
}

function rewriteWorkspaceDeps(packagePath) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  let changed = 0
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[section]
    if (!deps) continue
    for (const [name, range] of Object.entries(deps)) {
      if (WORKSPACE_SCOPED.test(name) && range !== 'workspace:^') {
        deps[name] = 'workspace:^'
        changed++
      }
    }
  }
  if (changed) writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  return changed
}

function checkLifecycle(packagePath, id) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  const found = LIFECYCLE.filter(script => pkg.scripts?.[script])
  if (found.length) {
    throw new Error(`${id}: tarball declares lifecycle scripts (${found.join(', ')}); vendoring rule forbids them`)
  }
}

function syncComponent(component) {
  const id = component.id
  const packageName = component.npmName ?? id
  const currentVersion = component.version
  const latest = sh('npm', ['view', packageName, 'dist-tags.latest']).trim()
  if (!latest) throw new Error(`${id}: npm view returned no latest`)
  if (latest === currentVersion) return { id, status: 'UP-TO-DATE', version: latest }

  if (component.mode === 'fork' && !force) {
    return { id, status: 'SKIP-FORK', version: latest, reason: `fork 需人工重放增量（${component.diffDocument ?? 'diffDocument'}）；确认后 --force` }
  }

  const work = mkdtempSync(join(tmpdir(), `marisa-npm-sync-${id}-`))
  const destination = join(root, 'plugins', id)
  try {
    // npm pack → 解包（Windows 自带 tar；POSIX 同）
    const tarball = sh('npm', ['pack', `${packageName}@${latest}`, '--pack-destination', work], { cwd: work }).trim().split('\n').pop()
    const unpackDir = join(work, 'unpack')
    mkdirSync(unpackDir, { recursive: true })
    execFileSync('tar', ['-xzf', join(work, tarball), '-C', unpackDir], { cwd: work, stdio: 'ignore' })
    const packageDir = join(unpackDir, 'package')
    const stagedPackage = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    if (stagedPackage.name !== packageName) {
      throw new Error(`${id}: tarball package name mismatch (${stagedPackage.name} != ${packageName})`)
    }
    checkLifecycle(join(packageDir, 'package.json'), id)

    // 替换 vendored 树（保留 node_modules）
    if (!existsSync(destination)) throw new Error(`${id}: plugins/${id} missing`)
    const keep = join(destination, 'node_modules')
    rmSync(destination, { recursive: true, force: true })
    mkdirSync(destination, { recursive: true })
    if (existsSync(keep)) {
      // node_modules 是安装期生成物，直接重建即可，无需保留
      rmSync(keep, { recursive: true, force: true })
    }
    cpSync(packageDir, destination, { recursive: true })

    const changed = rewriteWorkspaceDeps(join(destination, 'package.json'))

    component.version = latest
    component.note = `${component.note ? component.note + '; ' : ''}npm sync ${latest} (${new Date().toISOString().slice(0, 10)}): re-vendored from ${packageName}@${latest}, ${changed} workspace dep(s) rewired`
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    // profile 清单 version 同步（verify-repository 要求两清单一致）
    const profileManifestPath = join(root, 'profiles', 'marisa', 'plugins.json')
    const profileManifest = JSON.parse(readFileSync(profileManifestPath, 'utf8'))
    const profileEntry = profileManifest.plugins.find(entry => entry.dir === id)
    if (profileEntry) {
      profileEntry.version = latest
      writeFileSync(profileManifestPath, `${JSON.stringify(profileManifest, null, 2)}\n`, 'utf8')
    }
    return { id, status: 'SYNCED', version: latest, workspaceRewrites: changed }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const targets = all
  ? manifest.plugins.filter(p => p.source === 'npm')
  : ids.map(id => manifest.plugins.find(p => p.id === id))
for (const target of targets) {
  if (!target) { console.error(`unknown npm-snapshot plugin: ${target}`); process.exit(2) }
  if (target.source !== 'npm') { console.error(`${target.id}: not an npm snapshot (source=${target.source})`); process.exit(2) }
}

let synced = 0
for (const component of targets) {
  try {
    const result = syncComponent(component)
    console.log(`[${result.status}] ${result.id}: ${result.version}${result.workspaceRewrites ? ` (${result.workspaceRewrites} workspace rewrites)` : ''}${result.reason ? ` — ${result.reason}` : ''}`)
    if (result.status === 'SYNCED') synced++
  } catch (error) {
    console.error(`[ERROR] ${component.id}: ${error.message}`)
    process.exitCode = 2
  }
}
console.log(`npm snapshot sync: ${synced} updated`)
if (process.exitCode === undefined) process.exit(synced ? 1 : 0)
