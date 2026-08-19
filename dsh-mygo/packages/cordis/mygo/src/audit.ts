/**
 * Deployment audit stream (#17, T5): append-only JSONL at
 * `plugin-state/<profile>/audit.jsonl`, 0o600, rotated by
 * `auditMaxBytes` × `auditKeepFiles`. Entries follow §22.3; readers tolerate
 * unknown fields and a truncated final line. The writer is the manager's
 * single choke point — `PluginEnv` never exposes it.
 * @module @r05en1cu/dsh-mygo/src/audit
 */

import { appendFile, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/** Audit entry classes (§22.3 closed set). */
export const AUDIT_CLASSES = [
  'mount',
  'veto',
  'quota',
  'grant-change',
  'provenance',
  'quarantine',
  'shadow',
  'boot-gc',
  'cross-process-resurrect',
  'veto-suppressed',
  'intercept-skipped',
  'state-rejected',
] as const

/** Closed audit class set (§22.3): every durable class the rotation can record. */
export type AuditClass = (typeof AUDIT_CLASSES)[number]

/** One audit entry (§22.3 schema; readers tolerate extra fields). */
export interface AuditEntry {
  readonly v: 1
  readonly ts: number
  readonly profile: string
  readonly class: AuditClass
  readonly plugin?: { readonly id: string; readonly version: string; readonly gen: number }
  readonly actor: 'model' | 'operator' | 'system'
  readonly reason?: string
  readonly details?: Record<string, unknown>
  readonly session?: string
}

/** Input accepted by {@link AuditLog.append}; `v`/`ts`/`profile` are filled in. */
export type AuditInput = Omit<AuditEntry, 'v' | 'ts' | 'profile'> & { readonly ts?: number }

/**
 * Append-only JSONL audit log with bounded rotation. Write ordering is
 * audit-after-commit (T5-5): callers append only after the operation's
 * commit point, so a crash between commit and audit produces a gap, never a
 * false positive.
 */
export class AuditLog {
  private readonly current: string

  /**
   * @param dir - per-profile state directory (`<stateRoot>/<profile>`).
   * @param profile - profile name stamped on every entry.
   * @param maxBytes - rotation threshold for one file (`auditMaxBytes`).
   * @param keepFiles - rotated files retained including the current one.
   */
  constructor(
    private readonly dir: string,
    private readonly profile: string,
    private readonly maxBytes: number,
    private readonly keepFiles: number,
  ) {
    this.current = join(dir, 'audit.jsonl')
  }

  /**
   * Append one entry durably. Rotates first when the current file would
   * exceed `maxBytes`.
   * @param entry - entry without the filled `v`/`ts`/`profile` fields.
   */
  async append(entry: AuditInput): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const line = `${JSON.stringify({ v: 1, ts: entry.ts ?? Date.now(), profile: this.profile, ...entry })}\n`
    if (await this.sizeOf(this.current) + Buffer.byteLength(line) > this.maxBytes) {
      await this.rotate()
    }
    await appendFile(this.current, line, { mode: 0o600 })
  }

  /**
   * Entries with `ts >= since`, oldest first, across all retained files.
   * @param since - lower timestamp bound (inclusive, epoch millis).
   * @returns matching entries in chronological order.
   */
  async since(since: number): Promise<readonly AuditEntry[]> {
    return (await this.readAll()).filter(entry => entry.ts >= since)
  }

  /**
   * Entries naming one plugin, oldest first.
   * @param id - plugin id to filter by.
   * @returns matching entries in chronological order.
   */
  async byPlugin(id: string): Promise<readonly AuditEntry[]> {
    return (await this.readAll()).filter(entry => entry.plugin?.id === id)
  }

  /**
   * The last `count` entries across all retained files, oldest first.
   * @param count - number of most recent entries to return.
   * @returns the tail slice in chronological order.
   */
  async tail(count: number): Promise<readonly AuditEntry[]> {
    return (await this.readAll()).slice(-count)
  }

  private async rotate(): Promise<void> {
    for (let index = this.keepFiles - 2; index >= 1; index -= 1) {
      const from = `${this.current}.${index}`
      const to = `${this.current}.${index + 1}`
      try {
        await rename(from, to)
      } catch {
        // Absent rotated file: nothing to shift.
      }
    }
    const last = `${this.current}.${this.keepFiles}`
    try {
      await unlink(last)
    } catch {
      // No file beyond the retention window.
    }
    try {
      await rename(this.current, `${this.current}.1`)
    } catch {
      // Current file absent: nothing to rotate.
    }
  }

  private async readAll(): Promise<readonly AuditEntry[]> {
    const entries: AuditEntry[] = []
    const files: string[] = [this.current]
    for (let index = 1; index < this.keepFiles; index += 1) files.push(`${this.current}.${index}`)
    for (const file of files) {
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (line.length === 0) continue
        try {
          entries.push(JSON.parse(line) as AuditEntry)
        } catch {
          // Malformed or truncated tail line: tolerated by the reader.
        }
      }
    }
    return entries
  }

  private async sizeOf(file: string): Promise<number> {
    try {
      return (await stat(file)).size
    } catch {
      return 0
    }
  }
}
