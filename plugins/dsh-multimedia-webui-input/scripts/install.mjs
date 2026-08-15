import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const PACKAGE_NAME = '@dsh-community/multimedia-webui-input';
const CONFIG_START = '# dsh-multimedia-webui-input:start';
const CONFIG_END = '# dsh-multimedia-webui-input:end';
const LEGACY_PACKAGE_NAME = '@dsh-community/attachments';
const LEGACY_CONFIG_START = '# dsh-community-attachments:start';
const LEGACY_CONFIG_END = '# dsh-community-attachments:end';
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv[2] ?? 'install';

function fail(message) {
  throw new Error(`dsh-multimedia-webui-input: ${message}`);
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames() {
  if (process.platform !== 'win32') return ['dsh'];
  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';');
  return ['dsh', ...extensions.map(extension => `dsh${extension.toLowerCase()}`)];
}

async function locateExecutable() {
  const explicit = process.env.DSH_EXECUTABLE;
  if (explicit) return realpath(resolve(explicit));
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const name of executableNames()) {
      const candidate = join(directory, name);
      if (await exists(candidate)) return realpath(candidate);
    }
  }
  fail('cannot find dsh on PATH; set DSH_EXECUTABLE or DSH_CHECKOUT');
}

async function checkoutKind(path) {
  if (await exists(join(path, 'apps', 'cli', 'src', 'plugin.ts'))
    && await exists(join(path, 'packages', 'bundle', 'web-app', 'cordis.patch.yml'))) {
    return 'profile';
  }
  if (await exists(join(path, 'apps', 'cli', 'config', 'base.cordis.yml'))) return 'legacy';
  return undefined;
}

