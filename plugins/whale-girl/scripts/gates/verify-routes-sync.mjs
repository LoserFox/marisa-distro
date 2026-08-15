// 门禁：路由前缀单一来源（verify-routes-sync）。
// 拒绝不变量：client/index.mjs、index.mjs、src/assets.mjs 任一**手写** ROUTE_PREFIX
// 字面量（从 src/routes.mjs 读取当前前缀——改前缀自动跟随，不再硬编码 '/plugins/'），
// 或未从 src/routes.mjs import 端点常量（路由前缀只能有一个权威——改前缀只改
// routes.mjs，散落字面量断端点且改名/迁移时漏改即红）。
// 只读、确定性。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
// 从 routes.mjs 导入的语句（相对路径形式多样，只校验来源模块名）。
const IMPORT_RE = /from\s+['"][^'"]*routes\.mjs['"]/

/** 提取 routes.mjs 的 ROUTE_PREFIX 值；缺失返回 null。 */
function readPrefix(routesSrc) {
  const m = /ROUTE_PREFIX\s*=\s*['"]([^'"]+)['"]/.exec(routesSrc)
  return m === null ? null : m[1]
}

/** 校验路由单一来源。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  const consumers = [
    { file: '.dsh-plugin/client/index.mjs', label: 'client/index.mjs' },
    { file: '.dsh-plugin/index.mjs', label: 'index.mjs' },
    { file: '.dsh-plugin/src/assets.mjs', label: 'src/assets.mjs' },
  ]
  const routesSrc = readFileSync(join(root, '.dsh-plugin', 'src', 'routes.mjs'), 'utf8')
  const prefix = readPrefix(routesSrc)
  if (prefix === null) {
    errors.push('.dsh-plugin/src/routes.mjs 未定义 ROUTE_PREFIX（路由单一来源缺失）')
    return { ok: false, errors }
  }
  // 路由前缀字面量（引号包住的 ROUTE_PREFIX 路径）——routes.mjs 内部允许，消费文件禁止。
  const literalRe = new RegExp(`['"]${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  for (const { file, label } of consumers) {
    const src = readFileSync(join(root, file), 'utf8')
    if (literalRe.test(src)) {
      errors.push(`${label} 手写路由前缀字面量（须从 src/routes.mjs import 端点常量）`)
    }
    if (!IMPORT_RE.test(src)) {
      errors.push(`${label} 未从 src/routes.mjs import 端点常量（路由端点须单一来源）`)
    }
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-routes-sync] ${e}`)
  if (!ok) {
    console.error(`[verify-routes-sync] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log('[verify-routes-sync] OK（路由端点单一来源 src/routes.mjs，消费文件无字面量）')
}
