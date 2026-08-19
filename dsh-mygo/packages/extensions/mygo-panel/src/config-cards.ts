/**
 * 配置卡片基础设施（r6）：schemastery Config schema 的内省面（JSON 安全的
 * schema 摘要 + 起始模板，供 node half 的 config-cards API 与 client half
 * 的通用配置表单共用）+ bundle 行 id 推导 + 配置导入导出纯函数。
 * @module @r05en1cu/dsh-mygo-ext-panel/config-cards
 */

/** Structural schemastery schema surface (no runtime dependency on the package). */
export interface ConfigSchemaLike {
  readonly type?: string
  readonly meta?: {
    readonly required?: boolean
    readonly default?: unknown
    readonly description?: string | Record<string, string>
    readonly role?: string
    readonly extra?: unknown
    readonly min?: number
    readonly max?: number
    readonly step?: number
    readonly pattern?: { readonly source?: string; readonly flags?: string }
    readonly hidden?: boolean
  }
  readonly dict?: Record<string, ConfigSchemaLike>
  readonly list?: readonly ConfigSchemaLike[]
  readonly inner?: ConfigSchemaLike
  readonly value?: unknown
  readonly builder?: () => ConfigSchemaLike
}

/** One user-editable config field surfaced by the panel. */
export interface ConfigFieldInfo {
  readonly name: string
  readonly type: string
  readonly required: boolean
  readonly description?: string
  readonly role?: string
  readonly extra?: unknown
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly pattern?: string
  readonly default?: unknown
  readonly literal?: unknown
  readonly enumValues?: readonly unknown[]
  readonly children?: readonly ConfigFieldInfo[]
  /** P1 plughub form parity: secret fields are write-only on the wire. */
  readonly secret?: boolean
  /** P1: whether a redacted secret slot currently holds a value. */
  readonly secretSet?: boolean
  /** P1: `array(string)` item type marker. */
  readonly items?: string
  /** P1: `dict(string)` value type marker. */
  readonly values?: string
  /** P1: schema type unsupported by the generic editor. */
  readonly unsupported?: boolean
}

/** Schema summary + a JSON-safe starter template for one plugin config. */
export interface ConfigSchemaInfo {
  readonly description: string
  readonly fields: readonly ConfigFieldInfo[]
  readonly template: unknown
}

/** Resolve lazy schemastery nodes so introspection sees the real shape. */
export function resolveConfigSchema(schema: ConfigSchemaLike): ConfigSchemaLike {
  if (schema.type === 'lazy' && schema.builder !== undefined) {
    try {
      return resolveConfigSchema(schema.builder())
    } catch {
      return schema
    }
  }
  return schema
}

/** JSON-safe starter value for one schema node (placeholder, never a live path). */
export function configSchemaTemplateOf(schema: ConfigSchemaLike): unknown {
  const node = resolveConfigSchema(schema)
  switch (node.type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [name, field] of Object.entries(node.dict ?? {})) {
        const child = resolveConfigSchema(field)
        if (child.meta?.default !== undefined) {
          out[name] = child.meta.default
        } else {
          out[name] = configSchemaTemplateOf(child)
        }
      }
      return out
    }
    case 'union': {
      const branches = node.list ?? []
      const preferred = branches.find(branch => resolveConfigSchema(branch).meta?.default !== undefined) ?? branches[0]
      return preferred === undefined ? undefined : configSchemaTemplateOf(preferred)
    }
    case 'array':
      return []
    case 'dict':
      return {}
    case 'const':
      return node.value
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'transform':
      return node.inner === undefined ? undefined : configSchemaTemplateOf(node.inner)
    default:
      return node.meta?.default
  }
}

