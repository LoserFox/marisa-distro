#!/usr/bin/env node
/**
 * mygo 发布流水线骨架（P3 自包含 workspace 形态）：在仓库内构建全部产物、
 * 做发布前自检，然后逐个 `pnpm publish`（不自动执行发布，避免无授权发布；
 * 发布留作 handoff，见工作区守则）。
 *
 * 用法（仓库根）：
 *   node scripts/publish-mygo.mjs --dry-run
 *   node scripts/publish-mygo.mjs
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dryRun = process.argv.includes('--dry-run')
const node = process.execPath

function run(bin, args, cwd = root) {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit', env: process.env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const packages = [
  'packages/core/mygo-api',
  'packages/cordis/mygo',
  'packages/cordis/mygo-cli',
  'packages/extensions/mygo-panel',
  'packages/loaders/mygo-loader-profile',
  'packages/loaders/mygo-loader-hub',
  'packages/extensions/mygo-fabric',
]
for (const pkg of packages) {
  if (!existsSync(join(root, pkg, 'package.json'))) {
    console.error(`缺少 ${pkg}/package.json（仓库布局不完整）`)
    process.exit(1)
  }
}

console.log('==> 全量构建（pnpm -r run build）')
run('pnpm', ['-r', 'run', 'build'])

console.log('==> prepack 自检（lib + .d.ts 门禁）')
for (const pkg of packages) {
  // npm pack --dry-run 会执行该包的 prepack（lib/.d.ts 存在性门禁）并列出发布内容。
  run('npm', ['pack', '--dry-run'], join(root, pkg))
}

const names = [
  '@r05en1cu/dsh-mygo-api',
  '@r05en1cu/dsh-mygo',
  '@r05en1cu/dsh-mygo-cli',
  '@r05en1cu/dsh-mygo-ext-panel',
  '@r05en1cu/dsh-mygo-loader-profile',
  '@r05en1cu/dsh-mygo-loader-hub',
  '@r05en1cu/dsh-mygo-ext-fabric',
]
if (dryRun) {
  console.log('dry-run：构建与自检通过，未执行发布。')
  console.log('发布命令（确认 scope 权限后执行）：')
  for (const name of names) {
    console.log(`  pnpm --filter ${name} publish --no-git-checks`)
  }
} else {
  console.log('==> 发布（请确认权限；本脚本执行 pnpm publish）')
  for (const name of names) {
    run('pnpm', ['--filter', name, 'publish', '--no-git-checks'])
  }
}
