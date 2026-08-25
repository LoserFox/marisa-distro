#!/usr/bin/env node
// upstream-sync-assess — 全组件上游同步评估：判断「是否应该同步」并给出建议动作。
//
// 覆盖 harness / mygo / 全部 plugins（internal 跳过）。对每个组件输出：
//   当前 pin（baseline 或 npm version）→ 上游 HEAD / 最新 tag / npm latest
//   → 落后判定（UPDATE-稳定 / NO-STABLE→人工 / OK / INTERNAL）
//   → 建议动作（mirror 自动树替换 / fork 人工重放 diff / npm 快照人工更新）
//
// 决策规则：
//   - git 组件：baseline 命中 HEAD 或最新稳定 tag = OK；有稳定 tag 且领先
//     baseline = UPDATE-稳定（应该同步）；无 tag 但 HEAD 漂移 = NO-STABLE
//     （rc 生态常态，建议人工评估后再 pin）
//   - npm 快照：latest != 登记 version = UPDATE-稳定；同步时须复查
//     minimumReleaseAgeExclude 白名单与 vendored lifecycle 脚本
//   - mirror 组件另附干净度提示（转 submodule 前提，见 verify-mirror-purity）
//
// 用法：
//   node scripts/upstream-sync-assess.mjs                  # 控制台表格
//   node scripts/upstream-sync-assess.mjs --report <path>  # 另写 markdown 报告
// 退出码：有待同步项 = 1，全 OK = 0，查询失败 = 2（可接 CI/定时任务）。

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'maintenance/upstreams.json'), 'utf8'))
const argv = process.argv.slice(2)
const reportArg = argv.indexOf('--report')
const reportPath = reportArg >= 0 ? resolve(argv[reportArg + 1]) : null

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, shell: process.platform === 'win32' })
}

function short(sha) { return (sha ?? '').slice(0, 12) }

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

const components = [
  { id: 'harness', ...manifest.harness },
  { id: 'mygo', ...manifest.mygo },
  ...manifest.plugins,
]

const rows = []
let updates = 0
let errors = 0

for (const component of components) {
  const base = { id: component.id, mode: component.mode }
  if (component.mode === 'internal' || (!component.repository && component.source !== 'npm')) {
    rows.push({ ...base, pin: '—', latest: '—', status: 'INTERNAL', action: '自研组件（无上游）' })
    continue
  }
  // 第一方插件：repository 指向 marisa-distro 仓库自身（如 dsh-update-check、
  // dsh-auto-resume），演进即仓库自身演进，不适用上游同步判断。
  if (String(component.repository ?? '').includes('marisa-distro')) {
    rows.push({ ...base, pin: component.baseline ? short(component.baseline) : `npm ${component.version}`, latest: '—', status: 'FIRST-PARTY', action: '本地第一方插件（repository 即本仓库），不适用上游同步' })
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
        ...base,
        pin: `npm ${current}`,
        latest: latest || '查询为空',
        status: changed ? 'UPDATE-稳定' : 'OK',
        action: changed
          ? `同步到 npm ${latest}：重新 vendored 快照，复查 minimumReleaseAgeExclude 与 lifecycle 脚本`
          : '已是最新',
      })
      continue
    }
    const head = sh('git', ['ls-remote', component.repository, 'HEAD']).trim().split(/\s+/)[0]
    const tagLines = sh('git', ['ls-remote', '--tags', '--refs', component.repository]).trim()
    const tags = tagLines ? tagLines.split('\n').map(l => { const [sha, ref] = l.split(/\s+/); return { sha, ref } }) : []
    const tag = latestSemverTag(tags)
    const baseline = component.baseline
    const headDrift = !head.startsWith(baseline) && !baseline.startsWith(head)
    let status, action
    if (tag && tag.sha.startsWith(baseline)) {
      status = 'OK'
      action = `基线即最新稳定 tag ${tag.ref}`
    } else if (tag && baseline.startsWith(tag.sha)) {
      status = 'OK'
      action = `基线已超过最新稳定 tag ${tag.ref}（${short(tag.sha)}，无更新的稳定线）`
    } else if (tag) {
      status = 'UPDATE-稳定'
      action = component.mode === 'mirror'
        ? `同步到 tag ${tag.ref}（${short(tag.sha)}）：scripts/sync-upstream.mjs ${component.id} 自动树替换`
        : `重放 diff 到 ${tag.ref}（${short(tag.sha)}）：见 ${component.diffDocument ?? 'diffDocument'}`
      updates++
    } else if (headDrift) {
      status = 'NO-STABLE→人工'
      action = `HEAD 漂移到 ${short(head)} 但无稳定 tag（rc 生态常态）；人工评估后 pin`
      updates++
    } else {
      status = 'OK'
      action = `HEAD（${short(head)}）即 baseline`
    }
    rows.push({
      ...base,
      pin: short(baseline),
      latest: `${short(head)}${tag ? ` / tag ${tag.ref}` : ''}`,
      status,
      action,
    })
  } catch (error) {
    errors++
    rows.push({ ...base, pin: component.baseline ? short(component.baseline) : component.version, latest: '—', status: 'ERROR', action: String(error.message).split('\n')[0].slice(0, 120) })
  }
}

const lines = []
lines.push('# 上游同步评估报告')
lines.push('')
lines.push(`> 生成：\`node scripts/upstream-sync-assess.mjs\`。判断口径：git 组件比较登记 baseline 与上游 HEAD/最新稳定 tag；npm 快照比较登记 version 与 dist-tags.latest。`)
lines.push('')
lines.push('| 组件 | mode | 当前 pin | 上游最新 | 判定 | 建议动作 |')
lines.push('|---|---|---|---|---|---|')
for (const r of rows) {
  const badge = r.status === 'OK' ? '✅' : r.status === 'UPDATE-稳定' ? '⬆️' : r.status === 'NO-STABLE→人工' ? '⚠️' : r.status === 'INTERNAL' ? '⏸' : '❌'
  lines.push(`| ${r.id} | ${r.mode} | \`${r.pin}\` | \`${r.latest}\` | ${badge} ${r.status} | ${r.action} |`)
}
lines.push('')
lines.push(`共 ${rows.length} 组件：${updates} 个建议同步，${errors} 个查询失败。`)

const table = lines.join('\n') + '\n'
if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, table, 'utf8')
  process.stdout.write(`report written: ${resolve(root, reportPath)}\n`)
} else {
  process.stdout.write(table)
}
process.exit(errors ? 2 : updates ? 1 : 0)
