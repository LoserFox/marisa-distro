# Agent Note: Declarative entrypoint contributions for bundles

Status: proposed

[English](2026-08-08-declarative-entrypoint-contributions.md) | 中文

## Problem

如今一个 bundle 向共享扩展点做贡献只有两种方式,而对一个常见场景来说,这两种方式的形态都不对。

- **命令式注册**:插件的 `apply` 调用 `ctx.tools.register(...)` 或等效的注册表。这对有代码支撑的贡献可行,但它迫使每一个贡献——包括"挂载这个 skill 根目录"或"添加这个压缩策略描述符"这类纯静态贡献——都必须附带可执行的插件代码,而且贡献的来源(provenance)只在运行时才存在。
- **patch 行配置**:用户(或某个 bundle 层)在 `cordis.patch.yml` 层里编辑属主行的 `config`。这是声明式的,但它寻址的是*行*而不是*扩展点*:贡献者必须知道属主的 row id 和 config schema,而且两个 bundle 向同一个点做贡献时,会因 last-write-wins 相互覆盖,而不是两个都生效。

缺的是一条**多对一的声明式贡献通道**:任何 bundle 在自己的 manifest 里声明"我向扩展点 `K` 贡献这个值",而由 `K` 的属主——且只有属主——决定一个贡献值变成什么。没有它,扩展点作者就得为每个 key 各造一套配置管道;静态数据也要跑代码;移除 bundle 不能可靠地撤回它的贡献;不启动组合就无法回答"谁在向 `K` 做贡献"。

Fabric Loader 的 entrypoint 机制是现成先例:任何 mod 可以定义一个 entrypoint key,任何其他 mod 在 `fabric.mod.json` 里按该 key 贡献,`FabricLoader.getEntrypoints(key, type)` 把它们聚合成一个类型化列表。Fabric 生态的大部分解耦都来自这一个机制——`fabric-api` 定义 key,成千上万的 mod 无需互相建立编译期依赖即可贡献。本笔记的动机来自对 `fabric-loader` 的 `FabricLoader`/`EntrypointStorage`/`LanguageAdapter` 表面与 0806 profile/bundle/patch-layer 插件管理器的对照分析。

## Proposal

增加一个 manifest 声明的贡献段和一个聚合服务。共三部分,全部为增量。

### Manifest:`dsh.bundle.entrypoints`

`DshBundleManifest`(`packages/ui/app-boot/src/profile.ts`)增加一个可选段:

```jsonc
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml",
      "entrypoints": {
        "skill:roots": ["./skills"],
        "compact:strategies": [
          { "value": { "id": "prune-reads", "priority": "late" } }
        ]
      }
    }
  }
}
```

一个贡献是字符串或单键 `{ value }` 对象——**仅静态数据**。不允许模块说明符、不允许代码引用:可执行贡献继续走插件代码(`apply`)或[静态仓库插件格式](../../implemented/architecture/2026-07-30-static-repository-plugin-format.md)的固定 wrapper。这是对 Fabric `LanguageAdapter` 的刻意硬化——后者能从 manifest 字符串实例化任意类;harness 的安全立场不接受这一点,而驱动本提案的用例也不需要它。

### 聚合:`ctx.entrypoints`

一个 Cordis 服务,放在 `plugin-manager` 里(在它落地之前先作为一个独立的小型 cordis 插件):

```ts ignore-check
interface Entrypoints {
  define<T>(key: string, adapt: (value: unknown, ctx: Context) => T): void
  get<T>(key: string): readonly Contribution<T>[]
  keys(): readonly string[]
}

interface Contribution<T> {
  value: T              // adapted value, ready to use
  raw: unknown          // the manifest declaration
  provider: string      // contributing bundle's package name
}
```

- **key 有属主。** 定义 key `K` 的插件通过 `define` 注册它的 `adapt` 函数。这是 Fabric 全局适配器注册表在 harness 安全模型下的按 key 等价物:实例化逻辑属于 key 的属主,而不是一套字符串记号约定。未定义 key 下的贡献是惰性的——保留、在检视中列出、永不适配——与 Fabric 对未知 key 的处理一致。
- **顺序即 profile 层序。** `get(key)` 按 `dsh.profile.bundles` 顺序返回贡献,用户自有层在最后。这是构造上确定的——[权限与排序笔记](../../implemented/architecture/2026-08-05-plugin-permission-levels-and-transform-ordering.md)需要推导才能得到的监听器顺序保证,在这里免费获得,因为组合本身已有全序,Fabric 的发现顺序问题不存在。
- **贡献是 fiber effect。** bundle 的贡献随其层组合而注册、随层移除而撤回;HMR 层切换与 bundle 原子地一并撤回并重加;组合失败时保留上一份可用的贡献集——与 `repository-plugins` 对其 source 列表已有的事务性一致。

