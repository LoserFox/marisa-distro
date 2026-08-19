#!/usr/bin/env node
/**
 * verify:self-contained —— 官方 plugin-template 脚本的 dsh-mygo 框架适配版。
 * 官方脚本要求仓库完全自包含；dsh-mygo 处于安装形态过渡态，按 AGENTS.md
 * 框架例外 #2/#5 显式豁免以下事实（其余检查保留模板精神）：
 *   - workspace:^ 依赖：仅允许 @deepseek-ai/* 与 @r05en1cu/*（发布前过渡态，AGENTS.md #2）
 *   - tsconfig references：不检查越界（安装形态变体，AGENTS.md #5）
 *   - tests/ 目录：不检查绝对路径（证据语料与实测环境路径）
 *   - assets/plugin-template：vendored 官方模板资产，整体跳过
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const ignoredDirectories = new Set(['.git', 'lib', 'node_modules', 'assets'])
const textExtensions = new Set(['.cjs', '.cts', '.js', '.json', '.jsx', '.md', '.mjs', '.mts', '.ts', '.tsx', '.yaml', '.yml'])
const emojiRe = /\p{Emoji_Presentation}|\u{200D}|\u{FE0F}|\u{1F1E6}-\u{1F1FF}/u
const failures = []
const textFiles = []

function isInsideRoot(target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const fullPath = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      try {
        const target = realpathSync(fullPath)
        if (!isInsideRoot(target)) failures.push(`${relative(root, fullPath)}: symlink leaves repository`)
      } catch (error) {
        failures.push(`${relative(root, fullPath)}: broken symlink (${error.message})`)
      }
      continue
    }
    if (entry.isDirectory()) {
      walk(fullPath)
    } else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      textFiles.push(fullPath)
    }
  }
}

walk(root)

for (const filePath of textFiles) {
  const rel = relative(root, filePath)
  const source = readFileSync(filePath, 'utf8')
  if (rel !== 'scripts/verify-self-contained.mjs' && !rel.startsWith('tests/') && !rel.startsWith('test/')) {
    const absolutePath = source.match(/(?:^|\s|["'`(=,:])((?:~\/|\/(?:[^/\s"'`<>]+\/)+[^/\s"'`<>]*|[A-Za-z]:[\\/][^\s"'`<>]+))/m)
    // 只认真实文件系统路径：~/ 前缀、盘符，或以已知系统根开头（排除
    // /-/g、/[.*+?^${}()|[\]\\]/g 等正则字面量）。
    const candidate = absolutePath?.[1] ?? ''
    const looksLikePath = /^(?:~(?:\/|$)|[A-Za-z]:[\\/]|\/(?:home|tmp|usr|opt|var|etc|Users|private|root|mnt|srv|media|dev|bin|sbin|lib|boot|proc|sys|run)(?:\/|$))/.test(candidate)
    if (absolutePath !== null && looksLikePath) {
      failures.push(`${rel}: contains absolute path ${absolutePath[1]}`)
    }
  }
  if (rel.startsWith('tests/fixtures/')) continue
  const emoji = source.match(emojiRe)
  if (emoji !== null) failures.push(`${rel}: contains emoji ${emoji[0]}`)
  if (extname(filePath) === '.md') {
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const rawTarget = match[1].trim().replace(/^<|>$/g, '')
      if (rawTarget.startsWith('#') || rawTarget.startsWith('mailto:')) continue
      if (/^[a-z][a-z+.-]*:/i.test(rawTarget)) {
        failures.push(`${rel}: external Markdown link ${rawTarget}`)
        continue
      }
      const targetPath = resolve(dirname(filePath), rawTarget.split('#')[0])
      if (!isInsideRoot(targetPath)) {
        failures.push(`${rel}: Markdown link leaves repository: ${rawTarget}`)
      } else if (!existsSync(targetPath)) {
        failures.push(`${rel}: broken Markdown link: ${rawTarget}`)
      }
    }
  }
}

for (const requiredPath of ['src/README.md', 'tests/README.md', 'tests/snapshots/README.md']) {
  if (!existsSync(join(root, requiredPath))) failures.push(`missing repository-layout contract ${requiredPath}`)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, spec] of Object.entries(packageJson[field] ?? {})) {
    if (/^(?:file|link|portal|git\+|https?):/i.test(spec) || spec.startsWith('.') || isAbsolute(spec)) {
      failures.push(`package.json: ${field}.${name} uses non-registry spec ${spec}`)
    }
    if (/^workspace:/i.test(spec) && !name.startsWith('@deepseek-ai/') && !name.startsWith('@r05en1cu/')) {
      failures.push(`package.json: ${field}.${name} uses workspace spec outside the documented @deepseek-ai/@r05en1cu transition exemption`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log(`self-contained package verified (${textFiles.length} text files)`)
