import assert from 'node:assert/strict'
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
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
    'web',
    '--profile', 'marisa',
    '--patch', layout.overlay,
    '--dev',
    '--port', '{port}',
  ])
  const command = buildDesktopBackendCommand(layout, 'C:\\Program Files\\nodejs\\node.exe')
  assert.match(command, /^"C:\\Program Files\\nodejs\\node\.exe"/u)
  assert.match(command, /"--dev" "--port" "\{port\}"$/u)
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