async function checkoutFromExecutable(executable) {
  if (process.env.DSH_CHECKOUT) {
    const explicit = await realpath(resolve(process.env.DSH_CHECKOUT));
    if (await checkoutKind(explicit) === undefined) {
      fail(`DSH_CHECKOUT is not a DSH source checkout: ${explicit}`);
    }
    return explicit;
  }
  let cursor = dirname(executable);
  for (let depth = 0; depth < 8; depth += 1) {
    if (await checkoutKind(cursor) !== undefined) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  fail('the located dsh executable does not resolve into a source-based DSH installation; set DSH_CHECKOUT');
}

async function stableResolverRoot(checkout) {
  const parent = dirname(checkout);
  const current = join(parent, 'current');
  let currentTarget;
  try {
    currentTarget = await realpath(current);
  } catch {
    currentTarget = undefined;
  }
  if (currentTarget === checkout || basename(checkout).startsWith('staging-')) {
    return join(parent, 'node_modules');
  }
  return join(checkout, 'node_modules');
}

async function assertCompatibility(checkout) {
  const probes = [
    ['packages/client/modules/src/index.ts', 'resolvePkgJson'],
    ['packages/client/ui-conversation/src/client/contract/slots.ts', "'conversation.input.left'"],
    ['packages/client/ui-conversation/src/client/contract/slots.ts', "'conversation.input.overlay'"],
    ['packages/client/ui-conversation/src/client/contract/slots.ts', "'conversation.input.dock'"],
    ['packages/client/ui-conversation/src/client/input/facade.ts', 'serializeReference'],
    ['packages/client/ui-settings/src/client/contract/slots.ts', "'settings.section'"],
    ['packages/host/webserver/src/index.ts', 'Longest-prefix-wins'],
  ];
  for (const [relative, token] of probes) {
    const path = join(checkout, relative);
    let content;
    try {
      content = await readFile(path, 'utf8');
    } catch {
      fail(`DSH capability probe is missing: ${relative}`);
    }
    if (!content.includes(token)) fail(`DSH capability probe failed: ${relative} lacks ${token}`);
  }
}

async function gitOutput(args) {
  return new Promise(resolvePromise => {
    const child = spawn('git', args, { cwd: SOURCE_ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.once('error', () => resolvePromise(undefined));
    child.once('close', code => resolvePromise(code === 0 ? Buffer.concat(chunks).toString('utf8').trim() : undefined));
  });
}

async function sourceIdentity() {
  const commit = await gitOutput(['rev-parse', 'HEAD']);
  const remote = await gitOutput(['remote', 'get-url', 'origin']);
  const dirty = (await gitOutput(['status', '--porcelain']))?.length > 0;
  const sourceDigest = createHash('sha256');
  for (const relative of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'scripts/install.mjs']) {
    sourceDigest.update(relative).update('\0').update(await readFile(join(SOURCE_ROOT, relative))).update('\0');
  }
  const contentDigest = sourceDigest.digest('hex');
  const fingerprint = createHash('sha256')
    .update(`${remote ?? 'local'}\0${commit ?? 'uncommitted'}\0${dirty ? 'dirty' : 'clean'}\0${contentDigest}\0${PACKAGE_NAME}`)
    .digest('hex');
  return { commit, dirty, contentDigest, distributionFingerprint: fingerprint };
}

function configBlock() {
  return [
    CONFIG_START,
    '- insert:',
    '    - id: community-multimedia-webui-input',
    `      name: '${PACKAGE_NAME}'`,
    CONFIG_END,
    '',
  ].join('\n');
}

function withoutMarkedBlock(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start === -1) return content;
  const end = content.indexOf(endMarker, start);
  if (end === -1) fail(`config marker ${startMarker} exists without its matching end marker`);
  const after = end + endMarker.length;
  return `${content.slice(0, start)}${content.slice(after).replace(/^\r?\n/, '')}`;
}

function withoutBlock(content) {
  return withoutMarkedBlock(
    withoutMarkedBlock(content, CONFIG_START, CONFIG_END),
    LEGACY_CONFIG_START,
    LEGACY_CONFIG_END,
  );
}

function withBlock(content) {
  const clean = withoutBlock(content).trim();
  if (clean === '' || clean === '[]') return configBlock();
  return `${clean}\n${configBlock()}`;
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.dshca-${process.pid}-${Date.now()}`;
  const backup = `${path}.dshca-backup-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, { flag: 'wx' });
  let backedUp = false;
  try {
    if (await exists(path)) {
      await rename(path, backup);
      backedUp = true;
    }
    await rename(temporary, path);
    if (backedUp) await rm(backup, { force: true });
  } catch (cause) {
    await rm(temporary, { force: true }).catch(() => {});
    if (backedUp && !await exists(path)) await rename(backup, path).catch(() => {});
    throw cause;
  }
}

async function publishPackage(target) {
  const parent = dirname(target);
  const staging = `${target}.staging-${process.pid}-${Date.now()}`;
  const backup = `${target}.backup-${process.pid}-${Date.now()}`;
  await mkdir(parent, { recursive: true });
  await mkdir(staging, { recursive: false });
  for (const item of ['package.json', 'cordis.patch.yml', 'lib', 'README.md', 'README.zh.md', 'LICENSE']) {
    await cp(join(SOURCE_ROOT, item), join(staging, item), { recursive: true });
  }
  let backedUp = false;
  let published = false;
  try {
    if (await exists(target)) {
      const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
      if (manifest.name !== PACKAGE_NAME) fail(`refusing to replace non-plugin directory: ${target}`);
      await rename(target, backup);
      backedUp = true;
    }
    await rename(staging, target);
    published = true;
    let settled = false;
    return {
      async commit() {
        if (settled) return;
        if (backedUp) await rm(backup, { force: true, recursive: true });
        settled = true;
      },
      async rollback() {
        if (settled) return;
        if (published) await rm(target, { force: true, recursive: true });
        if (backedUp) await rename(backup, target);
        settled = true;
      },
    };
  } catch (cause) {
    await rm(staging, { force: true, recursive: true }).catch(() => {});
    if (published) await rm(target, { force: true, recursive: true }).catch(() => {});
    if (backedUp && !await exists(target)) await rename(backup, target).catch(() => {});
    throw cause;
  }
}

function noOpTransaction() {
  return { commit: async () => {}, rollback: async () => {} };
}

