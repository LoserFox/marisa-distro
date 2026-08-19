/**
 * The plugin management error vocabulary: one error class, a closed code
 * table, and message templates that name every machine entity the spec
 * §16.2 attaches to each code.
 *
 * CD-1 统一（2026-08-13，next 分支）：ResolutionReport 的有生产者码并入本表
 * （组 7），两侧的码表从此同源；零生产者的死码已删除（grant-missing /
 * install-denied / ceiling-exceeded / source-not-allowed / provenance-rejected
 * / fs-denied / network-denied / vars-denied / http-denied / emit-denied），
 * 求解体系退役带走 lockfile-mismatch / dependency-cycle / dispose-timeout。
 * @module @r05en1cu/dsh-mygo-api/src/error
 */

/**
 * Stable kebab-case error codes for the plugin management surface (§16.2).
 * The comment on each code lists the "naming X" entities its message template
 * must render; `details` carries exactly those entities, machine-readable.
 * Service isolation is deliberately NOT a code: `env.get` returns `undefined`
 * for an undeclared capability.
 */
export type PluginErrorCode =
  // 组 1：manifest 与声明校验（mount 期，fiber 建立前）
  /** zod/schema failure; details: field + expected */
  | 'manifest-invalid'
  /** event outside the harness tier (`internal/*`); details: event + tier */
  | 'event-not-mountable'
  /** declared transform/intercept above the event's `@mode` ceiling; details: event + mode + ceiling */
  | 'mode-ceiling-exceeded'
  /** requires/provides entry contains `@`; details: entry + note (v2 name@range) */
  | 'capability-range-reserved'
  /** declared property is not on the event's return type; details: event + name + valid */
  | 'unknown-property'
  /** payload-external name such as `service:*`; details: name + boundary */
  | 'non-payload-name'
  /** direct EventOptions (e.g. prepend) passed where manifest position is the only entry; details: option */
  | 'unsupported-event-option'
  // 组 2：权限与授权（mount 期）
  /** writes hits a protected field; details: field */
  | 'protected-field'
  // 组 3：关系冲突（install/replace 期，对当前 peer 集求值）
  /** two plugins write the same property on intersecting scopes; details: a + b + property + scope */
  | 'write-conflict'
  /** two interceptors where one may return a non-deny branch; details: a + b + event + branch */
  | 'intercept-branch-conflict'
  /** derived edges form a cycle in one scope; details: cycle + scope */
  | 'ordering-cycle'
  /** two outermost intercept plugins; details: a + b */
  | 'veto-position-conflict'
  /** returning to a cached generation conflicts with a newly installed companion; details: companion */
  | 'companion-conflict'
  /** config write carries a stale revision; details: id + expected + actual */
  | 'config-revision-conflict'
  /** package-level requires/breaks constraint violated; details: plugin + violations */
  | 'compatibility-conflict'
  /** claims targets a slot a raw Cordis plugin holds; details: slot */
  | 'claims-unmanaged-incumbent'
  /** scoped registration shadows a global name without a claims declaration; details: tool + holder */
  | 'shadow-undeclared'
  /** two plugins claim the same slot on intersecting scopes; details: a + b + slot + scope */
  | 'claims-conflict'
  // 组 4：协议操作失败（install/uninstall/replace/enable 中途）
  /** plugins depend on the target; details: dependents */
  | 'dependent-exists'
  /** overlapping operations on one id; details: id + operation */
  | 'concurrent-operation'
  /** enable/disable/replace target id is not in the managed set (caller bug); details: id + operation */
  | 'plugin-not-found'
  /** bounded next-idle/drain wait timed out; details: policy + waitedMs */
  | 'swap-timeout'
  /** staging setup/validation failed, current generation stays live; details: stage + cause */
  | 'staging-failed'
  /** sqlite persist failed; details: operation + table */
  | 'persist-failed'
  /** registry quotas (maxCodeBytes/maxRegistryBytes/maxDynamicPlugins) exceeded; details: limit + current */
  | 'quota-registry-exceeded'
  /** npm source failed double-anchor resolution; details: package + anchors */
  | 'package-not-resolvable'
  /** on/registerTool/provide called during setup; details: method */
  | 'setup-registration'
  // 组 5：dispatch 边界违规（运行时，容器吞没，计数；从不终结 dispatch）
  /** transform listener returned without next(); details: plugin + event */
  | 'next-missing'
  /** intercept:[] plugin vetoed or an observe listener bailed on serial; details: plugin + event */
  | 'undeclared-veto'
  /** interceptor returned an undeclared branch; details: plugin + event + branch */
  | 'undeclared-branch'
  /** own-time CPU budget exceeded (not counting awaited next() windows); dispatch skipped */
  | 'quota-cpu-exceeded'
  /** registration quotas (100 listeners / 50 tools / 20 services) exceeded; details: kind + limit */
  | 'quota-effects-exceeded'
  // 组 6：能力拒绝（env.* 边界，同步 throw，先于任何实际操作）
  /** model call outside llmAccess grants or with no host seam; details: plugin + model */
  | 'llm-denied'
  /** subprocess command outside execAccess grants or with no host seam; details: plugin + command */
  | 'exec-denied'
  // 组 7：包治理报告（CD-1 并入：ResolutionReport 码，summary 为自由文本报告）
  /** registry 候选集内没有可安装版本；details: package + reasons */
  | 'resolve-failed'
  /** 安装期 bundles 声明校验失败（扫描/未声明内嵌包）；details: plugin + problems */
  | 'bundle-invalid'
  /** 引用了提供方不存在的符号；details: plugin + symbols */
  | 'symbol-missing'
  /** requires 政策闸拒绝（服务缺失/提供者版本不符）；details: plugin + violations */
  | 'policy-rejected'
  /** pack 清单/成员预检失败；details: problems */
  | 'pack-invalid'
  /** pack vendored 文件 sha512/fileSize 失配；details: files */
  | 'pack-hash-mismatch'

