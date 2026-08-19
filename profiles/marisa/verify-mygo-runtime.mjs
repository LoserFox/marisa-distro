#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'harness', 'apps', 'cli', 'lib', 'bin.js');
const startupTimeoutMs = Number(process.env.MARISA_RUNTIME_BOOT_TIMEOUT_MS ?? 120_000);
const requestTimeoutMs = 30_000;
assert.ok(Number.isFinite(startupTimeoutMs) && startupTimeoutMs > 0, 'MARISA_RUNTIME_BOOT_TIMEOUT_MS must be a positive number');
const fetchWithTimeout = (url, timeoutMs = requestTimeoutMs) => fetch(url, {
  signal: AbortSignal.timeout(timeoutMs),
});

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

// rc7 CLI syntax: --profile is a launcher flag; `web` subcommand does not
// accept it (rc7 sync, 2026-08-18).
const child = spawn(process.execPath, [bin, '--profile', 'marisa', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: repo,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

const deadline = Date.now() + startupTimeoutMs;
try {
  let rootResponse;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Marisa exited before becoming ready:\n${output}`);
    try {
      rootResponse = await fetchWithTimeout(
        `http://127.0.0.1:${port}/`,
        Math.max(1, Math.min(3_000, deadline - Date.now())),
      );
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
  const clientBundles = new Map();
  for (const entry of boot.entries) {
    assert.equal(typeof entry.id, 'string', 'Client boot entry must have an id');
    assert.equal(typeof entry.url, 'string', `Client boot entry ${entry.id} must have a URL`);
    const bundleResponse = await fetchWithTimeout(new URL(entry.url, `http://127.0.0.1:${port}/`));
    assert.equal(bundleResponse.status, 200, `${entry.id} client bundle returned ${bundleResponse.status}`);
    const bundleSource = await bundleResponse.text();
    assert.doesNotThrow(
      () => new Script(bundleSource, { filename: entry.url }),
      `${entry.id} client bundle must be syntactically valid JavaScript`,
    );
    clientBundles.set(entry.id, { url: entry.url, status: bundleResponse.status });
  }
  const panelEntry = boot.entries.find((entry) => entry.id === '@r05en1cu/dsh-mygo-ext-panel');
  assert.ok(panelEntry, 'MyGO panel must be registered in the browser client graph');
  const panelBundle = clientBundles.get(panelEntry.id);
  assert.ok(panelBundle, 'MyGO panel client bundle must be fetched and parsed');

  const status = await fetchWithTimeout(`http://127.0.0.1:${port}/api/mygo/plugins`);
  const responseText = await status.text();
  assert.equal(status.status, 200, `MyGO plugins endpoint returned ${status.status}: ${responseText}`);
  const payload = JSON.parse(responseText);
  assert.ok(payload && typeof payload === 'object', 'MyGO plugins endpoint must return JSON');
  assert.ok(Array.isArray(payload.plugins), 'MyGO plugins endpoint must expose its managed-plugin inventory');
  const expectedMygoPlugins = [
    ['dsh-mygo', '0.2.0-rc.7'],
    ['dsh-mygo-loader-hub', '0.2.0-rc.7'],
    ['dsh-mygo-cli', '0.2.0-rc.7'],
    ['dsh-mygo-ext-panel', '0.2.0-rc.7'],
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
    clientPanel: { id: panelEntry.id, ...panelBundle },
    mygo: payload,
  }, null, 2));
} finally {
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
