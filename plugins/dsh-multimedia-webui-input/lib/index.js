import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const name = 'dsh-multimedia-webui-input';
export const inject = ['httpServer', 'loader', 'sessions'];

const API_ROOT = '/community-multimedia-webui-input/v1';
const OWNER_FILE = '.dsh-workspace-attachments.json';
const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 1024 ** 3,
  maxBatchBytes: 2 * 1024 ** 3,
  maxFiles: 10_000,
  maxDepth: 64,
  maxConcurrentUploads: 4,
});

function json(res, status, value) {
  const body = `${JSON.stringify(value)}\n`;
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(body);
}

function error(res, status, code, message) {
  json(res, status, { ok: false, error: { code, message } });
}

function header(headers, name) {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function authority(value) {
  try {
    return new URL(`http://${value}`);
  } catch {
    return undefined;
  }
}

function canonicalAuthority(raw, parsed) {
  const port = parsed.port !== '' ? parsed.port : new URL(`https://${raw}`).port;
  return port === '' ? parsed.hostname : `${parsed.hostname}:${port}`;
}

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return host === 'localhost' || host === '::1' || host === '127.0.0.1'
    || host.startsWith('127.');
}

function trustedRequest(req, trustedHosts) {
  const host = header(req.headers, 'host');
  if (host === undefined) return false;
  const parsedHost = authority(host);
  if (parsedHost === undefined) return false;
  const listed = trustedHosts.some((entry) => {
    const parsed = authority(entry);
    if (parsed === undefined) return false;
    return canonicalAuthority(entry, parsed) === parsed.hostname
      ? parsed.hostname === parsedHost.hostname
      : parsed.host === parsedHost.host;
  });
  if (!isLoopback(parsedHost.hostname) && !listed) return false;
  if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(req.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === parsedHost.host;
  } catch {
    return false;
  }
}

async function readJson(req, maxBytes = 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`JSON body exceeds ${maxBytes} bytes`);
    parts.push(chunk);
  }
  const text = Buffer.concat(parts).toString('utf8');
  return JSON.parse(text === '' ? '{}' : text);
}

function sourceTrustedHosts(ctx) {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name !== '@deepseek-ai/dsh-client-connection') continue;
    const value = entry.fiber?.config?.trustedHosts;
    if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value;
  }
  return [];
}

function sessionDirectoryName(sessionId) {
  const slug = sessionId.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 48) || 'session';
  const digest = createHash('sha256').update(sessionId).digest('hex').slice(0, 12);
  return `${slug}-${digest}`;
}

function rawSegments(path) {
  if (typeof path !== 'string' || path === '' || path.includes('\0')) {
    throw new Error('attachment path must be a non-empty string');
  }
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`attachment path must be relative: ${JSON.stringify(path)}`);
  }
  const parts = normalized.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`attachment path contains an unsafe segment: ${JSON.stringify(path)}`);
  }
  return parts;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function safeSegment(segment) {
  let next = segment.normalize('NFC').replace(/[<>:"|?*\u0000-\u001f\\]/g, '_');
  if (process.platform === 'win32') {
    next = next.replace(/[. ]+$/g, match => '_'.repeat(match.length));
    if (WINDOWS_RESERVED.test(next)) next = `_${next}`;
  }
  if (next === '' || next === '.' || next === '..') next = '_';
  return next;
}

function appendCollisionSuffix(path, index) {
  const extension = extname(path);
  const stem = basename(path, extension);
  return join(dirname(path), `${stem}~${index}${extension}`);
}

function mapFiles(files, limits) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('at least one file is required');
  if (files.length > limits.maxFiles) throw new Error(`file count exceeds ${limits.maxFiles}`);
  const rawPaths = new Set();
  const allocatedFiles = new Set([process.platform === 'win32' ? OWNER_FILE.toLowerCase() : OWNER_FILE]);
  const allocatedDirectories = new Set();
  const rows = [];
  let totalBytes = 0;
  for (const [index, input] of files.entries()) {
    if (typeof input !== 'object' || input === null) throw new Error(`file ${index} is not an object`);
    const parts = rawSegments(input.path);
    if (parts.length > limits.maxDepth) throw new Error(`file ${index} exceeds depth ${limits.maxDepth}`);
    const rawPath = parts.join('/');
    if (rawPaths.has(rawPath)) throw new Error(`duplicate attachment path: ${rawPath}`);
    for (const existing of rawPaths) {
      if (existing.startsWith(`${rawPath}/`) || rawPath.startsWith(`${existing}/`)) {
        throw new Error(`file/directory attachment path conflict: ${existing} and ${rawPath}`);
      }
    }
    rawPaths.add(rawPath);
    if (!Number.isSafeInteger(input.size) || input.size < 0 || input.size > limits.maxFileBytes) {
      throw new Error(`file ${rawPath} has invalid or excessive size`);
    }
    totalBytes += input.size;
    if (totalBytes > limits.maxBatchBytes) throw new Error(`batch exceeds ${limits.maxBatchBytes} bytes`);
    let actualPath = parts.map(safeSegment).join('/');
    let collision = 1;
    const collisionKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
    const parentKeys = value => {
      const parts = value.split('/');
      return parts.slice(0, -1).map((_, index) => collisionKey(parts.slice(0, index + 1).join('/')));
    };
    while (allocatedFiles.has(collisionKey(actualPath)) || allocatedDirectories.has(collisionKey(actualPath))) {
      actualPath = appendCollisionSuffix(actualPath, collision++).split(sep).join('/');
    }
    const parents = parentKeys(actualPath);
    if (parents.some(parent => allocatedFiles.has(parent))) {
      throw new Error(`cross-platform filename mapping creates a file/directory conflict: ${rawPath}`);
    }
    allocatedFiles.add(collisionKey(actualPath));
    for (const parent of parents) allocatedDirectories.add(parent);
    rows.push({
      index,
      originalPath: rawPath,
      actualPath,
      size: input.size,
      type: typeof input.type === 'string' ? input.type.slice(0, 256) : '',
      lastModified: Number.isFinite(input.lastModified) ? Number(input.lastModified) : undefined,
    });
  }
  return { rows, totalBytes };
}

function ensureInside(root, target) {
  const rel = relative(root, target);
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) return;
  throw new Error(`resolved attachment path escapes its root: ${target}`);
}

