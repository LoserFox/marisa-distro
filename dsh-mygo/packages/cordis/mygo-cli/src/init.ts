/**
 * init 骨架生成器（design-r5 §5；B16 落地）：以 plugin-template@87acac8
 * 的 vendored 资产为模板，做身份替换 + mygo 词汇增量，写盘前完成 B1 与
 * 模板对齐双重校验。全程不触网、不执行 install/prepare。
 * @module @r05en1cu/dsh-mygo-cli/init
 */

import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename, join, relative, resolve } from 'node:path'
import {
  checkTemplateAlignment,
  parsePackageManifest,
} from '@r05en1cu/dsh-mygo'
import type { PluginManifestV3 } from '@r05en1cu/dsh-mygo'
import { slugId } from './args.ts'

/** 生成失败的稳定错误码（不进入结构化报告体系；CLI 翻译为退出码 1）。 */
export class InitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InitError'
  }
}

export interface InitResult {
  readonly dir: string
  readonly files: readonly string[]
  readonly id: string
  readonly manifest: PluginManifestV3
}

/** vendored 模板根（src 与 lib 布局下均指向包根 assets/plugin-template）。 */
const TEMPLATE_ROOT = fileURLToPath(new URL('../assets/plugin-template/', import.meta.url))

/** 身份替换点（照 2da8230 README「Create your plugin」清单；不做全局替换）。 */
const IDENTITY_FILES = [
  'src/index.ts',
  'src/config.ts',
  'src/runtime.ts',
  'src/invariant.ts',
  'tests/plugin.spec.ts',
  'cordis.patch.yml',
  'README.md',
  'AGENTS.md',
]

/** 模板 package.json 的 mygo 词汇增量（design-r5 §5.3；2026-08-13 起无 depends/breaks）。 */
function mygoBlock(id: string, version: string): Record<string, unknown> {
  return {
    formatVersion: 1,
    id,
    version,
    entry: 'lib/index.js',
    requires: {},
    core: '^0.0.1-rc.1',
    loader: { id: 'standard', range: '^1.0.0' },
  }
}

/** 递归复制模板；跳过 .git（不应存在于 vendored 资产，双保险）。 */
async function copyTree(source: string, target: string): Promise<readonly string[]> {
  const out: string[] = []
  const walk = async (from: string, to: string): Promise<void> => {
    const entries = await readdir(from, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const src = join(from, entry.name)
      const dst = join(to, entry.name)
      if (entry.isDirectory()) {
        await mkdir(dst, { recursive: true })
        await walk(src, dst)
      } else if (entry.isFile()) {
        await cp(src, dst)
        out.push(relative(target, dst))
      }
    }
  }
  await walk(source, target)
  return out
}

/** 文本身份替换：包名精确替换优先，再替换占位 id（确定性顺序）。 */
function substituteIdentity(source: string, packageName: string, id: string): string {
  return source
    .split('@your-scope/dsh-plugin-template').join(packageName)
    .split('plugin-template').join(id)
}

/**
 * 生成插件骨架。写盘顺序：目录存在性/空目录校验 → 内存组装 package.json
 * → B1 + 模板对齐双校验 → 复制模板 → 身份替换 → 写 package.json。
 * 校验失败时不落任何文件。
 */
export async function generatePluginSkeleton(
  name: string,
  options: { readonly id?: string; readonly dir?: string; readonly cwd?: string } = {},
): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd()
  const base = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
  const dir = resolve(cwd, options.dir ?? base)
  try {
    const existing = await readdir(dir)
    if (existing.length > 0) throw new InitError(`目标目录已存在且非空：${dir}`)
  } catch (error) {
    if (error instanceof InitError) throw error
    // ENOENT → 可创建；其余错误（如父路径不存在）由 mkdir 统一报告。
  }
  const id = options.id ?? slugId(name)
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new InitError(`非法 manifest id（须匹配 /^[a-z][a-z0-9-]*$/）：${JSON.stringify(id)}`)
  }

  const templatePkg = JSON.parse(await readFile(join(TEMPLATE_ROOT, 'package.json'), 'utf8')) as Record<string, unknown>
  const version = typeof templatePkg.version === 'string' ? templatePkg.version : '0.0.1'
  const nextPkg: Record<string, unknown> = {
    ...templatePkg,
    name,
    // 生成物默认作者声明（mygo 体系作者面；2026-08-13 起 r05En1cU）。
    author: 'r05En1cU',
    dsh: {
      ...(typeof templatePkg.dsh === 'object' && templatePkg.dsh !== null && !Array.isArray(templatePkg.dsh)
        ? { ...(templatePkg.dsh as Record<string, unknown>) }
        : {}),
      mygo: mygoBlock(id, version),
    },
  }

  const parsed = parsePackageManifest(nextPkg)
  if (parsed.value === undefined || parsed.problems.length > 0) {
    throw new InitError(`生成的 manifest 未通过 B1 校验：${parsed.problems.map(p => p.message).join('；')}`)
  }
  const aligned = checkTemplateAlignment(nextPkg)
  if (!aligned.aligned) {
    throw new InitError(`生成的骨架未通过模板对齐检查：${aligned.gaps.join('；')}`)
  }

  await mkdir(dir, { recursive: true })
  const files = await copyTree(TEMPLATE_ROOT, dir)
  for (const file of IDENTITY_FILES) {
    const target = join(dir, file)
    const current = await readFile(target, 'utf8').catch(() => undefined)
    if (current === undefined) continue
    await writeFile(target, substituteIdentity(current, name, id), 'utf8')
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify(nextPkg, null, 2) + '\n', 'utf8')
  return {
    dir,
    files: [...files.filter(file => file !== 'package.json'), 'package.json'].sort(),
    id,
    manifest: parsed.value,
  }
}

/** 供渲染使用的包名末段（目录默认名）。 */
export function defaultDirName(name: string): string {
  return basename(name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name)
}