/** Describe one object field for the panel's expandable config surface. */
export function configFieldInfoOf(name: string, field: ConfigSchemaLike): ConfigFieldInfo {
  const node = resolveConfigSchema(field)
  const description = node.meta?.description
  const secret = node.meta?.role === 'secret'
  const supported = node.type === 'string'
    || node.type === 'number'
    || node.type === 'integer'
    || node.type === 'boolean'
    || node.type === 'const'
    || node.type === 'union'
    || (node.type === 'array' && resolveConfigSchema(node.inner ?? {}).type === 'string')
    || (node.type === 'dict' && resolveConfigSchema(node.inner ?? {}).type === 'string')
    || node.type === 'object'
  return {
    name,
    type: node.type ?? 'any',
    required: node.meta?.required ?? false,
    ...(description === undefined
      ? {}
      : { description: typeof description === 'string' ? description : JSON.stringify(description) }),
    ...(node.meta?.role === undefined ? {} : { role: node.meta.role }),
    ...(node.meta?.extra === undefined ? {} : { extra: node.meta.extra }),
    ...(node.meta?.min === undefined ? {} : { min: node.meta.min }),
    ...(node.meta?.max === undefined ? {} : { max: node.meta.max }),
    ...(node.meta?.step === undefined ? {} : { step: node.meta.step }),
    ...(node.meta?.pattern === undefined || node.meta.pattern.source === undefined
      ? {}
      : { pattern: node.meta.pattern.source }),
    ...(node.meta?.default === undefined ? {} : { default: node.meta.default }),
    ...(secret ? { secret: true } : {}),
    unsupported: !supported,
    ...(node.type === 'const' ? { literal: node.value } : {}),
    ...(node.type === 'array' && resolveConfigSchema(node.inner ?? {}).type === 'string'
      ? { items: 'string' }
      : {}),
    ...(node.type === 'dict' && resolveConfigSchema(node.inner ?? {}).type === 'string'
      ? { values: 'string' }
      : {}),
    ...(node.type === 'union'
      ? {
          enumValues: (node.list ?? [])
            .filter(branch => resolveConfigSchema(branch).type === 'const')
            .map(branch => (resolveConfigSchema(branch) as { value?: unknown }).value),
        }
      : {}),
    ...(node.type === 'object'
      ? {
          children: Object.entries(node.dict ?? {})
            .filter(([, child]) => resolveConfigSchema(child).meta?.hidden !== true)
            .map(([childName, child]) => configFieldInfoOf(childName, child)),
        }
      : {}),
  }
}

/** Schema summary + starter template for one schemastery Config schema. */
export function configSchemaInfoOf(schema: ConfigSchemaLike): ConfigSchemaInfo | undefined {
  const root = resolveConfigSchema(schema)
  let description = ''
  try {
    const text = String(schema)
    if (text !== '') description = text
  } catch {
    // unreadable description: keep empty
  }
  let fields: ConfigFieldInfo[] = []
  if (root.type === 'object') {
    fields = Object.entries(root.dict ?? {})
      .filter(([, field]) => resolveConfigSchema(field).meta?.hidden !== true)
      .map(([name, field]) => configFieldInfoOf(name, field))
  } else if (root.type === 'union') {
    const firstObject = (root.list ?? []).find(branch => resolveConfigSchema(branch).type === 'object')
    if (firstObject !== undefined) {
      fields = Object.entries(resolveConfigSchema(firstObject).dict ?? {})
        .filter(([, field]) => resolveConfigSchema(field).meta?.hidden !== true)
        .map(([name, field]) => configFieldInfoOf(name, field))
    }
  }
  const template = configSchemaTemplateOf(root)
  if (typeof template !== 'object' || template === null || Array.isArray(template)) return undefined
  return { description, fields, template }
}

/**
 * Redact secret-role values from one config object and annotate the field
 * descriptors with `secretSet`. The value itself never crosses the panel API;
 * a write with an empty secret means "keep the stored value".
 */
export function redactSecretConfig(
  fields: readonly ConfigFieldInfo[],
  config: unknown,
): { readonly config: Record<string, unknown>; readonly fields: readonly ConfigFieldInfo[] } {
  const source = typeof config === 'object' && config !== null && !Array.isArray(config)
    ? config as Record<string, unknown>
    : {}
  const out: Record<string, unknown> = { ...source }
  const nextFields = fields.map((field): ConfigFieldInfo => {
    if (field.type === 'object' && field.children !== undefined) {
      const child = redactSecretConfig(field.children, source[field.name])
      out[field.name] = child.config
      return { ...field, children: child.fields }
    }
    if (field.secret === true) {
      const value = source[field.name]
      if (field.name in out) delete out[field.name]
      return {
        ...field,
        secretSet: typeof value === 'string' && value !== ''
          || typeof value === 'number' && true
          || typeof value === 'boolean' && value,
      }
    }
    return field
  })
  return { config: out, fields: nextFields }
}

