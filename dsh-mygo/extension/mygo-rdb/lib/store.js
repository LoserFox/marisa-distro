/**
 * Backend-agnostic mygo registry store over rdb (SQLite / PostgreSQL).
 *
 * Mirrors `SqliteRegistryStore` semantics exactly: `status` rows keyed by
 * plugin id, `gens` rows keyed `<id>/<gen>`, values are opaque JSON carrying
 * `v: 1` record versions. Damaged rows surface as `RegistryRowError` so boot
 * recovery quarantines them; unknown record versions quarantine at recovery.
 * Both dialects share the same DDL and parameterized queries.
 *
 * The manager resolves this store through the `mygoRegistryStore` host service
 * (see `store-provider.js`); the core only depends on `RegistryStore`.
 */

import { DatabaseSync } from 'node:sqlite'
import {
  parseGenerationRecord,
  parseStatusRecord,
  RegistryRowError,
} from '@deepseek-ai/dsh-mygo'

const SCHEMA_VERSION = 1
const META_TABLE = 't_mygo_meta'
const STATUS_TABLE = 't_mygo_status'
const GENS_TABLE = 't_mygo_gens'
const AUDIT_TABLE = 't_mygo_audit'
const AUDIT_KEEP = 5000

function createTable(table) {
  return `CREATE TABLE IF NOT EXISTS ${table} (k TEXT PRIMARY KEY, v TEXT NOT NULL)`
}

function upsert(table) {
  return `INSERT INTO ${table} (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`
}

/** Rewrite `?` placeholders to PostgreSQL `$n` when needed. */
function pgParams(sql, params) {
  let index = 0
  const rewritten = sql.replace(/\?/g, () => `$${++index}`)
  return [rewritten, params]
}

/** Create one rdb registry store; `open()` is idempotent and awaited by every op. */
export function createRdbRegistryStore(config) {
  return new RdbRegistryStore(config)
}

/** rdb registry store over `node:sqlite` (type sqlite) or `pg` (type postgres). */
export class RdbRegistryStore {
  constructor(config) {
    this.config = config
    this.sqlite = null
    this.pool = null
    this.ready = this.open()
  }

  async open() {
    if (this.config.type === 'sqlite') {
      this.sqlite = new DatabaseSync(this.config.path)
      this.sqlite.exec('PRAGMA journal_mode = WAL')
      for (const table of [META_TABLE, STATUS_TABLE, GENS_TABLE]) {
        this.sqlite.exec(createTable(table))
      }
      this.sqlite.exec(`CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, entry TEXT NOT NULL)`)
      this.sqlite.prepare(upsert(META_TABLE)).run('schema_version', String(SCHEMA_VERSION))
      return
    }
    const { Pool } = await import('pg')
    this.pool = new Pool({ connectionString: this.config.connectionString })
    for (const table of [META_TABLE, STATUS_TABLE, GENS_TABLE]) {
      await this.pool.query(createTable(table))
    }
    await this.pool.query(`CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (id SERIAL PRIMARY KEY, ts BIGINT NOT NULL, entry TEXT NOT NULL)`)
    const [sqlText, values] = pgParams(upsert(META_TABLE), ['schema_version', String(SCHEMA_VERSION)])
    await this.pool.query(sqlText, values)
  }

  async exec(sql, params = []) {
    await this.ready
    if (this.sqlite !== null) {
      this.sqlite.prepare(sql).run(...params)
      return
    }
    const [sqlText, values] = pgParams(sql, params)
    await this.pool.query(sqlText, values)
  }

