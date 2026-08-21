# 急救模式与上游 deepseek-harness-desktop 恢复体系对比与移植方案

- 日期：2026-08-23
- 基线：marisa origin/main 578bf32e（rc.8，含急救模式 23990f7b 合并）
- 上游：github.com/anywhere-labs/deepseek-harness-desktop master @ 9d18856（浅克隆于 `release/_upstream-dsh-desktop`，本地临时克隆在 `_upstream-dsh-desktop`）
- 触发：用户观察到上游恢复（recovery）实现比我们更好，确认先落对比文档、再按优先级移植

## 1. 背景

Marisa 桌面（Go + Wails/WebView2 壳层，`desktop/`）在 rc.8 引入了三级启动状态机与急救模式
（`feature/rescue-mode`，23990f7b，含后续三补 0ffbfed1）。上游官方桌面（Electron +
`dsh-plugin-desktop` TS 插件）同期实现了更完整的恢复体系。本文档对比双方能力、确认移植优先级，
并给出第一个移植项（安装事务 WAL）的设计。

## 2. 上游恢复体系全景（文件地图）

| 文件 | 职责 |
|---|---|
| `dsh-plugin-desktop/src/install-recovery.ts` | 崩溃可恢复的安装事务 WAL：受保护三文件（package.json / pnpm-lock.yaml / pnpm-workspace.yaml）安装前备份 + 8 阶段状态机 + sha256 镜像 + 原子写 + 文件锁 |
| `dsh-plugin-desktop/src/startup-recovery-controller.ts` | 代数绑定的恢复控制器：只解析 profile 清单，永不解析插件；一次性 preview/confirm token（TTL 5 分钟）；对外只暴露 bundle 快照（core/managed/external 三类 + 可否禁用） |
| `dsh-plugin-desktop/src/startup-recovery-window.ts` | 原生恢复窗口：零脚本渲染（`dsh-recovery:` 自定义 scheme 白名单动作）、沙箱 WebContents（sandbox:true / contextIsolation / CSP default-src 'none'）、诊断包自动导出、失败阶段标签（9 段） |
| `dsh-plugin-desktop/src/desktop-boot-recovery.ts` | boot 页注入：宿主 "Failed to load plugins" 时向启动页追加恢复控件（开终端 / 导出诊断 / 运行回滚 / 切换配置 / 新建配置） |
| `dsh-plugin-desktop/src/native-ui/recovery/App.tsx` | 恢复窗口的 React 壳（仅读 `?state=` base64url 投影，无 IPC） |
| 配套测试 | `tests/desktop-boot-recovery.spec.ts`、`install-recovery.spec.ts`、`startup-recovery-controller.spec.ts`、`startup-recovery-window.spec.ts` |

上游恢复窗口的完整动作面：保存/展示诊断包、回滚最近一次受保护安装（三文件）、单次重试授权、
单插件禁用、切换配置、新建配置、恢复 last-known-good（上次成功启动的配置+快照）、
打开配置文件/补丁/manifest/目录手工编辑、重启/退出。

## 3. 双方能力对比

| 维度 | 我们（Go 壳层） | 上游（Electron） | 结论 |
|---|---|---|---|
| 触发机制 | 三级状态机 normal→minimal→rescue；连续失败降级；冷启动直进急救页；`--minimal/--rescue` 手动入口 | 9 个启动阶段全程跟踪，任一段失败开恢复窗；boot 页注入作为宿主层兜底 | 方向互补：我们有自动降级，他有阶段定位 |
| 恢复粒度 | 整 backend 目录 rename 备份 + 内嵌 tar 重解包 + 重置用户配置 | 事务级：只回滚受保护三文件，不动 node_modules 与用户数据；检测事务外改动则拒绝覆盖（manual-recovery-required） | 上游精细；我们全量兜底更彻底 |
| 插件级处置 | 无（minimal 是「全部不加载」，无单插件开关） | 列出全部 bundle（core/managed/external + disabled 标记），单插件禁用（只跳过加载、不卸载文件） | **最大差距** |
| 安装事务 WAL | 无 | crash-recoverable WAL：prepared→awaiting-restart→verifying→recovery-pending→retry-requested→verified/rolled-back/manual-recovery-required；sha256 文件镜像、原子写、文件锁 | **缺失** |
| 诊断 | 页面显示日志尾部 + 打开日志目录 | 自动打包诊断 zip（日志+版本+崩溃转储），破坏性操作前强制保存，隐私提示 | 缺打包导出 |
| 安全模型 | 127.0.0.1 随机端口 + 随机 token 单层 | 沙箱窗口（CSP default-src 'none'、零脚本、scheme 动作白名单、一次性 preview/confirm token、代数绑定双重校验、renderer 永不接触路径） | 上游更分层；我们单层但端口+token 对本机威胁模型够用 |
| 其他恢复手段 | 重试完整启动、打开日志/备份目录 | 切换/新建配置、last-known-good 恢复、手工编辑补丁/manifest/目录 | 缺失 |
| UI | 单页 HTML+JS（仅中文），本地 API fetch | 零脚本原生窗口（中英双语）+ boot 页注入控件 | 上游更完整；我们的架构简单够用 |
| 代码形态 | Go + WebView2 壳层（desktop/） | TS 插件（dsh-plugin-desktop，Electron） | 概念可移植，代码不能直接搬 |

