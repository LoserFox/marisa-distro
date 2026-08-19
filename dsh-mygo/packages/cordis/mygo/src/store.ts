/**
 * Registry persistence seam (#15 T3 write ordering; #17 supplies the sqlite
 * implementation of this same surface). Rows follow §22.1: write-once
 * `gens` records plus a small `status` record per plugin, both opaque TEXT
 * carrying `v: 1` record versions. The engine owns the ordering rules —
 * dependency records before pointers, status before/after runtime commit per
 * class — so a crash between writes leaves a state boot recovery can read.
 * @module @r05en1cu/dsh-mygo/src/store
 */

import type { InstallOrigin, PluginDefinition, PluginSource } from '@r05en1cu/dsh-mygo-api'

/** One immutable generation record (§22.1 `gens` row). */
export interface GenerationRecord {
  /** Record version; unknown versions quarantine the row at recovery. */
  readonly v: 1
  /** Source the generation came from. */
  readonly source: PluginSource | { readonly type: 'static' }
  /** Validated manifest. */
  readonly manifest: PluginDefinition
  /** Config validated against the manifest schema. */
  readonly resolvedConfig: unknown
}

/** Provenance facts recorded with each status row (§20/T4-4). */
export interface ProvenanceRecord {
  readonly origin: 'static' | InstallOrigin
  readonly mountedAt: number
}

/** One status row (§22.1). */
export interface StatusRecord {
  /** Record version; unknown versions quarantine the row at recovery. */
  readonly v: 1
  /** Current live generation number. */
  readonly currentGen: number
  /** Previous generation number, when retained in history. */
  readonly previousGen: number | null
  /** Lifecycle status; `quarantined`/`shadowed` carry a §16.3 reason. */
  readonly status: 'enabled' | 'disabled' | 'quarantined' | 'shadowed' | 'uninstalled'
  /** §16.3 recovery reason when the status is not `enabled`. */
  readonly reason?: string
  /** Durable state-snapshot pointer (§22.2); written after the file rename. */
  readonly snapshot?: { readonly path: string; readonly bytes: number; readonly sha256: string }
  /** Tool names owned by an uninstalled plugin (persisted uninstall tombstone). */
  tools?: readonly string[]
  readonly provenance: ProvenanceRecord
}

/** The persistence surface the lifecycle engine commits through. */
export interface RegistryStore {
  /** All plugin ids with at least one row. */
  listIds(): Promise<readonly string[]>
  /** Read one plugin's generation records, newest first. */
  readGenerations(id: string): Promise<readonly { readonly gen: number; readonly record: GenerationRecord }[]>
  /** Write one immutable generation record (T3: before the status pointer). */
  writeGeneration(id: string, gen: number, record: GenerationRecord): Promise<void>
  /** Delete one generation record (history trim / boot GC). */
  deleteGeneration(id: string, gen: number): Promise<void>
  /** Read one plugin's status row. */
  readStatus(id: string): Promise<StatusRecord | undefined>
  /** Write a status row; this is the pointer write. */
  writeStatus(id: string, record: StatusRecord): Promise<void>
  /** Delete every row of a plugin (T3 delete-class: persist before runtime). */
  deletePlugin(id: string): Promise<void>
  /** Durable-row estimate for the T6 registry quotas. */
  usage(): Promise<{ readonly rows: number; readonly bytes: number }>
  /**
   * Optional backend self-check (round-trip smoke). External stores implement
   * it so schema drift is detected at manager init instead of mid-recovery.
   */
  check?(): Promise<void>
}

/** In-memory registry store for #15 tests and the failure-injection report. */
export class InMemoryRegistryStore implements RegistryStore {
  private readonly generations = new Map<string, Map<number, GenerationRecord>>()
  private readonly statuses = new Map<string, StatusRecord>()
  /** Fail the next N writes of the named table (crash/persist-failure injection). */
  private failNext = new Map<'gens' | 'status' | 'delete', number>()
  /** Crash the next N writes of the named table AFTER durability (power-loss injection). */
  private crashNext = new Map<'gens' | 'status' | 'delete', number>()

