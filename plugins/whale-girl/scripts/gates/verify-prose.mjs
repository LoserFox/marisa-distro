// 门禁：散文契约 slop 扫描（verify-prose）。
// 拒绝不变量（deep-standard 法则 5「散文只写契约，不写转录」的 slop 清单程序化）：
// 常驻/规范文档（AGENTS.md、docs/*.md、decisions/README.md）出现：
// - 规划语气（提案期词）："应该""待迁移""待办""尚未实现""TODO""FIXME"（已实施记录里尤其禁止）
// - 历史叙述残留："之前""现在改为""不再""曾经"（写当前态；变更史归 commit/决策记录）
// - 评审走查/实现叙述标记："测试走查""评审发现"
// 只读、确定性。豁免：docs/architecture-evolution.md（设计演进文档，规划语气是正当的——
// 它记录「未来方向」）；growth-system.md 的「未来方向」节同理用行级豁免。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')

/** 扫描范围（常驻/规范文档；排除决策记录——它们有自己的格式门禁）。 */
const SCAN_FILES = ['AGENTS.md', 'README.md', 'docs/AGENTS.md', 'decisions/README.md']

/** 规划语气 slop（提案期词出现在已实施/常驻文档即违规）。 */
const PLANNING_RE = /(待迁移|待办|尚未实现|TODO|FIXME|验收标准|将来会|计划中)/
/** 历史叙述 slop（写当前态；变更史属于 commit/决策记录）。 */
const HISTORY_RE = /(之前.*(?:是|为|用)|现在改为|不再(?:是|用|需要)|曾经(?:是|有))/
/** 评审/实现叙述 slop。 */
const NARRATIVE_RE = /(测试走查|评审发现|本次重构|本次修复|上一轮)/

/** 豁免文件（设计演进文档正当使用规划语气；行级豁免用注释标记）。 */
const EXEMPT_FILES = new Set(['docs/architecture-evolution.md', 'docs/growth-system.md'])

/** 校验散文契约。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  for (const rel of SCAN_FILES) {
    const file = join(root, rel)
    let lines
    try {
      lines = readFileSync(file, 'utf8').split('\n')
    } catch {
      errors.push(`${rel}: 无法读取（文件缺失）`)
      continue
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // 豁免 slop 清单上下文（反例教学：❌ 示例 / 「删除」「不写」的枚举）——
      // 清单文档列出这些词是教人不要写，不是违规内容本身。
      const isSlopExample = /❌|不写|删除|删掉|避免|禁止/.test(line)
      if (isSlopExample) continue
      const stripped = line.replace(/<!--.*?-->/g, '') // 行内注释豁免标记
      if (PLANNING_RE.test(line)) {
        // 已实施记录禁规划语气；常驻文档若含 TODO/FIXME 即违规
        errors.push(`${rel}:${i + 1}: 规划语气「${line.match(PLANNING_RE)[0]}」——写当前态，规划归提案/文档「未来方向」`)
      } else if (HISTORY_RE.test(line)) {
        errors.push(`${rel}:${i + 1}: 历史叙述「${line.match(HISTORY_RE)[0]}」——写当前态，变更史归 commit/决策记录`)
      } else if (NARRATIVE_RE.test(line) && !EXEMPT_FILES.has(rel)) {
        errors.push(`${rel}:${i + 1}: 实现/评审叙述「${line.match(NARRATIVE_RE)[0]}」——只写契约`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-prose] ${e}`)
  if (!ok) {
    console.error(`[verify-prose] ${errors.length} 处 slop`)
    process.exit(1)
  }
  console.log('[verify-prose] OK（散文只写契约，无规划/历史/叙述残留）')
}
