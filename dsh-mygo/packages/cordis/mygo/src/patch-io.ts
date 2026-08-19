/**
 * profile patch 层统一写盘通道（r7 P1）：mygo 对 cordis.patch.yml 的写盘
 * 收敛进进程内串行的 `mutatePatchFile`——读 → 纯函数变换 → tmp+rename 原子
 * 写（同 bundle-rail 既有形态）。不变量：写出顶层始终是合法 YAML 数组，
 * 变换结果为空白时强制回落 `[]`（空文件/仅注释会让 host parsePatchList
 * 解析为 null，boot fail-loud）。
 * @module @r05en1cu/dsh-mygo/src/patch-io
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertInsideHome } from './package/paths.ts'

/** profile 用户 patch 层绝对路径（profile 名校验 + HOME 隔离闸）。 */
export function resolvePatchPath(home: string, profile: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(profile)) {
    throw new Error(`目标路径逃出实例 HOME：非法 profile 名 ${JSON.stringify(profile)}（实例 HOME=${home}）`)
  }
  return assertInsideHome(home, join(home, 'profiles', profile, 'cordis.patch.yml'))
}

/** 读 profile patch 层文本（缺失按空文档计）。 */
export function readPatchText(home: string, profile: string): string {
  const path = resolvePatchPath(home, profile)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/** 判断一段文本是否含 YAML 内容行（非空非注释；各受管块写盘同口径）。 */
export function hasYamlContent(text: string): boolean {
  return text.split('\n').some(line => {
    const trimmed = line.trim()
    return trimmed !== '' && !trimmed.startsWith('#')
  })
}

/** 同路径重入防护（同步写盘模型下串行天然成立，此处拦 mutator 内嵌套写）。 */
const writing = new Set<string>()

/**
 * 串行写盘：读当前文本（缺失按 '' 计）→ mutator 纯函数变换 → tmp+rename
 * 原子写。mutator 返回 undefined 表示放弃本次写入（文件不动）；变换结果
 * 为空白时回落 `[]\n`。返回是否实际写入。mutator 必须保持同步纯变换
 * （不 await、不再入 mutatePatchFile），否则进程内互斥不成立。
 */
export function mutatePatchFile(
  home: string,
  profile: string,
  mutator: (text: string, exists: boolean) => string | undefined,
): boolean {
  const path = resolvePatchPath(home, profile)
  if (writing.has(path)) throw new Error(`patch 文件写盘重入：${path}`)
  writing.add(path)
  try {
    const exists = existsSync(path)
    const text = exists ? readFileSync(path, 'utf8') : ''
    let next = mutator(text, exists)
    if (next === undefined) return false
    if (next.trim() === '') next = '[]\n'
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, path)
    return true
  } finally {
    writing.delete(path)
  }
}
