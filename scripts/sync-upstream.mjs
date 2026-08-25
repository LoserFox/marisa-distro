import assert from 'node:assert/strict'
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const manifestPath = join(root, 'maintenance', 'upstreams.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const id = process.argv[2]
assert.ok(id, 'usage: node scripts/sync-upstream.mjs <harness|plugin-id>')
assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'component id contains unsupported characters')

const component = id === 'harness'
  ? { id: 'harness', ...manifest.harness }
  : manifest.plugins.find(plugin => plugin.id === id)
assert.ok(component, `unknown upstream component: ${id}`)

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

function writeCandidateIfChanged(candidatePath, candidate) {
  let existing
  try {
    existing = JSON.parse(readFileSync(candidatePath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`${id}: replacing unreadable candidate ${candidatePath}: ${error.message}`)
    }
  }

  const { checkedAt: _existingCheckedAt, ...existingComparable } = existing ?? {}
  const { checkedAt: _candidateCheckedAt, ...candidateComparable } = candidate
  if (JSON.stringify(existingComparable) === JSON.stringify(candidateComparable)) {
    return false
  }

  mkdirSync(dirname(candidatePath), { recursive: true })
  writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`)
  return true
}

function writeCandidate({ available, source, currentVersion, mode = component.mode, action }) {
  const candidateDirectory = join(root, 'maintenance', 'candidates')
  const candidatePath = join(candidateDirectory, `${id}.json`)
  const candidate = source === 'npm'
    ? {
        component: id,
        source,
        mode,
        package: currentVersion.package,
        currentVersion: currentVersion.version,
        available,
        repository: component.repository,
        diffDocument: component.diffDocument,
        checkedAt: new Date().toISOString(),
        action: 'Review the published npm tarball manually, then update the vendored snapshot, manifest, profile, and lockfile. This candidate does not modify plugins automatically.',
      }
    : {
        component: id,
        source,
        mode,
        baseline: component.baseline,
        available,
        repository: component.repository,
        diffDocument: component.diffDocument,
        checkedAt: new Date().toISOString(),
        action: action ?? 'Rebase the fork manually, replay or delete every documented diff, then run the release-level test matrix.',
      }

  const changed = writeCandidateIfChanged(candidatePath, candidate)
  setOutput('changed', changed ? 'true' : 'false')
  console.log(changed
    ? `${id}: wrote ${source} candidate ${candidatePath}`
    : `${id}: existing ${source} candidate already records ${available}`)
}

setOutput('mode', component.mode)
setOutput('source', component.source ?? 'git')
if (component.source === 'npm') {
  assert.notEqual(id, 'harness', 'harness cannot be an npm snapshot')
  assert.ok(component.version, `${id}: npm snapshot is missing its current version`)
  const packagePath = join(root, 'plugins', id, 'package.json')
  const currentPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
  assert.ok(currentPackage.name, `${id}: package.json is missing name`)
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const npmCommand = process.platform === 'win32' ? process.execPath : 'npm'
  const npmArguments = process.platform === 'win32' ? [npmCli] : []
  assert.ok(process.platform !== 'win32' || existsSync(npmCli), 'npm CLI was not found beside Node')
  const output = execFileSync(npmCommand, [...npmArguments, 'view', currentPackage.name, 'version', '--json'], {
    encoding: 'utf8', timeout: 30_000,
  }).trim()
  const available = JSON.parse(output)
  assert.equal(typeof available, 'string', `${id}: npm returned an invalid version`)
  setOutput('head', available)
  if (available === component.version) {
    console.log(`${id}: npm snapshot already at ${available}`)
    setOutput('changed', 'false')
    process.exit(0)
  }
  writeCandidate({
    available,
    source: 'npm',
    currentVersion: { package: currentPackage.name, version: component.version },
  })
  process.exit(0)
}
if (!component.repository) {
  console.log(`${id}: no published upstream repository; nothing to sync`)
  setOutput('changed', 'false')
  process.exit(0)
}

const output = execFileSync('git', ['ls-remote', component.repository, 'HEAD'], {
  encoding: 'utf8', timeout: 30_000,
}).trim()
const head = output.split(/\s+/)[0]
assert.match(head, /^[0-9a-f]{40}$/)
const upstreamChanged = !head.startsWith(component.baseline) && !component.baseline.startsWith(head)

setOutput('head', head)
if (!upstreamChanged) {
  console.log(`${id}: already at ${head}`)
  setOutput('changed', 'false')
  process.exit(0)
}

// harness 是 git submodule：同步 = 人工 pin bump（git submodule update 到新
// HEAD + 根依赖升级 + minimumReleaseAgeExclude + 品牌 overlay 重基线 + 换树
// 验证），bot 不自动改树。只写 review 候选。
if (id === 'harness') {
  writeCandidate({
    available: head,
    source: 'git',
    mode: 'mirror',
    currentVersion: { package: 'harness', version: manifest.harness.dshVersion },
    action: 'Manual harness pin bump: update the harness gitlink to the new upstream HEAD, bump root deps and minimumReleaseAgeExclude, re-baseline the brand overlay if upstream strings changed, then run the release-level test matrix.',
  })
  setOutput('changed', 'true')
  process.exit(0)
}

if (component.mode === 'fork') {
  writeCandidate({ available: head, source: 'git' })
  process.exit(0)
}

setOutput('changed', 'true')

const temporary = mkdtempSync(join(tmpdir(), `marisa-sync-${id}-`))
const checkout = join(temporary, 'upstream')
try {
  execFileSync('git', ['clone', '--filter=blob:none', '--depth=1', component.repository, checkout], { stdio: 'inherit' })
  const clonedHead = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.equal(clonedHead, head, `${id}: upstream moved during sync; retry the job`)

  const destination = join(root, 'plugins', id)
  const currentPackage = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))
  const upstreamPackage = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'))
  assert.equal(upstreamPackage.name, currentPackage.name, `${id}: upstream package identity changed`)

  function rejectLinks(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      assert.ok(!lstatSync(path).isSymbolicLink(), `${id}: upstream contains symbolic link ${path}`)
      if (entry.isDirectory()) rejectLinks(path)
    }
  }
  rejectLinks(checkout)

  rmSync(destination, { recursive: true, force: true })
  cpSync(checkout, destination, {
    recursive: true,
    filter: source => !['.git', 'node_modules'].includes(basename(source)),
  })
  const entry = manifest.plugins.find(plugin => plugin.id === id)
  entry.baseline = head
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${id}: mirrored ${head}`)
} finally {
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
}
