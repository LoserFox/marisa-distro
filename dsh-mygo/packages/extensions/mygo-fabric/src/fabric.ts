/**
 * fabric extension 治理壳（P6）：fabric 组合缝（cordis-fabric +
 * cordis-fabric-dsh 两行）由 mygo 治理层接管——启用 = 经 profile loader
 * 执行面安装 fabric 包 + 向目标 profile 的 cordis.patch.yml 写受管块
 * （幂等标记块，P3 启停块同机制）；停用 = 移除受管块（包仍在
 * dependencies，卸载经 profile loader 另行执行）。
 *
 * 三条硬缝（profile-boot 挂钩 / clientBundle transform / api-catalog）
 * 不在本面包内——它们是 host 补丁提案（dsh-mygo/patches/fabric-host.patch）
 * 的内容；runtime 激活依赖 host 合入提案。
 * @module @r05en1cu/dsh-mygo-ext-fabric/fabric
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertInsideHome } from '@r05en1cu/dsh-mygo'
import type { ExtensionRegistration } from '@r05en1cu/dsh-mygo'
import { profileInstall } from '@r05en1cu/dsh-mygo-loader-profile'

export const FABRIC_EXTENSION_ID = 'fabric'

/** 受管块标记（启用态推导锚；ExtensionRegistration.blockMarker 同源）。 */
export const FABRIC_BLOCK_BEGIN = `# --- mygo managed extension (id:${FABRIC_EXTENSION_ID}) ---`
export const FABRIC_BLOCK_END = `# --- end mygo managed extension (id:${FABRIC_EXTENSION_ID}) ---`

/** fabric 扩展的 profile 包清单（cordis-fabric-api 为 peer-only，不直接装）。 */
export const FABRIC_PACKAGES = ['cordis-fabric', 'cordis-fabric-dsh'] as const

/**
 * 默认分发 spec（git 子目录 spec 白名单过渡，守则例外登记；push 禁令未
 * 解除期间验证一律用本地路径 spec 覆盖，见 enableFabric options.specs）。
 */
export const FABRIC_DEFAULT_SPECS = [
  'github:omdsh-dev/fabric#main&path:/packages/cordis-fabric',
  'github:omdsh-dev/fabric#main&path:/packages/cordis-fabric-dsh',
] as const

/** extension 登记表首条：fabric。 */
export function fabricExtensionRegistration(): ExtensionRegistration {
  return {
    id: FABRIC_EXTENSION_ID,
    kind: 'extension',
    source: 'github:omdsh-dev/fabric（git 子目录 spec 白名单过渡）',
    blockMarker: FABRIC_BLOCK_BEGIN,
    packages: FABRIC_PACKAGES,
    description: 'Fabric/Mixin 扩展层（组合缝两行由 mygo 治理层接管；硬缝走 host 补丁提案）',
  }
}

export interface FabricTarget {
  readonly home: string
  readonly profile: string
}

export interface FabricToggleResult {
  readonly ok: boolean
  readonly enabled: boolean
  readonly profile: string
  readonly error?: string | undefined
}

/** 受管块文本（fabric 两行组合缝；opt-in 由启停动作表达，行内不再 disabled）。 */
export function fabricManagedBlock(): string {
  return [
    FABRIC_BLOCK_BEGIN,
    '- insert:',
    '    - id: cordis-fabric',
    "      name: 'cordis-fabric'",
    '    - id: cordis-fabric-dsh',
    "      name: 'cordis-fabric-dsh'",
    `${FABRIC_BLOCK_END}`,
  ].join('\n')
}

/** 从 patch 文本移除指定扩展的受管块（幂等；无块原样返回）。 */
export function removeManagedExtensionBlock(text: string, id: string): string {
  const begin = `# --- mygo managed extension (id:${id}) ---`
  const end = `# --- end mygo managed extension (id:${id}) ---`
  const pattern = new RegExp(`\\n?${escapeRegExp(begin)}\\n(?:.*\\n)*?${escapeRegExp(end)}\\n?`)
  return text.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n')
}

