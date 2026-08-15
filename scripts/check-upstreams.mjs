import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'maintenance/upstreams.json'), 'utf8'))
const components = [
  { id: 'harness', ...manifest.harness },
  ...manifest.plugins,
]

let stale = 0
for (const component of components) {
  if (component.source === 'npm') {
    console.log(`SKIP  ${component.mode.padEnd(6)} ${component.id}: npm snapshot — replace the published tarball and bump version manually (docs/upstream-sync.md)`)
    continue
  }
  let output
  try {
    output = execFileSync('git', ['ls-remote', component.repository, 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim()
  } catch (error) {
    console.error(`${component.id}: upstream lookup failed: ${error.message}`)
    process.exitCode = 2
    continue
  }
  const head = output.split(/\s+/)[0]
  const current = component.baseline
  const changed = !head.startsWith(current) && !current.startsWith(head)
  console.log(`${changed ? 'UPDATE' : 'OK    '} ${component.mode.padEnd(6)} ${component.id}: ${current.slice(0, 12)} -> ${head.slice(0, 12)}`)
  if (changed) stale += 1
}

if (stale > 0) {
  console.error(`${stale} upstream update(s) available; open one upstream-sync PR per component and follow docs/upstream-sync.md`)
  process.exitCode = 1
}