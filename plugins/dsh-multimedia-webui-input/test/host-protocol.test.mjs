import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { apply } from '../lib/index.js';

class ResponseCapture {
  headers = {};
  status = 0;
  body = Buffer.alloc(0);

  writeHead(status, headers = {}) {
    this.status = status;
    this.headers = headers;
  }

  end(value = '') {
    this.body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  }

  json() {
    return JSON.parse(this.body.toString('utf8'));
  }
}

function request(method, url, body = Buffer.alloc(0), headers = {}) {
  const stream = Readable.from(body.length === 0 ? [] : [body]);
  stream.method = method;
  stream.url = url;
  stream.headers = {
    host: '127.0.0.1:3080',
    origin: 'http://127.0.0.1:3080',
    ...headers,
  };
  return stream;
}

function jsonRequest(method, url, value, headers) {
  const body = Buffer.from(JSON.stringify(value));
  return request(method, url, body, {
    'content-length': String(body.length),
    'content-type': 'application/json',
    ...headers,
  });
}

function fixture(cwd) {
  let route;
  const effects = [];
  const sessions = new Map(['session-one', 'session-two'].map(id => [id, { header: { id, cwd } }]));
  const ctx = {
    effect(factory) {
      const disposer = factory();
      if (typeof disposer === 'function') effects.push(disposer);
    },
    httpServer: {
      register(value) {
        route = value;
        return () => {};
      },
    },
    loader: {
      entries() {
        return [{
          options: { name: '@deepseek-ai/dsh-client-connection' },
          fiber: { config: { trustedHosts: [] } },
        }];
      },
    },
    logger: { warn() {} },
    sessions: {
      get(id) {
        return sessions.get(id);
      },
    },
  };
  apply(ctx);
  return {
    async call(req) {
      const res = new ResponseCapture();
      await route.handler(req, res);
      return res;
    },
    async dispose() {
      for (const effect of effects.reverse()) await effect();
    },
  };
}

test('streams a complete batch into the live session workspace and commits a manifest', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dshca-host-'));
  const app = fixture(cwd);
  try {
    const payload = Buffer.from('attachment bytes');
    const created = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/batches', {
      sessionId: 'session-one',
      cwd: '/browser/must/not/control/this',
      files: [{ path: 'folder/note.txt', size: payload.length, type: 'text/plain' }],
    }));
    assert.equal(created.status, 201);
    const batchId = created.json().batchId;

    const uploaded = await app.call(request(
      'PUT',
      `/community-multimedia-webui-input/v1/batches/${batchId}/files/0`,
      payload,
      { 'content-length': String(payload.length), 'content-type': 'application/octet-stream' },
    ));
    assert.equal(uploaded.status, 200);

    const committed = await app.call(request(
      'POST',
      `/community-multimedia-webui-input/v1/batches/${batchId}/commit`,
    ));
    assert.equal(committed.status, 200);
    const result = committed.json();
    assert.equal(result.ok, true);
    assert.ok(result.root.startsWith(cwd));
    assert.equal(await readFile(result.files[0].absolutePath, 'utf8'), payload.toString());
    const manifest = JSON.parse(await readFile(result.manifest, 'utf8'));
    assert.equal(manifest.owner, 'dsh-multimedia-webui-input');
    assert.equal(manifest.files[0].originalPath, 'folder/note.txt');

    const usage = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/usage/session', {
      sessionId: 'session-one',
    }));
    assert.deepEqual(usage.json(), {
      ok: true,
      sends: 1,
      files: 1,
      bytes: payload.length,
    });

    const cleaned = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/cleanup/session', {
      sessionId: 'session-one',
    }));
    assert.deepEqual(cleaned.json(), {
      ok: true,
      deletedSends: 1,
      deletedFiles: 1,
      deletedBytes: payload.length,
    });
    await assert.rejects(stat(result.root), { code: 'ENOENT' });
  } finally {
    await app.dispose();
    await rm(cwd, { force: true, recursive: true });
  }
});

test('workspace cleanup removes only owned committed sends across sessions', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dshca-workspace-clean-'));
  const app = fixture(cwd);
  const commit = async (sessionId, path, payload) => {
    const created = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/batches', {
      sessionId,
      files: [{ path, size: payload.length }],
    }));
    const batchId = created.json().batchId;
    await app.call(request('PUT', `/community-multimedia-webui-input/v1/batches/${batchId}/files/0`, payload, {
      'content-length': String(payload.length),
    }));
    return app.call(request('POST', `/community-multimedia-webui-input/v1/batches/${batchId}/commit`));
  };
  try {
    await commit('session-one', 'one.txt', Buffer.from('one'));
    await commit('session-two', 'two.txt', Buffer.from('two'));
    const unknown = join(cwd, '.dsh', 'tmp', 'attachments', 'foreign-data');
    await mkdir(unknown, { recursive: true });
    await writeFile(join(unknown, 'keep.txt'), 'not owned by this plugin');

    const usage = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/usage/workspace', {
      sessionId: 'session-one',
    }));
    assert.deepEqual(usage.json(), {
      ok: true,
      sessionDirectories: 2,
      sends: 2,
      files: 2,
      bytes: 6,
    });

    const cleaned = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/cleanup/workspace', {
      sessionId: 'session-one',
    }));
    assert.deepEqual(cleaned.json(), {
      ok: true,
      deletedSessionDirectories: 2,
      deletedSends: 2,
      deletedFiles: 2,
      deletedBytes: 6,
    });
    assert.equal(await readFile(join(unknown, 'keep.txt'), 'utf8'), 'not owned by this plugin');
  } finally {
    await app.dispose();
    await rm(cwd, { force: true, recursive: true });
  }
});

test('rejects cross-site requests before creating a batch', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dshca-trust-'));
  const app = fixture(cwd);
  try {
    const result = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/batches', {
      sessionId: 'session-one',
      files: [{ path: 'x.txt', size: 0 }],
    }, {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    }));
    assert.equal(result.status, 403);
    await assert.rejects(stat(join(cwd, '.dsh')), { code: 'ENOENT' });
  } finally {
    await app.dispose();
    await rm(cwd, { force: true, recursive: true });
  }
});

test('keeps an incomplete batch unpublished and removes staging on disposal', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dshca-incomplete-'));
  const app = fixture(cwd);
  try {
    const created = await app.call(jsonRequest('POST', '/community-multimedia-webui-input/v1/batches', {
      sessionId: 'session-one',
      files: [{ path: 'partial.bin', size: 4 }],
    }));
    const batchId = created.json().batchId;
    const committed = await app.call(request(
      'POST',
      `/community-multimedia-webui-input/v1/batches/${batchId}/commit`,
    ));
    assert.equal(committed.status, 400);
    assert.match(committed.json().error.message, /incomplete/);
    await app.dispose();
    const root = join(cwd, '.dsh', 'tmp', 'attachments');
    const entries = await (async () => {
      try {
        return await stat(root);
      } catch {
        return undefined;
      }
    })();
    assert.ok(entries === undefined || entries.isDirectory());
    await assert.rejects(stat(join(root, '.staging', batchId)), { code: 'ENOENT' });
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
