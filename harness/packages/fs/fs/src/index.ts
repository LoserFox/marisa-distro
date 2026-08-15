/**
 * Filesystem text-storage provider seam. Backends own stable target identity,
 * text decoding, binary rejection, and atomic mutations. Read windows and
 * observed-state policy stay in consumer and policy plugins; `editText` remains
 * here so version check, literal match, and rewrite share one critical section.
 * @module @deepseek-ai/dsh-fs
 */

import { Context, Service } from 'cordis'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsVersion,
  FsWriteIntent,
  FsWriteOutcome,
} from './types.ts'

export {
  FsError,
  FsTargetKey,
  FsVersion,
} from './types.ts'
export type {
  FsEditOutcome,
  FsEditRequest,
  FsDirEntry,
  FsErrorCode,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from './types.ts'

declare module 'cordis' {
  interface Context {
    fs: FileSystem
  }

  interface Events {
    /**
     * Single-slot decision for the next {@link FileSystem.writeText}. Calling
     * `next()` yields the bare provider's unconditional write; the first listener
     * that returns an intent owns the decision rather than composing with peers.
     * @param target - the resolved target about to be written.
     * @param actor - the opaque tool-execution context the decider keys off.
     * @mode waterfall
     */
    'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
    /**
     * Single-slot decision for the next {@link FileSystem.editText}. Calling
     * `next()` yields an unconditional edit; the first returned guard wins.
     * @param target - the resolved target about to be edited.
     * @param actor - the opaque tool-execution context the decider keys off.
     * @mode waterfall
     */
    'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
    /**
     * Record a successful observation. Listeners must be synchronous recorders:
     * throws fail the tool call and returned promises are not awaited.
     * @param target - the target that was read/written/edited.
     * @param version - the version the actor now holds as its observation.
     * @param actor - the observing tool-execution context; undefined records nothing useful.
     * @mode emit
     */
    'fs/observed'(target: FsTarget, version: FsVersion, actor: object | undefined): void
  }
}

/**
 * Abstract filesystem provider. Targets must preserve identity across aliases;
 * reads expose regular UTF-8 text or typed errors, listings are stable and
 * content-free, and mutations are atomic. Optional guards add stale protection
 * without changing the unguarded provider contract.
 */
export abstract class FileSystem extends Service {
  constructor(ctx: Context) {
    super(ctx, 'fs')
  }

  /**
  /**
   * The sandbox mode this backend enforces on mutations BY DEFAULT, or
   * `undefined` when it does not confine at all — the capability fact the tool
   * layer reads to advertise the escalation fields honestly (mirrors
   * `BashExecutor.sandboxMode`). The base class and the bare local backend
   * report `undefined`; a sandboxing backend (`@deepseek-ai/dsh-fs-sandbox`)
   * overrides it with the deployment default. A session override may make the
   * effective mode narrower or wider, so strict escalation widening is checked
   * per call rather than encoded in this default-relative fact.
   * @returns the configured default mode of a sandboxing backend; `undefined`
   *   for a backend that never confines.
   */
  get sandboxMode(): SandboxMode | undefined {
    return undefined
  }

  /**
   * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
   * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
   * async even though the local backend only normalizes + realpaths.
   *
   * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
   * @param opts - optional cwd override and cancellation signal.
   * @returns the stable target; the same file yields the same `targetKey`.
   */
  abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

  /**
   * Return target metadata, or `undefined` when the target does not exist.
   * @param target - the resolved target to stat.
   * @param signal - aborts the metadata round-trip.
   * @returns metadata only, never content; undefined for an absent target.
   */
  abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

  /**
   * Return path metadata without following the final path component when it is a
   * symbolic link. This is intentionally path-shaped, not target-shaped:
   * {@link resolve} follows symlinks to produce the stable identity used by
   * normal reads/writes, while `lstat` lets a consumer reject the path itself
   * before that follow happens.
   *
   * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
   * absent.
   * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
   * @param opts - `cwd` overrides the backend's default base for relative paths.
   * @param signal - aborts the metadata round-trip.
   * @returns metadata only, never content; undefined for an absent path.
   */
  abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

  /**
   * Read the whole regular text file as a single decoded string.
   * @param target - the resolved target to read.
   * @param signal - aborts the read.
   * @returns the full decoded UTF-8 content.
   */
  abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

  /**
   * Stream the whole regular text file as decoded text chunks (same text
   * semantics as {@link readText}, for large files). The backend owns
   * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
   * touches raw bytes.
   * @param target - the resolved target to read.
   * @param signal - aborts the stream, including between chunks.
   * @returns the chunk iterable, decoded and validated like {@link readText}.
   */
  abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

  /**
   * List direct children of a directory in stable name order. Returns resolved
   * child targets plus cheap metadata only; never reads file contents.
   * @param target - the resolved directory target.
   * @param signal - aborts the listing.
   * @returns one entry per direct child, in stable name order.
   */
  abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

  /**
   * Atomically create or replace UTF-8 text. `expected` guards intent and
   * staleness; omission allows unconditional overwrite.
   * @param target - the resolved target to write.
   * @param content - the full new file content.
   * @param expected - the write intent guarding the write; omit for unconditional.
   * @param signal - aborts before the atomic rename takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root this write
   *   runs under; a sandboxing backend fences the write by it, the bare backend
   *   ignores it. Omit to leave the backend its own default.
   * @returns the outcome, including the version the write produced.
   */
  abstract writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome>

  /**
   * Atomically edit literal text. When supplied, the version guard is checked
   * before matching so stale content reports `FS_STALE_VERSION`; omission edits
   * the current content without a freshness precondition.
   * @param target - the resolved target to edit.
   * @param edit - the literal search/replace request.
   * @param expected - the version guard; omit for an unconditional edit.
   * @param signal - aborts before the atomic rename takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root this edit runs
   *   under; a sandboxing backend fences the edit by it, the bare backend
   *   ignores it. Omit to leave the backend its own default.
   * @returns the outcome, including the version the edit produced.
   */
  abstract editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome>
}

export default FileSystem