async function stashPath(target) {
  if (!await exists(target)) return noOpTransaction();
  const backup = `${target}.migration-backup-${process.pid}-${Date.now()}`;
  await rename(target, backup);
  let settled = false;
  return {
    async commit() {
      if (settled) return;
      await rm(backup, { force: true, recursive: true });
      settled = true;
    },
    async rollback() {
      if (settled || !await exists(backup)) return;
      await rename(backup, target);
      settled = true;
    },
  };
}

async function stashLegacyPackage(target) {
  if (!await exists(target)) return noOpTransaction();
  const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  if (manifest.name !== LEGACY_PACKAGE_NAME) {
    fail(`refusing to migrate non-legacy package directory: ${target}`);
  }
  return stashPath(target);
}

async function stashLegacyMetadata(directory) {
  if (!await exists(directory)) return noOpTransaction();
  const metadata = JSON.parse(await readFile(join(directory, 'install.json'), 'utf8'));
  if (metadata.package !== LEGACY_PACKAGE_NAME) {
    fail(`refusing to migrate non-legacy metadata directory: ${directory}`);
  }
  return stashPath(directory);
}

async function runDsh(executable, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      env,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

async function installLegacy() {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const executable = await locateExecutable();
  const checkout = await checkoutFromExecutable(executable);
  await assertCompatibility(checkout);
  const resolverRoot = await stableResolverRoot(checkout);
  const packageTarget = join(resolverRoot, '@dsh-community', 'multimedia-webui-input');
  const legacyPackageTarget = join(resolverRoot, '@dsh-community', 'attachments');
  const configPath = join(dshHome, 'config.yaml');
  const metadataPath = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json');
  const legacyMetadataDirectory = join(dshHome, 'community-plugins', 'attachments');
  const hadConfig = await exists(configPath);
  const originalConfig = hadConfig ? await readFile(configPath, 'utf8') : '';
  const hadMetadata = await exists(metadataPath);
  const originalMetadata = hadMetadata ? await readFile(metadataPath, 'utf8') : undefined;

  const packageTransaction = await publishPackage(packageTarget);
  let legacyPackageTransaction = noOpTransaction();
  let legacyMetadataTransaction = noOpTransaction();
  try {
    legacyPackageTransaction = await stashLegacyPackage(legacyPackageTarget);
    legacyMetadataTransaction = await stashLegacyMetadata(legacyMetadataDirectory);
    const baseConfig = join(checkout, 'apps', 'cli', 'config', 'base.cordis.yml');
    const anchoredRequire = createRequire(pathToFileURL(baseConfig));
    const resolvedManifest = anchoredRequire.resolve(`${PACKAGE_NAME}/package.json`);
    if (resolve(resolvedManifest) !== resolve(packageTarget, 'package.json')) {
      fail(`DSH resolves ${PACKAGE_NAME} to an unexpected package: ${resolvedManifest}`);
    }
    await atomicWrite(configPath, withBlock(originalConfig));
    const result = await runDsh(executable, ['web', '--dump-config'], { ...process.env, DSH_HOME: dshHome });
    if (result.code !== 0 || !result.stdout.includes(`name: '${PACKAGE_NAME}'`)) {
      fail(`DSH rejected the installed config: ${result.stderr.trim() || result.stdout.trim()}`);
    }
    const identity = await sourceIdentity();
    await mkdir(dirname(metadataPath), { recursive: true });
    await atomicWrite(metadataPath, `${JSON.stringify({
      schemaVersion: 1,
      package: PACKAGE_NAME,
      installedAt: new Date().toISOString(),
      sourceCommit: identity.commit,
      sourceDirty: identity.dirty,
      sourceContentDigest: identity.contentDigest,
      distributionFingerprint: identity.distributionFingerprint,
      checkout,
      resolverRoot,
      packageTarget,
      configPath,
    }, null, 2)}\n`);
    await packageTransaction.commit();
    for (const transaction of [legacyPackageTransaction, legacyMetadataTransaction]) {
      try {
        await transaction.commit();
      } catch (cause) {
        process.stderr.write(`dsh-multimedia-webui-input: legacy retirement needs manual cleanup: ${cause instanceof Error ? cause.message : String(cause)}\n`);
      }
    }
  } catch (cause) {
    const rollbackFailures = [];
    try {
      if (hadConfig) await atomicWrite(configPath, originalConfig);
      else await rm(configPath, { force: true });
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    try {
      await packageTransaction.rollback();
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    try {
      await legacyPackageTransaction.rollback();
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    try {
      await legacyMetadataTransaction.rollback();
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    try {
      if (hadMetadata) await atomicWrite(metadataPath, originalMetadata);
      else await rm(metadataPath, { force: true });
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    if (rollbackFailures.length > 0) {
      throw new AggregateError([cause, ...rollbackFailures], 'installation failed and rollback was incomplete');
    }
    throw cause;
  }

  process.stdout.write([
    'DSH Multimedia WebUI Input installed.',
    `DSH checkout: ${checkout}`,
    `Plugin package: ${packageTarget}`,
    `Config: ${configPath}`,
    'Restart dsh web (or wait for personal-config HMR) before testing attachments.',
    '',
  ].join('\n'));
}

async function uninstallLegacy() {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const metadataPath = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json');
  if (!await exists(metadataPath)) fail(`install metadata not found: ${metadataPath}`);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  if (metadata.package !== PACKAGE_NAME || metadata.schemaVersion !== 1) fail('install metadata is not owned by this plugin');
  const configPath = resolve(metadata.configPath);
  if (configPath !== join(dshHome, 'config.yaml')) fail(`refusing unexpected config target: ${configPath}`);
  if (await exists(configPath)) {
    const content = await readFile(configPath, 'utf8');
    const next = withoutBlock(content);
    if (next.trim() === '') await rm(configPath, { force: true });
    else await atomicWrite(configPath, next);
  }
  const packageTarget = resolve(metadata.packageTarget);
  const expectedPackageTarget = join(resolve(metadata.resolverRoot), '@dsh-community', 'multimedia-webui-input');
  if (packageTarget !== expectedPackageTarget) fail(`refusing unexpected package target: ${packageTarget}`);
  if (await exists(packageTarget)) {
    const manifest = JSON.parse(await readFile(join(packageTarget, 'package.json'), 'utf8'));
    if (manifest.name !== PACKAGE_NAME) fail(`refusing to remove non-plugin directory: ${packageTarget}`);
    await rm(packageTarget, { force: true, recursive: true });
  }
  await rm(dirname(metadataPath), { force: true, recursive: true });
  process.stdout.write('DSH Multimedia WebUI Input uninstalled. Workspace attachment data was preserved.\n');
}

async function statusLegacy() {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const metadataPath = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json');
  if (!await exists(metadataPath)) {
    process.stdout.write('not installed\n');
    process.exitCode = 1;
    return;
  }
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const packagePresent = await exists(metadata.packageTarget);
  const configPresent = await exists(metadata.configPath)
    && (await readFile(metadata.configPath, 'utf8')).includes(CONFIG_START);
  process.stdout.write(`${JSON.stringify({ installed: packagePresent && configPresent, ...metadata }, null, 2)}\n`);
  if (!packagePresent || !configPresent) process.exitCode = 1;
}

function profileName() {
  const value = process.env.DSH_PROFILE ?? 'web';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === '.' || value === '..') {
    fail(`invalid DSH_PROFILE: ${JSON.stringify(value)}`);
  }
  return value;
}

async function profileManifest(profileDir) {
  const path = join(profileDir, 'package.json');
  if (!await exists(path)) return undefined;
  return JSON.parse(await readFile(path, 'utf8'));
}

async function installProfile(executable, checkout) {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const profile = profileName();
  const profileDir = join(dshHome, 'profiles', profile);
  const metadataDirectory = join(dshHome, 'community-plugins', 'multimedia-webui-input');
  const metadataPath = join(metadataDirectory, 'install.json');
  const packageTarget = join(metadataDirectory, 'package');
  const previousMetadata = await exists(metadataPath)
    ? JSON.parse(await readFile(metadataPath, 'utf8'))
    : undefined;
  if (previousMetadata?.schemaVersion === 2 && (previousMetadata?.mode !== 'profile'
    || previousMetadata?.profile !== profile
    || resolve(previousMetadata?.packageTarget ?? '') !== resolve(packageTarget))) {
    fail('an installation owned by this script targets a different profile or package path; uninstall it first');
  }
  const before = await profileManifest(profileDir);
  const wasDependency = typeof before?.dependencies?.[PACKAGE_NAME] === 'string';
  if (wasDependency && (previousMetadata?.schemaVersion !== 2
    || previousMetadata?.mode !== 'profile'
    || resolve(previousMetadata.packageTarget ?? '') !== resolve(packageTarget))) {
    fail(`${PACKAGE_NAME} is already managed directly by DSH profile ${profile}; remove it there before adopting this installer`);
  }

  await assertCompatibility(checkout);
  const packageTransaction = await publishPackage(packageTarget);
  let added = false;
  try {
    const installResult = await runDsh(executable, [
      'plugin', '--profile', profile, 'add', `link:${packageTarget}`,
    ], { ...process.env, DSH_HOME: dshHome });
    if (installResult.code !== 0) {
      fail(`DSH profile plugin install failed: ${installResult.stderr.trim() || installResult.stdout.trim()}`);
    }
    added = true;
    const dump = await runDsh(executable, ['--profile', profile, '--dump-config'], {
      ...process.env,
      DSH_HOME: dshHome,
    });
    if (dump.code !== 0 || !dump.stdout.includes(PACKAGE_NAME)) {
      fail(`DSH rejected the profile bundle: ${dump.stderr.trim() || dump.stdout.trim()}`);
    }
    const identity = await sourceIdentity();
    await atomicWrite(metadataPath, `${JSON.stringify({
      schemaVersion: 2,
      mode: 'profile',
      package: PACKAGE_NAME,
      profile,
      installedAt: new Date().toISOString(),
      sourceCommit: identity.commit,
      sourceDirty: identity.dirty,
      sourceContentDigest: identity.contentDigest,
      distributionFingerprint: identity.distributionFingerprint,
      checkout,
      packageTarget,
      profileDir,
    }, null, 2)}\n`);
    await packageTransaction.commit();
  } catch (cause) {
    const rollbackFailures = [];
    try {
      await packageTransaction.rollback();
    } catch (rollbackCause) {
      rollbackFailures.push(rollbackCause);
    }
    if (added) {
      try {
        const rollback = wasDependency
          ? await runDsh(executable, ['plugin', '--profile', profile, 'install'], {
            ...process.env,
            DSH_HOME: dshHome,
          })
          : await runDsh(executable, ['plugin', '--profile', profile, 'remove', PACKAGE_NAME], {
            ...process.env,
            DSH_HOME: dshHome,
          });
        if (rollback.code !== 0) {
          fail(`DSH profile rollback failed: ${rollback.stderr.trim() || rollback.stdout.trim()}`);
        }
      } catch (rollbackCause) {
        rollbackFailures.push(rollbackCause);
      }
    }
    if (rollbackFailures.length > 0) {
      throw new AggregateError([cause, ...rollbackFailures], 'profile installation failed and rollback was incomplete');
    }
    throw cause;
  }

  process.stdout.write([
    'DSH Multimedia WebUI Input installed.',
    `DSH checkout: ${checkout}`,
    `DSH profile: ${profile}`,
    `Plugin package: ${packageTarget}`,
    'Restart dsh web before testing attachments.',
    '',
  ].join('\n'));
}

async function uninstallProfile(metadata, metadataPath) {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const expectedMetadataPath = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json');
  if (resolve(metadataPath) !== resolve(expectedMetadataPath)) fail(`refusing unexpected metadata target: ${metadataPath}`);
  const profile = metadata.profile;
  if (typeof profile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    fail('install metadata has an invalid profile');
  }
  const expectedPackageTarget = join(dirname(expectedMetadataPath), 'package');
  if (resolve(metadata.packageTarget) !== resolve(expectedPackageTarget)) {
    fail(`refusing unexpected package target: ${metadata.packageTarget}`);
  }
  const executable = await locateExecutable();
  const manifest = await profileManifest(join(dshHome, 'profiles', profile));
  const dependencyPresent = typeof manifest?.dependencies?.[PACKAGE_NAME] === 'string';
  const pluginArgs = dependencyPresent
    ? ['plugin', '--profile', profile, 'remove', PACKAGE_NAME]
    : ['plugin', '--profile', profile, 'install'];
  const result = await runDsh(executable, pluginArgs, {
    ...process.env,
    DSH_HOME: dshHome,
  });
  if (result.code !== 0) {
    fail(`DSH profile plugin removal failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  const dump = await runDsh(executable, ['--profile', profile, '--dump-config'], {
    ...process.env,
    DSH_HOME: dshHome,
  });
  if (dump.code !== 0 || dump.stdout.includes(PACKAGE_NAME)) {
    fail(`DSH still composes the removed profile bundle: ${dump.stderr.trim() || dump.stdout.trim()}`);
  }
  await rm(dirname(metadataPath), { force: true, recursive: true });
  process.stdout.write('DSH Multimedia WebUI Input uninstalled. Workspace attachment data was preserved.\n');
}

async function statusProfile(metadata) {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const expectedProfileDir = join(dshHome, 'profiles', metadata.profile);
  const expectedPackageTarget = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'package');
  if (resolve(metadata.profileDir) !== resolve(expectedProfileDir)
    || resolve(metadata.packageTarget) !== resolve(expectedPackageTarget)) {
    fail('install metadata contains an unexpected profile or package path');
  }
  const manifest = await profileManifest(expectedProfileDir);
  const packagePresent = await exists(expectedPackageTarget);
  const dependencyPresent = typeof manifest?.dependencies?.[PACKAGE_NAME] === 'string';
  const bundlePresent = manifest?.dsh?.profile?.bundles?.includes(PACKAGE_NAME) === true;
  const installed = packagePresent && dependencyPresent && bundlePresent;
  process.stdout.write(`${JSON.stringify({ installed, packagePresent, dependencyPresent, bundlePresent, ...metadata }, null, 2)}\n`);
  if (!installed) process.exitCode = 1;
}

async function install() {
  const executable = await locateExecutable();
  const checkout = await checkoutFromExecutable(executable);
  if (await checkoutKind(checkout) === 'profile') return installProfile(executable, checkout);
  return installLegacy();
}

async function ownedMetadata() {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const metadataPath = join(dshHome, 'community-plugins', 'multimedia-webui-input', 'install.json');
  if (!await exists(metadataPath)) return { metadataPath, metadata: undefined };
  return { metadataPath, metadata: JSON.parse(await readFile(metadataPath, 'utf8')) };
}

async function uninstall() {
  const { metadataPath, metadata } = await ownedMetadata();
  if (metadata?.schemaVersion === 2 && metadata?.mode === 'profile') {
    return uninstallProfile(metadata, metadataPath);
  }
  return uninstallLegacy();
}

async function status() {
  const { metadata, metadataPath } = await ownedMetadata();
  if (metadata?.schemaVersion === 2 && metadata?.mode === 'profile') return statusProfile(metadata);
  if (metadata === undefined) {
    process.stdout.write('not installed\n');
    process.exitCode = 1;
    return;
  }
  if (resolve(metadataPath) === resolve(join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'community-plugins', 'multimedia-webui-input', 'install.json'))) {
    return statusLegacy();
  }
  fail(`refusing unexpected metadata target: ${metadataPath}`);
}

try {
  if (MODE === 'install') await install();
  else if (MODE === 'uninstall') await uninstall();
  else if (MODE === 'status') await status();
  else fail(`unknown mode ${JSON.stringify(MODE)}; use install, uninstall, or status`);
} catch (cause) {
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
}
