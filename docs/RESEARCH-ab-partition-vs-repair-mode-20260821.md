# RESEARCH — 启动自愈：A/B 分区 vs 极简修复模式（2026-08-21）

> 问题：Marisa 开发过程中经常把自己开发坏（部署树被开发操作破坏、插件组合与 rc 不兼容导致
> boot fail-loud、profile 文件被截断等），且当前没有任何启动降级路径——后端起不来时壳层只会
> 无限退避重启，用户永远停在启动页。要选 A/B 双槽分区，还是极简（修复）模式：启动失败时
> 禁用全部插件、只保留最基础工具的组合进入？

**结论先行：两者解决不同故障类，不是二选一。对「开发自毁」场景，极简修复模式是主答案
（成本≈0，且能形成从内部修复的闭环）；全量 A/B 双槽对 dev 场景是过度设计（2× 磁盘、dev
原地改动会使双槽同污、共享层无法回滚），它的正确位置是「版本升级失败回滚」（已有计划，且
嵌入式 bundle 本身就是免费的 B 槽）。建议按三层防线落地：极简模式（第一道）→ junction/文件
对账（第二道，已有）→ 按需重新解包（第三道，把内嵌 tar.zst 当工厂重置，需保护运行时数据）。**

---

## 1. 现状：启动链路与失败处理

```
dsh-shell.exe (Go/Wails)
 ├─ ensureBackend()        # embedded: 版本化原子解包 + LINKS.json junction 对账修复
 │                          # installed: launcher 存在性检查 + junction 对账
 ├─ launcher.cmd → node.exe bin.js --profile marisa
 │                          #  --patch desktop.overlay.yml --patch standalone.overlay.yml
 ├─ profile-boot.ts        # composeProfile: bundle 层(base→web-app→marisa-bundle→MyGO→npm 插件)
 │                          # + profile 用户层 cordis.patch.yml + home 层 + overlays
 ├─ boot() + installFailLoud + assertEntriesActivated   # 任一插件 load/activate 失败 → exit 1
 └─ supervise()            # 失败/未在 120s 内发布 URL → 无限退避重启（1s→30s），无降级路径
```

关键事实：

- **唯一自愈能力**：`recreateLinks` 每次启动对账 LINKS.json，只补缺失 junction（0.1.7 事故后加入，
  commit 087226a8）；解包本身是原子的（VERSION 标记 + staging rename）。
- **无降级路径**：`supervise` 无失败计数、无「放弃完整模式」概念；landing 页只有「从托盘退出
  后重新打开」的提示。`--dump-default-config`（跳过用户层）和 `--dump-config` 是仅有的手工诊断。
- **插件层 fail-loud 是设计**：assertEntriesActivated 会把失败的插件名和原始栈打到 stderr 后
  exit 1 —— 诊断信息是有的，但没有任何机制消费它做降级。
- **harness 自带极简 profile 模板**：`PROFILE_TEMPLATES.web = ['@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app']`（app-boot/src/profile.ts L114-116）。即「base + web-app、零插件」的
  组合是官方一等公民——**极简模式的后端侧已经存在**（`dsh --profile web`），Marisa 不需要造。
- **壳层已有持久日志**：%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop.log 收集壳与后端
  stderr（logging.go），修复页可直接展示上次 boot 错误。

## 2. 故障分类与现有防线（基于仓库文档 + 实测）

| # | 故障类 | 历史例证 | 现有防线 | 极简模式 | A/B 双槽 |
|---|--------|----------|----------|----------|----------|
| 1 | 插件/组合层 boot 失败（apply 抛错、inject 缺服务、工具撞名、rc 不兼容） | whale-girl / YAS / suggested-replies 移除；dsh-llm-fallbacks 停用；vision-toolkit webServer 修复 | fail-loud 报错退出后无限重启 | ✅ 跳过 marisa 层即可启动 | ❌ 双槽内容相同 |
| 2 | profile 用户层损坏（cordis.patch.yml 语法/行错） | `--dump-default-config` 的注释即为此场景设计 | 仅手工诊断 | ✅ 跳过用户层 | ❌ 用户层共享（若随 bundle 则✅） |
| 3 | 部署树文件被开发操作截断/删除 | **2026-08-21 活证据**：backend\.dsh\profiles\marisa\package.json 与 desktop.overlay.yml 被截断为 0 字节（node 启动后 20 分钟）；0.1.7 事故 12 条 junction 丢失；脚本误删 152 个 workspace 成员 | junction 对账（只补 junction，不补普通文件） | ❌（若 minimal 是独立 profile 则 ✅） | 取决于槽位是否含 profile；重新解包=免费修复 ✅ |
| 4 | 整树损坏（node_modules 残缺、node.exe 丢失） | 152 成员误删需 git checkout 恢复 | 无 | ❌ | ✅ 但 dev 在父级操作可同时弄坏两槽 |
| 5 | 运行时崩溃（OOM 等） | 105 分钟 V8 老生代 OOM | NODE_OPTIONS 环境变量 | ❌ | ❌ |
| 6 | 新版本安装后启动失败 | 更新路径（计划中，未实现） | MSI MajorUpgrade 只覆盖安装事务 | ❌ | ✅ 这正是「首启健康检查回滚」的用途 |

