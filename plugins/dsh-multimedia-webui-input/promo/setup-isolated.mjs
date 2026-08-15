import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const sourceInput = process.env.DSHCA_DSH_SOURCE;
const envInput = process.env.DSHCA_ENV_FILE;
const settingsInput = process.env.DSHCA_SETTINGS_FILE;

if (!sourceInput || !envInput || !settingsInput) {
  throw new Error('Set DSHCA_DSH_SOURCE, DSHCA_ENV_FILE, and DSHCA_SETTINGS_FILE');
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed (${code}): ${Buffer.concat(stderr).toString('utf8').trim()}`));
    });
  });
}

const source = await realpath(resolve(sourceInput));
const createdRoot = await mkdtemp(join(tmpdir(), 'dshca-promo-v2-'));
const root = await realpath(createdRoot);
const sourceContainer = join(root, 'source');
const checkout = join(sourceContainer, 'staging-qa');
const dshHome = join(root, 'home', '.dsh');
const workspace = join(root, 'Multimedia-WebUI-Input-Lab');
const workspaceId = randomUUID();
const now = new Date().toISOString();

await mkdir(sourceContainer, { recursive: true });
await mkdir(join(dshHome, 'storages'), { recursive: true });
await mkdir(workspace, { recursive: true });

// APFS clone-copy keeps the isolated built checkout cheap. Fall back to an
// ordinary recursive copy when clonefile is unavailable.
try {
  await run('cp', ['-cR', source, checkout]);
} catch {
  await run('cp', ['-R', source, checkout]);
}
await symlink('staging-qa', join(sourceContainer, 'current'));
await copyFile(resolve(envInput), join(dshHome, '.env'));
await copyFile(resolve(settingsInput), join(dshHome, 'settings.yaml'));
await writeFile(join(dshHome, 'storages', 'workspace.json'), `${JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [] },
  tables: {
    workspaces: {
      [workspaceId]: {
        path: workspace,
        title: 'DSH Multimedia WebUI Input Lab',
        sessionIds: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  },
}, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(root, '.dshca-promo-environment.json'), `${JSON.stringify({
  schemaVersion: 1,
  purpose: 'dsh-multimedia-webui-input-promo',
  root,
  source: basename(source),
}, null, 2)}\n`, { mode: 0o600 });

process.stdout.write(`${JSON.stringify({ root, checkout, dshHome, workspace }, null, 2)}\n`);
