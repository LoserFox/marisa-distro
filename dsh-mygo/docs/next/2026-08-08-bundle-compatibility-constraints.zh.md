# Agent Note: Bundle compatibility constraints with readable reports

Status: proposed

[English](2026-08-08-bundle-compatibility-constraints.md) | 中文

## Problem

0806 的插件管理器解析的是*包*,从不检查*插件*。pnpm 选定版本,`reconcilePlugins`(`apps/cli/src/plugin.ts`)把任何声明了 `dsh.bundle.patch` 的已安装包并入层栈,组合则应用栈里的一切。没有任何东西能表达——或强制——"bundle A ≥ 2.0 不得与 bundle B < 1.5 并存"。所有失败形态都暴露得很晚:

- 启动时缺失某个 Cordis 服务,报错归因于一条 `inject` 边,而非真正的原因(已安装的配套 bundle 太旧)。
- [权限与排序笔记](../../implemented/architecture/2026-08-05-plugin-permission-levels-and-transform-ordering.md)列举的那类冲突——两个 bundle 改写同一个 `agent/request` 字段——产生未定义结果,而其中一个 bundle 的作者*明知*这个组合是坏的,却无处声明。
- 静默的错误行为:两个 bundle 都加载成功,没有错误可报,用户只能手工对层栈做二分排查。

Fabric Loader 对同一问题的回答是参照点:五级依赖词汇(`depends` / `recommends` / `suggests` / `conflicts` / `breaks`),由 `ModSolver` 在启动前检查,`ResultAnalyzer` 把被违反的约束变成人类可读的链条——哪个 mod、哪条约束、哪个已安装版本。加载*失败*并附带解释,而不是进入未定义状态。

一个表面障碍其实已经按有利于我们的方式解决了。[热插拔插件 API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md) 将其能力问题定为"仅服务 id,不含版本范围",复审触发条件是"第一个真正的跨插件版本化契约消费者"。本笔记不重开这个结论:能力保持无版本。但 *bundle* 是 npm 包——它们已经带有 pnpm 选定的真实版本。bundle 级约束是对已存在数据的版本化消费,而不是一套新的版本化制度。

## Proposal

在 bundle 声明上增加两个 manifest 字段,在三个执行点检查,**只校验,永不求解**。

### Manifest:`dsh.bundle.requires` / `dsh.bundle.breaks`

`DshBundleManifest`(`packages/ui/app-boot/src/profile.ts`)增加:

```jsonc
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml",
      "requires": { "@deepseek-ai/dsh-base": ">=0.4.0" },
      "breaks":   { "acme/old-memory-policy": "<2.0.0" }
    }
  }
}
```

- `requires`:每一项必须解析到组合层栈中已安装版本满足该范围的 bundle。
- `breaks`:任何一项都不得解析到已安装版本落在该范围内的栈内 bundle。
- 检查所用的版本是已安装包的 `package.json` 版本——与 `reconcilePlugins` 已在使用的解析锚点相同,因此 git/tarball/path 安装以同样方式参与。
- 只有两个硬级别。Fabric 的软级别 `recommends`/`suggests`/`conflicts`(警告但继续)被刻意排除:无人理睬的警告比没有警告更糟,且软级别可以日后添加而不改变硬级别语义。

### 执行点

1. **安装** —— `dsh plugin add`/`update`:在 `reconcilePlugins` 之后,按已安装版本校验整个栈的约束。违例时打印报告(见下)并以非零退出,发生在 pnpm 运行*之后*;profile 处于新包已安装、但违例已明说的状态,因为 pnpm 持有文件系统,而检查持有结论。(`--force` 式覆写是一个 CLI flag,并在输出中记录。)
2. **组合** —— profile 启动与 HMR:违例的栈以同一份报告使组合失败;HMR 下保留 last-good 树,失败复用现有的 `hmr/config-update-failed` 广播,与今天 malformed patch 层的处理完全一致。
3. **动态安装** —— 当[热插拔插件 API](../../implemented/feature/2026-08-04-generic-hot-plug-plugin-api.md) 的 manager 在运行时安装时,同一校验器在 generation 激活前对活体注册表运行。

### 报告

违例渲染为约束链,而不是错误码——这是 Fabric 设计(`ResultAnalyzer`)中最值得照抄的部分:

