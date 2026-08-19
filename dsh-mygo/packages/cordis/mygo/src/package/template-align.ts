/**
 * 官方模板对齐工具（design-r3 §5.5，B16）：以 plugin-template package.json
 * 形态为参考输入，生成/校验 manifest（mygo init 候选，本轮不实现安装）。
 * 参考形态：exports `.`/`./invariant`/`./src/*`、peers `cordis`+`schemastery`、
 * `dsh.bundle.patch`、自包含 prepare 构建、`private→false` 发布门（Rev-6）。
 * @module @r05en1cu/dsh-mygo/src/package/template-align
 */

/** 模板参考形态（npm 强兼容，census §1.2/D7）。 */
export const TEMPLATE_REFERENCE = {
  peers: {
    cordis: '^4.0.0-rc.7',
    schemastery: '^3.18.0',
  },
  exports: ['.', './invariant', './src/*', './package.json'],
  scripts: ['build', 'test', 'typecheck', 'verify:self-contained', 'prepare'],
} as const

/** 对齐检查结果（只读；告警级；不阻断）。 */
export interface TemplateAlignResult {
  readonly aligned: boolean
  readonly gaps: readonly string[]
  readonly warnings: readonly string[]
}

/** 校验一个 package.json 是否与官方模板形态对齐（B16/T18）。 */
export function checkTemplateAlignment(pkg: unknown): TemplateAlignResult {
  const gaps: string[] = []
  const warnings: string[] = []
  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) {
    return { aligned: false, gaps: ['package.json 不是对象'], warnings }
  }
  const record = pkg as {
    readonly main?: unknown
    readonly types?: unknown
    readonly exports?: unknown
    readonly peerDependencies?: Readonly<Record<string, unknown>>
    readonly scripts?: Readonly<Record<string, unknown>>
    readonly dsh?: { readonly bundle?: { readonly patch?: unknown } }
    readonly private?: unknown
  }
  if (typeof record.main !== 'string') gaps.push('main（模板为 lib/index.js）')
  if (typeof record.types !== 'string') gaps.push('types（模板为 lib/types/index.d.ts）')
  const exportsValue = record.exports
  if (typeof exportsValue !== 'object' || exportsValue === null) {
    gaps.push('exports（模板含 . / ./invariant / ./src/* / ./package.json）')
  }
  const peers = record.peerDependencies ?? {}
  if (peers.cordis !== TEMPLATE_REFERENCE.peers.cordis) {
    gaps.push(`peerDependencies.cordis（模板 ${TEMPLATE_REFERENCE.peers.cordis}）`)
  }
  if (peers.schemastery !== TEMPLATE_REFERENCE.peers.schemastery) {
    gaps.push(`peerDependencies.schemastery（模板 ${TEMPLATE_REFERENCE.peers.schemastery}）`)
  }
  const scripts = record.scripts ?? {}
  for (const script of TEMPLATE_REFERENCE.scripts) {
    if (typeof scripts[script] !== 'string') gaps.push(`scripts.${script}（模板自包含构建/校验）`)
  }
  if (typeof record.dsh?.bundle?.patch !== 'string') {
    gaps.push('dsh.bundle.patch（bundle 分发形态）')
  }
  if (record.private === false) {
    warnings.push('private=false：按官方发布门，仅当公共依赖与分发产物就绪后再发布')
  }
  return { aligned: gaps.length === 0, gaps, warnings }
}
