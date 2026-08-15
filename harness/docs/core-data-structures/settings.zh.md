# 用户设置

[English](settings.md) | 中文

[dsh-settings](../../packages/settings/settings) 的用户设置 seam 持有一份按 namespace 分节的用户文档，并把每个已注册 namespace 解析为：schema 默认值，然后注册方的组合 `base`，最后用户分节。[dsh-settings-local](../../packages/settings/settings-local) 这类 provider 存储原始文档并推送外部编辑；消费插件注册 schema 后读取或观察解析值。组合配置仍留在 `cordis.yml`——namespace 只承载用户可编辑子集。

Source: [`packages/settings/settings/src/index.ts`](../../packages/settings/settings/src/index.ts)

## 标识

namespace 命名用户文档中一个插件所有的分节。brand 使其不与其他跨边界 id 混用；构造时校验小写 kebab-case 形态。

```ts type-equiv
/** Nominal id of one registered settings namespace. */
type SettingsNamespace = Branded<'SettingsNamespace'>
```

## 注册

注册把 schemastery schema 绑定到调用方插件 fiber 上的 namespace——dispose 该 fiber 即移除 namespace 及其观察者。options 携带组合层、owner 的生效时机，以及一个可选的、用于校验 schema 表达不了的约束的钩子。

```ts type-equiv
/** Registration options beyond the namespace schema. */
interface SettingsRegisterOptions<T> {
  /** Composition-layer values resolved below the user layer (entry-config subset). */
  base?: Partial<T>
  /** Owner's effect timing, surfaced to configuration UIs; defaults to `live`. */
  applies?: SettingsApplies
  /**
   * Reject a resolved section the owner could not act on, for constraints its
   * schema cannot express — a cross-field requirement, or one field's validity
   * depending on another's. Throwing here refuses the *write* that produced the
   * value, so a caller learns at `update`/`replace`/`mutate` instead of storing
   * something that would silently disable the owner.
   *
   * Kept separate from the schema because the schema is also what a
   * configuration surface renders and what an absent section resolves through;
   * folding a cross-field check into it would change both.
   *
   * Once the owner is registered, a stored section that fails this keeps the
   * namespace's last good value and warns, exactly as a schema failure does,
   * so an externally edited document cannot strand a running owner. At
   * registration there is no last good value yet, so a stored section that
   * already fails rejects the registration itself — again exactly as a schema
   * failure does.
   * @param value - the resolved section, schema-valid by construction.
   */
  validate?: (value: T) => void
}
```

`validate` 在 schema 接纳该值之后运行，因此它看到的默认值与组合 base 与 owner 将看到的完全一致。`dsh-llm-pi-ai` 用它在写入处拒绝自己无法服务的提供方 profile，而不是先存下来、再让该 namespace 下每条路由失效。

`applies` 是 UI 提示而非机制：`restart` 的 owner 只是从不 watch，其值在构造期读取一次，配置界面可为待生效变更加标。

```ts type-equiv
/** When a namespace's changes take effect for its owner. */
type SettingsApplies = 'live' | 'restart'
```

## Owner scope

scope 是面向 owner 的句柄。`update` 把稀疏 patch 只合并进用户分节（绝不进 `base`）；`replace` 整体替换分节，是删除/重置路径——替换中缺席的键重新继承 `base` 与 schema 默认值。同一 namespace 的写入按调用顺序串行，解析值是深冻结快照。

```ts type-equiv
/** Owner-facing handle for one registered namespace. */
interface SettingsScope<T> {
  /** Current resolved value: schema defaults, then `base`, then the user layer. */
  get(): T
  /**
   * Observe committed changes to this namespace's resolved value. Invocations
   * of one callback run asynchronously, one at a time, in commit order; a
   * rejection is contained and logged like a sync throw. After the disposer
   * returns, no further invocation starts — one already queued is skipped;
   * one already started still settles, and service disposal waits for it.
   * @param callback - invoked after each commit with the next and previous values.
   * @returns the disposer removing this observer.
   */
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
  /**
   * Merge a partial patch into this namespace's user layer and persist it.
   * @param patch - plain-object patch over the user section; JSON-shaped data
   * only (non-JSON values reject with their path before anything persists).
   */
  update(patch: object): Promise<void>
  /**
   * Replace this namespace's user section wholesale; absent keys re-inherit
   * the composition `base` and schema defaults (`replace({})` resets all).
   * @param section - the complete next user section; JSON-shaped data only,
   * as for {@link update}.
   */
  replace(section: object): Promise<void>
}
```

## 描述符

`describe()` 为配置界面序列化每个已注册 namespace：schemastery 的 `toJSON()` 信封驱动 schema 渲染的表单，解析值填充表单，分离出的 `base`/`user` 层让表单按字段是否出现在 user 层标注「用户已覆盖」。`describe({ redactSecrets: true })`——每个 wire 面都必须传入——从三层剥离 `role('secret')` 字段并枚举其 `{path, set}` 槽位，页面因此能渲染只写输入框而永远收不到机密值。

```ts type-equiv
/** One registered namespace as surfaced to configuration UIs. */
interface SettingsDescriptor {
  /** The registered namespace. */
  ns: SettingsNamespace
  /** Serialized schemastery schema (`schema.toJSON()`). */
  schema: unknown
  /** Current resolved value. */
  value: unknown
  /**
   * Monotonic revision of the raw user section this descriptor was read at.
   * Send it back as `expectedRevision` on a write to refuse a stale one.
   */
  revision: number
  /** Registrant's composition `base` layer (detached), when one was declared. */
  base?: unknown
  /**
   * Raw user section from the stored document (detached), when one exists and
   * is well-formed; a field's presence here is what marks it user-overridden.
   */
  user?: unknown
  /** Owner's declared effect timing. */
  applies: SettingsApplies
  /** Schema-declared secret positions; present only under `redactSecrets`. */
  secrets?: RedactedSecret[]
}
```

只持有脱敏 descriptor 的调用方无法安全地重建分节，因此删除改以路径 op 传递。每个 descriptor 还携带针对原始分节的 `revision`；写入可以把它作为 `expectedRevision` 送回，不再匹配的写入会被拒绝，而不是覆盖在先落地的那个写方之上。
```ts type-equiv
/**
 * One path-addressed edit to a namespace's user section. Path mutation exists
 * for a caller holding an INCOMPLETE view of the section — a configuration UI
 * reads the redacted descriptor, which by construction never received the
 * `role('secret')` fields. Such a caller can name the field it means without
 * restating the section: a wholesale `replace` rebuilt from a redacted
 * document silently deletes every secret the wire never returned.
 */
type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }
```

```ts type-equiv
/** Options for {@link Settings.describe}. */
interface SettingsDescribeOptions {
  /**
   * Strip `role('secret')` fields from `value`/`base`/`user` and enumerate
   * them in each descriptor's `secrets`. Every wire surface MUST pass this;
   * the verbatim default exists for same-process configuration UIs only.
   */
  redactSecrets?: boolean
}
```

## 变更提交

每次提交的变更——进程内写入或 provider 观察到的外部编辑——在新值成为权威值之后发出 `settings/updated (ns, next, prev, source)`，解析值深相等时绝不发出。source 标记区分两条入口路径。

```ts type-equiv
/** Origin of one committed settings change. */
type SettingsUpdateSource = 'update' | 'provider'
```
