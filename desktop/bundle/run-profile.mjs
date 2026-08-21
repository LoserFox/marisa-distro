#!/usr/bin/env node
/**
 * run-profile.mjs — standalone (profile) launcher for the marisa backend bundle.
 *
 * Boots the bundled harness CLI against the bundled marisa profile — the same
 * boot line as launcher.cmd (the desktop shell's DSH_WEB_CMD) — then:
 *   1. parses the "dsh web: <url>" line the web runtime prints,
 *   2. opens that URL in the system default browser (unless --no-open),
 *   3. relays backend output to this terminal,
 *   4. exits with the backend's exit code.
 *
 * This is the terminal-user entry point of the profile distribution:
 *   run-marisa.bat              (Windows, zip root — double-click or CLI)
 *   node run-profile.mjs [--no-open] [-- <extra cli args>]
 *
 * The bundle root (this file's directory) is self-contained: node.exe,
 * marisa-distro/ (harness tree), .dsh/ (bundled marisa profile home).
 * DSH_HOME stays inside the extraction directory — unzipping a new version
 * never touches an old one's data.
 *
 * Env: MARISA_NO_OPEN=1 has the same effect as --no-open (for scripts/tests).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(root, 'marisa-distro', 'harness', 'apps', 'cli', 'lib', 'bin.js')
const profile = path.join(root, '.dsh', 'profiles', 'marisa')
const desktopOverlay = path.join(profile, 'desktop.overlay.yml')
const standaloneOverlay = path.join(profile, 'standalone.overlay.yml')
const harness = path.join(root, 'marisa-distro', 'harness')

// The web runtime prints the URL once the server is up (see launcher.cmd).
const URL_PATTERN = /\bdsh web: (http:\/\/127\.0\.0\.1:\d+)\b/u

function parseArgs(argv) {
  const extra = []
  let noOpen = process.env.MARISA_NO_OPEN === '1'
  let passthrough = false
  for (const arg of argv) {
    if (!passthrough && arg === '--') { passthrough = true; continue }
    if (!passthrough && arg === '--no-open') { noOpen = true; continue }
    extra.push(arg)
  }
  return { noOpen, extra }
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => { /* opening a browser is best-effort */ })
  child.unref()
}

const { noOpen, extra } = parseArgs(process.argv.slice(2))

for (const [what, p] of [
  ['bundled CLI', cli],
  ['bundled profile', profile],
  ['desktop overlay', desktopOverlay],
  ['standalone overlay', standaloneOverlay],
]) {
  if (!existsSync(p)) {
    console.error(`marisa profile bundle is incomplete: missing ${what} at ${p}`)
    process.exit(2)
  }
}

// Bundled node.exe runs this script, so process.execPath is the right runtime.
// PATH gets the bundle root first so plugins can spawn `mnemon` (memory engine)
// and `node` from the bundle, mirroring launcher.cmd.
const child = spawn(process.execPath, [
  cli, '--profile', 'marisa',
  '--patch', desktopOverlay,
  '--patch', standaloneOverlay,
  ...extra,
], {
  cwd: harness,
  env: {
    ...process.env,
    DSH_HOME: path.join(root, '.dsh'),
    DSH_ROOT: path.join(root, 'marisa-distro'),
    PATH: `${root}${path.delimiter}${process.env.PATH ?? ''}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let url = null
const relay = (chunk, stderr) => {
  const text = chunk.toString()
  ;(stderr ? process.stderr : process.stdout).write(text)
  if (!url) {
    const match = URL_PATTERN.exec(text)
    if (match) {
      url = match[1]
      console.log(`\n[marisa] web UI ready: ${url}`)
      if (!noOpen) openBrowser(url)
    }
  }
}
child.stdout.on('data', (chunk) => relay(chunk, false))
child.stderr.on('data', (chunk) => relay(chunk, true))

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