/**
 * The single error class of the plugin management surface. `message` is
 * generated from the code template plus `details` (see {@link formatPluginError})
 * and names every "naming X" entity of §16.2 for that code; `details` itself
 * stays machine-readable for audit and test assertions. `pluginId` is required
 * when ownership is known (install-phase failures name the source plugin).
 */
export class PluginError extends Error {
  override readonly name = 'PluginError'

  /**
   * @param code - stable error code from the §16.2 table.
   * @param message - human-readable message naming every entity the code template requires.
   * @param details - machine-readable naming entities for the code.
   * @param pluginId - owning plugin id when attribution is known.
   */
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly pluginId?: string,
  ) {
    super(message)
  }
}

/** Render one detail value into a human-readable template slot. */
function render(value: unknown): string {
  if (Array.isArray(value)) return value.map(render).join(', ')
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/**
 * One message template per code. Each template names every "naming X" entity
 * listed for its code in §16.2; codes without a listed entity use a constant
 * template describing the trigger from the code table.
 */
const MESSAGE_TEMPLATES: Record<PluginErrorCode, (details: Record<string, unknown>) => string> = {
  'manifest-invalid': details =>
    `manifest invalid: field ${render(details.field)} expected ${render(details.expected)}`,
  'event-not-mountable': details =>
    `event ${render(details.event)} is not mountable: outside harness tier ${render(details.tier)}`,
  'mode-ceiling-exceeded': details =>
    `mode ceiling exceeded for event ${render(details.event)}: declared @mode ${render(details.mode)} exceeds ceiling ${render(details.ceiling)}`,
  'capability-range-reserved': details =>
    `capability entry ${render(details.entry)} uses reserved range syntax: ${render(details.note)}`,
  'unknown-property': details =>
    `unknown property ${render(details.name)} for event ${render(details.event)}; valid set: ${render(details.valid)}`,
  'non-payload-name': details =>
    `name ${render(details.name)} is outside the payload-only boundary (${render(details.boundary)})`,
  'unsupported-event-option': details =>
    `unsupported event option ${render(details.option)}: manifest position is the only listener-option entry`,
  'protected-field': details =>
    `protected field ${render(details.field)} is not writable`,
  'write-conflict': details =>
    `write conflict on property ${render(details.property)} between plugins ${render(details.a)} and ${render(details.b)} (scope ${render(details.scope)})`,
  'intercept-branch-conflict': details =>
    `intercept branch conflict on ${render(details.branch)} for event ${render(details.event)} between plugins ${render(details.a)} and ${render(details.b)}`,
  'ordering-cycle': details =>
    `ordering cycle ${render(details.cycle)} in scope ${render(details.scope)}`,
  'veto-position-conflict': details =>
    `veto position conflict between outermost intercept plugins ${render(details.a)} and ${render(details.b)}`,
  'companion-conflict': details =>
    `companion ${render(details.companion)} conflicts with the cached generation`,
  'config-revision-conflict': details =>
    `config revision conflict for plugin ${render(details.id)}: expected ${render(details.expected)}, actual ${render(details.actual)}`,
  'compatibility-conflict': details => {
    const lines = Array.isArray(details.violations)
      ? (details.violations as unknown[]).map(line => `  - ${String(line)}`).join('\n')
      : String(details.violations)
    return `compatibility constraints violated for plugin ${render(details.plugin)}:\n${lines}`
  },
  'claims-unmanaged-incumbent': details =>
    `claims target ${render(details.slot)} is held by an unmanaged incumbent; manager authority covers only the set it registered`,
  'shadow-undeclared': details =>
    `undeclared shadow of tool ${render(details.tool)} held by ${render(details.holder)}`,
  'claims-conflict': details =>
    `claims conflict on slot ${render(details.slot)} between plugins ${render(details.a)} and ${render(details.b)} (scope ${render(details.scope)})`,
  'dependent-exists': details =>
    `dependent plugins exist: ${render(details.dependents)}`,
  'concurrent-operation': details =>
    `concurrent operation on plugin ${render(details.id)}: ${render(details.operation)} already in progress`,
  'plugin-not-found': details =>
    `plugin ${render(details.id)} not found for ${render(details.operation)}: the managed set has no such plugin (caller bug)`,
  'swap-timeout': details =>
    `swap timed out after ${render(details.waitedMs)} ms under swapPolicy ${render(details.policy)}`,
  'staging-failed': details =>
    `staging failed at ${render(details.stage)}: ${render(details.cause)}`,
  'persist-failed': details =>
    `persist failed for ${render(details.operation)} on table ${render(details.table)}`,
  'quota-registry-exceeded': details =>
    `registry quota exceeded: limit ${render(details.limit)}, current ${render(details.current)}; uninstall plugins to free capacity`,
  'package-not-resolvable': details =>
    `package ${render(details.package)} not resolvable from anchors: ${render(details.anchors)}`,
  'setup-registration': details =>
    `registration via ${render(details.method)} is not allowed during setup; registrations belong to activate`,
  'next-missing': details =>
    `transform listener for ${render(details.plugin)} on event ${render(details.event)} returned without calling next()`,
  'undeclared-veto': details =>
    `undeclared veto by ${render(details.plugin)} on event ${render(details.event)}`,
  'undeclared-branch': details =>
    `interceptor ${render(details.plugin)} returned undeclared branch ${render(details.branch)} for event ${render(details.event)}`,
  'quota-cpu-exceeded': () =>
    'CPU quota exceeded for own-time execution; dispatch skipped',
  'quota-effects-exceeded': details =>
    `registration quota exceeded for ${render(details.kind)}: limit ${render(details.limit)}`,
  'llm-denied': details =>
    `model call denied for plugin ${render(details.plugin)}: model ${render(details.model)} is outside llmAccess`,
  'exec-denied': details =>
    `subprocess execution denied for plugin ${render(details.plugin)}: command ${render(details.command)} is outside execAccess`,
  'resolve-failed': details =>
    `resolve failed for ${render(details.package)}: ${render(details.reasons)}`,
  'bundle-invalid': details =>
    `bundle declarations invalid for ${render(details.plugin)}: ${render(details.problems)}`,
  'symbol-missing': details =>
    `missing symbols for ${render(details.plugin)}: ${render(details.symbols)}`,
  'policy-rejected': details =>
    `requires policy rejected for ${render(details.plugin)}: ${render(details.violations)}`,
  'pack-invalid': details =>
    `pack invalid: ${render(details.problems)}`,
  'pack-hash-mismatch': details =>
    `pack file hash mismatch: ${render(details.files)}`,
}

/**
 * Generate the human-readable message for one error code from its template and
 * machine-readable details. Every "naming X" entity listed for the code in
 * §16.2 is rendered into the message.
 * @param code - error code selecting the message template.
 * @param details - machine-readable naming entities for the code.
 * @returns the template-formatted message.
 */
export function formatPluginError(code: PluginErrorCode, details: Record<string, unknown>): string {
  return MESSAGE_TEMPLATES[code](details)
}