**关键观察**：故障 #1/#2（插件与配置层）是 Marisa 开发自毁的最常见形态（仓库全部移除/停用
记录都属于这一类），极简模式对它们全有效；A/B 对它们无效。故障 #3/#4（树级损坏）A/B 有效但
代价高，而内嵌 tar.zst 重新解包可以达到同样效果且不占双倍磁盘。

## 3. 两种方案的评估

### 3.1 极简/修复模式（推荐为主防线）

**形态**：壳层 `supervise` 加失败计数（如连续 3 次未发布 URL 或 exit≠0），触发降级——
改用 `--profile web`（harness 内置模板，base+web-app）加原 overlays 启动；landing 页切换为
「修复模式」画面：显示上次 boot 错误摘要（取自持久日志尾部）、「查看完整日志」「重试完整
模式」按钮。修复模式会话可正常使用（DSH_HOME 不变，会话/设置保留），只是插件面回到 base。

**为什么便宜**：
- 后端零改动：web 模板、`--patch` overlays、`--dump-config`、config HMR（watchUserPatches）
  全部现成；
- 壳层改动小：一个失败计数器 + 降级启动参数 + 修复页 HTML（landing.html 已有骨架）；
- 不占磁盘、不延长解包、不影响版本化提取。

**为什么能形成修复闭环**：进入修复模式后，用户（或会话内 agent）可以
1. 读日志定位失败插件/文件；
2. 编辑 `cordis.patch.yml`（配置 HMR 热生效，无需重启）；
3. 用 `--dump-config` 对比组合；
4. 一键「重试完整模式」。若坏的是部署树文件（如本次 package.json 截断），可从 bundle 原始
   副本恢复（见 3.3）。

**可选两档**：
- 档 1（轻）：仍用 marisa profile，但 overlay 禁用 marisa-bundle/MyGO 等全部插件行、跳过
  用户层 —— 保留 Marisa 组合的壳；
- 档 2（重）：直接 `--profile web` —— 连组合都回到官方基线。档 2 已存在，优先做档 2；
  档 1 可通过「dump-default-config 生成全禁用 overlay」机械生成。

### 3.2 A/B 双槽分区（不建议作为 dev 自愈主防线）

**全量双槽**（两个完整解包树，启动失败翻转）：实测部署树 ~931MB（含 32MB 用户数据），双槽
需再花 ~930MB 磁盘 + 解包时间翻倍 + junction 对账 ×2 + 槽位翻转状态机。且：

- **dev 场景失效**：开发是「在部署树上原地改」，不是「换一个版本树」。改动落在哪个槽？
  只改活动槽则另一槽迅速过期；两个槽都改则破坏性命令（rm/clean/脚本 bug）双倍炸；
- **共享层无法回滚**：`.dsh`（profiles 用户层、sessions 33MB、storages、settings）单份共享，
  本次 package.json 截断恰好发生在共享层内——A/B 翻槽也救不了；
- 对故障 #1/#2（最频繁的插件/配置自毁）无效。

**轻量版**（保留上一代解包 + 首启健康检查回切）：正是 RESEARCH-package-size-and-update-plugin
已设计的 update 状态机（`first_boot_healthcheck → committed | rollback_pending → rolled_back`，
文档 L346-360：「只有新壳启动、backend 解包、dsh web 发布 URL、profile heartbeat 均成功后才
删除旧版；否则回切」）。**归入发行升级路径实现**，是 A/B 思想的正确落点。

