/**
 * hub 条目可安装判定与治理元数据评估（P5）：`listing.state !== 'blocked'`
 * 且 release 存在为硬门；risk 分级 / vulnerabilityScan / nativeCode /
 * installScripts / maintenance / relations / capabilities 进安装前提示
 * （建议式，不强制）。本面即 hub 治理元数据进兼容性报告的维度
 * （CLI hub info / hub install 前置输出消费）。
 * @module @r05en1cu/dsh-mygo-loader-hub/assess
 */

import type { HubEntry, HubRelease } from './registry.ts'

export interface HubAssessment {
  /** 硬门结果（blocked / release 缺失 → false）。 */
  readonly installable: boolean
  /** 阻断原因（硬门）。 */
  readonly blocks: readonly string[]
  /** 建议式提示（风险/治理元数据；不阻断）。 */
  readonly advisories: readonly string[]
}

/** 选取目标 release（缺省 latestRelease）；不存在返回 undefined。 */
export function pickHubRelease(entry: HubEntry, releaseId?: string): HubRelease | undefined {
  const id = releaseId ?? entry.latestRelease
  return entry.releases.find(release => release.id === id)
}

/** 评估一个 hub 条目（可选指定 release）的可安装性与治理提示。 */
export function assessHubEntry(entry: HubEntry, releaseId?: string): HubAssessment {
  const blocks: string[] = []
  const advisories: string[] = []
  if (entry.listing.state === 'blocked') {
    blocks.push(`条目已被 hub 阻断（listing.state = blocked）`)
  }
  const release = pickHubRelease(entry, releaseId)
  if (release === undefined) {
    blocks.push(`release 不存在：${releaseId ?? entry.latestRelease}`)
  }
  // risk 分级与事实（建议式）
  if (entry.risk.level === 'high' || entry.risk.level === 'critical') {
    advisories.push(`风险分级 ${entry.risk.level}（建议人工复核源码后再装）`)
  } else if (entry.risk.level === 'unknown') {
    advisories.push('风险分级未知（未经 hub 评估）')
  }
  if (entry.risk.facts.vulnerabilityScan === 'findings') {
    advisories.push('漏洞扫描有发现（vulnerabilityScan = findings）')
  }
  if (entry.risk.facts.nativeCode === 'present') {
    advisories.push('包含原生代码（nativeCode = present）')
  }
  if (entry.risk.facts.installScripts === 'present') {
    advisories.push('包含安装脚本（installScripts = present）')
  }
  if (entry.listing.trustedPublisher === 'requested') {
    advisories.push('可信发布者身份待核实（trustedPublisher = requested）')
  }
  if (entry.maintenance.state !== 'active') {
    const notice = entry.maintenance.notice === null || entry.maintenance.notice === undefined
      ? ''
      : `：${entry.maintenance.notice}`
    advisories.push(`维护状态 ${entry.maintenance.state}${notice}`)
  }
  // relations / capabilities：catalog 源维度，registry 快照暂未释放；防御性消费
  for (const relation of entry.relations?.required ?? []) {
    advisories.push(`声明必需关系 ${relation.projectId}（${relation.releaseId}）：安装前请确认已就位`)
  }
  const capabilities = release?.capabilities
  if (capabilities?.requiresFabric === true) advisories.push('需要 fabric 宿主能力（requiresFabric）')
  if (capabilities?.deepHook === true) advisories.push('使用深钩子（deepHook）')
  if (capabilities?.restartRequired === true) advisories.push('安装后需要重启宿主（restartRequired）')
  return { installable: blocks.length === 0, blocks, advisories }
}
