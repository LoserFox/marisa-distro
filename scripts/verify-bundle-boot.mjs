#!/usr/bin/env node
/**
 * verify-bundle-boot.mjs — boot an EXTRACTED backend bundle exactly like the
 * desktop shell does (launcher.cmd), then check the web URL + HTTP 200.
 *
 * Unlike verify-mygo-runtime.mjs (which boots the REPO's CLI against a
 * profile), this uses the bundle's OWN node.exe, harness CLI, and profile —
 * the same code path a standalone user runs. Use it to prove a rebuilt
 * backend.tar.zst actually boots before shipping the exe.
 *
 * Usage: node scripts/verify-bundle-boot.mjs <extracted-bundle-dir>
 * (the dir containing node.exe, marisa-distro/, and .dsh/ — i.e. the
 * materialized backend root)
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const bundle = process.argv[2]
if (!bundle) {
  console.error('usage: node scripts/verify-bundle-boot.mjs <extracted-bundle-dir>')
  process.exit(2)
}
const nodeExe = path.join(bundle, 'node.exe')
const cli = path.join(bundle, 'marisa-distro', 'harness', 'apps', 'cli', 'lib', 'bin.js')
const harness = path.join(bundle, 'marisa-distro', 'harness')
const dshHome = path.join(bundle, '.dsh')
const profile = path.join(dshHome, 'profiles', 'marisa')

const timeoutMs = Number(process.env.MARISA_BUNDLE_BOOT_TIMEOUT_MS ?? 150_000)
const child = spawn(nodeExe, [
  cli, '--profile', 'marisa',
  '--patch', path.join(profile, 'desktop.overlay.yml'),
  '--patch', path.join(profile, 'standalone.overlay.yml'),
], {
  cwd: harness,
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_ROOT: path.join(bundle, 'marisa-distro'),
    PATH: `${bundle};${process.env.PATH ?? ''}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const deadline = Date.now() + timeoutMs
let url
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      console.error(`bundle boot FAILED (exit ${child.exitCode}):\n${output}`)
      process.exit(1)
    }
    const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
    if (match) {
      url = match[1]
      break
    }
    await sleep(500)
  }
  if (!url) {
    console.error(`bundle boot timed out after ${timeoutMs}ms:\n${output}`)
    process.exit(1)
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    console.error(`bundle boot HTTP ${response.status} at ${url}`)
    process.exit(1)
  }
  // Plugin route probes: these routes must be claimed by their plugins, not
  // fall through to the SPA (a "<!doctype" HTML body here is the exact
  // regression a missing webServer route fix would reintroduce).
  const probes = [
    ['update-check state', `${url}/plugins/dsh-update-check/state`],
    ['modlens config', `${url}/modlens/config`],
  ]
  const routeResults = []
  for (const [name, probeUrl] of probes) {
    let body = ''
    try {
      const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(15_000) })
      body = await probe.text()
      const looksLikeSpa = body.trimStart().startsWith('<!doctype') || body.trimStart().startsWith('<html')
      routeResults.push({ route: name, status: probe.status, spaFallback: looksLikeSpa })
    } catch (error) {
      routeResults.push({ route: name, error: String(error) })
    }
  }
  console.log(JSON.stringify({ ok: true, url, http: response.status, routes: routeResults }, null, 2))
} finally {
  child.kill()
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2_000),
  ])
}