function currentSession(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') throw new Error('sessionId is required');
  const session = ctx.sessions.get(sessionId);
  if (session === undefined) throw new Error(`live session not found: ${sessionId}`);
  const cwd = session.header.cwd;
  if (typeof cwd !== 'string' || cwd === '') throw new Error(`session has no workspace cwd: ${sessionId}`);
  return { session, cwd: resolve(cwd) };
}

async function writeRequest(req, target, expectedBytes) {
  await mkdir(dirname(target), { recursive: true });
  const handle = await open(target, 'wx');
  let received = 0;
  try {
    for await (const chunk of req) {
      received += chunk.length;
      if (received > expectedBytes) throw new Error('upload body exceeds declared file size');
      await handle.write(chunk);
    }
    if (received !== expectedBytes) {
      throw new Error(`upload body size mismatch: expected ${expectedBytes}, received ${received}`);
    }
    await handle.sync();
  } catch (cause) {
    await handle.close().catch(() => {});
    await rm(target, { force: true }).catch(() => {});
    throw cause;
  }
  await handle.close();
}

async function ownedSends(sessionRoot, expectedSessionId) {
  let entries;
  try {
    entries = await readdir(sessionRoot, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
  const owned = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.staging') continue;
    const directory = join(sessionRoot, entry.name);
    try {
      const marker = JSON.parse(await readFile(join(directory, OWNER_FILE), 'utf8'));
      if (marker?.owner === name && marker?.version === 1
        && (expectedSessionId === undefined || marker.sessionId === expectedSessionId)) {
        owned.push({
          directory,
          bytes: Number.isSafeInteger(marker.totalBytes) && marker.totalBytes >= 0
            ? marker.totalBytes
            : 0,
          files: Array.isArray(marker.files) ? marker.files.length : 0,
        });
      }
    } catch {
      // Unknown content is not ours and must survive cleanup.
    }
  }
  return owned;
}

function sessionAttachmentsRoot(cwd, sessionId) {
  return join(cwd, '.dsh', 'tmp', 'attachments', sessionDirectoryName(sessionId));
}

function workspaceAttachmentsRoot(cwd) {
  return join(cwd, '.dsh', 'tmp', 'attachments');
}

async function workspaceOwnedSends(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (cause) {
    if (cause?.code === 'ENOENT') return { sessionDirectories: 0, sends: [] };
    throw cause;
  }
  const sends = [];
  let sessionDirectories = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.staging') continue;
    const sessionRoot = join(root, entry.name);
    ensureInside(root, sessionRoot);
    const owned = await ownedSends(sessionRoot);
    if (owned.length === 0) continue;
    sessionDirectories += 1;
    sends.push(...owned);
  }
  return { sessionDirectories, sends };
}

