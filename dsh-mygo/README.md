# dsh-mygo

面向 DeepSeek Harness（DSH）的**受管插件治理层**：轻量核心 + 一切皆扩展。

- **核心不做产品功能**：安装/启停/替换/恢复语义、符号级校验、结构化失败
  报告、运行期政策闸——CLI、web 面板、loader、存储都是扩展。
- **双轨制（boot rail / live rail）**：boot rail 走 `dsh.profile.bundles`，
  live rail 走 profile `cordis.patch.yml` 的 mygo 受管块——运行期安装即刻
  激活（宿主 `watchUserPatches` 事务性重放），卸载先剥块验证 dispose。
- **pnpm 安装状态为唯一真相源**：治理视图每次操作后与 profile 实际状态
  对账，不做隐式求解；官方 CLI 旁路 add 同包时当场剥 live 块（bundle 赢）。
- **配置修订受保护**：bridge / bundle 行配置带 revision（文件指纹），
  stale 写入回 409（expected/actual），绝不静默覆盖。
- **整合包 mygo-pack/v1**：确定性、可审计、可离线还原；内嵌成员与 npm
  引用式成员（`--ref`）二态混合，restore 自动注册进目标 profile。

```text
mygo（核心服务 pluginManager）
  ├─ mygo-cli          命令面（本身是受管插件）
  ├─ mygo-ext-panel    web 面板（settings.section 管理区 + settings.plugin.item 配置卡片）
  ├─ loaders           profile（默认）/ hub（dsh-hub 市场）
  └─ mygo-ext-fabric   fabric（mixin/加载时变换）治理壳
        │
        ▼
$DSH_HOME/profiles/<name>/cordis.patch.yml（live rail 受管块，宿主事务性重放）
```

## 与 `dsh plugin add` 相容

mygo 的安装形态与官方 `dsh plugin add` 同源共存（包名 `@r05en1cu/dsh-*`，
发布 tag `next`）：

```sh
# 核心（必装）：治理服务 + bundle 层
dsh plugin --profile web add @r05en1cu/dsh-mygo@next

# 命令面（推荐）：mygo install/pack/registry/auth/hub/instances 等
dsh plugin --profile web add @r05en1cu/dsh-mygo-cli@next

# 可选扩展：web 设置页面板
dsh plugin --profile web add @r05en1cu/dsh-mygo-ext-panel@next

dsh web   # profile 组合自动挂载
```

- 面板安装 bundle 在实例**运行期即刻激活**（live rail），无需重启；
- 官方 CLI 旁路 add 同包 → 运行期对账当场剥 live 块，消弭下次 boot 的
  同 id 双 insert 致命撞车；
- headless profile 下 `mygo ...` 命令面完整可用（web profile 严格参数
  解析的宿主缝隙见 `patches/`，host 补丁提案不 apply）。

## 快速开始

### 1. 安装核心并启动

```sh
dsh plugin --profile web add @r05en1cu/dsh-mygo@next @r05en1cu/dsh-mygo-cli@next @r05en1cu/dsh-mygo-ext-panel@next
dsh web
```

### 2. 面板安装第一个插件

打开设置页「My 插件」→ 安装标签页：**npm bundle（默认）**输入
`@pkg/name@^1.0.0` 或 `github:owner/repo#ref`，或切换「单个 tar 包」
输入 `.tgz / .tar.gz` 路径；配置 JSON 可选，schema 模板自动生成，
warnings 走确认弹窗。安装成功即页内生效。

### 3. 配置受管插件

插件设置页中受管插件以**官方折叠卡片**形态出现（标题旁 mygo 小标）：
展开即表单，保存经核心 API（bridge 轨 HMR、bundle 轨 patch 层）；
整 profile 配置可从面板头部导入/导出。CLI 等价面：

```sh
mygo config <id> [--set '<json>']
```

## 双轨制：boot rail / live rail

| 轨道 | 载体 | 生效时机 |
|---|---|---|
| boot rail | `dsh.profile.bundles` | 重启后生效 |
| live rail | profile `cordis.patch.yml` 受管块 | 运行期即刻生效 |

- **安装**：pnpm 落盘后写受管 insert 块（宿主 `watchUserPatches`
  事务性重放），离线组合预检 id 撞车（host 组合函数不可达时降级 warn），
  写后轮询验证激活，失败回滚；回执带 `activated: 'live' | 'pending-restart'`。
- **卸载**：live rail 包先剥块验证 dispose 再 `pnpm remove`；boot rail 包
  且实例在跑先写 disable 块摘 fiber；CLI 与面板同口径。
- **页内免刷新（rc8）**：面板订阅 `/api/mygo/events`（SSE，帧格式与
  host `/plugins/events` 同款）——live 装卸广播 mount/unmount 帧，浏览器
  侧串行队列应用图变更，安装/卸载结果与激活态即时呈现。
