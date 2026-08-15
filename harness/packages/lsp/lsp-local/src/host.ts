/**
 * Host-filesystem source access for the local provider, using Node APIs directly in the
 * subprocess's namespace (never `ctx.fs`): only the LSP result is model-visible, so a query does not
 * satisfy read-before-write policy and emits no `fs/observed`. Canonicalization derives target
 * identity from `realpath`, so symlink aliases share a workspace; a source is rejected before server
 * startup when it is missing, non-regular, non-UTF-8, oversized, or canonically outside the
 * workspace. External result locations are allowed, but an external path can never become a query
 * source.
 * @module @deepseek-ai/dsh-lsp-local/host
 */

import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { isAbsolute, resolve as resolvePath, sep } from 'node:path'
import { throwIfAborted } from './abort.ts'

/** A validated source: its canonical absolute path and current UTF-8 text. */
export interface HostSource {
  /** The canonical (realpath-resolved) absolute path, inside the canonical workspace. */
  readonly canonicalPath: string
  /** The file's current text, read as UTF-8. */
  readonly text: string
}

/**
 * Canonicalize a workspace root: it must exist and be a directory. The returned realpath supplies
 * process cwd, `rootUri`, the sole `workspaceFolders` entry, and pool identity, so symlinked roots
 * collapse to one instance.
 * @param workspaceRoot - the caller's workspace root (absolute).
 * @param signal - optional cancellation observed around each filesystem operation.
 * @returns the canonical directory path.
 * @throws Error when the path is missing or not a directory.
 */
export async function canonicalizeWorkspace(workspaceRoot: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  let canonical: string
  try {
    canonical = await realpath(workspaceRoot)
  } catch (error) {
    throw new Error(`workspace root "${workspaceRoot}" cannot be resolved: ${messageOf(error)}`)
  }
  throwIfAborted(signal)
  const info = await stat(canonical)
  throwIfAborted(signal)
  if (!info.isDirectory()) {
    throw new Error(`workspace root "${workspaceRoot}" is not a directory`)
  }
  return canonical
}

/**
 * Resolve, canonicalize, validate, and read a query source in one pass. A relative `filePath`
 * resolves against `canonicalWorkspace`; an absolute one is taken directly. The canonical target
 * must be a regular UTF-8 file no larger than `maxDocumentBytes`, and must lie inside the canonical
 * workspace.
 * @param filePath - the model-supplied source path (relative or absolute).
 * @param canonicalWorkspace - the already-canonicalized workspace root.
 * @param maxDocumentBytes - the largest source this host will open.
 * @param signal - optional cancellation observed throughout resolution, validation, and reading.
 * @returns the canonical path and current UTF-8 text.
 * @throws Error when the source is missing, non-regular, oversized, non-UTF-8, or out of workspace.
 */
export async function readHostSource(
  filePath: string,
  canonicalWorkspace: string,
  maxDocumentBytes: number,
  signal?: AbortSignal,
): Promise<HostSource> {
  throwIfAborted(signal)
  const requested = isAbsolute(filePath) ? filePath : resolvePath(canonicalWorkspace, filePath)
  let canonicalPath: string
  try {
    canonicalPath = await realpath(requested)
  } catch (error) {
    throw new Error(`source "${filePath}" cannot be resolved: ${messageOf(error)}`)
  }
  throwIfAborted(signal)
  if (!isInside(canonicalWorkspace, canonicalPath)) {
    throw new Error(`source "${filePath}" resolves outside the workspace`)
  }
  // Open ONE handle after containment, then stat and read through it: a concurrent replace between
  // realpath and read cannot swap the target, so the regular-file and size checks bind the bytes we
  // actually read (no path-based TOCTOU). O_NOFOLLOW rejects the final component being swapped for a
  // symlink between realpath and open (which would otherwise escape the workspace).
  // O_NONBLOCK prevents a FIFO with no writer from hanging before fstat can reject it as nonregular.
  const handle = await open(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    throwIfAborted(signal)
    const info = await handle.stat()
    throwIfAborted(signal)
    if (!info.isFile()) {
      throw new Error(`source "${filePath}" is not a regular file`)
    }
    if (info.size > maxDocumentBytes) {
      throw new Error(`source "${filePath}" is ${info.size} bytes, over the ${maxDocumentBytes}-byte limit`)
    }
    // Bound the read to the cap even if the file grew after stat: read one extra byte and reject on
    // overflow, so a concurrent grow cannot defeat the memory bound.
    const buffer = await readCapped(handle, maxDocumentBytes, filePath, signal)
    const text = decodeUtf8Strict(buffer, filePath)
    throwIfAborted(signal)
    return { canonicalPath, text }
  } finally {
    await handle.close()
  }
}

/** Read at most `maxBytes` from the handle, rejecting when the source overflows the cap. */
async function readCapped(
  handle: FileHandle,
  maxBytes: number,
  filePath: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  const limit = maxBytes + 1
  const chunk = Buffer.allocUnsafe(limit)
  let total = 0
  for (;;) {
    throwIfAborted(signal)
    const { bytesRead } = await handle.read(chunk, total, limit - total, total)
    throwIfAborted(signal)
    if (bytesRead === 0) break
    total += bytesRead
    /* v8 ignore next 3 -- overflow requires the file to grow past the cap between stat and read (a concurrent mutation); defensive. */
    if (total > maxBytes) {
      throw new Error(`source "${filePath}" grew past the ${maxBytes}-byte limit while reading`)
    }
  }
  return chunk.subarray(0, total)
}

/** Whether `child` is the workspace itself or a descendant of it (both already canonical). */
function isInside(workspace: string, child: string): boolean {
  if (child === workspace) return true
  /* v8 ignore next -- a canonical non-root workspace never ends with a separator; the guard covers the filesystem root. */
  const base = workspace.endsWith(sep) ? workspace : workspace + sep
  return child.startsWith(base)
}

/** Decode strictly as UTF-8: a fatal decoder rejects only malformed bytes, keeping a legitimate U+FFFD. */
function decodeUtf8Strict(buffer: Buffer, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error(`source "${filePath}" is not valid UTF-8 text`)
  }
}

/** Extract a message from an unknown thrown value without leaking `any`. */
function messageOf(error: unknown): string {
  /* v8 ignore next -- Node fs rejections are always Error instances; the String() fallback is defensive. */
  return error instanceof Error ? error.message : String(error)
}
