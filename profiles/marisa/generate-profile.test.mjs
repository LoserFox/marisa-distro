import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const MYGO_PACKAGES = [
  '@r05en1cu/dsh-mygo',
  '@r05en1cu/dsh-mygo-loader-hub',
  '@r05en1cu/dsh-mygo-cli',
  '@r05en1cu/dsh-mygo-ext-panel',
];

test('generated Marisa profile mounts the complete MyGO rc6 market stack', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'marisa-profile-test-'));
  try {
    const result = spawnSync(process.execPath, ['profiles/marisa/generate-profile.mjs'], {
      cwd: REPO,
      env: { ...process.env, USERPROFILE: home },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    const profilePath = path.join(home, '.dsh', 'profiles', 'marisa', 'package.json');
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    const workspace = readFileSync(path.join(home, '.dsh', 'profiles', 'marisa', 'pnpm-workspace.yaml'), 'utf8');
    const standaloneOverlay = readFileSync(path.join(home, '.dsh', 'profiles', 'marisa', 'standalone.overlay.yml'), 'utf8');
    for (const name of MYGO_PACKAGES) {
      assert.equal(profile.dependencies[name], '0.2.0-rc.6', `${name} must be version-locked`);
      assert.ok(profile.dsh.profile.bundles.includes(name), `${name} must be mounted as a bundle`);
    }
    assert.ok(!profile.dsh.profile.bundles.includes('dsh-llm-fallbacks'));
    assert.ok(!profile.dsh.profile.bundles.includes('@canglongcl/dsh-web-review'));
    assert.equal(profile.dependencies['@deepseek-ai/dsh-qwen-mm'], undefined);
    assert.equal(profile.dependencies['@deepseek-ai/dsh-client-modules'], undefined);
    assert.equal(profile.dependencies['@deepseek-ai/dsh-client-ui-input-trigger'], undefined);
    assert.equal(profile.dependencies['@deepseek-ai/dsh-client-ui-commands'], undefined);

    const bundle = JSON.parse(readFileSync(path.join(REPO, 'bundles', 'marisa-bundle', 'package.json'), 'utf8'));
    const composition = readFileSync(path.join(REPO, 'bundles', 'marisa-bundle', 'cordis.patch.yml'), 'utf8');
    assert.equal(bundle.main, './package.json', 'MyGO preflight must be able to resolve marisa-bundle');
    assert.match(bundle.dependencies.cordis, /^file:/, 'production bundle must retain Cordis for tool-cordis runtime imports');
    assert.equal(bundle.dependencies['@deepseek-ai/dsh-qwen-mm'], undefined);
    assert.doesNotMatch(composition, /name: dsh-sonar(?:\/host)?/);
    assert.doesNotMatch(composition, /name: '@dsh-external\/dsh-diff-viewer'/);
    assert.doesNotMatch(composition, /name: '@fakechris\/dsh-track'/);
    assert.doesNotMatch(workspace, /patchedDependencies/);
    assert.match(
      workspace,
      /'@dsh-external\/dsh-code-map>schemastery': 'npm:@deepseek-ai\/schemastery@3\.18\.1'/,
      'the standalone dsh-code-map plugin must use a published schemastery build',
    );
    assert.match(workspace, /^  cordis: 4\.0\.0-rc\.7$/m, 'profile peer resolution must use the vendored cordis version');
    for (const name of [
      'dsh-better-sidebar',
      'dsh-llm-fallbacks',
      '@canglongcl/dsh-web-review',
      '@huanlin/dsh-plugin-yet-another-subagent',
      '@huanlin/dsh-plugin-ya-workspace-sidebar',
      '@huanlin/dsh-plugin-interpreters',
      '@huanlin/dsh-plugin-mineru',
      '@huanlin/dsh-plugin-aigc-canvas',
    ]) {
      assert.match(profile.dependencies[name], /^file:/, `${name} must be vendored as a file: dependency`);
    }
    assert.doesNotMatch(workspace, /dsh-client-modules@0\.1\.0-rc\.6/);
    assert.match(standaloneOverlay, /id: ui-input-trigger[\s\S]*disabled: false/);
    assert.match(standaloneOverlay, /id: ui-commands[\s\S]*disabled: false/);
    assert.match(standaloneOverlay, /id: ui-slash[\s\S]*disabled: true/);
    assert.match(standaloneOverlay, /id: ui-command[\s\S]*disabled: true/);

    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.mygo, {
      version: '0.2.0-rc.6',
      packages: MYGO_PACKAGES,
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