我们领先的地方（移植时不得退化）：
1. **minimal 自动降级**：连续失败先退零 marisa 插件 web 模板再试，很多场景不进急救页。
2. **整树备份**：rename 原子、junction 自洽，能清掉「插件文件本身损坏」；上游三文件回滚解决不了这个问题。
3. **零第三方运行时**：不背 Electron；Wails/WebView2 由系统提供。

## 4. 移植优先级（经用户确认，先落文档再动工）

1. **安装事务 WAL（Go 版 install-recovery）**——纯 launcher 侧文件操作，不依赖前端，可独立先行；本提交实现。
2. **插件级禁用 + 安装回滚**——急救页列出 bundle（读 profile manifest + LINKS.json + 受管块），
   禁用单插件只改加载清单不卸载文件；WAL 回滚接入急救页动作面。
3. **诊断导出**——Go archive/zip 打包日志+版本信息，破坏性操作前提示。
4. **阶段细化 + last-known-good**——3 阶段扩展子阶段标签（对应上游 9 段），每次成功启动记 checkpoint。
5. **UI 升级**——中英双语 + 页面 CSP 收紧，保留本地 API 架构。

## 5. 安装事务 WAL 设计（移植项 1）

### 5.1 受保护文件（marisa 适配，与上游不同）

上游保护 package.json / pnpm-lock.yaml / pnpm-workspace.yaml。Marisa live profile **无 lockfile**
（设计使然，见维护记录「live profile 禁止 dsh plugin add」），声明面为：

| 文件 | 位置 | 说明 |
|---|---|---|
| `package.json` | `<profileDir>/package.json` | 插件 bundles 声明 |
| `cordis.patch.yml` | `<profileDir>/cordis.patch.yml` | 用户层受管块（mygo 等写入） |
| `LINKS.json` | `<backendDir>/LINKS.json` | launcher 物化插件 junction 的清单；junction 本身可由 `recreateLinks` 从清单重建 |

WAL 只保护调用方显式传入的绝对路径（默认集合即上表）；文件缺失视为「present:false」镜像，
回滚时按镜像还原（存在则删、缺失则不动）。

### 5.2 状态与阶段

