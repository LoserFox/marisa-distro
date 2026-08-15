// 门禁：决策记录格式与分类合法。
// 拒绝不变量：decisions/ 下任何记录违反契约——头部缺失、状态行与所在生命周期目录不一致、
// 必需章节缺失、已实施记录出现规划语气标题、分类不在封闭集合、文件名不带日期、
// 取代声明不带链接 / 部分取代缺双向互链 / 完全取代未归档（取代检查的输出契约，
// 见 decisions/README.md「每条新记录都触发取代检查」）。
// 只读、确定性；archived/ 内容本身跳过（其出站链接由 verify-md-links 跳过）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
const CATEGORIES = new Set(['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing'])
const LIFECYCLES = ['proposed', 'implemented', 'rejected', 'archived']
const REQUIRED_SECTIONS = {
  proposed: ['## Problem', '## Proposal', '## Alternatives considered', '## Acceptance criteria', '## Risks'],
  implemented: ['## Problem', '## Decision', '## Alternatives considered', '## Consequences'],
  rejected: ['## Problem', '## Alternatives considered'],
  archived: ['## Problem', '## Decision', '## Alternatives considered', '## Consequences'],
}
const FORBIDDEN_IN_IMPLEMENTED = ['## Proposal', '## Plan', '## Migration plan', '## Acceptance criteria']
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/
const STATUS_RE = /^Status: (.+)$/
const ARCHIVED_MARKER = /^Archived: \d{4}-\d{2}-\d{2}$/
const PRE_FORMAT_MARKER = 'decision-format: alternatives-not-recorded'
// 取代声明：仅「完全取代/部分取代」触发（决策间取代契约）；语义性「取代」（如「字段取代 X 语义」）不触发。
const SUPERSEDE_RE = /完全取代|部分取代/
const LINK_RE = /\]\(([^)]+\.md)\)/g

function existsSafe(p) {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function readSafe(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** 解析记录正文：返回 { lines, status, archived }。 */
function parseRecord(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  let status = null
  let archived = false
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const m = lines[i].match(STATUS_RE)
    if (m) {
      status = m[1].trim()
      if (i + 1 < lines.length && ARCHIVED_MARKER.test(lines[i + 1])) archived = true
      break
    }
  }
  return { lines, status, archived }
}

/** 校验 decisions/ 树。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  const decisionsRoot = join(root, 'decisions')
  if (!existsSafe(decisionsRoot)) return { ok: true, errors }

  for (const lifecycle of LIFECYCLES) {
    const lifecycleDir = join(decisionsRoot, lifecycle)
    if (!existsSafe(lifecycleDir)) continue
    for (const entry of readdirSync(lifecycleDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue // 非目录（如遗留文件）不校验
      if (!CATEGORIES.has(entry.name)) {
        errors.push(`decisions/${lifecycle}/${entry.name}: 分类不在封闭集合 ${[...CATEGORIES].join('/')}`)
        continue
      }
      const categoryDir = join(lifecycleDir, entry.name)
      for (const file of readdirSync(categoryDir, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith('.md')) continue
        const relPath = `decisions/${lifecycle}/${entry.name}/${file.name}`
        if (!FILENAME_RE.test(file.name)) {
          errors.push(`${relPath}: 文件名必须形如 yyyy-mm-dd-主题.md`)
          continue
        }
        checkRecord(join(categoryDir, file.name), relPath, lifecycle, errors)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

function checkRecord(file, relPath, lifecycle, errors) {
  const { lines, status, archived } = parseRecord(file)
  if (lines[0] !== undefined && !lines[0].startsWith('# Decision: ')) {
    errors.push(`${relPath}: 首行必须是 "# Decision: <标题>"`)
  }
  if (status === null) {
    errors.push(`${relPath}: 缺 "Status:" 行`)
  } else if (lifecycle === 'rejected') {
    if (!status.startsWith('rejected')) errors.push(`${relPath}: Status 必须为 "rejected — <原因>"（当前 "${status}"）`)
  } else if (status !== lifecycle) {
    errors.push(`${relPath}: Status "${status}" 与所在目录 ${lifecycle}/ 不一致`)
  }
  if (lifecycle === 'archived' && !archived) {
    errors.push(`${relPath}: archived/ 记录必须在状态行下方插入 "Archived: YYYY-MM-DD"`)
  }

  const text = lines.join('\n')
  const hasAlternatives = text.includes('## Alternatives considered')
  const preFormat = text.includes(PRE_FORMAT_MARKER)
  const required = REQUIRED_SECTIONS[lifecycle] ?? []
  for (const section of required) {
    if (section === '## Alternatives considered' && (hasAlternatives || preFormat)) continue
    if (!text.includes(section)) errors.push(`${relPath}: 缺必需章节 "${section}"`)
  }
  if ((lifecycle === 'implemented' || lifecycle === 'archived')) {
    for (const heading of FORBIDDEN_IN_IMPLEMENTED) {
      if (text.includes(heading)) errors.push(`${relPath}: 已实施记录禁止规划语气标题 "${heading}"`)
    }
  }
  checkSupersede(file, relPath, errors)
}

/** 取代检查的输出契约（决策间取代声明）：带链接、部分取代双向互链、完全取代归档闭环。 */
function checkSupersede(file, relPath, errors) {
  const text = readSafe(file)
  if (text === null) return
  const dir = dirname(file)
  for (const line of text.split('\n')) {
    if (!SUPERSEDE_RE.test(line)) continue
    const links = [...line.matchAll(LINK_RE)].map((m) => m[1])
    if (links.length === 0) {
      errors.push(`${relPath}: 取代声明必须带相对路径链接（"完全取代/部分取代" 所在行须链接到相关记录）`)
      continue
    }
    for (const link of links) {
      const target = readSafe(join(dir, link))
      if (line.includes('完全取代')) {
        if (!link.includes('archived')) {
          errors.push(`${relPath}: 完全取代的旧件必须归档到 decisions/archived/（链接目标 ${link} 不在 archived/）`)
        }
        if (target !== null && !ARCHIVED_MARKER.test(target)) {
          errors.push(`${relPath}: 完全取代目标 ${link} 缺 "Archived: YYYY-MM-DD" 标记（归档即永久冻结）`)
        }
      }
      if (line.includes('部分取代') && target !== null && !target.includes(basename(file))) {
        errors.push(`${relPath}: 部分取代目标 ${link} 必须含指向本记录的链接（双向互链——部分取代保持活跃）`)
      }
    }
  }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-decisions] ${e}`)
  if (!ok) {
    console.error(`[verify-decisions] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log('[verify-decisions] OK')
}