function usageOf(owned) {
  return {
    sends: owned.length,
    files: owned.reduce((sum, row) => sum + row.files, 0),
    bytes: owned.reduce((sum, row) => sum + row.bytes, 0),
  };
}

export function apply(ctx, config = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(config.limits ?? {}) };
  const batches = new Map();

  const abortBatch = async (batch) => {
    batches.delete(batch.id);
    await rm(batch.stagingRoot, { force: true, recursive: true });
  };

  const route = async (req, res) => {
    const trustedHosts = sourceTrustedHosts(ctx);
    if (!trustedRequest(req, trustedHosts)) {
      error(res, 403, 'forbidden', 'request failed the DSH Host/Origin trust fence');
      return;
    }
    const url = new URL(req.url ?? '/', 'http://dsh.internal');
    const suffix = url.pathname.slice(API_ROOT.length);
    try {
      if (req.method === 'GET' && suffix === '/health') {
        json(res, 200, { ok: true, plugin: name, protocol: 1 });
        return;
      }

      if (req.method === 'POST' && suffix === '/batches') {
        const input = await readJson(req);
        const { cwd } = currentSession(ctx, input.sessionId);
        await access(cwd);
        const mapped = mapFiles(input.files, limits);
        const id = randomUUID();
        const sessionKey = sessionDirectoryName(input.sessionId);
        const attachmentsRoot = join(cwd, '.dsh', 'tmp', 'attachments');
        const stagingRoot = join(attachmentsRoot, '.staging', id);
        ensureInside(attachmentsRoot, stagingRoot);
        await mkdir(stagingRoot, { recursive: true });
        const batch = {
          id,
          sessionId: input.sessionId,
          sessionKey,
          cwd,
          attachmentsRoot,
          stagingRoot,
          files: mapped.rows,
          totalBytes: mapped.totalBytes,
          uploaded: new Set(),
          activeUploads: 0,
          createdAt: new Date().toISOString(),
        };
        batches.set(id, batch);
        json(res, 201, {
          ok: true,
          batchId: id,
          files: batch.files.map(file => ({ index: file.index, actualPath: file.actualPath })),
        });
        return;
      }

      const fileMatch = /^\/batches\/([^/]+)\/files\/(\d+)$/.exec(suffix);
      if (req.method === 'PUT' && fileMatch !== null) {
        const batch = batches.get(fileMatch[1]);
        if (batch === undefined) throw new Error('unknown or expired upload batch');
        currentSession(ctx, batch.sessionId);
        const index = Number(fileMatch[2]);
        const file = batch.files[index];
        if (file === undefined) throw new Error(`unknown file index ${index}`);
        if (batch.uploaded.has(index)) throw new Error(`file index ${index} was already uploaded`);
        if (batch.activeUploads >= limits.maxConcurrentUploads) {
          error(res, 429, 'too-many-uploads', 'too many concurrent attachment uploads');
          return;
        }
        const declared = Number(header(req.headers, 'content-length'));
        if (!Number.isSafeInteger(declared) || declared !== file.size) {
          throw new Error(`Content-Length must equal declared file size ${file.size}`);
        }
        const target = resolve(batch.stagingRoot, file.actualPath);
        ensureInside(batch.stagingRoot, target);
        batch.activeUploads += 1;
        try {
          await writeRequest(req, target, file.size);
          batch.uploaded.add(index);
        } finally {
          batch.activeUploads -= 1;
        }
        json(res, 200, { ok: true, index });
        return;
      }

      const commitMatch = /^\/batches\/([^/]+)\/commit$/.exec(suffix);
      if (req.method === 'POST' && commitMatch !== null) {
        const batch = batches.get(commitMatch[1]);
        if (batch === undefined) throw new Error('unknown or expired upload batch');
        currentSession(ctx, batch.sessionId);
        if (batch.activeUploads !== 0) throw new Error('uploads are still in progress');
        if (batch.uploaded.size !== batch.files.length) {
          throw new Error(`batch is incomplete: ${batch.uploaded.size}/${batch.files.length} files uploaded`);
        }
        const sendId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
        const sessionRoot = join(batch.attachmentsRoot, batch.sessionKey);
        const finalRoot = join(sessionRoot, sendId);
        ensureInside(batch.attachmentsRoot, finalRoot);
        const marker = {
          owner: name,
          version: 1,
          sessionId: batch.sessionId,
          createdAt: batch.createdAt,
          committedAt: new Date().toISOString(),
          totalBytes: batch.totalBytes,
          files: batch.files.map(({ index, originalPath, actualPath, size, type, lastModified }) => ({
            index, originalPath, actualPath, size, type, lastModified,
          })),
        };
        await writeFile(join(batch.stagingRoot, OWNER_FILE), `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx' });
        await mkdir(sessionRoot, { recursive: true });
        await rename(batch.stagingRoot, finalRoot);
        batches.delete(batch.id);
        json(res, 200, {
          ok: true,
          root: finalRoot,
          manifest: join(finalRoot, OWNER_FILE),
          files: batch.files.map(file => ({
            originalPath: file.originalPath,
            actualPath: file.actualPath,
            absolutePath: join(finalRoot, ...file.actualPath.split('/')),
            size: file.size,
          })),
        });
        return;
      }

      const abortMatch = /^\/batches\/([^/]+)$/.exec(suffix);
      if (req.method === 'DELETE' && abortMatch !== null) {
        const batch = batches.get(abortMatch[1]);
        if (batch !== undefined) await abortBatch(batch);
        json(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && suffix === '/usage/session') {
        const input = await readJson(req);
        const { cwd } = currentSession(ctx, input.sessionId);
        const owned = await ownedSends(sessionAttachmentsRoot(cwd, input.sessionId), input.sessionId);
        json(res, 200, {
          ok: true,
          ...usageOf(owned),
        });
        return;
      }

      if (req.method === 'POST' && suffix === '/usage/workspace') {
        const input = await readJson(req);
        const { cwd } = currentSession(ctx, input.sessionId);
        const owned = await workspaceOwnedSends(workspaceAttachmentsRoot(cwd));
        json(res, 200, {
          ok: true,
          sessionDirectories: owned.sessionDirectories,
          ...usageOf(owned.sends),
        });
        return;
      }

      if (req.method === 'POST' && suffix === '/cleanup/session') {
        const input = await readJson(req);
        const { cwd } = currentSession(ctx, input.sessionId);
        const root = sessionAttachmentsRoot(cwd, input.sessionId);
        const owned = await ownedSends(root, input.sessionId);
        for (const row of owned) {
          ensureInside(root, row.directory);
          await rm(row.directory, { force: true, recursive: true });
        }
        json(res, 200, {
          ok: true,
          deletedSends: owned.length,
          deletedFiles: owned.reduce((sum, row) => sum + row.files, 0),
          deletedBytes: owned.reduce((sum, row) => sum + row.bytes, 0),
        });
        return;
      }

      if (req.method === 'POST' && suffix === '/cleanup/workspace') {
        const input = await readJson(req);
        const { cwd } = currentSession(ctx, input.sessionId);
        const root = workspaceAttachmentsRoot(cwd);
        const owned = await workspaceOwnedSends(root);
        for (const row of owned.sends) {
          ensureInside(root, row.directory);
          await rm(row.directory, { force: true, recursive: true });
        }
        json(res, 200, {
          ok: true,
          deletedSessionDirectories: owned.sessionDirectories,
          deletedSends: owned.sends.length,
          deletedFiles: owned.sends.reduce((sum, row) => sum + row.files, 0),
          deletedBytes: owned.sends.reduce((sum, row) => sum + row.bytes, 0),
        });
        return;
      }

      error(res, 404, 'not-found', 'unknown attachment endpoint');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      error(res, 400, 'attachment-request-failed', message);
    }
  };

  ctx.effect(
    () => ctx.httpServer.register({ kind: 'prefix', path: API_ROOT, handler: route }),
    'dsh-multimedia-webui-input: upload route',
  );
  ctx.effect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const batch of batches.values()) {
        if (batch.activeUploads !== 0 || Date.parse(batch.createdAt) >= cutoff) continue;
        void abortBatch(batch).catch(cause => ctx.logger.warn(cause));
      }
    }, 10 * 60 * 1000);
    interval.unref?.();
    return () => clearInterval(interval);
  }, 'dsh-multimedia-webui-input: abandoned batch TTL');
  ctx.effect(() => async () => {
    const active = [...batches.values()];
    batches.clear();
    await Promise.all(active.map(batch => rm(batch.stagingRoot, { force: true, recursive: true })));
  }, 'dsh-multimedia-webui-input: staging cleanup');
}