- 状态目录在 profile 之外：`%LOCALAPPDATA%\marisa-distro\state\plugin-install-recovery\`
  - `state.json`：当前事务（单事务语义，与上游一致；新事务覆盖旧事务前先记录 rolled-back）
  - `backups/<transactionId>/`：受保护文件安装前副本（0600）
- 阶段机：`prepared → awaiting-restart → verifying → recovery-pending → retry-requested → verified | rolled-back | manual-recovery-required`
- 失败原因：install-failed / interrupted-install / startup-failed / startup-unconfirmed / recovery-failed
- 文件镜像：present + sha256 + size + mode + backupFile 叶名；事务元数据持久化 profile 目录的
  **sha256**（profileIdentity）而非路径本身；transactionId 为 crypto/rand 32 字节 hex。
- 写 state.json 用临时文件 + rename 原子替换；备份复制完成才进入 prepared（崩溃不留半事务）。

### 5.3 动作

- `begin`：读受保护文件 → 复制到备份目录 → 写 state.json（prepared）。
- `commit`：调用方确认安装完成（可选封存 after 镜像）→ awaiting-restart。
- `verify`：下一次启动健康通过后 → verified（清事务）。
- `rollback`：重读 state.json → 校验当前文件：与 after 一致（或未封存）→ 从备份还原；
  与 before/after 都不一致 → manual-recovery-required（不覆盖用户改动）。
- `retry`：recovery-pending → retry-requested（仅一次授权）。

### 5.4 集成点（后续步骤，不在本提交内）

- mygo 面板 install 链路（vendored harness，后端 TS）：安装/更新前调用
  `marisa-desktop.exe wal begin --profile-dir <dir> --profile-name <name> --package <id> [--version <v>] [--backend-dir <dir>] [--files a,b]`，
  成功后 `wal seal --tx <id>`；launcher 启动健康后 `wal verifying --tx <id>` + `wal verify --tx <id>`。
  状态目录可用 `MARISA_WAL_STATE_DIR` 覆盖（隔离环境/测试）。
- `dsh plugin add`：live profile 设计上已禁用（无 lockfile），缺口仅在 dev/非 live profile，
  记录在案，不做钩子。
- 急救页动作面：rescue_server 增加 `GET /api/wal`（挂起事务投影）+ `POST /api/wal/rollback`，
  页面按 upstream 交互呈现（回滚/重试/禁用联动）。

## 6. 风险与边界

- 本提交只落 WAL 核心（Go 包 + 单测 + CLI 子命令），**不接线**急救页与 mygo 面板；
  接线在移植项 2 一并完成，避免半接线的死代码扩散。
- CLI 子命令先于 Wails 初始化返回，不影响 GUI 启动路径；无权限面新增（仅文件读写，本机）。
- 权限影响声明（AGENTS.md 要求）：WAL 新增文件写入能力，范围限定
  `%LOCALAPPDATA%\marisa-distro\state\plugin-install-recovery` 与调用方显式传入的受保护文件，
  无网络/进程/密钥访问。

## 7. 验证

- `go test -C desktop -tags installedbundle ./...` 与 `-tags embeddedbundle`（含新 WAL 单测：
  阶段机全路径、原子写、崩溃残留恢复、manual-recovery-required 判定、present:false 还原）。
- CLI 冒烟：`marisa-desktop.exe wal begin/status/rollback` 于临时 profile 目录（本提交已做二进制级验证）。
- 验收范围：真机 MSI 安装后由 mygo 安装一次插件触发 begin/commit，重启验证 verify 清事务
  （人工验收项，随移植项 2 一并安排）。

## 8. 执行记录

- 2026-08-23：创建 worktree `.claude/worktrees/rescue-upstream`（分支 `feature/rescue-upstream`，
  基线 origin/main 578bf32e）；本文档落盘；提交 1 = 本文档，提交 2 = WAL 核心（见 git log）。

## 9. 真机验证记录（2026-08-23，用户质疑「我们的急救模式没跑起来过 / minimal 不关插件」后补充）

验证对象：部署树 `%LOCALAPPDATA%\marisa-distro\backend`（VERSION=marisa-backend-0.1.8-rc8test-dirty，
8/21），运行中 GUI = rc8-test worktree release 构建（138MB exe，二进制内确认含急救模式 marker：
「魔理沙急救模式」/ rescue-state / MARISA_BOOT_PROFILE）。

### 9.1 minimal（web profile）实际挂载 —— 已实测

- 临时 `DSH_HOME=%TEMP%\rescue-verify-home` + 部署树 node/bin.js `--dump-config`：
  - web profile 组合树 **135 个条目**（timer/llm/session/typert/fs/tools/approval/skill + 全部
    web client UI 层 ui-sidebar/ui-settings/ui-conversation……）；
  - marisa profile 组合树 **166 个条目**（+31 个 marisa 专属）；
  - web dump 中**无**任何 marisa 专属插件（dsh-better-sidebar/whale-widget/mnemon/marisa-bundle/
    ego-browser/modlens 均未出现）。
- 真实启动验证：临时 home + `node bin.js --profile web --patch <marisa desktop.overlay.yml>
  --patch <standalone.overlay.yml>` → boot 成功（URL http://127.0.0.1:2266，HTTP 200，无报错）。
- **结论：minimal 确实不加载 marisa 插件（设计意图达成），但挂载 135 个 harness 自带插件，
  不是「关掉所有插件」的空壳；若故障在 harness 核心层（llm/session/storage/webserver），
  minimal 照样挂。** 佐证文件：%TEMP%\rescue-verify-web-dump.txt / rescue-verify-marisa-dump.txt。
- 附带发现：minimal 路径 launcher 仍传 marisa profile 的两个 --patch overlay（desktop.overlay.yml
  端口/web-runtime + standalone.overlay.yml 两 client 插件），语义上 marisa 配置面混入 web profile
  （内容无害，但属设计瑕疵，见移植项 2a）。

### 9.2 --rescue 急救模式 —— 未真机验证（待 GUI 空闲）

- 运行中的 GUI 持有单实例互斥体 `Local\io.marisa-distro.desktop.early`（跨安装全局），
  `--rescue` 无法并行验证；用户选择跳过，待 GUI 空闲。
- 验证步骤（下次执行）：
  1. 关闭 GUI（同一 exe 重启，不换版本、不碰 backend 数据）；
  2. `Marisa-DSH-windows-x64-standalone.exe --rescue` 后台启动；
  3. 读持久日志（appLogDir）中 `rescue 页面：http://127.0.0.1:<port>/?token=...` 行；
  4. `GET /api/state`（带 token）验证页面数据（stage/lastError/logTail/capabilities）；
  5. 验证 `/api/backups`、`/api/open-log`（只读动作），**不执行** /api/rescue 的备份/重解包；
  6. 结束后杀进程，用同一 exe 正常启动拉回 GUI。