- **对账**：启动一次 + 运行期监听 manifest，官方 CLI 旁路操作当场纠偏。

## 整合包（mygo-pack/v1）

把一组插件打成一个**确定性、可审计、可离线还原**的整合包。格式仍为
**v1**：引用式成员（`references[]`）是 v1 的兼容扩展（formatVersion
仍为 1）——files/plugins 语义未变；旧还原端遇到含 references 的 pack
以「一一对应」校验干净拒绝（fail closed），新还原端对无 references 键
的旧 pack 逐字节兼容。

| 成员形态 | 包体 | 还原 |
|---|---|---|
| 内嵌（默认） | GNU tar（`--sort=name --mtime=@0`），成员级 sha512 + fileSize | 离线原子还原，失败回滚不留半成品 |
| 引用式（`--ref <id>` / `--ref=all`） | 不进 pack；固化 `spec` + `integrity` + `tarball` URL | 在线拉取 + integrity 硬校验，离线点名缺失成员整体拒绝 |

- restore 自动注册进目标 profile（等价 `dsh plugin add`；`--no-register`
  保持纯还原语义），与手工混装不撞行；
- 跨实例搬运 `mygo clone --from <A> --to <B>`：内容寻址共享缓存
  （hardlink 优先），多实例不重复下载；
- 格式与用法详见 [`mygo-pack.md`](mygo-pack.md)。

## 配置合并与修订保护

- **配置合并面（面板）**：受管插件逐张卡片进默认插件配置区——外壳对齐
  官方折叠卡片（展开/收起、未保存徽章、放弃修改/保存），标题旁带
  mygo 小标；schema/当前配置读 `/api/mygo/config-cards`，保存经
  `PUT /api/mygo/config`（bridge 轨 HMR、bundle 轨 patch 层），与默认
  配置层零重复。
- **修订冲突检测（rc8）**：bridge 配置 revision 存于生命周期引擎、bundle
  行配置 revision 存于 row-config（文件指纹）；面板配置 API 返回
  `revision` 并接受 `expectedRevision`，stale 写入回 409
  （expected/actual），绝不覆盖他人写入。
- 整 profile 导入导出：`dsh.mygo-configs/v1` 单文件，受管集分面拒绝
  未知 id。

## 安装与认证（rc8）

- 面板安装面：**npm bundle（默认）/ 单个 tar 包**两方式；整合包安装为
  独立预留卡片（后续版本接入 `mygo restore` 等价面）。
- **profile .npmrc 受管块**：只写 `${REF}` 占位、块外用户行不动、原子
  写、删净不留痕；spawn 前按操作解析 ref → 子进程 env，服务缺席/未配置
  只 warn 不阻断。
- 面板「源与凭据」标签页 + CLI `mygo registry list/add/remove`、
  `mygo auth status/set/unset`（`--value-env` 或交互隐藏输入；响应
  不携带值，遮蔽显示）。

## 扩展生态

| 包 | 作用 |
|---|---|
| `@r05en1cu/dsh-mygo-api` | 契约层（Cordis-free）：`definePlugin`、`PluginHooks`、`PluginError` 码、`LoaderAdapter` 契约——插件作者 SHOULD 只依赖它 |
| `@r05en1cu/dsh-mygo-cli` | 命令面（本身是受管插件）：install/pack/restore/config/registry/auth/hub/instances |
| `@r05en1cu/dsh-mygo-ext-panel` | web 设置页面板：管理区（live rail 装卸、安装面、更新与自更新、hub catalog）+ 受管插件配置卡片（官方折叠形态 + mygo 小标）|
| `@r05en1cu/dsh-mygo-loader-profile` | 默认 loader（dsh 原生 profile bundle / pnpm 机制） |
| `@r05en1cu/dsh-mygo-loader-hub` | dsh-hub 市场 loader（registry 快照验签、集合原子安装） |
| `@r05en1cu/dsh-mygo-ext-fabric` | fabric（mixin/加载时变换）治理壳 |

## 开发

仓内自包含回路（pnpm workspace + 公开 registry 依赖）：

```sh
pnpm install
pnpm -r run verify:self-contained && pnpm -r run typecheck && pnpm -r run build
# vitest 串行分包（禁止并行多包）：
pnpm --filter @r05en1cu/dsh-mygo exec vitest run --maxWorkers=2 --pool=threads
```

测试口径（2026-08-15 rc8 起）：全量 86 文件 / 782 用例 + EB 13 项（无网
拦截、确定性断言字节级）；面板套件 7 文件 / 45 用例（live-events /
client-live-rail / 安装面等）。架构与验证入口见
[`DEV-GUIDE.md`](DEV-GUIDE.md) 与 `docs/`；仓库布局、发布流水线
（`scripts/publish-mygo.mjs`）与 host 补丁提案（`patches/`）随仓维护。

## License

MIT
