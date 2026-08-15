import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const installer = fileURLToPath(new URL('../scripts/install.mjs', import.meta.url));

test('package exposes one client contract to current and legacy DSH scanners', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.deepEqual(manifest.dshClient, manifest.dsh.client);
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
});

async function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installer, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => resolve({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

async function fakeDsh(root) {
  const checkout = join(root, 'source', 'staging-fixture');
  const files = new Map([
    ['apps/cli/config/base.cordis.yml', '- id: fixture\n  name: fixture\n'],
    ['packages/client/modules/src/index.ts', 'const resolvePkgJson = true\n'],
    ['packages/client/ui-conversation/src/client/contract/slots.ts', "'conversation.input.left'\n'conversation.input.overlay'\n'conversation.input.dock'\n"],
    ['packages/client/ui-conversation/src/client/input/facade.ts', 'function serializeReference() {}\n'],
    ['packages/client/ui-settings/src/client/contract/slots.ts', "'settings.section'\n"],
    ['packages/host/webserver/src/index.ts', '// Longest-prefix-wins\n'],
  ]);
  for (const [relative, content] of files) {
    const path = join(checkout, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  const executable = join(checkout, 'bin', 'dsh');
  await mkdir(join(checkout, 'bin'), { recursive: true });
  await writeFile(executable, "#!/bin/sh\nprintf \"name: '@dsh-community/multimedia-webui-input'\\n\"\n");
  await chmod(executable, 0o755);
  return { checkout, executable };
}

async function fakeProfileDsh(root) {
  const checkout = join(root, 'source', 'staging-profile-fixture');
  const files = new Map([
    ['apps/cli/src/plugin.ts', 'export function runPlugin() {}\n'],
    ['packages/bundle/web-app/cordis.patch.yml', '- insert: []\n'],
    ['packages/client/modules/src/index.ts', 'const resolvePkgJson = true\n'],
    ['packages/client/ui-conversation/src/client/contract/slots.ts', "'conversation.input.left'\n'conversation.input.overlay'\n'conversation.input.dock'\n"],
    ['packages/client/ui-conversation/src/client/input/facade.ts', 'function serializeReference() {}\n'],
    ['packages/client/ui-settings/src/client/contract/slots.ts', "'settings.section'\n"],
    ['packages/host/webserver/src/index.ts', '// Longest-prefix-wins\n'],
  ]);
  for (const [relative, content] of files) {
    const path = join(checkout, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  const executable = join(checkout, 'bin', 'dsh');
  await mkdir(join(checkout, 'bin'), { recursive: true });
  await writeFile(executable, `#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const name = '@dsh-community/multimedia-webui-input';
const args = process.argv.slice(2);
const profile = args[args.indexOf('--profile') + 1] || 'web';
const dir = join(process.env.DSH_HOME, 'profiles', profile);
const manifestPath = join(dir, 'package.json');
await mkdir(dir, { recursive: true });
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch { manifest = { name: 'fixture', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }; }
const bundles = manifest.dsh.profile.bundles;
if (args[0] === 'plugin') {
  const command = args[args.indexOf('--profile') + 2];
  if (command === 'add') {
    const spec = args.at(-1);
    manifest.dependencies[name] = spec;
    if (!bundles.includes(name)) bundles.push(name);
  } else if (command === 'remove') {
    delete manifest.dependencies[name];
    const index = bundles.indexOf(name);
    if (index !== -1) bundles.splice(index, 1);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\\n');
  process.exit(0);
}
if (args.includes('--dump-config')) {
  if (process.env.FAKE_DSH_DUMP_FAIL === '1') {
    process.stderr.write('intentional profile dump failure\\n');
    process.exit(1);
  }
  if (bundles.includes(name)) process.stdout.write("name: '@dsh-community/multimedia-webui-input'\\n");
  process.exit(0);
}
process.exit(0);
`);
  await chmod(executable, 0o755);
  return { checkout, executable };
}

test('clone-local installer survives a staging switch through the stable source resolver root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshca-installer-'));
  try {
    const dshHome = join(root, 'home', '.dsh');
    const { checkout, executable } = await fakeDsh(root);
    await mkdir(dshHome, { recursive: true });
    await writeFile(join(dshHome, 'config.yaml'), '- id: existing\n  config:\n    enabled: true\n');
    const env = { DSH_CHECKOUT: checkout, DSH_EXECUTABLE: executable, DSH_HOME: dshHome };

    const installed = await run(['install'], env);
    assert.equal(installed.code, 0, installed.stderr);
    const packageTarget = join(root, 'source', 'node_modules', '@dsh-community', 'multimedia-webui-input');
    const manifest = JSON.parse(await readFile(join(packageTarget, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@dsh-community/multimedia-webui-input');
    const config = await readFile(join(dshHome, 'config.yaml'), 'utf8');
    assert.match(config, /dsh-multimedia-webui-input:start/);
    assert.match(config, /id: existing/);
    const metadata = JSON.parse(await readFile(join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json'), 'utf8'));
    assert.equal(metadata.resolverRoot, join(await realpath(join(root, 'source')), 'node_modules'));
    assert.equal(typeof metadata.distributionFingerprint, 'string');
    assert.equal(metadata.distributionFingerprint.length, 64);

    const status = await run(['status'], env);
    assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).installed, true);

    // A failed reinstall must restore the complete previous installation,
    // not merely its config block.
    await writeFile(join(packageTarget, 'preserved-from-previous-install.txt'), 'keep me\n');
    await writeFile(executable, "#!/bin/sh\nprintf 'intentional dump failure\\n' >&2\nexit 1\n");
    const failedReinstall = await run(['install'], env);
    assert.equal(failedReinstall.code, 1);
    assert.equal(await readFile(join(packageTarget, 'preserved-from-previous-install.txt'), 'utf8'), 'keep me\n');
    assert.match(await readFile(join(dshHome, 'config.yaml'), 'utf8'), /dsh-multimedia-webui-input:start/);
    assert.deepEqual(
      JSON.parse(await readFile(join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json'), 'utf8')),
      metadata,
    );

    const uninstalled = await run(['uninstall'], env);
    assert.equal(uninstalled.code, 0, uninstalled.stderr);
    await assert.rejects(stat(packageTarget), { code: 'ENOENT' });
    const restored = await readFile(join(dshHome, 'config.yaml'), 'utf8');
    assert.doesNotMatch(restored, /dsh-multimedia-webui-input/);
    assert.match(restored, /id: existing/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('renames a legacy attachment install without leaving two active packages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshmmi-migration-'));
  try {
    const dshHome = join(root, 'home', '.dsh');
    const { checkout, executable } = await fakeDsh(root);
    const env = { DSH_CHECKOUT: checkout, DSH_EXECUTABLE: executable, DSH_HOME: dshHome };
    const legacyPackage = join(root, 'source', 'node_modules', '@dsh-community', 'attachments');
    const legacyMetadataDirectory = join(dshHome, 'community-plugins', 'attachments');
    await mkdir(legacyPackage, { recursive: true });
    await writeFile(join(legacyPackage, 'package.json'), JSON.stringify({ name: '@dsh-community/attachments' }));
    await mkdir(legacyMetadataDirectory, { recursive: true });
    await writeFile(join(legacyMetadataDirectory, 'install.json'), JSON.stringify({
      schemaVersion: 1,
      package: '@dsh-community/attachments',
    }));
    const legacyConfig = [
      '- id: existing',
      '# dsh-community-attachments:start',
      '- insert:',
      "    - id: community-attachments",
      "      name: '@dsh-community/attachments'",
      '# dsh-community-attachments:end',
      '',
    ].join('\n');
    await mkdir(dshHome, { recursive: true });
    await writeFile(join(dshHome, 'config.yaml'), legacyConfig);

    await writeFile(executable, "#!/bin/sh\nprintf 'intentional migration failure\\n' >&2\nexit 1\n");
    const failed = await run(['install'], env);
    assert.equal(failed.code, 1);
    assert.equal(JSON.parse(await readFile(join(legacyPackage, 'package.json'), 'utf8')).name, '@dsh-community/attachments');
    assert.equal(await readFile(join(dshHome, 'config.yaml'), 'utf8'), legacyConfig);
    await stat(join(legacyMetadataDirectory, 'install.json'));

    await writeFile(executable, "#!/bin/sh\nprintf \"name: '@dsh-community/multimedia-webui-input'\\n\"\n");
    const installed = await run(['install'], env);
    assert.equal(installed.code, 0, installed.stderr);
    const renamedPackage = join(root, 'source', 'node_modules', '@dsh-community', 'multimedia-webui-input');
    assert.equal(JSON.parse(await readFile(join(renamedPackage, 'package.json'), 'utf8')).name, '@dsh-community/multimedia-webui-input');
    await assert.rejects(stat(legacyPackage), { code: 'ENOENT' });
    await assert.rejects(stat(legacyMetadataDirectory), { code: 'ENOENT' });
    const migratedConfig = await readFile(join(dshHome, 'config.yaml'), 'utf8');
    assert.match(migratedConfig, /dsh-multimedia-webui-input:start/);
    assert.doesNotMatch(migratedConfig, /dsh-community-attachments/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('installs through the native profile bundle layer and uninstalls reversibly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshmmi-profile-installer-'));
  try {
    const dshHome = join(root, 'home', '.dsh');
    const { checkout, executable } = await fakeProfileDsh(root);
    const env = { DSH_CHECKOUT: checkout, DSH_EXECUTABLE: executable, DSH_HOME: dshHome };

    const installed = await run(['install'], env);
    assert.equal(installed.code, 0, installed.stderr);
    const packageTarget = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'package');
    const copiedManifest = JSON.parse(await readFile(join(packageTarget, 'package.json'), 'utf8'));
    assert.equal(copiedManifest.dsh.bundle.patch, './cordis.patch.yml');
    assert.equal(copiedManifest.dsh.client.platform, 'web');
    assert.deepEqual(copiedManifest.dshClient, copiedManifest.dsh.client);
    const profileManifest = JSON.parse(await readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8'));
    assert.match(profileManifest.dependencies['@dsh-community/multimedia-webui-input'], /^link:/);
    assert.ok(profileManifest.dsh.profile.bundles.includes('@dsh-community/multimedia-webui-input'));

    const status = await run(['status'], env);
    assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).installed, true);

    await writeFile(join(packageTarget, 'preserved-from-profile-install.txt'), 'keep me\n');
    const failedReinstall = await run(['install'], { ...env, FAKE_DSH_DUMP_FAIL: '1' });
    assert.equal(failedReinstall.code, 1);
    assert.equal(await readFile(join(packageTarget, 'preserved-from-profile-install.txt'), 'utf8'), 'keep me\n');

    const uninstalled = await run(['uninstall'], env);
    assert.equal(uninstalled.code, 0, uninstalled.stderr);
    await assert.rejects(stat(packageTarget), { code: 'ENOENT' });
    const removedManifest = JSON.parse(await readFile(join(dshHome, 'profiles', 'web', 'package.json'), 'utf8'));
    assert.equal(removedManifest.dependencies['@dsh-community/multimedia-webui-input'], undefined);
    assert.ok(!removedManifest.dsh.profile.bundles.includes('@dsh-community/multimedia-webui-input'));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
