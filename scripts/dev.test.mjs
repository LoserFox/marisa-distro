import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildBackendArgs,
  buildDesktopBackendCommand,
  buildWatcherArgs,
  extractWebUrl,
  missingPrerequisites,
  parseArgs,
  resolveLayout,
} from './dev.mjs'

test('development options expose browser and desktop modes', () => {
  assert.deepEqual(parseArgs([]), { desktop: false, open: true, help: false })
  assert.deepEqual(parseArgs(['--desktop', '--no-open']), { desktop: true, open: false, help: false })
  assert.throws(() => parseArgs(['--wat']), /unknown option: --wat/u)
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
    mkdirSync(layout.profileModules, { recursive: true })
    assert.deepEqual(missingPrerequisites(layout), [])
    assert.deepEqual(missingPrerequisites(layout, { desktop: true }), [
      ['development desktop shell', layout.desktopShell],
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