/** 追加受管块（幂等：已有块先移除再追加 = 内容收敛到唯一一份）。 */
function writeManagedExtensionBlock(text: string, id: string, block: string): string {
  const stripped = removeManagedExtensionBlock(text, id)
  const head = stripped.trimEnd()
  return (head === '' ? '' : `${head}\n\n`) + block + '\n'
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 检测不受管的 fabric 载体行（`- id: cordis-fabric[-dsh]`，在受管块之外）。 */
export function findStrayFabricRow(patchText: string): string | undefined {
  const unmanaged = removeManagedExtensionBlock(patchText, FABRIC_EXTENSION_ID)
  for (const id of FABRIC_PACKAGES) {
    if (new RegExp(`^\\s*-\\s+id:\\s*['"]?${id}['"]?\\s*$`, 'm').test(unmanaged)) return id
  }
  return undefined
}

function profilePatchPath(target: FabricTarget): string {
  // profile 名硬校验：任何分隔符/点段直接拒绝（拼接归一会把 ../x 吸进
  // HOME 内，仅靠前缀闸无法识别，必须在拼接前拒绝）。
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(target.profile)) {
    throw new Error(`目标路径逃出实例 HOME：非法 profile 名 ${JSON.stringify(target.profile)}（实例 HOME=${target.home}）`)
  }
  // P4 隔离闸：patch 层必须落在目标实例 HOME 内。
  return assertInsideHome(target.home, join(target.home, 'profiles', target.profile, 'cordis.patch.yml'))
}

function readProfileDeps(target: FabricTarget): Readonly<Record<string, string>> {
  try {
    const manifest = JSON.parse(readFileSync(
      assertInsideHome(target.home, join(target.home, 'profiles', target.profile, 'package.json')),
      'utf8',
    )) as { readonly dependencies?: Readonly<Record<string, string>> }
    return manifest.dependencies ?? {}
  } catch {
    return {}
  }
}

/**
 * 启用 fabric extension：安装 fabric 两包（profile 执行面；specs 缺省
 * git 子目录 spec 白名单）+ 写受管块。幂等：两包已在 dependencies 且
 * 块已存在时零写入。P7-B8：写块前检测层内既有 fabric 载体行（不受管
 * 的 `- id: cordis-fabric[-dsh]` 行），命中即拒绝（重复插行互斥）。
 */
export function enableFabric(
  target: FabricTarget,
  options: { readonly specs?: readonly string[]; readonly cwd?: string } = {},
): FabricToggleResult {
  const specs = options.specs ?? FABRIC_DEFAULT_SPECS
  if (specs.length !== FABRIC_PACKAGES.length) {
    return { ok: false, enabled: false, profile: target.profile, error: `specs 数量必须与包清单一致（${FABRIC_PACKAGES.length}）` }
  }
  const deps = readProfileDeps(target)
  const patchPath = profilePatchPath(target)
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const installed = FABRIC_PACKAGES.every(name => deps[name] !== undefined)
  const blockPresent = text.includes(FABRIC_BLOCK_BEGIN)
  if (installed && blockPresent) return { ok: true, enabled: true, profile: target.profile }
  if (!blockPresent) {
    const stray = findStrayFabricRow(text)
    if (stray !== undefined) {
      return {
        ok: false,
        enabled: false,
        profile: target.profile,
        error: `profile patch 层已存在不受管的 fabric 载体行（${stray}）：与 mygo 受管块重复插行互斥；请先移除该行再启用`,
      }
    }
  }
  if (!installed) {
    for (const [index, spec] of specs.entries()) {
      if (deps[FABRIC_PACKAGES[index] ?? ''] !== undefined) continue
      const outcome = profileInstall(spec, {
        profile: target.profile,
        home: target.home,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      })
      if (!outcome.ok) {
        return { ok: false, enabled: false, profile: target.profile, error: `安装 ${FABRIC_PACKAGES[index]} 失败：${outcome.error ?? 'pnpm 失败'}` }
      }
    }
  }
  const next = writeManagedExtensionBlock(text, FABRIC_EXTENSION_ID, fabricManagedBlock())
  writeFileSync(patchPath, next, 'utf8')
  return { ok: true, enabled: true, profile: target.profile }
}

/** 停用 fabric extension：移除受管块（幂等；包保留在 dependencies）。 */
export function disableFabric(target: FabricTarget): FabricToggleResult {
  const patchPath = profilePatchPath(target)
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const next = removeManagedExtensionBlock(text, FABRIC_EXTENSION_ID)
  if (next !== text) writeFileSync(patchPath, next === '\n' ? '' : next, 'utf8')
  return { ok: true, enabled: false, profile: target.profile }
}
