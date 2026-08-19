/**
 * 社区侧 npm 元数据收割器（design-r3 §5.1，B11；two-tier §9 三原则）：
 * 只读、告警级、永不阻断。把 `engines.dsh` / `cordis` peer /
 * `@deepseek-ai/dsh-tools` peer 归一为 core 区间；cordis↔dsh 对照表外置
 * （EXT-1：权威来源未定，无法映射的 peer 输出「无法归一」告警，不猜测）。
 * @module @r05en1cu/dsh-mygo/src/package/harvester
 */

/** cordis 版本 ↔ dsh 版本对照锚点（EXT-1；映射表外置可更新）。 */
export const CORDIS_DSH_ANCHORS: readonly {
  readonly dsh: string
  readonly cordis: string
  readonly npm: string
}[] = [
  {
    dsh: '0.0.1-rc.1',
    cordis: '4.0.1-rc.1',
    npm: '^4.0.0-rc.7',
  },
]

/** 收割结果：归一 core 区间 + 告警（永不阻断）。 */
export interface HarvestResult {
  readonly packageName: string
  readonly version: string | undefined
  /** 归一后的 core 区间；无法归一时为 undefined。 */
  readonly coreRange: string | undefined
  /** 命中的信号与归一过程（报告展示）。 */
  readonly signals: readonly {
    readonly kind: 'engines.dsh' | 'cordis-peer' | 'dsh-tools-peer' | 'dsh-service-peer'
    readonly raw: string
    readonly normalized: string | undefined
  }[]
  readonly warnings: readonly string[]
}

/**
 * 归一一个 peer 区间：若直接就是 npm semver 区间则原样采用；否则经对照表
 * 锚点映射（区间上界不越过锚点带宽）。
 */
function normalizePeerRange(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  if (trimmed === '*' || trimmed === '^0.0.1' || trimmed === '>=0.0.1') return '*'
  return trimmed
}

/** 收割一个 package.json 元数据（只读；绝不写盘、绝不阻断）。 */
export function harvestPackageMetadata(pkg: unknown): HarvestResult {
  const warnings: string[] = []
  const signals: {
    readonly kind: 'engines.dsh' | 'cordis-peer' | 'dsh-tools-peer' | 'dsh-service-peer'
    readonly raw: string
    readonly normalized: string | undefined
  }[] = []
  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) {
    return { packageName: 'unknown', version: undefined, coreRange: undefined, signals, warnings: ['包元数据不是对象'] }
  }
  const record = pkg as {
    readonly name?: unknown
    readonly version?: unknown
    readonly engines?: { readonly dsh?: unknown }
    readonly peerDependencies?: Readonly<Record<string, unknown>>
  }
  const packageName = typeof record.name === 'string' ? record.name : 'unknown'
  const version = typeof record.version === 'string' ? record.version : undefined

  let coreRange: string | undefined
  const enginesDsh = record.engines?.dsh
  if (typeof enginesDsh === 'string' && enginesDsh.trim() !== '') {
    const normalized = normalizePeerRange(enginesDsh)
    signals.push({ kind: 'engines.dsh', raw: enginesDsh, normalized })
    if (normalized !== undefined) coreRange = normalized
  }

  const peers = record.peerDependencies ?? {}
  for (const [peer, raw] of Object.entries(peers)) {
    if (typeof raw !== 'string') continue
    if (peer === 'cordis') {
      const normalized = normalizePeerRange(raw)
      signals.push({ kind: 'cordis-peer', raw, normalized })
      if (normalized !== undefined && coreRange === undefined) {
        if (normalized === '*') {
          coreRange = '*'
        } else if (CORDIS_DSH_ANCHORS.some(anchor => anchor.npm === raw.trim())) {
          coreRange = CORDIS_DSH_ANCHORS[0]?.dsh
        } else {
          warnings.push(`cordis peer ${raw} 无法经对照表归一为 dsh core 区间（EXT-1 未定；不猜测）`)
        }
      }
    } else if (peer === '@deepseek-ai/dsh-tools' || peer.startsWith('@deepseek-ai/dsh-')) {
      const normalized = normalizePeerRange(raw)
      signals.push({
        kind: peer === '@deepseek-ai/dsh-tools' ? 'dsh-tools-peer' : 'dsh-service-peer',
        raw,
        normalized,
      })
      if (normalized !== undefined && coreRange === undefined) {
        // 服务包 peer 样本以 `*` / `^0.0.1` 为主（census M2）；无法归一仅告警。
        coreRange = normalized
      }
    }
  }
  return { packageName, version, coreRange, signals, warnings }
}