/** Merge one panel write with the stored config, keeping untyped secrets. */
export function mergeSecretConfigWrite(
  fields: readonly ConfigFieldInfo[],
  incoming: Record<string, unknown>,
  stored: unknown,
): Record<string, unknown> {
  const current = typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? stored as Record<string, unknown>
    : {}
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.type === 'object' && field.children !== undefined) {
      out[field.name] = mergeSecretConfigWrite(
        field.children,
        typeof incoming[field.name] === 'object' && incoming[field.name] !== null
          && !Array.isArray(incoming[field.name])
          ? incoming[field.name] as Record<string, unknown>
          : {},
        current[field.name],
      )
      continue
    }
    if (field.secret === true) {
      const value = incoming[field.name]
      if (value === undefined || value === '') {
        if (field.name in current) out[field.name] = current[field.name]
      } else {
        out[field.name] = value
      }
      continue
    }
    if (field.name in incoming) out[field.name] = incoming[field.name]
  }
  return out
}

/**
 * bundle 行的 patch 行 id 推导：取 bundle 自带 cordis.patch.yml 的第一个
 * insert 行 id（官方 bundle 行的 id 语义；无 insert 行回退 undefined）。
 */
export function bundleRowIdOf(patchText: string): string | undefined {
  const match = /-\s+id:\s*['"]?([a-z][a-z0-9-]*)['"]?\s*$/m.exec(patchText)
  return match?.[1]
}

// ---------------------------------------------------------------------------
// 配套配置导入导出（r6 任务 3：整 profile 粒度）
// ---------------------------------------------------------------------------

/** 导出文件格式标识。 */
export const CONFIG_EXPORT_FORMAT = 'dsh.mygo-configs/v1'

/** 一份配置导出文档（当前 profile 全部受管行的用户层 config 快照）。 */
export interface ConfigExportDocument {
  readonly format: typeof CONFIG_EXPORT_FORMAT
  readonly profile: string
  readonly exportedAt: string
  readonly configs: Readonly<Record<string, Record<string, unknown>>>
}

export function buildConfigExport(
  profile: string,
  configs: Readonly<Record<string, Record<string, unknown>>>,
  exportedAt: string,
): ConfigExportDocument {
  return { format: CONFIG_EXPORT_FORMAT, profile, exportedAt, configs }
}

export type ConfigImportParse =
  | { readonly ok: true; readonly configs: Readonly<Record<string, Record<string, unknown>>> }
  | { readonly ok: false; readonly error: string }

/** 解析导入文档（格式/format 校验 + configs 形状校验）。 */
export function parseConfigImport(raw: unknown): ConfigImportParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '导入文档不是 JSON 对象' }
  }
  const doc = raw as { readonly format?: unknown; readonly configs?: unknown }
  if (doc.format !== CONFIG_EXPORT_FORMAT) {
    return { ok: false, error: `format 必须是 ${CONFIG_EXPORT_FORMAT}（得到 ${String(doc.format)}）` }
  }
  if (typeof doc.configs !== 'object' || doc.configs === null || Array.isArray(doc.configs)) {
    return { ok: false, error: 'configs 必须是 id → config 对象映射' }
  }
  for (const [id, config] of Object.entries(doc.configs)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return { ok: false, error: `非法插件 id：${JSON.stringify(id)}` }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      return { ok: false, error: `${id} 的 config 不是对象` }
    }
  }
  return { ok: true, configs: doc.configs as Readonly<Record<string, Record<string, unknown>>> }
}

/** 导入校验结果：可写的 id 与被拒的 id（原因）。 */
export interface ConfigImportPartition {
  readonly accepted: readonly string[]
  readonly rejected: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * 按已知行集合校验导入目标：id 不在受管集（已有 patch 行或已知卡片）的
 * 拒绝并指认（防 typo 写出孤儿行）；其余放行（schema 可解析性由各写入
 * 路径自行保证——值均为 JSON 形状）。
 */
export function partitionImportTargets(
  configs: Readonly<Record<string, Record<string, unknown>>>,
  knownIds: ReadonlySet<string>,
): ConfigImportPartition {
  const accepted: string[] = []
  const rejected: { readonly id: string; readonly reason: string }[] = []
  for (const id of Object.keys(configs)) {
    if (knownIds.has(id)) accepted.push(id)
    else rejected.push({ id, reason: '不在当前 profile 的受管行集合内（patch 行与已知卡片均无此 id）' })
  }
  return { accepted, rejected }
}
