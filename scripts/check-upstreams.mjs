// check-upstreams — 本地上游雷达：对比 maintenance/upstreams.json 的 pin 与上游现状。
//
// 设计要点（2026-08-23 升级）：
// - pin 的判断权始终在人：命令只提供「上游稳定信号 + 建议 pin + 漂移量」。
// - git 组件：HEAD 漂移 + 最新 semver tag（有 tag = 稳定信号；无 tag 无 release
//   = NO-STABLE，给 HEAD 供人工判断 pin 到哪）。
// - npm 快照组件：dist-tags.latest 与 pin 版本对比（不再 SKIP）。
// - 全部本地执行（git ls-remote / npm view），不依赖 push 或 GitHub UI。
// - 退出码：有待决策项（稳定版落后或无稳定版但 HEAD 漂移）= 1，可接 CI；
//   全部最新 = 0；lookup 失败 = 2。

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'maintenance/upstreams.json'), 'utf8'))
const wantMd = process.argv.includes('--md')
const mdPathArg = wantMd
  ? (process.argv[process.argv.indexOf('--md') + 1] ?? 'maintenance/upstream-report.md')
  : null

function sh(cmd, args) {
  // Windows 上 npm 是 .cmd shim，无 shell 时 spawnSync 直接 ENOENT。
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, shell: process.platform === 'win32' })
}

function latestSemverTag(tags) {
  const sem = tags
    .map(t => ({ ...t, m: /^refs\/tags\/v?(\d+)\.(\d+)\.(\d+)(?:[-.][0-9A-Za-z.-]+)?$/.exec(t.ref) }))
    .filter(t => t.m)
  if (!sem.length) return null
  sem.sort((a, b) => {
    for (let i = 1; i <= 3; i++) if (+a.m[i] !== +b.m[i]) return +b.m[i] - +a.m[i]
    return b.ref.localeCompare(a.ref)
  })
  return sem[0]
}

function short(sha) { return (sha ?? '').slice(0, 12) }

const rows = []
let updates = 0
let errors = 0

for (const component of [{ id: 'harness', ...manifest.harness }, ...manifest.plugins]) {
  if (component.mode === 'internal' || (!component.repository && component.source !== 'npm')) {
    rows.push({ id: component.id, mode: component.mode, pin: '—', signal: '自研组件（无上游）', suggest: '—', status: 'INTERNAL' })
    continue
  }
  try {
    if (component.source === 'npm') {
      const pkg = component.npmName ?? component.id
      const latest = sh('npm', ['view', pkg, 'dist-tags.latest']).trim()
      const current = component.version
      const changed = Boolean(latest) && latest !== current
      if (changed) updates++
      rows.push({
        id: component.id, mode: component.mode,
        pin: `npm ${current}`,
        signal: latest ? `npm latest ${latest}` : 'npm 查询为空',
        suggest: changed ? latest : '—',
        status: changed ? 'UPDATE-稳定' : 'OK',
      })
      continue
    }
    const head = sh('git', ['ls-remote', component.repository, 'HEAD']).trim().split(/\s+/)[0]
    const tagLines = sh('git', ['ls-remote', '--tags', '--refs', component.repository]).trim()
    const tags = tagLines ? tagLines.split('\n').map(l => { const [sha, ref] = l.split(/\s+/); return { sha, ref } }) : []
    const tag = latestSemverTag(tags)
    const baseline = component.baseline
    const headDrift = !head.startsWith(baseline) && !baseline.startsWith(head)
    let status, suggest
    if (tag && tag.sha.startsWith(baseline)) { status = 'OK(tag)' ; suggest = '—' }
    else if (tag) { status = 'UPDATE-稳定'; suggest = short(tag.sha); updates++ }
    else if (headDrift) { status = 'NO-STABLE→人工'; suggest = short(head); updates++ }
    else { status = 'OK'; suggest = '—' }
    rows.push({
      id: component.id, mode: component.mode,
      pin: `${short(baseline)}${component.dshVersion ? ` (${component.dshVersion})` : ''}`,
      signal: tag ? `tag ${tag.ref.replace('refs/tags/', '')}` : `HEAD ${short(head)}（无 tag/release）`,
      suggest, status,
    })
  } catch (error) {
    errors++
    rows.push({ id: component.id, mode: component.mode, pin: '?', signal: `lookup failed: ${error.message.split('\n')[0]}`, suggest: '?', status: 'ERROR' })
  }
}

const order = { 'UPDATE-稳定': 0, 'NO-STABLE→人工': 1, ERROR: 2, 'OK(tag)': 3, OK: 3, INTERNAL: 4 }
rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.id.localeCompare(b.id))

for (const r of rows) {
  console.log(`${r.status.padEnd(14)} ${r.mode.padEnd(6)} ${r.id.padEnd(30)} pin=${r.pin.padEnd(20)} ${r.signal}${r.suggest !== '—' ? `  → 建议 pin ${r.suggest}` : ''}`)
}
const summary = `${rows.length} 组件：${updates} 项待决策（稳定版可更新或无稳定版需人工 pin），${errors} 项查询失败`
console.log(`\n${summary}`)
if (updates > 0) process.exitCode = 1
if (errors > 0) process.exitCode = 2

if (wantMd) {
  const md = [
    '# 上游漂移报告',
    '',
    `生成：${new Date().toISOString()}`,
    '',
    summary,
    '',
    '| 状态 | 模式 | 组件 | pin | 上游信号 | 建议 pin |',
    '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.status} | ${r.mode} | ${r.id} | ${r.pin} | ${r.signal} | ${r.suggest} |`),
    '',
    '决策权在人：建议 pin 仅供参照（tag 优先；无发版史的仓库自行判断 commit）。同步流程见 docs/upstream-sync.md。',
  ].join('\n')
  writeFileSync(resolve(root, mdPathArg), md)
  console.log(`markdown 报告: ${mdPathArg}`)
}
