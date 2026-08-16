import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifestPath = join(root, 'maintenance', 'upstreams.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

assert.equal(manifest.schemaVersion, 1, 'unsupported upstream manifest schema')
for (const required of ['harness', 'plugins', 'desktop', 'docs']) {
  assert.ok(existsSync(join(root, required)), `missing repository boundary: ${required}/`)
}

assert.ok(!existsSync(join(root, 'harness', '.git')), 'harness must be owned by the root repository, not a nested Git repository')
assert.ok(existsSync(join(root, 'harness', 'package.json')), 'harness/package.json is missing')
assert.match(manifest.harness.baseline, /^[0-9a-f]{7,40}$/, 'harness baseline must be a commit id')
assert.equal(manifest.harness.mode, 'fork', 'harness is a maintained fork')

const pluginDirectories = readdirSync(join(root, 'plugins'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name !== 'node_modules')
  .map(entry => entry.name)
  .sort()
const pluginIds = manifest.plugins.map(plugin => plugin.id).sort()
assert.deepEqual(pluginIds, pluginDirectories, 'maintenance/upstreams.json must describe every plugins/* directory exactly once')

const profileManifestPath = join(root, 'profiles', 'marisa', 'plugins.json')
assert.ok(existsSync(profileManifestPath), 'profiles/marisa/plugins.json is missing')
const profileManifest = JSON.parse(readFileSync(profileManifestPath, 'utf8'))
assert.equal(profileManifest.schemaVersion, 1, 'unsupported profile plugin manifest schema')

for (const plugin of manifest.plugins) {
  assert.ok(['mirror', 'fork'].includes(plugin.mode), `${plugin.id}: invalid mode ${plugin.mode}`)
  const pluginRoot = join(root, 'plugins', plugin.id)
  const packagePath = join(pluginRoot, 'package.json')
  assert.ok(existsSync(packagePath), `${plugin.id}: package.json is missing`)
  assert.ok(!existsSync(join(pluginRoot, '.git')), `${plugin.id}: nested .git is forbidden`)

  const source = plugin.source ?? 'git'
  if (source === 'npm') {
    assert.ok(plugin.version, `${plugin.id}: npm snapshots require a package version`)
    if (plugin.repository !== null && plugin.repository !== undefined) {
      assert.match(plugin.repository, /^https:\/\/github\.com\/.+\/.+\.git$/, `${plugin.id}: repository must be a GitHub HTTPS clone URL`)
    }
    assert.equal(plugin.baseline, undefined, `${plugin.id}: npm snapshots track a version, not a git baseline`)
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
    assert.equal(pkg.version, plugin.version, `${plugin.id}: package.json version must match the upstream manifest`)
    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly']) {
      assert.equal(pkg.scripts?.[lifecycle], undefined, `${plugin.id}: vendored npm snapshots must not run ${lifecycle} during install`)
    }
  } else if (source === 'git') {
    assert.match(plugin.repository, /^https:\/\/github\.com\/.+\.git$/, `${plugin.id}: repository must be a GitHub HTTPS clone URL`)
    assert.match(plugin.baseline, /^[0-9a-f]{40}$/, `${plugin.id}: baseline must be a full commit id`)
  } else {
    assert.fail(`${plugin.id}: invalid source ${source}`)
  }

  if (plugin.mode === 'fork') {
    assert.ok(plugin.diffDocument, `${plugin.id}: forks need a diffDocument`)
    assert.ok(existsSync(join(root, plugin.diffDocument)), `${plugin.id}: missing ${plugin.diffDocument}`)
  } else {
    assert.equal(plugin.diffDocument, undefined, `${plugin.id}: mirrors cannot carry a local diff document`)
  }
}

const profileDirs = profileManifest.plugins.map(plugin => plugin.dir).sort()
assert.deepEqual(profileDirs, pluginDirectories, 'profiles/marisa/plugins.json must describe every plugins/* directory exactly once')
for (const plugin of profileManifest.plugins) {
  assert.ok(['git', 'npm'].includes(plugin.source), `${plugin.dir}: invalid profile plugin source ${plugin.source}`)
  const pkg = JSON.parse(readFileSync(join(root, 'plugins', plugin.dir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, plugin.name, `${plugin.dir}: profile manifest name must match package.json name`)
  const upstream = manifest.plugins.find(entry => entry.id === plugin.dir)
  assert.ok(upstream, `${plugin.dir}: missing upstream manifest entry`)
  assert.equal(plugin.source, upstream.source ?? 'git', `${plugin.dir}: profile manifest source must match upstream manifest`)
  if (plugin.source === 'npm') {
    assert.equal(plugin.version, upstream.version, `${plugin.dir}: profile manifest version must match upstream manifest`)
  }
}

const releaseWorkflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
assert.match(releaseWorkflow, /windows:\s*[\s\S]*?timeout-minutes:\s*60\b/, 'Windows release jobs must have a bounded runtime')
assert.match(releaseWorkflow, /version:\s*['"]11\.7\.0['"]/, 'release builds must use the pnpm version that generated the lockfile')
assert.match(
  releaseWorkflow,
  /if \(-not \(Get-Command python3\.exe -ErrorAction SilentlyContinue\)\)/,
  'release setup must preserve an existing python3.exe',
)

const rootWorkspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
assert.match(
  rootWorkspace,
  /'@dsh-external\/dsh-code-map>schemastery': 'npm:@deepseek-ai\/schemastery@3\.18\.1'/,
  'the root workspace must redirect dsh-code-map to a built schemastery package',
)
assert.match(rootWorkspace, /^  cordis: 4\.0\.0-rc\.7$/m, 'root peer resolution must use the vendored cordis version')

const hostTypecheck = readFileSync(join(root, 'harness', 'tsconfig.host.json'), 'utf8')
assert.doesNotMatch(hostTypecheck, /"examples\/\*\//, 'release host typechecking must not include example fixtures')
assert.doesNotMatch(hostTypecheck, /"website\/\.vitepress\//, 'release host typechecking must not require VitePress')
assert.match(hostTypecheck, /"website\/docs\.ts"/, 'the host build must retain the website runtime docs module')

const webPackage = JSON.parse(readFileSync(join(root, 'harness', 'apps', 'web', 'package.json'), 'utf8'))
assert.match(
  webPackage.scripts.build,
  /vite build --configLoader runner/,
  'the Windows-compatible web build must not let esbuild scan outside the workspace while loading Vite config',
)

const windowsReleaseScript = readFileSync(join(root, 'scripts', 'build-release-windows.ps1'), 'utf8')
assert.match(windowsReleaseScript, /npm_config_fetch_retries = '5'/, 'Windows release installs must retry transient registry failures')
assert.match(windowsReleaseScript, /while \(\$attempt -le 3\)/, 'the isolated release profile install must be bounded and retried')
assert.match(windowsReleaseScript, /pnpm install \(prepare phase\) failed/, 'package prepare scripts must run after the harness build')
assert.match(windowsReleaseScript, /::group::release:/, 'Windows release output must identify the active release stage')

const bundleScript = readFileSync(join(root, 'desktop', 'bundle', 'make-bundle.ps1'), 'utf8')
assert.doesNotMatch(bundleScript, /dir \/a:l \/s/, 'bundle link discovery must not recurse through cyclic junctions')
assert.match(bundleScript, /FileAttributes\]::ReparsePoint/, 'bundle link discovery must explicitly stop at reparse points')
assert.match(bundleScript, /WELCOME_NOTICE_VERSION/, 'bundled Marisa homes must acknowledge the shipped Harness welcome notice')
assert.match(bundleScript, /welcomeNoticeVersion/, 'bundled Marisa homes must persist the welcome-notice acknowledgement')

console.log(`repository policy ok: harness fork + ${manifest.plugins.length} plugins (${manifest.plugins.filter(p => p.mode === 'mirror').length} mirrors, ${manifest.plugins.filter(p => p.mode === 'fork').length} forks)`)
