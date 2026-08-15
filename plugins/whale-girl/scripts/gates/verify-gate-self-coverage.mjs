// 门禁：门禁↔自证测试对照（verify-gate-self-coverage，漏洞 D 审查落地）。
// 拒绝不变量：run.mjs GATES 清单里任一「有实现的门禁」缺对应 scripts/gates/<name>.test.mjs
// （法则 2「每个非平凡门禁必须有测试」的元校验——gate-self-tests 的 glob 只跑已存在的
// 测试文件，新增门禁忘写自证时不会自然红，此处补上对照校验）。
// 排除：unit-tests / tool-tests / gate-self-tests 本身即测试组（非门禁实现）。
// 只读、确定性。
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')
// 自身即测试组的 GATES 条目（无 .mjs 实现，不要求 .test.mjs）。
const TEST_GROUPS = new Set(['unit-tests', 'tool-tests', 'gate-self-tests'])

/** 从 run.mjs 源码提取 GATES 的 name 清单（正则解析，不 import 执行）。 */
export function parseGateNames(runSrc) {
  return [...runSrc.matchAll(/name:\s*'([a-z-]+)'/g)].map((m) => m[1])
}

/** 校验每个有实现的门禁都有自证测试。返回 { ok, errors }。 */
export function check(root = ROOT) {
  const errors = []
  const gatesDir = join(root, 'scripts', 'gates')
  const runSrc = readFileSync(join(gatesDir, 'run.mjs'), 'utf8')
  const names = parseGateNames(runSrc)
  if (names.length === 0) {
    return { ok: false, errors: ['scripts/gates/run.mjs 未解析到 GATES 条目（GATES 格式变更？）'] }
  }
  const present = new Set(readdirSync(gatesDir).filter((f) => f.endsWith('.test.mjs')))
  for (const name of names) {
    if (TEST_GROUPS.has(name)) continue
    if (!present.has(`${name}.test.mjs`)) {
      errors.push(`门禁 ${name} 缺自证测试 scripts/gates/${name}.test.mjs（法则 2：每个非平凡门禁必须有证明它会拒绝的测试）`)
    }
  }
  return { ok: errors.length === 0, errors }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { ok, errors } = check()
  for (const e of errors) console.error(`[verify-gate-self-coverage] ${e}`)
  if (!ok) {
    console.error(`[verify-gate-self-coverage] ${errors.length} 处违规`)
    process.exit(1)
  }
  console.log('[verify-gate-self-coverage] OK（GATES 全部有自证测试）')
}
