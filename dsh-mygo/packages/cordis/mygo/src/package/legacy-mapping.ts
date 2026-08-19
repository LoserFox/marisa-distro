/**
 * legacy `dsh.plugin.json` 只读映射（design-r3 §5.4，B15）：识别旧文件输出
 * 迁移警告（告警级）；不阻断。字段映射：
 * id/version/main/engines.dsh/contributes/client → 规范字段
 * （id/version/entry/core/environment 元数据/client 报告信息）。
 * @module @r05en1cu/dsh-mygo/src/package/legacy-mapping
 */

import type { PluginManifestV3 } from './manifest-v2.ts'

/** 一条 legacy 文件的结构事实。 */
export interface LegacyPluginFile {
  readonly id?: unknown
  readonly version?: unknown
  readonly main?: unknown
  readonly engines?: { readonly dsh?: unknown }
  readonly contributes?: unknown
  readonly client?: unknown
}

/** legacy 映射结果（value 仅当核心字段可映射时存在；永远不阻断）。 */
export interface LegacyMappingResult {
  readonly value?: PluginManifestV3
  readonly warnings: readonly string[]
  readonly unmapped: readonly string[]
}

/** 规范化 legacy id（scope/路径 → 末段；非法则返回 undefined）。 */
function normalizeLegacyId(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const last = raw.split(/[\/@]/).filter(Boolean).at(-1)
  if (last === undefined) return undefined
  return /^[a-z][a-z0-9-]*$/.test(last) ? last : undefined
}

/** 把 legacy `dsh.plugin.json` 内容只读映射为规范 manifest（B15）。 */
export function mapLegacyPluginFile(legacy: unknown): LegacyMappingResult {
  const warnings: string[] = []
  const unmapped: string[] = []
  if (typeof legacy !== 'object' || legacy === null || Array.isArray(legacy)) {
    return { warnings: ['dsh.plugin.json 不是对象：无法映射（告警，不阻断）'], unmapped: ['legacy-file'] }
  }
  const file = legacy as LegacyPluginFile
  const id = normalizeLegacyId(file.id)
  if (id === undefined) {
    unmapped.push('id')
    warnings.push('legacy dsh.plugin.json 缺少合法 id（告警，不阻断）')
  }
  const version = typeof file.version === 'string' && file.version !== '' ? file.version : undefined
  if (version === undefined) unmapped.push('version')
  const main = typeof file.main === 'string' && file.main !== ''
    ? file.main.replace(/^\.\//, '').replace(/^\\/, '')
    : undefined
  if (main === undefined) {
    unmapped.push('main')
    warnings.push('legacy dsh.plugin.json 缺少 main（entry 无法映射；告警，不阻断）')
  }
  const core = typeof file.engines?.dsh === 'string' && file.engines.dsh !== '' ? file.engines.dsh : undefined
  if (id === undefined || main === undefined) {
    return { warnings, unmapped }
  }
  warnings.push('检测到 legacy dsh.plugin.json（repository-plugin 分发已于 0811 移除）：'
    + '按只读映射为规范字段并继续；迁移文档随 mygo init 候选功能规划')
  return {
    value: {
      formatVersion: 1,
      id,
      version: version ?? '0.0.0-legacy',
      entry: main,
      requires: {},
      core: core ?? '*',
      recommends: {},
      provides: [],
      entrypoints: {},
      bundles: [],
      ...(file.contributes === undefined && file.client === undefined
        ? {}
        : {
            environment: {
              ...(file.contributes === undefined ? {} : { contributes: file.contributes }),
              ...(file.client === undefined ? {} : { client: file.client }),
            },
          }),
    },
    warnings,
    unmapped,
  }
}
