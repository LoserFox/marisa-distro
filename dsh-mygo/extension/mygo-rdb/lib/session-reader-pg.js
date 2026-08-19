/**
 * PostgreSQL session reader for the rdb persistence backend.
 *
 * Same three-table semantics as `RdbSessionReader`: dense `f_sequence` with
 * `f_original_seq` remapping, `sourceEventSeqs`/`surfaceOp` remap, and torn
 * tails cut after the last committed `turn/end`. Only the access layer is
 * different (`pg` pool instead of `node:sqlite`); row mapping reuses
 * `scanRdbRows` / `rdbRowToHeader` from the mygo core.
 */

import {
  rdbRowToHeader,
  scanRdbRows,
} from '@deepseek-ai/dsh-mygo'

/** Create one postgres session reader; open() is idempotent. */
export function createPostgresSessionReader(connectionString) {
  return new PostgresSessionReader(connectionString)
}

/** rdb postgres session reader over a pg Pool. */
export class PostgresSessionReader {
  constructor(connectionString) {
    this.connectionString = connectionString
    this.pool = null
    this.ready = this.open()
  }

  async open() {
    const { Pool } = await import('pg')
    this.pool = new Pool({ connectionString: this.connectionString })
    await this.pool.query('SELECT 1')
  }

  async query(sql, params = []) {
    await this.ready
    return (await this.pool.query(sql, params)).rows
  }

  async list() {
    const rows = await this.query(
      'SELECT f_session_id, f_version, f_created_at, f_cwd, f_parent_session,'
      + ' f_seed_length, f_origin, f_delegation_depth'
      + ' FROM t_sessions ORDER BY f_created_at',
    )
    return rows.map(rdbRowToHeader)
  }

  async readById(id) {
    const sessions = await this.query(
      'SELECT * FROM t_sessions WHERE f_session_id = $1',
      [id],
    )
    if (sessions.length === 0) return undefined
    const rows = await this.query(
      'SELECT se.f_sequence AS "fSequence", e.f_kind AS "fKind", e.f_data AS "fData",'
      + ' e.f_created_at AS "fCreatedAt", e.f_original_seq AS "fOriginalSeq",'
      + ' e.f_source_event_seqs AS "fSourceEventSeqs", e.f_surface_op AS "fSurfaceOp"'
      + ' FROM t_session_events se JOIN t_events e ON e.f_event_id = se.f_event_id'
      + ' WHERE se.f_session_id = $1 ORDER BY se.f_sequence',
      [id],
    )
    const { preserved, tornFrom } = scanRdbRows(rows)
    return {
      header: rdbRowToHeader(sessions[0]),
      events: preserved,
      ...(tornFrom === undefined ? {} : { tornFrom }),
    }
  }

  async close() {
    await this.pool?.end()
    this.pool = null
  }
}
