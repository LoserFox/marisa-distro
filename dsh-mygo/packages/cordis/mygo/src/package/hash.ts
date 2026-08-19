/**
 * 内容哈希工具（原 lockfile.ts 拆出的通用部分）：sha256/sha512 文件与文本
 * 哈希、npm integrity（SRI sha512-base64）解析。pack 完整性校验与还原事实
 * 文件共用；与 dsh.lock/v1 账本无关。
 * @module @r05en1cu/dsh-mygo/src/package/hash
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/** SHA-256 hex of one file's bytes. */
export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

/** SHA-512 hex of one file's bytes. */
export async function sha512File(path: string): Promise<string> {
  const bytes = await readFile(path)
  return createHash('sha512').update(bytes).digest('hex')
}

/** SHA-256 hex of a UTF-8 string. */
export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 解析 npm `integrity` SRI（`sha512-base64`）为 hex。
 * 无法解析返回 undefined（不猜测、不阻断）。
 */
export function integritySha512Hex(integrity: string | undefined): string | undefined {
  if (integrity === undefined) return undefined
  const match = /^sha512-([A-Za-z0-9+/=]+)$/.exec(integrity.trim())
  if (match === null) return undefined
  return Buffer.from(match[1] as string, 'base64').toString('hex')
}
