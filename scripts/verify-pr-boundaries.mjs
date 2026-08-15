import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'maintenance/upstreams.json'), 'utf8'))
const changed = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean).map(path => path.replaceAll('\\', '/'))
const changedSet = new Set(changed)
const upstreamSync = process.env.UPSTREAM_SYNC === 'true'
const baseRef = process.env.PR_BASE_REF ?? 'origin/main'

try {
  execFileSync('git', ['rev-parse', '--verify', baseRef], { cwd: root, stdio: 'ignore' })
} catch {
  throw new Error(`Cannot resolve PR base ref ${baseRef}; set PR_BASE_REF to the fetched base branch`)
}

function isInitialVendorImport(path) {
  try {
    execFileSync('git', ['cat-file', '-e', `${baseRef}:${path}`], { cwd: root, stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

for (const plugin of manifest.plugins) {
  const prefix = `plugins/${plugin.id}/`
  if (!changed.some(path => path.startsWith(prefix))) continue
  if (plugin.mode === 'mirror') {
    const initialImport = isInitialVendorImport(`plugins/${plugin.id}`)
    assert.ok(
      upstreamSync || initialImport,
      `${plugin.id} is a mirror; only a maintainer-labelled upstream-sync PR may modify it`,
    )
    assert.ok(changedSet.has('maintenance/upstreams.json'), `${plugin.id}: mirror sync must update its commit baseline`)
  } else {
    assert.ok(changedSet.has(plugin.diffDocument), `${plugin.id}: fork changes must update ${plugin.diffDocument}`)
  }
}

if (changed.some(path => path.startsWith('harness/'))) {
  assert.ok(changedSet.has('docs/upstream-diff.md'), 'harness changes must update docs/upstream-diff.md')
  assert.ok(changedSet.has('maintenance/upstreams.json'), 'harness changes must update or reaffirm the recorded upstream baseline')
}

console.log(`PR boundaries ok for ${changed.length} changed path(s)`)
