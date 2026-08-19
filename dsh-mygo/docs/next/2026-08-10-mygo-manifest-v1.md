# mygo 声明式 manifest v1：entrypoints + 兼容性约束（2026-08-10 实现）

状态：已实现（mygo 0.2.0 方向的第一块）。来源是 0806 的两篇 proposed 笔记
（`2026-08-08-declarative-entrypoint-contributions` /
`2026-08-08-bundle-compatibility-constraints`），机制按 mygo 现状重写；实现时
对照了本地 `fabric-loader` 源码（`EntrypointStorage` / `ModDependency.Kind` /
`ResultAnalyzer`）与浅拉的 fabric-api（`fabric.mod.json` 的 `entrypoints` /
`depends` 惯例）。

## 目标

1. **多对一静态贡献通道**：任何插件在自身 package.json 里声明“我向扩展点 `K`
   贡献静态数据”，由 `K` 的属主决定这些值变成什么；贡献随 HMR 原子注册/撤回。
2. **插件间兼容性检查**：`requires` / `breaks` 版本化硬约束，纯校验不解算，
   违反时给出“声明者 + 约束文本 + 已装版本”的人读报错链（Fabric `ResultAnalyzer`
   思路），而不是把整个后端拖崩。

刻意不做（与 0806 笔记一致）：不移植 Fabric `LanguageAdapter` 的字符串代码
加载；不移植 `ModSolver` 的选版本（pnpm 负责）；不做 recommends/suggests/
conflicts 软级别。

## Manifest schema（插件 package.json 的 `dsh.mygo` 段）

```jsonc
{
  "name": "dsh-something",
  "version": "1.4.0",
  "dsh": {
    "mygo": {
      "entrypoints": {
        "skill:roots": ["./skills"],
        "command:menu": [{ "value": { "name": "settings", "order": 10 } }]
      },
      "compatibility": {
        "requires": { "dsh-base": ">=0.4.0" },
        "breaks":   { "dsh-rewind": "<2.0.0" }
      }
    }
  }
}
```

- `entrypoints`：key → 贡献数组。贡献只能是**字符串**或单键 `{ value }` 对象
  （静态数据，无模块说明符、无代码引用）。
- `compatibility.requires` / `compatibility.breaks`：key 是**受管插件 id**，
  value 是 semver 范围。v1 不检查宿主 npm 包（host 包用现有服务 id
  `requires` 表达；`hostPackages` 引擎选项已留好，后续可从面板注入）。
- 版本锚定：插件包自身的 `package.json.version`（面板安装时读入），git /
  tarball / path 安装同参与。

## 运行时映射

- `PluginDefinition` 新增可选字段：`entrypoints` 与 `compatibility`
  （`@deepseek-ai/dsh-mygo-api`）。
- `adoptRaw` / `updateRaw` / `checkSupport` 增加可选第 4 参
  `RawPluginDeclaration { version?, entrypoints?, compatibility? }`；桥接包
  把 `dsh.mygo` 段作为 JSON 字面量嵌入生成代码，零代码改动即可让存量生态插件
  声明这些字段。
- `PluginHandleInfo` 新增 `entrypoints`（贡献的 key 列表）与 `compatibility`，
  面板 `/api/mygo/plugins` 透出。

## `ctx.entrypoints` 服务

```ts
interface EntrypointsService {
  define<T>(key: string, adapt: (value: unknown, ctx: Context) => T): void
  get<T>(key: string): readonly EntrypointContribution<T>[]
  keys(): readonly string[]
}
interface EntrypointContribution<T> { value: T; raw: unknown; provider: string }
```

- **key 有属主**：只有 `define` 的调用者能决定适配逻辑；未定义 key 下的贡献
  惰性保留、`get` 原样返回、`keys()` 可检视，永不适配。
- **顺序即注册序**：`get(key)` 按插件声明贡献的激活顺序返回（HMR 换层后保持
  新代的顺序）。
- **按代撤回**：每个贡献带 opaque token，`disposeGeneration` 只撤自己那一代
  的 token——同一插件替换后新贡献不会被旧代误删。
- **适配失败归属**：贡献方激活时报 `staging-failed`，stage 为
  `entrypoint:<key>`，cause 点名贡献插件与适配错误；`define` 替换失败回滚到
  旧适配器并保持表一致。

## 兼容性检查语义

- **声明者即受害者**：谁的约束不满足就拒绝/禁用谁（安装、替换、恢复三条路径
  一致）。恢复时按“声明者”禁用，避免依赖行序导致不可判定的受害方。
- **双向检查**：新插件既要满足自己的 `requires`/`breaks`，也不能破坏已装插件
  对它的声明（A breaks B → B 不能装）。
- **检查点**：install / adopt（静态）/ replace / updateRaw / uninstall（阻止
  破坏他人 requires）/ enable 重挂 / 启动恢复后全量对账 / `plan()` 预览 /
  `checkSupport()`（守卫桥接，跳过挂载并记日志）/ 面板安装预检
  `checkCompatibility()`（写桥接前拒绝）。
- **force**：`replace({ force: true })` 跳过兼容性与组 3 冲突（与现有 force
  语义一致）。
- **错误**：新错误码 `compatibility-conflict`（组 3），details
  `{ plugin, violations }`，message 渲染约束链。
- **恢复**：启动时先按行序挂载，结束后 `reconcileCompatibility()` 全量对账，
  违规记录置 `disabled` + reason `compatibility-conflict` 并持久化，不拖垮宿主。

## semver 范围子集

`src/semver-range.ts`（零依赖，~250 行）：`*`、精确、`=`、`>`、`>=`、`<`、
`<=`、`^`、`~`、空格 AND、`||` OR；支持 `1.x` / `1.2.x` 通配与 `>1.2` 这类
部分号语义；预发布标识按 semver 排序。非法版本/范围 → 不匹配，报告里区分
“未安装 / 版本不满足 / 范围不可解析”。

## 验收（v1 已通过测试）

- 静态贡献无需插件代码即进入 `ctx.entrypoints.get(key)`，顺序与属主正确；
- 卸载 / 同 id 替换后旧贡献原子撤回，新代贡献保留；
- `requires` 缺失 / 版本不满足、`breaks` 命中、替换升级破坏幸存者、卸载破坏
  他人 requires、A breaks B 阻止 B 安装——全部拒绝并给出约束链；
- 启动恢复后违规记录被禁用（reason `compatibility-conflict`）；
- 面板安装预检与守卫桥接在写行前 / 挂载前拦截；
- 现有 352 用例 + 新增 26 用例全绿（串行跑，拆文件）。

## 未决项 / 后续

- `hostPackages` 版本注入（dsh 核心包版本）与 `main`/`client` 这类 Fabric 式
  内置 key 的惯例文档；
- `dump-config`-家族命令检视贡献集/约束集（面板 API 已透出 entrypoints/
  compatibility，CLI 侧未做）；
- 面板 UI 展示约束链与 entrypoint 贡献；
- 软级别（recommends/suggests）留待硬级别跑稳后再议。
