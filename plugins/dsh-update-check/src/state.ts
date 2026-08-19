/** $DSH_HOME/update-check/state.json 的读写与缓存窗口判定。 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 持久化检查状态。latest 与 dismissedVersion 是归一化版本号（无 v 前缀）。 */
export interface UpdateCheckState {
  /** 上次检查时间（ISO 字符串；未检查过为 null）。 */
  readonly lastCheckAt: string | null
  /** 最新 Release 版本（尚无结果为 null）。 */
  readonly latest: string | null
  /** 用户已忽略的版本（null 表示从未忽略）。 */
  readonly dismissedVersion: string | null
  /** 最新 Release 的 changelog（release body，截断到固定上界）。 */
  readonly changelog: string
  /** 最新 Release 的三个候选链接（下载选择按运行期安装形态决定，不落盘）。 */
  readonly assets: { readonly msi: string | null; readonly standalone: string | null; readonly releasePage: string | null }
}

export const EMPTY_UPDATE_CHECK_STATE: UpdateCheckState = {
  lastCheckAt: null,
  latest: null,
  dismissedVersion: null,
  changelog: '',
  assets: { msi: null, standalone: null, releasePage: null },
}

/** 读 state.json；文件缺失或损坏都按空状态处理（检查结果可从 GitHub 重新获得）。 */
export async function readState(path: string): Promise<UpdateCheckState> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_UPDATE_CHECK_STATE
    return EMPTY_UPDATE_CHECK_STATE
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const stringOrNull = (key: string): string | null => (typeof parsed[key] === 'string' ? parsed[key] as string : null)
    const parsedAssets = parsed.assets
    const assets = typeof parsedAssets === 'object' && parsedAssets !== null
      ? parsedAssets as Record<string, unknown>
      : {}
    const linkOrNull = (key: string): string | null => (typeof assets[key] === 'string' ? assets[key] as string : null)
    return {
      lastCheckAt: stringOrNull('lastCheckAt'),
      latest: stringOrNull('latest'),
      dismissedVersion: stringOrNull('dismissedVersion'),
      changelog: stringOrNull('changelog') ?? '',
      assets: { msi: linkOrNull('msi'), standalone: linkOrNull('standalone'), releasePage: linkOrNull('releasePage') },
    }
  } catch {
    return EMPTY_UPDATE_CHECK_STATE
  }
}

/** 原子写 state.json：先写同目录临时文件再改名，崩溃不会留下半截文件。 */
export async function writeState(path: string, state: UpdateCheckState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
  await rename(tmp, path)
}

/** 上次检查的 epoch 毫秒（无记录或解析失败为 null）。 */
export function lastCheckMs(state: UpdateCheckState): number | null {
  if (state.lastCheckAt === null) return null
  const ms = Date.parse(state.lastCheckAt)
  return Number.isNaN(ms) ? null : ms
}

/** 距上次检查是否不足 windowMs（手动检查的缓存窗口）。 */
export function withinCacheWindow(state: UpdateCheckState, nowMs: number, windowMs: number): boolean {
  const last = lastCheckMs(state)
  return last !== null && nowMs - last < windowMs
}
