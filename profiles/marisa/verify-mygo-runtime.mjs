#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'harness', 'apps', 'cli', 'lib', 'bin.js');

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const child = spawn(process.execPath, [bin, 'web', '--profile', 'marisa', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: repo,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const deadline = Date.now() + 20_000;
try {
  let rootResponse;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Marisa exited before becoming ready:\n${output}`);
    try {
      rootResponse = await fetch(`http://127.0.0.1:${port}/`);
      if (rootResponse.ok) break;
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(rootResponse?.ok, `Marisa did not become HTTP-ready:\n${output}`);
  const rootHtml = await rootResponse.text();
  const bootMatch = rootHtml.match(/window\.__DSH_BOOT__\s*=\s*({.*?})<\/script>/s);
  assert.ok(bootMatch, 'Marisa root page must contain the client boot manifest');
  const boot = JSON.parse(bootMatch[1]);
  assert.ok(Array.isArray(boot.entries), 'Client boot manifest must contain entries');
  const panelEntry = boot.entries.find((entry) => entry.id === '@r05en1cu/dsh-mygo-ext-panel');
  assert.ok(panelEntry, 'MyGO panel must be registered in the browser client graph');
  const panelBundle = await fetch(new URL(panelEntry.url, `http://127.0.0.1:${port}/`));
  assert.equal(panelBundle.status, 200, `MyGO panel client bundle returned ${panelBundle.status}`);

  const status = await fetch(`http://127.0.0.1:${port}/api/mygo/plugins`);
  const responseText = await status.text();
  assert.equal(status.status, 200, `MyGO plugins endpoint returned ${status.status}: ${responseText}`);
  const payload = JSON.parse(responseText);
  assert.ok(payload && typeof payload === 'object', 'MyGO plugins endpoint must return JSON');
  assert.ok(Array.isArray(payload.plugins), 'MyGO plugins endpoint must expose its managed-plugin inventory');
  const expectedMygoPlugins = [
    ['dsh-mygo', '0.2.0-rc.6'],
    ['dsh-mygo-loader-hub', '0.2.0-rc.6'],
    ['dsh-mygo-cli', '0.2.0-rc.6'],
    ['dsh-mygo-ext-panel', '0.2.0-rc.6'],
  ];
  for (const [id, version] of expectedMygoPlugins) {
    const plugin = payload.plugins.find((candidate) => candidate.id === id);
    assert.ok(plugin, `${id} must appear in the MyGO inventory`);
    assert.equal(plugin.version, version, `${id} must stay exact-pinned`);
    assert.equal(plugin.status, 'enabled', `${id} must activate at startup`);
  }
  console.log(JSON.stringify({
    ok: true,
    port,
    clientPanel: { id: panelEntry.id, url: panelEntry.url, status: panelBundle.status },
    mygo: payload,
  }, null, 2));
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
