/**
 * State snapshot files (#17, §22.2): `plugin-state/<profile>/<id>/<gen>.state.json`
 * with temp-write + rename atomicity, sha256 + byte metadata for the status
 * row, hash-verified reads (a mismatch means "no snapshot" + warn), and boot
 * GC over orphan files. Snapshots are JSON-serializable by contract (§4-3/4),
 * so the file content is the JSON text of the captured state.
 * @module @r05en1cu/dsh-mygo/src/snapshots
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Snapshot pointer stored on the status row (§22.2). */
export interface SnapshotMeta {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

/**
 * Snapshot file manager. All paths are absolute; `root` is the per-profile
 * snapshot directory (`<stateRoot>/<profile>`).
 */
export class SnapshotStore {
  /**
   * @param root - per-profile snapshot directory.
   */
  constructor(private readonly root: string) {}

  private fileFor(id: string, gen: number): string {
    return join(this.root, id, `${gen}.state.json`)
  }

  /**
   * Durably write one generation's snapshot: temp file in the same directory,
   * then rename over the target (T3 rule 4: rename precedes the status row).
   * @param id - plugin id.
   * @param gen - generation number.
   * @param state - JSON-serializable captured state.
   * @returns the pointer metadata for the status row.
   */
  async write(id: string, gen: number, state: unknown): Promise<SnapshotMeta> {
    const dir = join(this.root, id)
    await mkdir(dir, { recursive: true })
    const json = JSON.stringify(state)
    const bytes = new TextEncoder().encode(json).length
    const sha256 = createHash('sha256').update(json).digest('hex')
    const target = this.fileFor(id, gen)
    const temp = join(dir, `.${gen}.${Math.random().toString(36).slice(2)}.tmp`)
    await writeFile(temp, json, { mode: 0o600 })
    await rename(temp, target)
    return { path: target, bytes, sha256 }
  }

  /**
   * Read one snapshot. A missing file, an unparsable file, or a hash/byte
   * mismatch against `expected` yields `undefined` (T4-7: treated as no
   * snapshot); a mismatch additionally reports through `warn`.
   * @param id - plugin id.
   * @param gen - generation number.
   * @param expected - status-row pointer to verify against.
   * @param warn - warning surface (engine logger).
   * @returns the parsed state, or `undefined`.
   */
  async read(
    id: string,
    gen: number,
    expected: SnapshotMeta | undefined,
    warn: (message: string) => void,
  ): Promise<unknown> {
    const file = this.fileFor(id, gen)
    let raw: Buffer
    try {
      raw = await readFile(file)
    } catch {
      return undefined
    }
    const text = raw.toString()
    if (expected !== undefined) {
      const sha256 = createHash('sha256').update(text).digest('hex')
      if (raw.length !== expected.bytes || sha256 !== expected.sha256) {
        warn(`plugin ${id} snapshot ${gen} failed its hash check; treating it as no snapshot`)
        return undefined
      }
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      warn(`plugin ${id} snapshot ${gen} is not valid JSON; treating it as no snapshot`)
      return undefined
    }
  }

  /**
   * Delete one generation's snapshot; absent file is a no-op.
   * @param id - plugin id.
   * @param gen - generation number.
   */
  async delete(id: string, gen: number): Promise<void> {
    try {
      await unlink(this.fileFor(id, gen))
    } catch {
      // Absent snapshot: nothing to delete.
    }
  }

  /**
   * Delete every snapshot of one plugin (uninstall path).
   * @param id - plugin id.
   */
  async deleteAll(id: string): Promise<void> {
    await rm(join(this.root, id), { recursive: true, force: true })
  }

  /**
   * Boot GC: remove snapshot files whose `id/gen` is not in `keep`, then
   * remove directories left empty. Orphan files have no status-row pointer.
   * @param keep - relative keys `id/gen` still referenced by status rows.
   * @returns the number of removed files.
   */
  async gc(keep: ReadonlySet<string>): Promise<number> {
    let removed = 0
    for (const id of await this.listIds()) {
      const dir = join(this.root, id)
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.state.json')) continue
        const gen = name.slice(0, -'.state.json'.length)
        if (keep.has(`${id}/${gen}`)) continue
        await unlink(join(dir, name))
        removed += 1
      }
      try {
        await rm(dir, { recursive: false })
      } catch {
        // Directory not empty: keep it.
      }
    }
    return removed
  }

  /**
   * Relative snapshot keys `id/gen` currently on disk.
   * @returns every key found, in deterministic order.
   */
  async listKeys(): Promise<readonly string[]> {
    const keys: string[] = []
    for (const id of await this.listIds()) {
      const dir = join(this.root, id)
      for (const name of await readdir(dir)) {
        if (name.endsWith('.state.json')) keys.push(`${id}/${name.slice(0, -'.state.json'.length)}`)
      }
    }
    return keys.sort()
  }

  private async listIds(): Promise<readonly string[]> {
    try {
      return (await readdir(this.root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
    } catch {
      return []
    }
  }
}
