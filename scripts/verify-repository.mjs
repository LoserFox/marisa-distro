import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifestPath = join(root, 'maintenance', 'upstreams.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

assert.equal(manifest.schemaVersion, 1, 'unsupported upstream manifest schema')
for (const required of ['harness', 'plugins', 'desktop', 'docs']) {
  assert.ok(existsSync(join(root, required)), `missing repository boundary: ${required}/`)
}

// harness 以 git submodule 形式跟踪上游（harness/.git 是 gitlink 元数据文件，
// 不是嵌套仓库目录）；未 checkout 的 fresh clone 无法通过本检查（CI 的
// actions/checkout 带 submodules: recursive；本地先 git submodule update --init）。
const harnessGit = join(root, 'harness', '.git')
assert.ok(
  !existsSync(harnessGit) || !statSync(harnessGit).isDirectory(),
  'harness must be a git submodule (gitlink), never a nested Git repository',
)
assert.ok(existsSync(join(root, '.gitmodules')), 'harness submodule requires a committed .gitmodules')
assert.ok(existsSync(join(root, 'harness', 'package.json')), 'harness/package.json is missing (run git submodule update --init)')
assert.match(manifest.harness.baseline, /^[0-9a-f]{7,40}$/, 'harness baseline must be a commit id')
assert.equal(manifest.harness.mode, 'mirror', 'harness must track the pinned upstream rc baseline')
assert.equal(manifest.harness.mechanism, 'submodule', 'harness must be registered as a submodule')

// harness 工作树必须保持上游 pristine：发行版增量（品牌兜底字符串、
// anchored-standard 预设）只允许以 overlays/harness 形式存在，由构建期
// scripts/apply-harness-overlays.mjs 应用。构建残留（apply 后未 revert）会被
// 这里拦截。
const overlayCheck = spawnSync(process.execPath, [join(root, 'scripts', 'apply-harness-overlays.mjs'), 'verify'], {
  cwd: root,
  encoding: 'utf8',
})
assert.equal(
  overlayCheck.status,
  0,
  `harness tree must be pristine (marisa overlays live in overlays/harness only):\n${overlayCheck.stderr ?? ''}`,
)

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
  assert.ok(['mirror', 'fork', 'internal'].includes(plugin.mode), `${plugin.id}: invalid mode ${plugin.mode}`)
  const pluginRoot = join(root, 'plugins', plugin.id)
  const packagePath = join(pluginRoot, 'package.json')
  assert.ok(existsSync(packagePath), `${plugin.id}: package.json is missing`)
  assert.ok(!existsSync(join(pluginRoot, '.git')), `${plugin.id}: nested .git is forbidden`)

  // internal：自研插件（无上游仓库），不做上游字段要求。
  if (plugin.mode === 'internal') {
    assert.equal(plugin.repository, undefined, `${plugin.id}: internal plugins have no upstream repository`)
    continue
  }

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
  assert.ok(['git', 'npm', 'internal'].includes(plugin.source), `${plugin.dir}: invalid profile plugin source ${plugin.source}`)
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
assert.match(releaseWorkflow, /windows:\s*[\s\S]*?timeout-minutes:\s*90\b/, 'Windows release jobs must have a bounded runtime')
assert.match(releaseWorkflow, /version:\s*['"]11\.9\.0['"]/, 'release builds must use the pnpm version that generated the lockfile')
assert.match(
  releaseWorkflow,
  /if \(-not \(Get-Command python3\.exe -ErrorAction SilentlyContinue\)\)/,
  'release setup must preserve an existing python3.exe',
)

const rootWorkspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
assert.match(
  rootWorkspace,
  /^verifyDepsBeforeRun: false$/m,
  'repository scripts must not implicitly install after builds rewrite workspace outputs',
)
assert.match(
  rootWorkspace,
  /'@dsh-external\/dsh-code-map>schemastery': 'npm:@deepseek-ai\/schemastery@3\.18\.1'/,
  'the root workspace must redirect dsh-code-map to a built schemastery package',
)
assert.match(rootWorkspace, /^  cordis: 4\.0\.0-rc\.7$/m, 'root peer resolution must use the vendored cordis version')

const hostTypecheck = readFileSync(join(root, 'harness', 'tsconfig.host.json'), 'utf8')
assert.match(hostTypecheck, /"examples\/\*\/src\/\*\*\/\*\.ts"/, 'rc7 harness host typechecking must retain upstream examples')
assert.match(hostTypecheck, /"website\/\.vitepress\/\*\*\/\*\.ts"/, 'rc7 harness host typechecking must retain upstream website sources')

const webPackage = JSON.parse(readFileSync(join(root, 'harness', 'apps', 'web', 'package.json'), 'utf8'))
assert.equal(webPackage.scripts.build, 'vite build', 'harness web build must remain upstream rc7')

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
