#!/usr/bin/env node
/**
 * generate-profile.mjs — materialize the marisa v2 distribution.
 *
 * Reads profiles/marisa/plugins.json (30 vendored plugins) and writes:
 *   1. bundles/marisa-bundle/package.json — the fork's aggregation bundle:
 *      the 21 vendored git plugins + pwsh lane + tool-cordis + skill-manager
 *      as file: deps, with the composition patch (cordis.patch.yml, checked
 *      in beside it) owned by the bundle. Patch rows resolve through the
 *      profile's node_modules, where the bundle's deps are hoisted.
 *   2. %USERPROFILE%\.dsh\profiles\marisa — the thin profile (dsh-coding
 *      form): deps = marisa-bundle + 8 npm plugins + locked MyGO market;
 *      bundles = base + web-app + marisa-bundle + MyGO core/Hub/CLI/panel
 *      (+ bundle-flagged npm plugins); dsh.desktop
 *      metadata. NO profile-level cordis.patch.yml — composition belongs to
 *      the bundle, the Windows pwsh lane belongs to the harness/bundle, not
 *      to hand-written profile rows.
 *
 * Resolution contract:
 *   - git plugin dep KEYS are the ACTUAL package.json names recorded in
 *     profiles/marisa/plugins.json. The generator reads each vendored
 *     package.json and warns whenever the recorded name has drifted from the
 *     source tree (e.g. a sync PR changed the package identity).
 *   - Extra file: deps required by patch rows that reference non-plugin
 *     packages:
 *       @deepseek-ai/dsh-tool-cordis -> harness/packages/extensions/tool-cordis
 *       @deepseek-ai/cordis          -> harness/vendor/cordis
 *       dsh-skill-manager            -> <REPO>/dsh-skill-manager
 *       @deepseek-ai/dsh-pwsh-local  -> harness/packages/shell/pwsh-local
 *       @deepseek-ai/dsh-tool-pwsh   -> harness/packages/shell/tool-pwsh
 *
 * Upstream deviations (documented, deliberate):
 *   - MyGO is consumed from its published rc.6 `next` line instead of the
 *     0808 harness snapshot. All product-facing packages are exact-pinned so
 *     Core, Hub, CLI, and Panel cannot drift independently.
 *   - NO marisa-v2-compat bundle: the `webServer` service alias is provided
 *     by the fork's webserver package (harness/packages/host/webserver) —
 *     a harness-source fix, not a distro-side compat layer.
 *
 * Usage: node profiles/marisa/generate-profile.mjs
 * Does NOT run pnpm install (a later phase does).
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── paths ────────────────────────────────────────────────────────────────
const TEMPLATE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TEMPLATE_DIR, '..', '..');
const PLUGINS_ROOT = path.join(REPO, 'plugins');
const BUNDLE_DIR = path.join(REPO, 'bundles', 'marisa-bundle');
const MANIFEST = JSON.parse(readFileSync(path.join(TEMPLATE_DIR, 'plugins.json'), 'utf8'));

const DSH_ROOT = process.env.USERPROFILE || os.homedir();
const PROFILE_DIR = process.env.MARISA_PROFILE_DIR
  ? path.resolve(process.env.MARISA_PROFILE_DIR)
  : path.join(DSH_ROOT, '.dsh', 'profiles', 'marisa');
const RUNTIME_PROFILE_DIR = path.join(REPO, 'profiles', 'marisa', 'runtime');
const isReleaseRuntime = path.resolve(PROFILE_DIR) === path.resolve(RUNTIME_PROFILE_DIR);

// Windows-safe absolute path with forward slashes for file:/workspace specs.
const fwd = (p) => p.split(path.sep).join('/');
const profileRef = (target) => isReleaseRuntime ? fwd(path.relative(PROFILE_DIR, target)) : fwd(target);

// ── manifest ─────────────────────────────────────────────────────────────
// internal（自研，如 dsh-ego-browser）与 git 插件同样以 file: 从源码树组合。
const gitPlugins = MANIFEST.plugins.filter((p) => p.source === 'git' || p.source === 'internal');
const npmPlugins = MANIFEST.plugins.filter((p) => p.source === 'npm');
if (gitPlugins.length !== 22) throw new Error(`expected 22 git+internal plugins, got ${gitPlugins.length}`);
if (npmPlugins.length !== 9) throw new Error(`expected 9 npm plugins, got ${npmPlugins.length}`);

// ── bundle deps (relative file: — machine-independent) ───────────────────
const bundleDeps = {};
const nameMismatches = [];
for (const p of gitPlugins) {
  const dir = path.join(PLUGINS_ROOT, p.dir);
  const pkgPath = path.join(dir, 'package.json');
  if (!existsSync(pkgPath)) throw new Error(`git plugin dir missing: ${dir} (manifest entry ${p.name})`);
  const actualName = JSON.parse(readFileSync(pkgPath, 'utf8')).name;
  if (actualName !== p.name) {
    nameMismatches.push({ manifestName: p.name, dir: p.dir, actualName });
  }
  bundleDeps[actualName] = `file:${fwd(path.relative(BUNDLE_DIR, dir))}`;
}

// Patch-row extras (not in plugins.json — see header comment).
const EXTRA_DIRS = {
  // tool-cordis imports this peer at runtime. Keep it as a direct bundle
  // dependency: production bundle pruning does not preserve undeclared peers.
  '@deepseek-ai/cordis': path.join(REPO, 'harness', 'vendor', 'cordis'),
  '@deepseek-ai/dsh-tool-cordis': path.join(REPO, 'harness', 'packages', 'extensions', 'tool-cordis'),
  'dsh-skill-manager': path.join(REPO, 'dsh-skill-manager'),
  // Windows pwsh lane: rc7 base ships pwsh-sandbox natively on win32
  // (ctx.shell via ACL runner); the bundle only re-enables the tool-pwsh row,
  // whose package must resolve from the profile node_modules.
  '@deepseek-ai/dsh-tool-pwsh': path.join(REPO, 'harness', 'packages', 'shell', 'tool-pwsh'),
};
for (const [name, dir] of Object.entries(EXTRA_DIRS)) {
  if (!existsSync(path.join(dir, 'package.json'))) throw new Error(`extra patch-row package missing: ${dir}`);
  bundleDeps[name] = `file:${fwd(path.relative(BUNDLE_DIR, dir))}`;
}

// ── marisa-bundle package.json ───────────────────────────────────────────
const bundlePkg = {
  name: 'marisa-bundle',
  version: '0.1.0',
  private: true,
  // This is a manifest-only bundle. A resolvable root entry is required by
  // MyGO's strict bundle preflight (`require.resolve(bundleName)`).
  main: './package.json',
  description:
    '魔理沙 fork 聚合 bundle — 21 vendored git plugins + Windows pwsh lane + tool-cordis + skill-manager（组合行见 cordis.patch.yml）',
  dependencies: bundleDeps,
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
  },
};

// ── thin profile ─────────────────────────────────────────────────────────
const profileDeps = {
  'marisa-bundle': `file:${profileRef(BUNDLE_DIR)}`,
  // composition 补丁（cordis.patch.yml）启用的核心包必须在 profile 根可解析。
  // 声明在 profile 层而非 bundle 层：pnpm 对 file: 依赖可能物化过期拷贝，
  // workspace:* 链成员则始终指向源码树。（对应 bundle deps 中的同名声明。）
  '@deepseek-ai/dsh-permission-presets': 'workspace:*',
  '@deepseek-ai/dsh-tool-session-query': 'workspace:*',
  '@deepseek-ai/dsh-session-query-sqlite': 'workspace:*',
  '@deepseek-ai/dsh-client-ui-workspace': 'workspace:*',
};
for (const p of npmPlugins) {
  const dir = path.join(PLUGINS_ROOT, p.dir);
  if (!existsSync(path.join(dir, 'package.json'))) throw new Error(`vendored npm plugin dir missing: ${dir}`);
  profileDeps[p.name] = `file:${profileRef(dir)}`;
}

// MyGO is vendored source (dsh-mygo/, omdsh-dev/dsh-mygo@next + keyed fix
// 2026-08-18); the profile consumes the built lib via file: like every other
// vendored package. Hub is mounted explicitly (a transitive dependency does
// not apply its dsh.bundle patch by itself).
const MYGO_DIRS = {
  '@r05en1cu/dsh-mygo': path.join(REPO, 'dsh-mygo', 'packages', 'cordis', 'mygo'),
  '@r05en1cu/dsh-mygo-loader-hub': path.join(REPO, 'dsh-mygo', 'packages', 'loaders', 'mygo-loader-hub'),
  '@r05en1cu/dsh-mygo-cli': path.join(REPO, 'dsh-mygo', 'packages', 'cordis', 'mygo-cli'),
  '@r05en1cu/dsh-mygo-ext-panel': path.join(REPO, 'dsh-mygo', 'packages', 'extensions', 'mygo-panel'),
  // the four mounted packages resolve these from the profile node_modules,
  // so the full vendored set is installed (bundles stay the four above).
  '@r05en1cu/dsh-mygo-api': path.join(REPO, 'dsh-mygo', 'packages', 'core', 'mygo-api'),
  '@r05en1cu/dsh-mygo-ext-fabric': path.join(REPO, 'dsh-mygo', 'packages', 'extensions', 'mygo-fabric'),
  '@r05en1cu/dsh-mygo-loader-profile': path.join(REPO, 'dsh-mygo', 'packages', 'loaders', 'mygo-loader-profile'),
};
for (const [name, dir] of Object.entries(MYGO_DIRS)) {
  if (!existsSync(path.join(dir, 'package.json'))) throw new Error(`vendored mygo package missing: ${dir}`);
  profileDeps[name] = `file:${profileRef(dir)}`;
}
// Mounted bundles stay the four product packages; the rest are deps only.
const MYGO_PACKAGES = [
  '@r05en1cu/dsh-mygo',
  '@r05en1cu/dsh-mygo-loader-hub',
  '@r05en1cu/dsh-mygo-cli',
  '@r05en1cu/dsh-mygo-ext-panel',
];

// dsh-llm-fallbacks targets the rc6 conversationEvents/remote event APIs.
// The 0808 client snapshot has neither contract; mounting its client bundle
// aborts the entire web boot. Keep it installed for MyGO visibility, but do
// not activate it until the harness client runtime is migrated as a unit.
const incompatibleBundlePlugins = new Set(['dsh-llm-fallbacks']);
const bundleNpmPlugins = npmPlugins
  .filter((p) => p.bundle && !incompatibleBundlePlugins.has(p.name))
  .map((p) => p.name);
const bundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'marisa-bundle',
  ...MYGO_PACKAGES,
  ...bundleNpmPlugins,
];

// dsh.desktop follows the ecosystem convention (cf. omdsh-dev/dsh-coding):
// the desktop shell reads window/icon/dshHome metadata from the profile
// manifest instead of hardcoding it. dshHome 'bundled' = the launcher points
// DSH_HOME at the extracted/bundled profile home (never touches ~/.dsh).
const pkg = {
  name: 'marisa-marisa',
  private: true,
  version: '0.1.0',
  description: '魔理沙薄 profile — base + web-app + vendored 插件 + MyGO rc6 市场',
  dependencies: profileDeps,
  dsh: {
    profile: { bundles },
    desktop: {
      id: 'ai.deepseek.dsh.marisa',
      window: { width: 1280, height: 800, minWidth: 800, minHeight: 600 },
      icon: profileRef(path.join(REPO, 'desktop', 'assets', 'icon.svg')),
      dshHome: 'bundled',
    },
  },
};

// ── pnpm-workspace.yaml (profile) ────────────────────────────────────────
// Joins the harness workspaces (base/web-app declare workspace:^ deps).
// landlock packages are listed EXPLICITLY (not globbed): pnpm 11 fails to
// match the native/landlock-run/packages/* glob from an absolute-path
// workspace file (ERR_PNPM_WORKSPACE_PKG_NOT_FOUND), and bash-sandbox
// depends on the entry package via workspace:* — the fork pins the dirs.
const landlockGlobs = [
  'harness/native/landlock-run',
  'harness/native/landlock-run/packages/entry',
  'harness/native/landlock-run/packages/linux-arm64',
  'harness/native/landlock-run/packages/linux-x64',
];
const minimumReleaseAgeExclude = [
  '@deepseek-ai/dsh-agent@0.1.0-rc.6',
  '@deepseek-ai/dsh-brand@0.1.0-rc.6',
  '@deepseek-ai/dsh-commands@0.1.0-rc.6',
  '@deepseek-ai/dsh-invariants@0.1.0-rc.6',
  '@deepseek-ai/dsh-llm@0.1.0-rc.6',
  '@deepseek-ai/dsh-session@0.1.0-rc.6',
  '@deepseek-ai/dsh-settings@0.1.0-rc.6',
  '@deepseek-ai/dsh-storage-domain@0.1.0-rc.6',
  '@deepseek-ai/dsh-storage-sqlite@0.1.0-rc.6',
  '@deepseek-ai/dsh-storage@0.1.0-rc.6',
  '@deepseek-ai/dsh-system-prompt@0.1.0-rc.6',
  '@deepseek-ai/dsh-tools@0.1.0-rc.6',
  ...MYGO_PACKAGES.map((name) => `${name}@0.2.0-rc.7`),
  '@r05en1cu/dsh-mygo-api@0.2.0-rc.7',
  '@r05en1cu/dsh-mygo-loader-profile@0.2.0-rc.7',
  '@liustack/modlens@3.22.1',
  // 0.1.1-rc.1 sync (2026-08-22): mirror the root workspace registry bump so
  // the bundle prod closure resolves the same generation if it ever falls
  // back to the registry instead of workspace links.
  '@deepseek-ai/dsh-agent@0.1.1-rc.2',
  '@deepseek-ai/dsh-brand@0.1.1-rc.2',
  '@deepseek-ai/dsh-commands@0.1.1-rc.2',
  '@deepseek-ai/dsh-invariants@0.1.1-rc.2',
  '@deepseek-ai/dsh-llm@0.1.1-rc.2',
  '@deepseek-ai/dsh-session@0.1.1-rc.2',
  '@deepseek-ai/dsh-settings@0.1.1-rc.2',
  '@deepseek-ai/dsh-storage-domain@0.1.1-rc.2',
  '@deepseek-ai/dsh-storage-sqlite@0.1.1-rc.2',
  '@deepseek-ai/dsh-storage@0.1.1-rc.2',
  '@deepseek-ai/dsh-system-prompt@0.1.1-rc.2',
  '@deepseek-ai/dsh-tools@0.1.1-rc.2',
];
const workspaceYaml = `# marisa v2 profile workspace — joins the marisa-distro harness workspaces.
packages:
  - '.'
  - '${profileRef(path.join(REPO, 'harness', 'packages', '*'))}'
  - '${profileRef(path.join(REPO, 'harness', 'packages', '*', '*'))}'
  - '${profileRef(path.join(REPO, 'harness', 'vendor', '*'))}'
  - '${profileRef(path.join(REPO, 'harness', 'apps', '*'))}'
  - '${profileRef(path.join(REPO, 'dsh-mygo', 'packages', '*', '*'))}'
  # vendored plugins/bundles join the profile workspace: their @deepseek-ai
  # deps carry rc6-era ranges that would otherwise resolve to old registry
  # builds (dsh-client-runtime@0.0.1-rc.1 -> dsh-compact 404).
  - '${profileRef(path.join(REPO, 'plugins', '*'))}'
  - '${profileRef(path.join(REPO, 'bundles', '*'))}'
  - '${profileRef(path.join(REPO, 'dsh-skill-manager'))}'
${landlockGlobs.map((g) => `  - '${profileRef(path.join(REPO, g))}'`).join('\n')}

nodeLinker: hoisted
linkWorkspacePackages: true
install-links: false

allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': true
  esbuild: true
  koffi: true
  lefthook: true
  node-pty: true
  protobufjs: true
  sharp: true

overrides:
  # rolldown 1.2.5 (2026-08-19) crashes dsh-sidechain tsdown builds (masked
  # "Cannot convert undefined or null to object"); pin the proven 1.2.4 to match
  # the root workspace.
  rolldown: 1.2.4
  '@dsh-external/dsh-code-map>schemastery': 'npm:@deepseek-ai/schemastery@3.18.1'
  # Some third-party plugin declares bare 'cordis: >=4.0.0 <5.0.0-0'; pin
  # the bare peer to the rc7-compatible release used by the root workspace.
  cordis: 4.0.0-rc.7
  # fflate: single-version override so the prod-pruned bundle install hoists
  # the same 0.8.3 ESM build apiproxy's named imports need (univerjs's exact
  # 0.4.9 pin would otherwise win the top-level hoist in --prod and break
  # boot). Mirrors the root workspace.
  fflate: '0.8.3'

minimumReleaseAgeExclude:
${minimumReleaseAgeExclude.map((p) => `  - '${p}'`).join('\n')}

`;

// ── materialize ──────────────────────────────────────────────────────────
// 1) bundle package.json (the patch file is checked in beside it)
mkdirSync(BUNDLE_DIR, { recursive: true });
writeFileSync(path.join(BUNDLE_DIR, 'package.json'), JSON.stringify(bundlePkg, null, 2) + '\n');

// 2) thin profile — overwrite the half-built profile from earlier experiments
for (const stale of ['allinone-install', 'cordis.patch.yml', 'v2-compat']) {
  rmSync(path.join(PROFILE_DIR, stale), { recursive: true, force: true });
}
if (!isReleaseRuntime) {
  for (const stale of ['node_modules', 'pnpm-lock.yaml']) {
    rmSync(path.join(PROFILE_DIR, stale), { recursive: true, force: true });
  }
}
mkdirSync(PROFILE_DIR, { recursive: true });
writeFileSync(path.join(PROFILE_DIR, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(path.join(PROFILE_DIR, 'pnpm-workspace.yaml'), workspaceYaml);
cpSync(path.join(TEMPLATE_DIR, 'desktop.overlay.yml'), path.join(PROFILE_DIR, 'desktop.overlay.yml'));
cpSync(path.join(TEMPLATE_DIR, 'standalone.overlay.yml'), path.join(PROFILE_DIR, 'standalone.overlay.yml'));

// ── summary ──────────────────────────────────────────────────────────────
const summary = {
  bundleDir: BUNDLE_DIR,
  profileDir: PROFILE_DIR,
  bundleDeps: Object.keys(bundleDeps).length,
  profileDeps: Object.keys(profileDeps),
  bundles,
  nameMismatches,
  mygo: { source: 'vendored', version: '0.2.0-rc.7', packages: MYGO_PACKAGES },
};
console.log(JSON.stringify(summary, null, 2));
