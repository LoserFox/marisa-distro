import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildBackendArgs,
  buildDesktopBackendCommand,
  buildWatcherArgs,
  desktopGoFiles,
  desktopShellBuildCommand,
  extractWebUrl,
  missingPrerequisites,
  needsDesktopShellRebuild,
  parseArgs,
  resolveLayout,
  supportsNativeTypeScript,
} from './dev.mjs'

test('development options expose browser and desktop modes', () => {
  assert.deepEqual(parseArgs([]), { desktop: false, open: true, help: false })
  assert.deepEqual(parseArgs(['--desktop', '--no-open']), { desktop: true, open: false, help: false })
  assert.throws(() => parseArgs(['--wat']), /unknown option: --wat/u)
})

test('development runtime requires native TypeScript support', () => {
  assert.equal(supportsNativeTypeScript('22.18.0'), false)
  assert.equal(supportsNativeTypeScript('22.19.0'), true)
  assert.equal(supportsNativeTypeScript('23.11.0'), false)
  assert.equal(supportsNativeTypeScript('24.0.0'), true)
})

test('backend command selects the Marisa profile, HMR, overlay, and requested port', () => {
  const layout = resolveLayout({ root: 'C:\\repo', home: 'C:\\Users\\dev', platform: 'win32' })
  assert.deepEqual(buildBackendArgs(layout, { port: '{port}' }), [
    layout.cli,
    '--profile', 'marisa',
    '--patch', layout.overlay,
    '--no-open',
    '--port', '{port}',
  ])
  const command = buildDesktopBackendCommand(layout, 'C:\\Program Files\\nodejs\\node.exe')
  assert.match(command, /^"C:\\Program Files\\nodejs\\node\.exe"/u)
  assert.match(command, /"--no-open" "--port" "\{port\}"$/u)
  assert.deepEqual(buildWatcherArgs(layout), [layout.watcherScript, '--poll'])
})

test('web URL extraction accepts only the loopback boot line', () => {
  assert.equal(extractWebUrl('dsh web: http://127.0.0.1:43125'), 'http://127.0.0.1:43125')
  const splitBootLine = ['dsh web: http://127.0.', '0.1:43125'].reduce((tail, chunk) => `${tail}${chunk}`.slice(-4096), '')
  assert.equal(extractWebUrl(splitBootLine), 'http://127.0.0.1:43125')
  assert.equal(extractWebUrl('dsh web: http://0.0.0.0:43125'), undefined)
  assert.equal(extractWebUrl('noise http://127.0.0.1:43125'), undefined)
})

