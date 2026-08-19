/**
 * 多实例登记处（P4）：**实例 = $DSH_HOME**。用户级登记处
 * 家目录 `.dsh-mygo/instances.json`（用户级目录，非任何实例 HOME，写它不算
 * 跨实例污染）；每实例仅存 `{home, dshVersion, lastSeenAt}`，不存插件账
 * （插件账 = pnpm 安装状态，唯一真相源在各实例 HOME 内）。
 *
 * 跨版本不共享可写状态：`dshVersion` 只是治理事实记录面（治理视图展示），
 * 可写状态全部落在各实例 HOME 内；登记处本身是唯一例外（用户级共享）。
 *
 * 写入语义：读-合并-写 + staging → rename 原子发布；并发登记为
 * last-writer-wins（登记处只承载发现面，丢一次 lastSeenAt 不构成事实
 * 损失——已知限制，见 DEV-GUIDE 多实例章节）。
 * @module @r05en1cu/dsh-mygo/src/instances
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 登记处文件格式标识。 */
export const INSTANCES_FORMAT = 'dsh.mygo-instances/v1'

/**
 * 用户级 mygo 根目录环境变量（测试注入；生产缺省为家目录 `.dsh-mygo`）。
 * 注意：这是**用户级**目录，与实例 HOME（$DSH_HOME）无关。
 */
export const MYGO_USER_DIR_ENV = 'MYGO_USER_DIR'

/** 一条实例登记记录（仅存三项，不存插件账）。 */
export interface InstanceRecord {
  /** 实例 HOME（resolve 后的绝对路径）。 */
  readonly home: string
  /** 实例侧 dsh 版本（治理事实；未知时缺省）。 */
  readonly dshVersion?: string
  /** 最近一次见到该实例的时间（ISO 8601；服务 init / adopt 更新）。 */
  readonly lastSeenAt: string
}

export interface InstanceRegistryOptions {
  /** 用户级根目录覆盖（测试注入；缺省 resolveMygoUserRoot()）。 */
  readonly root?: string
  /** 时钟覆盖（确定性测试）。 */
  readonly now?: () => Date
  /** 锁等待上限（ms；P7-B10，缺省 2000；超时 fail-open，见锁注释）。 */
  readonly lockWaitMs?: number
  /** 锁陈旧判定（ms；超过即视为崩溃残留，直接接管）。 */
  readonly lockStaleMs?: number
}

/** 解析用户级 mygo 根目录：MYGO_USER_DIR 覆盖优先，缺省为家目录 `.dsh-mygo`。 */
export function resolveMygoUserRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const explicit = env[MYGO_USER_DIR_ENV]
  return typeof explicit === 'string' && explicit !== '' ? explicit : join(homedir(), '.dsh-mygo')
}

function registryPath(root: string): string {
  return join(root, 'instances.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读登记处；文件缺失/损坏 → 空表（发现面不构成硬事实）。 */
export function listInstances(options: InstanceRegistryOptions = {}): readonly InstanceRecord[] {
  const root = options.root ?? resolveMygoUserRoot()
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(registryPath(root), 'utf8'))
  } catch {
    return []
  }
  if (!isRecord(raw) || raw.format !== INSTANCES_FORMAT || !Array.isArray(raw.instances)) return []
  const out: InstanceRecord[] = []
  for (const entry of raw.instances) {
    if (!isRecord(entry) || typeof entry.home !== 'string' || entry.home === '') continue
    if (typeof entry.lastSeenAt !== 'string' || entry.lastSeenAt === '') continue
    out.push({
      home: entry.home,
      ...(typeof entry.dshVersion === 'string' && entry.dshVersion !== ''
        ? { dshVersion: entry.dshVersion }
        : {}),
      lastSeenAt: entry.lastSeenAt,
    })
  }
  return out.sort((a, b) => (a.home < b.home ? -1 : a.home > b.home ? 1 : 0))
}

function writeRegistry(root: string, instances: readonly InstanceRecord[]): void {
  mkdirSync(root, { recursive: true })
  const path = registryPath(root)
  const tmp = join(dirname(path), `.instances-${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify({ format: INSTANCES_FORMAT, instances }, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

// ---------------------------------------------------------------------------
// P7-B10：读-改-写的跨进程互斥（mkdir 锁）。
// ---------------------------------------------------------------------------

/** 同步睡眠（Node 主线程允许 Atomics.wait；锁自旋专用，上限毫秒级）。 */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * mkdir 自旋锁：等待上限内拿到锁；陈旧锁（holder 崩溃残留，超
 * lockStaleMs）直接接管；超时 **fail-open**（放行本写）——登记处只承载
 * 发现面，宁可接受 last-writer-wins 也不能让一把残留锁砖掉服务启动。
 */
function withRegistryLock<T>(root: string, options: InstanceRegistryOptions, fn: () => T): T {
  const lockDir = join(root, '.instances.lock')
  const waitMs = options.lockWaitMs ?? 2000
  const staleMs = options.lockStaleMs ?? 30_000
  const deadline = Date.now() + waitMs
  mkdirSync(root, { recursive: true })
  let held = false
  for (;;) {
    try {
      mkdirSync(lockDir)
      held = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > staleMs) {
          rmSync(lockDir, { recursive: true, force: true })
          continue
        }
      } catch {
        continue // 锁刚好被释放/接管：重试
      }
      if (Date.now() >= deadline) break // fail-open
      sleepSync(10)
    }
  }
  try {
    return fn()
  } finally {
    if (held) rmSync(lockDir, { recursive: true, force: true })
  }
}

/**
 * 登记/更新一个实例（upsert by resolved home）：刷新 lastSeenAt；
 * dshVersion 给出时更新，缺省保留既有值。返回登记后的记录。
 */
export function registerInstance(
  input: { readonly home: string; readonly dshVersion?: string },
  options: InstanceRegistryOptions = {},
): InstanceRecord {
  const root = options.root ?? resolveMygoUserRoot()
  const home = resolve(input.home)
  const now = (options.now?.() ?? new Date()).toISOString()
  return withRegistryLock(root, options, () => {
    const existing = listInstances({ root })
    const previous = existing.find(record => record.home === home)
    const record: InstanceRecord = {
      home,
      ...(input.dshVersion !== undefined && input.dshVersion !== ''
        ? { dshVersion: input.dshVersion }
        : previous?.dshVersion === undefined ? {} : { dshVersion: previous.dshVersion }),
      lastSeenAt: now,
    }
    const next = [...existing.filter(item => item.home !== home), record]
      .sort((a, b) => (a.home < b.home ? -1 : a.home > b.home ? 1 : 0))
    writeRegistry(root, next)
    return record
  })
}

/** 注销一个实例；返回是否有记录被移除。 */
export function unregisterInstance(home: string, options: InstanceRegistryOptions = {}): boolean {
  const root = options.root ?? resolveMygoUserRoot()
  const resolved = resolve(home)
  return withRegistryLock(root, options, () => {
    const existing = listInstances({ root })
    const next = existing.filter(record => record.home !== resolved)
    if (next.length === existing.length) return false
    writeRegistry(root, next)
    return true
  })
}

/** 登记处是否已含指定实例 HOME。 */
export function isInstanceRegistered(home: string, options: InstanceRegistryOptions = {}): boolean {
  const resolved = resolve(home)
  return listInstances(options).some(record => record.home === resolved)
}

/** 登记处文件是否存在（诊断面用）。 */
export function instanceRegistryExists(options: InstanceRegistryOptions = {}): boolean {
  return existsSync(registryPath(options.root ?? resolveMygoUserRoot()))
}
