#!/usr/bin/env node
/**
 * mygo bom scaffold <id> —— P4 BOM 极薄壳脚手架（独立脚本，无需 dsh web）。
 *
 * 读 `dsh.bom.json`，为开发者生成一个新插件的三文件骨架：
 *   package.json（dsh.mygo 声明，depends service:mygo-core 自动取 BOM self 带）
 *   src/index.ts（零侵入 raw Cordis 插件骨架）
 *   README.md（使用说明）
 *
 * 用法：
 *   node scripts/bom-scaffold.mjs my-plugin
 *   node scripts/bom-scaffold.mjs my-plugin --bom /path/dsh.bom.json --out ./out
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION_RE = /^v?\d+\.\d+\.\d+/

function fail(message) {
  console.error(`[bom-scaffold] ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const args = { id: undefined, bom: 'dsh.bom.json', out: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--bom') args.bom = argv[++index]
    else if (arg === '--out') args.out = argv[++index]
    else if (args.id === undefined) args.id = arg
    else fail(`多余参数: ${arg}`)
  }
  if (args.id === undefined) fail('缺少插件 id（用法: bom-scaffold <id> [--bom path] [--out dir]）')
  if (!ID_RE.test(args.id)) fail(`插件 id 必须是小写 kebab-case: ${args.id}`)
  return args
}

function selfBand(bom) {
  if (bom?.format !== 'dsh.bom/v1') fail('不是有效的 dsh.bom/v1 文件')
  const self = (bom.lock?.members ?? []).find(member => member.rail === 'self')
  if (self === undefined || typeof self.version !== 'string') fail('BOM 缺少 self 成员（mygo 自身）')
  return VERSION_RE.test(self.version) ? `^${self.version}` : '*'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const out = args.out ?? `./${args.id}`
  try {
    await readFile(join(out, 'package.json'))
    fail(`目标目录已存在，拒绝覆盖: ${out}`)
  } catch {
    // not exists: ok
  }
  const bom = JSON.parse(await readFile(args.bom, 'utf8'))
  const band = selfBand(bom)
  await mkdir(join(out, 'src'), { recursive: true })
  const pkg = {
    name: args.id,
    version: '0.1.0',
    dsh: {
      mygo: {
        entrypoints: {},
        compatibility: {
          depends: { 'service:mygo-core': band },
        },
      },
    },
  }
  const indexTs = `/**
 * ${args.id} —— mygo 生态插件骨架（由 \`mygo bom scaffold\` 生成）。
 *
 * 依赖声明已按 BOM 自动生成（depends service:mygo-core ${band}）。
 * 按需打开 dsh.bom.md 挑选宿主服务加入 \`inject\`，或在此声明 entrypoints。
 */

export const name = '${args.id}'
export const inject = [] as string[]
export const Config = {}

export function apply(ctx: unknown, config: unknown): void {
  // 在这里挂载工具 / 事件 / 路由 / entrypoints
  void ctx
  void config
}
`
  const readme = `# ${args.id}

mygo 生态插件骨架（由 \`mygo bom scaffold\` 生成）。

- 依赖带：\`depends service:mygo-core ${band}\`（来自 \`${args.bom}\` 的 self 成员）
- 宿主服务：打开 \`dsh.bom.md\` 按需挑选，加入 \`src/index.ts\` 的 \`inject\`
- 验证：在 dsh web 面板执行 \`POST /api/mygo/bom/check { "target": "." }\`
`
  await writeFile(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  await writeFile(join(out, 'src', 'index.ts'), indexTs)
  await writeFile(join(out, 'README.md'), readme)
  console.log(`[bom-scaffold] 已生成 ${args.id} → ${out}`)
  console.log(`[bom-scaffold] depends service:mygo-core ${band}（BOM self 带）`)
}

main().catch(error => fail(String(error)))
