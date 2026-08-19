/**
 * mygo-rdb — mygo 的会话读取扩展插件。
 *
 * 声明式依赖 mygo 本体暴露的 `service:mygo-core`（capability 依赖，
 * 用于 dogfood mygo 的插件依赖系统）；默认同时支持三种持久化格式：
 * rdb（`$DSH_HOME/sessions/sessions.sqlite` 三表）、sqlite（官方
 * sessions/events 表）、jsonl（`$DSH_HOME/sessions` 目录树）。
 *
 * 工具：
 * - `session_list`：列出所有可读会话；
 * - `session_read`：读一个会话并返回字段摘要（surface 文本、工具调用、
 *   meta 卡、usage、轮次边界）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  JsonlSessionReader,
  RdbSessionReader,
  SqliteSessionReader,
  extractFields,
} from '@deepseek-ai/dsh-mygo'
import { createPostgresSessionReader } from './session-reader-pg.js'

export const name = 'mygo-rdb'
export const inject = ['tools']

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

let pgReader = undefined

function detectReaders() {
  const sessionsRoot = join(dshHome(), 'sessions')
  const rdbPath = join(sessionsRoot, 'sessions.sqlite')
  const readers = []
  if (existsSync(rdbPath)) {
    const rdb = new RdbSessionReader(rdbPath)
    try {
      rdb.list()
      readers.push({ id: 'rdb', list: () => rdb.list() })
    } catch {
      // not an rdb store; the sqlite reader may still work
    }
  }
  if (existsSync(rdbPath)) {
    const sqlite = new SqliteSessionReader(rdbPath)
    try {
      sqlite.list()
      readers.push({ id: 'sqlite', list: () => sqlite.list() })
    } catch {
      // not an official sqlite store either
    }
  }
  if (existsSync(sessionsRoot)) {
    readers.push({ id: 'jsonl', list: async () => new JsonlSessionReader(sessionsRoot).list() })
  }
  if (pgReader !== undefined) {
    readers.push({
      id: 'rdb-postgres',
      list: async () => pgReader.list(),
    })
  }
  return readers
}

export function apply(ctx) {
  const settings = ctx.get?.('settings')
  const rdbSettings = settings?.get?.('session-persistence-rdb')
  const fromSettings = typeof rdbSettings === 'object' && rdbSettings !== null
    && rdbSettings.type === 'postgres' && typeof rdbSettings.connectionString === 'string'
    ? rdbSettings.connectionString
    : ''
  const connection = fromSettings !== '' ? fromSettings : (process.env.DSH_RDB_POSTGRES ?? '')
  if (connection !== '') {
    pgReader = createPostgresSessionReader(connection)
  }
  ctx.tools.register({
    name: 'session_list',
    description: '列出 dsh 会话持久化里所有可读会话（自动识别 rdb / sqlite / jsonl 三种格式）。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' } },
    execute: async () => {
      const out = []
      for (const reader of detectReaders()) {
        try {
          const sessions = await reader.list()
          out.push(`[${reader.id}] ${sessions.length} 个会话：${sessions.map(s => s.id).join(', ')}`)
        } catch (error) {
          out.push(`[${reader.id}] 读取失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      return out.join('\n') || '没有可读的会话存储'
    },
  })

  ctx.tools.register({
    name: 'session_read',
    description: '读取一个 dsh 会话并返回字段摘要（消息、工具调用/结果、meta 卡、usage、轮次）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '会话 id（session-xxxx）' },
        format: {
          type: 'string',
          enum: ['auto', 'rdb', 'rdb-postgres', 'sqlite', 'jsonl'],
          description: '存储格式；auto 自动检测（默认）',
        },
      },
      required: ['id'],
    },
    output: { schema: { type: 'string' } },
    execute: async (args) => {
      const id = String(args.id)
      const format = args.format ?? 'auto'
      let reader
      const candidates = format === 'auto'
        ? detectReaders()
        : detectReaders().filter(candidate => candidate.id === format)
      for (const candidate of candidates) {
        try {
          const stored = await readById(candidate, id)
          if (stored !== undefined) { reader = stored; break }
        } catch {
          // try the next candidate
        }
      }
      if (reader === undefined) return `会话 ${id} 未找到（已尝试格式 ${format}）`
      const fields = extractFields(reader.events)
      return [
        `会话 ${id}（${reader.header.cwd ?? 'no-cwd'}，创建于 ${new Date(reader.header.createdAt).toISOString()}）`,
        `事件 ${reader.events.length} 条（tornFrom=${reader.tornFrom ?? '-'}）`,
        `消息 ${fields.messages.length}（首条：${(fields.messages[0]?.text ?? '').slice(0, 80)}）`,
        `工具调用 ${fields.toolCalls.length}：${fields.toolCalls.map(t => t.name).join(', ')}`,
        `工具结果 ${fields.toolResults.length}，meta 卡 ${fields.metaCards.length}`,
        `轮次 ${fields.turns.length}：${fields.turns.map(t => `#${t.turn}${t.reason ? ` ${JSON.stringify(t.reason).slice(0, 40)}` : ''}`).join('，')}`,
      ].join('\n')
    },
  })
}

async function readById(reader, id) {
  if (reader.id === 'jsonl') return new JsonlSessionReader(join(dshHome(), 'sessions')).readById(id)
  if (reader.id === 'rdb') return new RdbSessionReader(join(dshHome(), 'sessions', 'sessions.sqlite')).readById(id)
  if (reader.id === 'rdb-postgres') return pgReader.readById(id)
  return new SqliteSessionReader(join(dshHome(), 'sessions', 'sessions.sqlite')).readById(id)
}