### 3.3 第三层：嵌入式 bundle 就是免费的 B 槽（推荐补上）

standalone 形态下，`desktop/bundle/backend.tar.zst` 被 go:embed 进 exe——**每一份 exe 都自带
一份出厂副本**。任何树级损坏（junction、截断文件、node_modules 残缺）都可以通过「按需重新
解包」恢复，等价于 A/B 的 B 槽，但零额外磁盘、零额外维护。

当前缺口有二：
1. **触发**：`ensureBackend` 只在 VERSION 不匹配时解包；需要「连续 N 次 boot 失败 → 强制
   重解包」路径（作为极简模式也失败的第三级）；
2. **数据保护**：现状 `os.RemoveAll(dir)` 会清掉 `.dsh` 运行时数据（sessions 实测 33MB、
   storages、settings.yaml、.credentials.yaml）。重解包必须改为 merge 语义：先移出运行时子目录
   （sessions/storages/settings 等），解包后还原，或让 DSH_HOME 移出 backend 目录（更大改动，
   涉及 launcher/安装形态，另议）。

## 4. 业界对照

### 4.1 仓库内既有调研（本 repo 已评估过的先例）

- **EAC（Deepseek-Harness-EAC）**：桌面端有后端 watchdog、渲染恢复、启动失败恢复页，客户端
  updater 用「备份旧 EXE → 替换 → 失败复制回去」；其 DSH updater 用 agent-staging + overlay
  原子切换、失败移走 overlay 回到 bundled copy。`RESEARCH-package-size-and-update-plugin`
  已吸收其状态机思想并明确：**「新版本能安装但启动失败」必须由桌面 helper 保留上一个可启动
  候选或缓存上一版 MSI，在首启健康检查通过后才删除旧版**（L346-360）——这是 A/B 思想的既定
  落点，属于发行升级路径。
- **dsh-plugin-guard（社区插件）**：插件安装前快照/回退/备份（写 $DSH_HOME/rollbacks），但
  其 boot-guard 面向 `dsh web` CLI 启动链，**与 Wails 启动链不适配**（RESEARCH-awesome-plugins-
  selection 结论）——Marisa 的降级判定必须做在壳层（Go）。
- **Android A/B / Windows Last Known Good / 系统还原点**：均为「版本/状态级回滚」的成熟先例，
  语义与「首启健康检查回滚」一致；不适用于「运行树被原地修改」的 dev 场景。
- **VS Code / Firefox / Obsidian 安全模式**：均为「禁用全部扩展启动 + 诊断 + 手动重试」——
  与极简修复模式语义一致；触发多为用户手动或崩溃检测，修复模式内可编辑配置再恢复。

### 4.2 外部调研（web_search 实证，2026-08-21；以下 URL 均来自实际搜索返回，未编造）

#### 主题一：A/B / keep-last-known-good 类机制