- 待验证项还包含：三级状态机自然触发路径（连续 2 次快速异常退出 → minimal → 2 次 → rescue）
  在真机上从未被观察到，属长期未验收路径。

### 9.3 boot 注入 —— 确认缺失

- 我们没有上游 desktop-boot-recovery.ts 式的「webserver 起来了但页面挂了 → 页面内恢复控件」。
- 现有页面健康监控（monitorPageHealth）只做检测→计入失败→重启/降级，无用户可操作入口。
- 对应修正见移植项 3（利用壳层控窗口优势：健康监控触发时切窗口到急救页，带失败上下文）。

### 9.4 minimal 修正（2026-08-23，本分支提交 3）

用户质疑「minimal 不关掉所有插件，没什么用」成立。实测补充一个关键约束：**空壳不可行**——
bundles 仅 dsh-base 的组合树 78 条、无 webserver/web-runtime、不打印 URL，桌面壳无法导航，
必然超时降级（比现状更糟）。因此 minimal 的正确形态是：

1. **保持 web 模板**（base+web-app，135 条，无 marisa 插件、有完整基础 UI）——这是桌面壳能
   出界面的最小可用集，且已排除 marisa 层故障；
2. **脱离 marisa 配置面**：新增出厂 `bundle/minimal.overlay.yml`（webserver 端口 0 +
   web-runtime openBrowser:false + input 插件），launcher 在 `MARISA_BOOT_PROFILE=web` 时只传
   该 overlay，不再引用 marisa profile 的 desktop/standalone overlay（shim 实测：
   `--profile web --patch <minimal.overlay.yml>`；默认分支不变）；
3. **语义透明化**：rescue_state.go 注释与降级日志改为「基础界面模式（无 Marisa 定制）」，
   明确 minimal 不是零插件空壳；「按需关掉单个插件」由移植项 2（急救页插件级禁用）承担。

测试证据：go test -tags installedbundle / embeddedbundle 全绿；launcher.cmd 分支 shim 实测
（默认 marisa 参数不变；BOOT_PROFILE=web 只传 bundled overlay）。

### 9.5 移植项 2 核心：急救页插件级禁用（2026-08-23，本分支提交 4）

对应上游「Temporarily disable a plugin」动作面。实现：

- `desktop/rescue_bundles.go`：bundleRepo（目录可注入）——解析 profile package.json 的
  `dsh.profile.bundles` 加载清单，禁用=从清单移除并记入 profile 内 `.disabled-bundles.json`，
  启用=加回清单末尾并清记录；每次变更先开安装事务 WAL（保护 package.json，可回滚）；
  名字经 npm 包名正则校验防路径注入；写回用 map 解析保留非 bundles 字段。
- `desktop/rescue_server.go`：`GET /api/bundles`（清单+禁用标记）、`POST /api/disable-bundle`
  / `POST /api/enable-bundle`（`{name}`，重启后生效）。
- `desktop/rescue.html`：插件管理区块（bundle 行 + 禁用/启用按钮 + 状态提示）。
- 语义：仅跳过加载、不卸载文件；重解包/初始化配置清禁用记录（回到出厂即全部启用）。

测试证据：新增 6 个用例（清单解析/禁用+WAL 封存+字段保留/重复与未知禁用/启用+去重/
回滚一致性/非法名与缺失损坏清单）；`go test` 双 tag 全绿。禁用后必须重启才生效——
连续禁用/启用间 WAL 事务未终态会被单事务语义拒绝（正确行为，测试以 verifyPendingTx 模拟重启）。

### 9.6 待办（未在本轮内）

- --rescue 真机验证（见 §9.2）。
- mygo 安装链路接线 wal begin/seal/verify（WAL 的写入端），及急救页 WAL 回滚卡片。

### 9.7 移植项 3：页面挂时的恢复入口（2026-08-23，本分支提交 5）

对应上游 boot 页注入的场景（webserver 起来了但页面挂了），利用壳层控窗口优势实现，
不动 vendored harness：

- `main.go` healthErr 分支：页面健康检查失败（白屏/client 模块加载失败）不再静默
  「计入失败→重启等待降级」，而是立即 `enterRescue`——窗口直接切到急救页（带失败
  原因 + 插件管理 + 恢复动作），用户可即时禁用出问题的插件或重试。
- `enterRescue` 增加 `waitNav` 参数：stage=rescue 冷启动（窗口停在 landing）走原
  等待导航逻辑；页面挂场景（窗口已在后端页面）直接 SetURL，避免 awaitWebviewReady
  死等下一次导航事件（120s 超时）而切不过去。
- 语义：页面挂不再累计到 normal→minimal 降级计数（每次都直接给入口）；三级状态机
  保留给「后端起不来」的连续失败降级。

测试证据：go test 双 tag 全绿（-count=1 强制重跑）；此改动为 supervise 集成路径，
真机验证随 §9.2 一并安排。
