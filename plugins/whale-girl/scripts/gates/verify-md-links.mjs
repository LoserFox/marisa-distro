// 门禁：文档相对链接可达性。
// 拒绝不变量：仓库内 .md 文件的相对链接/图片引用全部指向存在的文件。
// 只读、确定性（无时间/网络依赖，遍历顺序无关）；跳过 http(s)/mailto/data/tel 链接、
// 纯锚点链接与 archived/（永久冻结，含其出站链接，见 decisions/README.md）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
const SKIP_DIRS = new Set(['.git', 'node_modules', 'archived'])
const SKIP_TARGET_PREFIXES = ['http://', 'https://', 'mailto:', 'data:', 'tel:']
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

/** 收集 root 下全部 .md 文件（跳过 SKIP_DIRS）。 */
export function collectMarkdownFiles(root) {
  const out = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      out.push(...collectMarkdownFiles(join(root, entry.name)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(join(root, entry.name))
    }
  }
  return out
}

function existsSafe(p) {
  try {
    const s = statSync(p)
    return s.isFile() || s.isDirectory()
  } catch {
    return false
  }
}

function rel(root, p) {
  return p === root ? '.' : p.replace(root + sep, '')
}

/** 校验 root 下所有 .md 的相对链接可达性。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  for (const file of collectMarkdownFiles(root)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      LINK_RE.lastIndex = 0
      let m
      while ((m = LINK_RE.exec(lines[i])) !== null) {
        const raw = m[1]
        const target = raw.split('#')[0].trim()
        if (target === '' || SKIP_TARGET_PREFIXES.some((p) => target.startsWith(p))) continue
        const resolved = target.startsWith('/')
          ? normalize(join(root, target))
          : normalize(join(dirname(file), target))
        if (!existsSafe(resolved)) {
          errors.push(`${rel(root, file)}:${i + 1}: 链接 "${raw}" 指向不存在的路径 ${rel(root, resolved)}`)
        }
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-md-links] ${e}`)
  if (!ok) {
    console.error(`[verify-md-links] ${errors.length} 个失效链接`)
    process.exit(1)
  }
  console.log('[verify-md-links] OK')
}
