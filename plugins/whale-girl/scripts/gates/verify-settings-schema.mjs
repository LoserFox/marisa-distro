// 门禁：配置 schema 声明合法性（verify-settings-schema）。
// 拒绝不变量（src/config.mjs 的 buildSchema 内）：
// 1. 数值字段缺 min/max（未 clamp 到安全域——如 size 无界）；
// 2. 字段名落入语义层黑名单（xp/taskXp/sessionXp/level/titles/memoryMax/
//    activeCap/…——配置面不得承载积累语义，防"顺手把 XP 做成可配"）；
// 3. 缺默认值（每条配置须有 default——防未初始化读取 undefined）。
// 只读、确定性；启发式扫描（同 verify-tool-schemas 纪律——门禁前置到提交前，
// 宿主 settings 的 schemastery 校验是最终防线）。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')

/** 语义层字段名黑名单（配置面禁止出现；与决策记录 config-system 的 L2 封闭一致）。 */
export const SEMANTIC_KEYS = new Set([
  'xp', 'taskXp', 'sessionXp', 'resumeXp', 'level', 'titles', 'title',
  'memoryMax', 'activeCap', 'xpCap', 'xpSafeMax',
])

/**
 * 校验 config schema 声明。返回 { ok, errors }。
 * 启发式：扫描 buildSchema 的 z.number()/z.boolean() 调用，检查 min/max/default 与字段名。
 */
export function check(root = ROOT) {
  const errors = []
  const src = readFileSync(join(root, '.dsh-plugin', 'src', 'config.mjs'), 'utf8')

  // 提取 buildSchema 函数体内的 schema 声明段
  const fnMatch = /export function buildSchema\(\) \{([\s\S]*?)\n\}/.exec(src)
  if (fnMatch === null) {
    return { ok: false, errors: ['src/config.mjs 未找到 buildSchema 函数'] }
  }
  const body = fnMatch[1]

  // 逐字段声明：`key: z.number().min(N).max(N).default(N)` 或 z.boolean().default(B)
  const fieldRe = /([a-zA-Z][a-zA-Z0-9]*):\s*z\.(number|boolean)\(\)(\.min\([^)]*\))?(\.max\([^)]*\))?(\.default\([^)]*\))?/g
  let m
  let found = 0
  while ((m = fieldRe.exec(body)) !== null) {
    found++
    const [full, key, type, min, max, def] = m
    if (SEMANTIC_KEYS.has(key)) {
      errors.push(`buildSchema.${key}: 字段名落入语义层黑名单（${[...SEMANTIC_KEYS].join('/')}——配置面不得承载积累语义）`)
    }
    if (type === 'number') {
      if (min === undefined) errors.push(`buildSchema.${key}: 数值字段缺 min（未 clamp 下限）`)
      if (max === undefined) errors.push(`buildSchema.${key}: 数值字段缺 max（未 clamp 上限）`)
    }
    if (def === undefined) errors.push(`buildSchema.${key}: 缺默认值（default(...)）`)
  }
  if (found === 0) {
    errors.push('buildSchema 内未扫描到任何 z.number/z.boolean 字段声明（schema 可能未用 schemastery 或结构异常）')
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-settings-schema] ${e}`)
  if (!ok) {
    console.error(`[verify-settings-schema] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log('[verify-settings-schema] OK（配置 schema 声明合法：字段 clamp + 默认值 + 无语义层泄漏）')
}