  /**
   * Inject a write failure: the next `count` writes of a table reject.
   * @param table - table to fail.
   * @param count - number of consecutive writes to fail.
   */
  fail(table: 'gens' | 'status' | 'delete', count = 1): void {
    this.failNext.set(table, count)
  }

  /**
   * Inject a power loss after the next `count` writes of a table: the write
   * lands (durable) and the call then rejects, simulating a process death
   * right after that write's durability point (T3 crash matrix).
   * @param table - table whose next write crashes.
   * @param count - number of consecutive writes to crash after.
   */
  crashAfter(table: 'gens' | 'status' | 'delete', count = 1): void {
    this.crashNext.set(table, count)
  }

  /**
   * A deep copy of every row, simulating the durable bytes after a crash.
   * @returns deep-copied generation and status maps.
   */
  snapshot(): { readonly generations: Map<string, Map<number, GenerationRecord>>; readonly statuses: Map<string, StatusRecord> } {
    return {
      generations: new Map([...this.generations].map(([id, gens]) => [id, new Map(gens)])),
      statuses: new Map(this.statuses),
    }
  }

  listIds(): Promise<readonly string[]> {
    return Promise.resolve([...new Set([...this.generations.keys(), ...this.statuses.keys()])].sort())
  }

  readGenerations(id: string): Promise<readonly { readonly gen: number; readonly record: GenerationRecord }[]> {
    return Promise.resolve([...(this.generations.get(id) ?? [])]
      .map(([gen, record]) => ({ gen, record }))
      .sort((left, right) => right.gen - left.gen))
  }

  async writeGeneration(id: string, gen: number, record: GenerationRecord): Promise<void> {
    await this.consumeFailure('gens')
    const gens = this.generations.get(id) ?? new Map<number, GenerationRecord>()
    gens.set(gen, record)
    this.generations.set(id, gens)
    await this.consumeCrash('gens')
  }

  async deleteGeneration(id: string, gen: number): Promise<void> {
    const gens = this.generations.get(id)
    if (gens !== undefined) {
      gens.delete(gen)
      if (gens.size === 0) this.generations.delete(id)
    }
    await this.consumeCrash('gens')
  }

  readStatus(id: string): Promise<StatusRecord | undefined> {
    return Promise.resolve(this.statuses.get(id))
  }

  async writeStatus(id: string, record: StatusRecord): Promise<void> {
    await this.consumeFailure('status')
    this.statuses.set(id, record)
    await this.consumeCrash('status')
  }

  async deletePlugin(id: string): Promise<void> {
    await this.consumeFailure('delete')
    this.generations.delete(id)
    this.statuses.delete(id)
    await this.consumeCrash('delete')
  }

  usage(): Promise<{ readonly rows: number; readonly bytes: number }> {
    let rows = 0
    let bytes = 0
    const measure = (value: unknown): void => {
      rows += 1
      bytes += new TextEncoder().encode(JSON.stringify(value)).length
    }
    for (const [id, gens] of this.generations) {
      for (const [gen, record] of gens) measure({ id, gen, record })
    }
    for (const [id, status] of this.statuses) measure({ id, status })
    return Promise.resolve({ rows, bytes })
  }

  /** In-memory backend self-check: always passes. */
  async check(): Promise<void> {}

  private consumeFailure(table: 'gens' | 'status' | 'delete'): Promise<void> {
    const remaining = this.failNext.get(table) ?? 0
    if (remaining <= 0) return Promise.resolve()
    if (remaining === 1) this.failNext.delete(table)
    else this.failNext.set(table, remaining - 1)
    return Promise.reject(new Error(`${table} write failed (injected)`))
  }

  private consumeCrash(table: 'gens' | 'status' | 'delete'): Promise<void> {
    const remaining = this.crashNext.get(table) ?? 0
    if (remaining <= 0) return Promise.resolve()
    if (remaining === 1) this.crashNext.delete(table)
    else this.crashNext.set(table, remaining - 1)
    return Promise.reject(new Error(`power loss after ${table} write (injected)`))
  }
}
