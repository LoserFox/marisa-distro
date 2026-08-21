#!/usr/bin/env node
/**
 * verify-profile-run.mjs — boot an EXTRACTED profile zip through the shipped
 * terminal launcher (run-profile.mjs), exactly like a terminal user would.
 *
 * Unlike verify-bundle-boot.mjs (which boots the backend directly), this
 * exercises the profile distribution's own entry point: URL parsing from the
 * "dsh web:" line, env wiring (DSH_HOME/DSH_ROOT/PATH), output relay and exit
 * propagation — then checks the web URL + plugin routes.
 *
 * Usage: node scripts/verify-profile-run.mjs <extracted-profile-zip-root>
 * (the dir containing node.exe, marisa-distro/, .dsh/ and run-profile.mjs)
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.argv[2] ? path.resolve(process.argv[2]) : ''
if (!root) {
  console.error('usage: node scripts/verify-profile-run.mjs <extracted-profile-zip-root>')
  process.exit(2)
}
const nodeExe = path.join(root, 'node.exe')
const runner = path.join(root, 'run-profile.mjs')

const timeoutMs = Number(process.env.MARISA_BUNDLE_BOOT_TIMEOUT_MS ?? 150_000)
const child = spawn(nodeExe, [runner, '--no-open'], {
  cwd: root,
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
      console.error(`profile run FAILED (exit ${child.exitCode}):\n${output}`)
      process.exit(1)
    }
    const match = output.match(/\[marisa\] web UI ready: (http:\/\/127\.0\.0\.1:\d+)/)
    if (match) {
      url = match[1]
      break
    }
    await sleep(500)
  }
  if (!url) {
    console.error(`profile run timed out after ${timeoutMs}ms:\n${output}`)
    process.exit(1)
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const probes = [
    ['update-check state', `${url}/plugins/dsh-update-check/state`],
    ['vision settings', `${url}/_dsh/vision-toolkit/settings`],
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