  async all(sql, params = []) {
    await this.ready
    if (this.sqlite !== null) {
      return this.sqlite.prepare(sql).all(...params)
    }
    const [sqlText, values] = pgParams(sql, params)
    return (await this.pool.query(sqlText, values)).rows
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params)
    return rows[0]
  }

  async listIds() {
    const rows = await this.all(
      `SELECT k FROM ${STATUS_TABLE} UNION SELECT k FROM ${GENS_TABLE}`,
    )
    const ids = new Set()
    for (const row of rows) {
      const key = String(row.k)
      const slash = key.lastIndexOf('/')
      ids.add(slash > 0 ? key.slice(0, slash) : key)
    }
    return [...ids].sort()
  }

  async readGenerations(id) {
    const rows = await this.all(
      `SELECT k, v FROM ${GENS_TABLE} WHERE k LIKE ?`,
      [`${id}/%`],
    )
    const entries = []
    const prefix = `${id}/`
    for (const row of rows) {
      const key = String(row.k)
      if (!key.startsWith(prefix)) continue
      const gen = Number(key.slice(prefix.length))
      if (!Number.isInteger(gen)) continue
      entries.push({ gen, record: parseGenerationRecord(String(row.v), id, gen) })
    }
    return entries.sort((left, right) => right.gen - left.gen)
  }

  async writeGeneration(id, gen, record) {
    await this.exec(upsert(GENS_TABLE), [`${id}/${gen}`, JSON.stringify(record)])
  }

  async deleteGeneration(id, gen) {
    await this.exec(`DELETE FROM ${GENS_TABLE} WHERE k = ?`, [`${id}/${gen}`])
  }

  async readStatus(id) {
    const row = await this.get(`SELECT v FROM ${STATUS_TABLE} WHERE k = ?`, [id])
    if (row === undefined) return undefined
    return parseStatusRecord(String(row.v), id)
  }

  async writeStatus(id, record) {
    await this.exec(upsert(STATUS_TABLE), [id, JSON.stringify(record)])
  }

  /** Raw row import (migration): upsert one stored value without parsing. */
  async importRawStatus(key, value) {
    await this.exec(upsert(STATUS_TABLE), [String(key), String(value)])
  }

  /** Raw row import (migration): upsert one stored generation without parsing. */
  async importRawGeneration(key, value) {
    await this.exec(upsert(GENS_TABLE), [String(key), String(value)])
  }

  async deletePlugin(id) {
    await this.exec(`DELETE FROM ${STATUS_TABLE} WHERE k = ?`, [id])
    await this.exec(`DELETE FROM ${GENS_TABLE} WHERE k LIKE ?`, [`${id}/%`])
  }

  async usage() {
    const rows = await this.all(
      `SELECT 'status' AS kind, count(*) AS rows, sum(length(v)) AS bytes FROM ${STATUS_TABLE}
       UNION ALL
       SELECT 'gens' AS kind, count(*) AS rows, sum(length(v)) AS bytes FROM ${GENS_TABLE}`,
    )
    let rowCount = 0
    let byteCount = 0
    for (const row of rows) {
      rowCount += Number(row.rows ?? 0)
      byteCount += Number(row.bytes ?? 0)
    }
    return { rows: rowCount, bytes: byteCount }
  }

  /** Round-trip smoke: write a heartbeat marker and read it back. */
  async check() {
    const marker = JSON.stringify({ ts: Date.now(), nonce: String(Math.random()) })
    await this.exec(upsert(META_TABLE), ['__check', marker])
    const row = await this.get(`SELECT v FROM ${META_TABLE} WHERE k = '__check'`)
    if (row === undefined || String(row.v) !== marker) {
      throw new Error('round-trip mismatch on registry backend marker')
    }
  }

  /** Whether a previous sqlite→rdb migration marker exists. */
  async migrationMarked() {
    const row = await this.get(`SELECT v FROM ${META_TABLE} WHERE k = 'migrated_from_sqlite'`)
    return row !== undefined
  }

  /** Record that the sqlite→rdb migration ran. */
  async markMigrated() {
    await this.exec(
      upsert(META_TABLE),
      ['migrated_from_sqlite', JSON.stringify({ ts: Date.now(), from: 'sqlite' })],
    )
  }

  /** Append one audit entry; rows beyond the retention window are pruned. */
  async appendAudit(entry) {
    await this.exec(`INSERT INTO ${AUDIT_TABLE} (ts, entry) VALUES (?, ?)`, [Date.now(), JSON.stringify(entry)])
    const rows = await this.all(`SELECT count(*) AS n FROM ${AUDIT_TABLE}`)
    const count = Number(rows[0]?.n ?? 0)
    if (count <= AUDIT_KEEP) return
    const cutoff = await this.get(`SELECT id FROM ${AUDIT_TABLE} ORDER BY id DESC LIMIT 1 OFFSET ${AUDIT_KEEP}`)
    if (cutoff !== undefined) {
      await this.exec(`DELETE FROM ${AUDIT_TABLE} WHERE id < ?`, [cutoff.id])
    }
  }

  /** Read recent audit entries, newest first. */
  async readAudit(limit = 100) {
    const rows = await this.all(`SELECT entry FROM ${AUDIT_TABLE} ORDER BY id DESC LIMIT ?`, [limit])
    return rows.map(row => JSON.parse(String(row.entry)))
  }

  /** Audit entries since a timestamp, oldest first. */
  async since(ts) {
    const rows = await this.all(`SELECT entry FROM ${AUDIT_TABLE} WHERE ts >= ? ORDER BY id ASC`, [ts])
    return rows.map(row => JSON.parse(String(row.entry)))
  }

  /** Audit entries naming one plugin id, oldest first. */
  async byPlugin(id) {
    const rows = await this.all(
      `SELECT entry FROM ${AUDIT_TABLE} WHERE entry LIKE ? ORDER BY id ASC`,
      [`%"plugin":{"id":"${id}"%`],
    )
    return rows.map(row => JSON.parse(String(row.entry)))
  }

  /** The last `count` audit entries, oldest first. */
  async tail(count) {
    const rows = await this.all(`SELECT entry FROM ${AUDIT_TABLE} ORDER BY id DESC LIMIT ?`, [count])
    return rows.map(row => JSON.parse(String(row.entry))).reverse()
  }

  async close() {
    if (this.sqlite !== null) {
      this.sqlite.close()
      this.sqlite = null
      return
    }
    await this.pool?.end()
    this.pool = null
  }
}

export { RegistryRowError }