test('preflight reports only missing artifacts and includes the shell in desktop mode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'marisa-dev-test-'))
  try {
    const layout = resolveLayout({ root, home: path.join(root, 'home'), platform: 'win32' })
    for (const target of [layout.cli, layout.watcherScript, layout.profileManifest, layout.overlay]) {
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, '')
    }
    mkdirSync(layout.rootModules, { recursive: true })
    mkdirSync(path.dirname(layout.tsdownManifest), { recursive: true })
    writeFileSync(layout.tsdownManifest, '{}')
    mkdirSync(layout.profileModules, { recursive: true })
    // 桌面壳由 dev 流程按需自动重建，不再是预检硬依赖。
    assert.deepEqual(missingPrerequisites(layout), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('desktop shell is rebuilt when missing or stale relative to Go sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'marisa-dev-shell-'))
  try {
    const layout = resolveLayout({ root, home: path.join(root, 'home'), platform: 'win32' })
    mkdirSync(path.join(layout.desktopDir, 'sub'), { recursive: true })
    writeFileSync(path.join(layout.desktopDir, 'main.go'), 'package main\n')
    writeFileSync(path.join(layout.desktopDir, 'sub', 'util.go'), 'package main\n')
    writeFileSync(path.join(layout.desktopDir, 'main_test.go'), 'package main\n')

    // 测试文件不影响产物，不计入重建判定。
    assert.deepEqual(
      desktopGoFiles(layout.desktopDir).map((file) => path.relative(layout.desktopDir, file)).sort(),
      ['main.go', path.join('sub', 'util.go')],
    )

    // 壳缺失 → 需要重建。
    assert.equal(needsDesktopShellRebuild(layout), true)

    mkdirSync(path.dirname(layout.desktopShell), { recursive: true })
    writeFileSync(layout.desktopShell, '')
    const future = new Date(Date.now() + 60_000)
    // 任一源文件比壳新 → 需要重建。
    utimesSync(path.join(layout.desktopDir, 'main.go'), future, future)
    assert.equal(needsDesktopShellRebuild(layout), true)

    // 壳比所有源文件新 → 无需重建。
    utimesSync(layout.desktopShell, new Date(future.getTime() + 60_000), new Date(future.getTime() + 60_000))
    assert.equal(needsDesktopShellRebuild(layout), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('desktop shell build command pins -C first and an absolute -o', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'marisa-dev-shell-'))
  try {
    const layout = resolveLayout({ root, home: path.join(root, 'home'), platform: 'win32' })
    const build = desktopShellBuildCommand(layout)
    assert.equal(build.command, 'go')
    assert.equal(build.cwd, root)
    assert.deepEqual(build.args, ['build', '-C', layout.desktopDir, '-o', layout.desktopShell, '.'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── harness overlays ──────────────────────────────────────────────────────────
// overlays/harness 的发行版增量（品牌兜底字符串 + anchored-standard 预设）由
// scripts/apply-harness-overlays.mjs 在构建/打包阶段应用；harness 工作树必须
// 保持上游 pristine。测试用模拟上游文件验证 apply/revert/verify 的幂等与保护。

import { fileURLToPath } from 'node:url'

const overlayScript = fileURLToPath(new URL('./apply-harness-overlays.mjs', import.meta.url))
const overlayUpstreamFiles = {
  'apps/web/index.html': '<!doctype html><html lang="en"><head><title>DSH Local Build</title></head></html>\n',
  'apps/web/vite.config.ts': "const DEFAULT_CLIENT_TITLE = 'DSH Local Build'\nhtml.replace('<title>DSH Local Build</title>', `<title>${title}</title>`)\n",
  'packages/client/ui-renderer/src/client/DocumentTitle.tsx': "const DEFAULT_CLIENT_TITLE = 'DSH Local Build'\n",
  'packages/client/ui-sidebar/src/client/SidebarRoot.tsx': '<span className={css.fallbackBrandName}>DSH Local Build</span>\n',
}

function runOverlay(...args) {
  return execFileSync(process.execPath, [overlayScript, ...args], { encoding: 'utf8' })
}

async function seedUpstreamTree(tree) {
  for (const [rel, content] of Object.entries(overlayUpstreamFiles)) {
    const target = path.join(tree, rel)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

test('harness overlays apply/revert/verify on a pristine tree', async () => {
  const tree = await mkdtemp(path.join(tmpdir(), 'marisa-overlay-'))
  try {
    await seedUpstreamTree(tree)
    const anchoredDir = path.join(tree, 'apps', 'cli', 'config', 'agent-presets', 'anchored-standard')

    runOverlay('apply', '--tree', tree)
    assert.match(readFileSync(path.join(tree, 'apps/web/index.html'), 'utf8'), /<html lang="zh-CN"><head><title>Marisa DSH<\/title>/u)
    assert.match(readFileSync(path.join(tree, 'packages/client/ui-renderer/src/client/DocumentTitle.tsx'), 'utf8'), /'Marisa DSH'/u)
    assert.ok(existsSync(path.join(anchoredDir, 'agent.cordis.yml')), 'anchored-standard preset must be materialized')

    runOverlay('apply', '--tree', tree) // 幂等
    assert.throws(() => runOverlay('verify', '--tree', tree), (error) => String(error.stderr ?? '').includes('not pristine'))

    runOverlay('revert', '--tree', tree)
    assert.match(readFileSync(path.join(tree, 'apps/web/index.html'), 'utf8'), /<html lang="en"><head><title>DSH Local Build<\/title>/u)
    assert.match(readFileSync(path.join(tree, 'packages/client/ui-renderer/src/client/DocumentTitle.tsx'), 'utf8'), /'DSH Local Build'/u)
    assert.ok(!existsSync(anchoredDir), 'anchored-standard must be removed on revert')

    runOverlay('revert', '--tree', tree) // 幂等
    runOverlay('verify', '--tree', tree)
  } finally {
    await rm(tree, { recursive: true, force: true })
  }
})

test('harness overlay revert refuses foreign edits under anchored-standard', async () => {
  const tree = await mkdtemp(path.join(tmpdir(), 'marisa-overlay-foreign-'))
  try {
    await seedUpstreamTree(tree)
    runOverlay('apply', '--tree', tree)
    const foreign = path.join(tree, 'apps', 'cli', 'config', 'agent-presets', 'anchored-standard', 'FOREIGN.md')
    writeFileSync(foreign, 'x')
    assert.throws(() => runOverlay('revert', '--tree', tree), (error) => String(error.stderr ?? '').includes('refusing to remove'))
    assert.ok(existsSync(foreign), 'foreign file must survive a refused revert')
  } finally {
    await rm(tree, { recursive: true, force: true })
  }
})