### 与 `provides` / `requires` 的关系

[热插拔插件 API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md) 的 `provides` 声明的是插件*持有*、他人*依赖*的能力——一条一对多的服务边。`entrypoints` 是其对偶:一条汇入他人持有的点的多对一贡献边。一个压缩策略 bundle 并不提供其他插件 inject 的服务;它向 compact 插件持有的 `compact:strategies` 表贡献一行。两种机制互相无法表达对方;本笔记的 v1 只覆盖 manifest 声明的静态数据形态,待两者都落地后,热插拔 API 下的托管插件将获得同样的 `entrypoints` 段。

## Alternatives considered

**只保留命令式注册(现状)。** 否决:它迫使静态数据也要写代码,把来源隐藏到运行时,并把贡献撤回变成插件作者的责任而非运行时的责任。目前树内每一个扩展点(`ctx.tools.register`、skill 根目录、MCP server 列表)都是同一个缺失原语的特设实例。

**patch 行配置数组。** 作为贡献通道否决:patch 行以 last-write-wins 替换某行的整个 `config`,两个 bundle 无法同时向一个点做贡献,除非用户手工合并一层。patch 层仍然是*用户覆写*的载体;本笔记是 *bundle 作者*的载体。

**用 Cordis 事件做贡献通道。** 否决:事件是瞬时分发,没有持久、可检视的贡献者集合,顺序还会继承注册顺序的不确定性。贡献是状态,不是分发。

**原样移植 Fabric 的全局 `LanguageAdapter` 注册表。** 否决:它会从 manifest 字符串实例化任意类,与[静态仓库插件格式](../../implemented/architecture/2026-07-30-static-repository-plugin-format.md)的 import-free wrapper 立场相冲突。由 key 定义者持有的按 key `adapt` 保留了解耦,又不引入字符串驱动的代码加载。

## Acceptance criteria

- 一个声明了 `dsh.bundle.entrypoints` 的 fixture bundle,其贡献值按 profile 层序通过 `ctx.entrypoints.get(key)` 出现,并归属到该 bundle 的包名;贡献本身不运行任何插件代码。
- 从 `dsh.profile.bundles` 移除该 bundle(或通过 HMR 层变更使其退出)恰好撤回它的贡献;组合失败时之前的贡献集原样保留,并复用现有的 `hmr/config-update-failed` 广播。
- 没有 `define` 的 key 下的贡献可通过 `keys()`/检视看到,且永远不会传给任何 `adapt`。
- `dsh plugin add` 一个 manifest 声明了 `entrypoints` 的 bundle 无需改动 reconcile:该段搭载现有 bundle 声明,CLI 的 bundle 检测(`dsh.bundle.patch`)不受影响。
- 贡献集可在不启动组合的情况下检视:`dump-config` 家族的命令仅从 profile manifest 栈即可列出 key、原始值与提供方。

## Risks

- **同一样东西有了两种贡献方式。** 落地后,一个静态贡献既可以声明在 `entrypoints`,也可以在 `apply` 里命令式注册。缓解靠约定而非强制:静态数据以 manifest 声明为文档默认,扩展点属主对其 key 已覆盖的内容停止接受命令式注册。接受这种重复作为 lint 级问题,是不破坏现有插件的代价。
- **key 抢注与命名空间。** Fabric 的 key 是非正式字符串,跨 mod 冲突发生过;同样的隐患在这里也存在。v1 仅以文档约定 `owner:suffix` 形式,不设注册表——集中式 key 注册表会重建该机制要消除的耦合。
- **仅静态数据可能过窄。** 第一个合法需要函数的贡献(例如打分回调)无法表达。这是刻意的压力,引导走向托管插件路径,而不是用字符串代码引用去补洞;如果这种压力成为常态,后续方案是经 `definePlugin` 中介的贡献形态,而不是移植 `LanguageAdapter`。
- **adapt 在组合期运行。** 抛异常的 `adapt` 会使贡献层的组合失败;错误中必须带失败归因(哪个 bundle、哪个 key、哪个值),否则调试第三方 bundle 会变成猜谜。