```
dsh: incompatible profile layers for profile "web"
  acme/memory-doctor@1.2.0  breaks  acme/old-memory-policy@1.4.3
    constraint: acme/old-memory-policy "<2.0.0"  (declared by acme/memory-doctor)
  acme/memory-doctor@1.2.0  requires  @deepseek-ai/dsh-base >=0.4.0
    installed: @deepseek-ai/dsh-base@0.3.1
```

每一行都指名声明方 bundle、约束文本和已安装的违例方。检查本身便宜到可以在每次组合时运行;设计预算花在报告上。

## Alternatives considered

**pnpm `peerDependencies`。** 作为主要机制否决:peer 范围产生的是 pnpm 自己已经把用户训练得会忽略的安装期警告;它无法表达"这两个顶层 bundle 冲突"(peer 是向你*依赖*的包声明的,而不是向平级层声明);在组合期或 HMR 期它无话可说。bundle 仍可针对真实的库依赖边声明 peer;本笔记覆盖的是 pnpm 看不见的插件语义层。

**运行时 `inject` 失败(现状)。** 否决:missing-service 报错指名的是服务,而不是造成它的不兼容配对;而且它根本无法表达 breaks——两个都加载成功但组合语义已坏的 bundle 不会产生任何报错。

**移植 Fabric 的 `ModSolver`。** 否决:solver 会*选择*版本,那是包管理器的工作,而 harness 已经有 pnpm。本提案只取约束词汇和报告,并刻意把自己限制在检查 pnpm 已选定的版本上。检查器一旦开始提议替代版本,它就变成了第二个、更差的包管理器。

**在能力(`provides`/`requires` 服务 id)上挂版本范围。** 按热插拔笔记中已定案的问题,在此否决:今天没有任何语义消费能力版本,而 bundle 级范围已覆盖真实的失败形态——用户安装、更新、相互冲突的单位是 bundle。

## Acceptance criteria

- 一个组合了两个 bundle 的 profile,若其中一个 `breaks` 另一个的已安装版本,则拒绝启动,链式报告指名两个 bundle、约束与已安装版本;由 HMR 层编辑引入的同样违例保留 last-good 树并广播 `hmr/config-update-failed`。
- `dsh plugin add` 引入 `requires`/`breaks` 违例时打印同一份报告并以非零退出;覆写 flag 写入 CLI 契约文档。
- `requires` 指名一个不在栈中的 bundle 时,缺失与版本不匹配分别报告。
- 约束原样搭载现有 bundle 检测:一个包跨版本获得或丢弃约束时,`reconcilePlugins` 的安装状态逻辑既不需要特判也不会被破坏。
- `dump-config` 家族对 profile 的输出包含每层的有效约束集,使检查的输入无需组合即可检视。

## Risks

- **两个声明式信息源可能不一致。** pnpm 可能合法地安装一组被 dsh 检查拒绝的包(这正是检查在起作用),但反过来——pnpm 拒绝 dsh 会接受的组合——属于 pnpm 自己的 peer 机制,两者同时触发时会被读作互相矛盾的工具。CLI 报告必须说明哪一行出自哪一层机制。
- **范围编写的质量。** Fabric 的经验是 `breaks` 范围在发现时写下然后腐烂:声明了 `breaks: { "x": "<2.0" }` 的 bundle 永远不会得知 x 3.0 已修复不兼容。版本化约束是声明方作者对*他人*软件的断言;报告格式通过始终指名声明者来缓解,使陈旧范围挡住合法组合时 blame 清晰可辨。
- **组合失败从此成为正常的安装结果。** 过去会降级启动的 profile 将拒绝启动。这正是目的,但它会在检查发布的那一天,把既有用户 profile 的静默错误行为转化为可见的破坏——迁移说明必须写明这一点,且首个发布版本应在组合期只校验警告一个版本周期,之后再转为拒绝。
- **没有传递语义。** `requires` 针对扁平的组合栈检查,不做传递解析;bundle 不得依赖由它 require 的 bundle 所声明的约束。把扁平检查规则写进文档是契约的一部分,因为 Fabric 用户惯常假设其 solver 提供而本设计刻意不提供的传递性。