**Android A/B 无缝更新（Seamless Updates / Virtual A/B）**
- 机制：系统镜像双槽（A/B 分区），更新写入非活动槽，重启时切换槽位；新槽首次启动成功后才被标记为可用，启动失败则回退旧槽。Virtual A/B 用「快照 + 写时复制」避免双倍磁盘（Galaxy S25 等已采用）。
- 触发：bootloader 判定新槽启动未成功（无成功标记）即自动回退——即「健康检查通过才提交新版本」的经典状态机。
- 来源：[A/B（无缝）系统更新 · Android Open Source Project](https://source.android.com/docs/core/ota/ab_updates?authuser=0&hl=zh-cn)、[Virtual A/B overview · AOSP](https://source.android.com/docs/core/ota/virtual_ab)、[Galaxy S25 采用虚拟 A/B 不占额外存储（IT之家）](https://m.ithome.com/html/827308.htm)

**Chrome OS 自动更新（ChromiumOS update_engine）**
- 机制：根文件系统 A/B 双分区 + 更新引擎；官方设计文档明确「限制 boot attempt 次数」，新版本启动尝试耗尽后自动回滚上一版本。
- 触发：启动尝试计数超限（自动回滚）。
- 来源：[ChromiumOS Design Doc: File System/Autoupdate](https://new.chromium.org/chromium-os/chromiumos-design-docs/filesystem-autoupdate/#limiting-the-number-of-boot-attempts)

**systemd Automatic Boot Assessment**
- 机制：boot loader spec 条目携带 boot counter 与 good 标记；每次启动递减计数，持续 N 次成功启动/运行 M 天未被判定失败则标记 good，计数耗尽时引导器自动回退到上一个 boot 条目。
- 触发：自动（boot 计数耗尽即回退，无需用户介入）。
- 来源：[Automatic Boot Assessment · systemd](https://systemd.io/AUTOMATIC_BOOT_ASSESSMENT/)

**Squirrel.Windows（Electron 系更新器）**
- 机制：新版本暂存于 `%LocalAppData%\<app>\updates`，启动器（Update.exe）启动最新版本；Squirrel 本身**无自动回滚**，回滚策略需应用层实现（官方 issue #524 讨论）。
- 触发：Squirrel 无内建触发；社区方案是改 `latest.yml` 指回旧版本重新安装（electron-builder #3554）。
- 来源：[Squirrel.Windows update-process.md](https://raw.githubusercontent.com/Squirrel/Squirrel.Windows/refs/heads/develop/docs/using/update-process.md)、[Squirrel.Windows Issue #524: Rollback strategy](https://github.com/Squirrel/Squirrel.Windows/issues/524)、[electron-builder Issue #3554: roll back via .yml](https://github.com/electron-userland/electron-builder/issues/3554#issue-391578803)

**electron-updater（electron-builder / Cap-go fork）**
- 机制：下载新版本 → 安装 → 下次启动运行新版本；API 提供 update-downloaded/update-available 等事件，但**无内建自动回滚**——「保留上一版本并在启动失败时回滚」需应用层记录旧版本并手动重装。
- 触发：人工/应用层实现（无自动健康检查回滚）。
- 来源：[Electron Updater API Reference · Cap-go](https://capgo.app/docs/plugins/electron-updater/api/#available-events)、[@capgo/electron-updater · npm](https://www.npmjs.com/package/@capgo/electron-updater?activeTab=versions)

**Windows 最近一次的正确配置（Last Known Good Configuration）**
- 机制：Windows 保存上次成功登录/关机时的注册表配置（`Select\LastKnownGood`）；启动失败（服务崩溃、蓝屏、驱动问题）时用户可从高级启动选项选择 LKG，撤销本次启动对配置的改动。
- 触发：启动失败后**用户手动选择**（非自动回切）。
- 来源：[Troubleshoot startup problems · Microsoft Support Docs](https://raw.githubusercontent.com/MicrosoftDocs/SupportArticles-docs/main/support/windows-server/performance/troubleshoot-startup-problems.md)、[Restore the registry: Core Services · learn.microsoft.com](https://learn.microsoft.com/zh-cn/previous-versions/windows/it-pro/windows-server-2003/cc776506(v=ws.10))

**rpm-ostree / Fedora Silverblue**
- 机制：不可变系统镜像多部署（deployment）并存，每次升级生成新部署、旧部署保留；`rpm-ostree rollback` 一键切回上一部署，GRUB 也保留旧条目。
- 触发：用户手动 rollback（可被自动化包装）。
- 来源：[How to Roll Back a Deployment on Fedora Silverblue](https://www.fedorafaq.com/en/how-to-roll-back-to-a-previous-deployment-on-fedora-silverblue/)、[rpm-ostree man · Linux Command Library](https://linuxcommandlibrary.com/man/rpm-ostree)

#### 主题二：极简/安全（修复）模式

**VS Code（--disable-extensions / Disable All Installed Extensions）**
- 机制：官方 CLI 支持 `--disable-extensions`、`--disable-extension <id>` 以零扩展启动；命令面板提供「Extensions: Disable All Installed Extensions」与逐项启用排查，定位插件冲突/崩溃。
- 触发：**用户手动**（崩溃后自己用命令行/命令面板进入）；VS Code 无扩展崩溃自动降级检测。
- 来源：[VS Code Command Line Interface · code.visualstudio.com](https://code.visualstudio.com/docs/configure/command-line)、[VSCode 插件冲突排查（第三方）](https://www.php.cn/faq/1558927.html)

**Visual Studio /SafeMode（devenv.exe）**
- 机制：`devenv /SafeMode` 仅加载默认环境与内置组件，不加载第三方 VSPackages/扩展，用于隔离扩展导致的启动崩溃。
- 触发：用户手动。
- 来源：[/SafeMode (devenv.exe) · learn.microsoft.com](https://learn.microsoft.com/zh-hk/visualstudio/ide/reference/safemode-devenv-exe?view=visualstudio&viewFallbackFrom=vs-2019)

**Firefox Troubleshoot Mode（安全模式）**
- 机制：以临时配置启动：禁用全部扩展/主题、关闭硬件加速、重置工具栏；不改动用户数据，重启后自动恢复；「Reset Firefox」可进一步恢复出厂。
- 触发：用户手动（帮助菜单 → Troubleshoot Mode）；也有社区方案在扩展导致无法启动时用该模式自修。
- 来源：[Diagnose Firefox issues using Troubleshoot Mode · Mozilla Support](https://support.mozilla.com/en-US/kb/diagnose-firefox-issues-using-troubleshoot-mode)

**Chrome 崩溃修复（无独立安全模式）**
- 机制：官方修复页指导恢复会话、检查/停用扩展（chrome://extensions）、清理缓存等；可全局停用扩展排查，但无 Firefox 式的独立安全模式。
- 触发：崩溃后用户手动。
- 来源：[Fix Chrome if it crashes or won't open · support.google.com](https://support.google.com/chrome/answer/142063?co=GENIE.Platform%3dDesktop&hl=en)

**Obsidian Restricted Mode（原 Safe Mode）**
- 机制：Restricted Mode 禁用全部社区插件，仅运行官方插件与核心功能；插件安全文档说明该信任边界。
- 触发：用户手动开关（早期版本默认开启，无崩溃自动触发）。
- 来源：[Obsidian 第三方插件帮助页](https://obsidian.md/zh/help/community-plugins)、[obsidian-help: Plugin security.md · GitHub](https://github.com/obsidianmd/obsidian-help/blob/029ba842/en/Extending%20Obsidian/Plugin%20security.md?plain=1)

**VS Code Workspace Trust（信任边界降级，补充）**
- 机制：不信任的工作区以受限模式打开、禁用自动运行的扩展，直到用户显式信任——「按信任边界降级」而非「按故障降级」。
- 触发：打开新工作区时询问。
- 来源：[Workspace Trust · code.visualstudio.com](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)

#### 主题三：开发者自毁场景的对策

**Homebrew**
- 机制：brew 自身是 git 仓库（/opt/homebrew），升级破坏自身时可用 git checkout 回退到旧 commit；`brew pin <formula>` 固定版本防意外升级。
- 触发：用户手动回滚/pin。
- 来源：[Homebrew FAQ · docs.brew.sh](https://docs.brew.sh/FAQ)、[How to Rollback Homebrew Update（第三方）](https://tech.amikelive.com/node-1766/how-to-rollback-homebrew-update/)

**JetBrains Local History**
- 机制：IDE 按时间戳自动保留文件/目录的本地修订（无 VCS 时也生效），被覆盖/删除的文件可随时对比并恢复——本地快照式回滚。
- 触发：自动记录；用户手动恢复。
- 来源：[Local History · IntelliJ IDEA Help](https://www.jetbrains.com/help/idea/local-history.html)

**Kubernetes Deployment 回滚（容器镜像 tag 保留的工程化形态）**
- 机制：Deployment 保留旧 ReplicaSet（revision 历史），`kubectl rollout undo` 一键回退到上一/指定 revision；配合不可变镜像 digest 保留旧镜像。
- 触发：rollout 失败（镜像拉取失败/就绪探针失败时 K8s 自动暂停 rollout）或用户手动。
- 来源：[kubectl rollout undo · kubernetes.io](https://kubernetes.io/zh-cn/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/)

**Windows 系统还原点**
- 机制：系统保护在安装驱动/更新/软件前自动创建还原点，快照注册表 + 受监控文件，可撤销破坏性变更；与 LKG 互补（LKG 只回滚注册表配置，还原点回滚文件与注册表）。
- 触发：安装事件自动创建；用户手动还原。
- 来源：[Restoring the System · learn.microsoft.com (Win32)](https://raw.githubusercontent.com/MicrosoftDocs/win32/refs/heads/docs/desktop-src/sr/restoring-the-system.md)、[Examine the System Restore feature · Microsoft Learn](https://learn.microsoft.com/en-us/training/modules/troubleshoot-windows-startup/7-examine-system-restore-feature)

**Node 生态（npm/pnpm）**
- 机制：npm 无内建回滚命令；回滚依赖「package-lock.json 确定性记录 + 重装旧版本号」，社区有专门的 npm 版本回滚机制设计讨论。
- 触发：用户手动。
- 来源：[npm 版本回滚机制的设计与实现（社区文章）](https://developer.bembew.cn/zh/article/npm/rollback-mechanism-design-and-implementation-for-npm.html)

（仓库内先例：dsh-plugin-guard 插件安装前快照 → 见 4.1。）

#### 主题四：成本与适用性对比（现成分析缺失，以下为来源支撑的归纳）

- **没有搜到把「A/B 双槽」与「极简修复模式」直接对比的现成文章**——两者解决的是不同故障类（版本升级失败 vs 运行树/配置损坏），业界按场景分别讨论。
- A/B 的成本与选型考量：dev.to 的 "Choosing an A/B Update Layout for Your Product" 讨论双槽布局的磁盘/维护权衡；Android Virtual A/B 用快照把磁盘开销降到近似单槽（Galaxy S25 报道佐证）；unix.SE #806906 讨论「A/B 根文件系统 + 独立持久数据」的分区设计——与桌面 App（应用树 vs 用户数据分离）场景同构。
- 安全模式的低成本：社区排查文章反复强调「先禁用全部扩展、零成本定位」（php.cn / wsisp），无磁盘与解包成本；触发全靠用户或简单失败计数。

来源：[Choosing an A/B Update Layout for Your Product · dev.to](https://dev.to/raghu_bharadwaj_404e60eb0c/choosing-an-ab-update-layout-for-your-product-8en)、[A/B rootfs + separate persistent app data · unix.SE](https://unix.stackexchange.com/questions/806906/design-considerations-for-an-a-b-linux-root-filesystem-update-mechanism-with-sep)、[Galaxy S25 A/B 不占额外存储 · SamMobile](https://www.sammobile.com/news/galaxy-s25-a-b-partition-dont-use-extra-storage-seamless-updates)

#### 总结（200 字内）

两者解决不同故障类，不互斥：A/B 双槽是「版本升级失败」的答案——Android/ChromeOS/systemd 的 boot 计数与 good 标记证明「健康检查通过才提交」，磁盘成本可借虚拟 A/B 或重解包摊薄；极简修复模式是「运行树被原地修改」的答案——零磁盘、能进 UI 自修，但救不了整树损坏。桌面 Node 应用建议：修复模式作第一道防线（成本≈0，覆盖插件/配置自毁高频场景），轻量 A/B 只留给升级回滚路径，嵌入式 bundle 重解包充当免费 B 槽。

## 5. 落地切片建议

1. **壳层降级判定**（desktop/main.go supervise）：连续 3 次启动失败（未发布 URL 或 exit≠0）
   → 记录并进入修复模式；保留「重试完整模式」；
2. **修复模式启动**：`--profile web` + 原 overlays + 环境标记（MARISA_REPAIR_MODE=1）；
   landing.html 增加修复画面（错误摘要 + 日志路径 + 重试按钮，经 Wails 事件/URL 参数通信）；
3. **修复闭环工具**：修复模式首屏提供「恢复 profile 出厂文件」（从 exe 内嵌 bundle 提取
   package.json/overlays 覆盖部署树）+ 文档指引（dump-config、cordis.patch.yml 编辑）；
4. **重解包保护运行时数据**（embedded.go）：第三级触发时 merge 语义重解包；
5. **update 路径**：沿用已计划的 first_boot_healthcheck 状态机（轻量 A/B），不与 dev 自愈
   混在一起；
6. 验证：人为破坏三类故障（插件组合行、profile 文件、junction），重启后分别验证档 2 修复
   模式进入、修复闭环、重解包恢复；stage-boot / verify-bundle-boot.mjs 扩展修复模式用例。

## 6. 附：2026-08-21 实测的活证据

- 运行中 GUI 后端（PID 32804，03:19 启动）的 profile 目录在 03:39 被开发操作截断：
  `backend\.dsh\profiles\marisa\package.json`（应为 1996B）与 `desktop.overlay.yml`（应为 286B）
  均为 0 字节；`storages` 下多个 JSON 也为 1 字节。
- 内嵌 bundle（desktop/bundle/backend.tar.zst）含两者的出厂副本（tarstat 提取验证）。
- 下次重启将触发 `readProfileManifest → JSON.parse('')` 硬失败，且无任何降级路径
  —— 正是本研究的触发场景。
