# Marisa 吸收对照表 — 三仓源码级复核版（2026-08-25）

> 依据：本机直接克隆的三个仓库源码核验报告（见会话交付物）：
>
> - anywhere-labs/dsh-desktop @ `efc72d4f`（官方基线 0.1.1-rc.2 / `b150a551`）
> - zhu1090093659/dsh-web @ `c34878c8`
> - zouyuxuan122/Deepseek-Harness-EAC @ `f04ed56e`（官方基线 0.1.1-rc.2）
>
> 本文是吸收方案，不是研究报告。每条"抄"都写明**抄机制还是抄实现**、落点、验证口径。

---

## 0. 三仓复核后的一句话结论

| 仓库 | 插件/壳分工 | 官方 baseline 改动 | 对 Marisa 的定位 |
|---|---|---|---|
| alabs | 功能几乎全部由 Cordis 插件实现；壳只做启动编排与原生能力 | **11 个包走 Yarn `patch:` 协议**（9 个官方包 + app-builder-lib + dshmarket），可审计 | **安装安全模型与官方包修正清单的来源** |
| dsh-web | 19 个 bundle，全部插件；聚合由生成器驱动 | **零官方修改**；官方 CLI 是唯一写入者 | **清单驱动生成与"CLI 单写者"纪律的来源** |
| EAC | 40 个 cordis 插件，但大量是壳 IPC 门面 | **非 pnpm patch 形态直改官方包文件**（patch-deps.ts / patch-session-manage.js / vendored 覆盖） | **只抄保护中心与恢复思想；不抄其补丁管线** |

---

## 1. 吸收原则（先立规矩）

1. **抄机制，不抄实现**。Marisa 是 Go/Wails 壳 + workspace harness，不换 Electron/Tauri。
2. **对官方包的修改只允许两种形态**：
   - Marisa harness 是 workspace 源码：把逻辑移植进对应 `src/*.ts`，记入 `docs/upstream-diff.md` 与 `maintenance/upstreams.json`；
   - 发布包形态：用 `patch:` / vendored 快照，禁止运行期脚本直改 `node_modules`。
   - **明确禁止抄 EAC 的 `patch-deps.ts` 直改管线**（见 §3.3）。
3. **用户 profile 是资产**：卸载/恢复只做外科手术式行编辑，注释和无关覆盖必须保留；证据不足时不动手。
4. **恢复必须证据驱动**：只有恰好匹配 1 个肇事插件才自动行动；匹配 0 或 ≥2 只报告。
5. **生命周期脚本默认拒绝**：市场/一键安装不得自动写 `allowBuilds` 白名单；确需构建脚本必须逐条展示、用户显式确认。
6. 继续保持"官方 CLI/包管理器是 profile 唯一写入者"的 MyGO 边界。

---

## 2. 与 Marisa 现状对齐后的判定表

### 2.1 从 alabs 看

| 能力 | Marisa 现状 | 判定 |
|---|---|---|
| 端口 43120/0 + 回环 + `--no-open` | `desktop/command.go` 已 `--no-open`、端口 0；overlay 已 `openBrowser:false` | 已实现，不抄 |
| 单实例/托盘/通知/更新门卫 | `desktop/single_instance_*.go`、`tray.go`、`toast_bridge.go`、`update_guard*` | 已实现；只补"turn/job 完成通知"逻辑 |
| 启动阶段机 + active-run marker + 诊断导出 | 有持久日志与三级 rescue，无阶段机 marker、无自动脱敏导出 | **抄**（P1，Go 侧） |
| 安装恢复 WAL | `desktop/install_wal.go` 已有（发行包安装） | 已实现；把同一思想下沉到 MyGO 插件安装（P0-1） |
| 9 个官方包 patch | Marisa harness 基线同为 `b150a551`，但以 workspace 源码存在，不能直接套 JS patch | **移植逻辑进源码并记账**（P0-2） |
| `dshmarket` 852 行 patch | MyGO 是自建市场，不用 dshmarket | 不抄 |
| preview/execute 两阶段 + receipt + 三文件快照 | MyGO 有 registry 校验与安装树原子换入，但无 preview intent、无四文件快照回滚，且会**自动放行构建脚本** | **抄核心安全链**（P0-1） |
| catalog 三层缓存/assetRef/pinned-DNS | MyGO 当前是本地 registry 快照，无远程 catalog 面 | 暂不抄；开远程源时再抄（P2） |

### 2.2 从 dsh-web 看

| 能力 | Marisa 现状 | 判定 |
|---|---|---|
| aggregate.yml 单源 → 生成 patch/deps + CI `--check` | `profiles/marisa/generate-profile.mjs` + 根 `plugins.json` + `test:repository` 双清单校验 | **抄生成器纪律**：收敛为单一手写清单 + 生成 + 漂移门禁（P1） |
| mount-once 去重 | MyGO 有自己的账本/live rail | 概念已覆盖，不抄 |
| 官方 `/plugin-installer` 优先，否则 CLI 网关；CLI 唯一写入者 | MyGO 已通过 `dsh plugin --profile` 操作 | 守住边界即可，不抄 |
| 市场资产下载器（来源白名单/穿越防护/大小超时/sha256/原子写） | 无皮肤/宠物资产中心 | 有条件抄（P2，若做主题中心） |
| task-board / ssh / remote / pet 等 17 个功能包 | Marisa 定位不覆盖 | 不抄 |

### 2.3 从 EAC 看

| 能力 | Marisa 现状 | 判定 |
|---|---|---|
| 插件保护中心：4 声明文件快照、回滚前反悔快照、boot 健康链、incident 报告 | MyGO 安装树有 backup rename；无 profile 声明文件快照/健康提交/incident | **抄思想，用 Go + MyGO 重新实现**（P0-3） |
| 证据驱动失败归因（单命中才动手） | rescue 只有分级降级，无肇事插件归因 | **抄**（P0-3，写入 AGENTS 硬规则） |
| `patch-deps.ts` 直改 node_modules | — | **不抄**（§3.3） |
| `patch-session-manage.js` 启动时改 5 个官方包 | 官方已有 session-search/archive 等原生能力；Marisa 不需要自建删除链路 | 不抄；若确需删除/恢复，先核对官方 0.1.1-rc.2 是否已覆盖 |
| companion-sync 写 profile patch + row heal/dedup | profile 生成器已有；可借鉴 row heal 幂等逻辑 | 抄概念（并入 P0-2/P1 生成器） |
| `skin.json` + patch 行互斥重写 + 重启生效 | 无皮肤中心 | 条件抄（P2） |
| soul.md `fs.watch` 热重载 + 配置默认值 | 无等价物 | 条件抄（P2，人设需求出现时） |
| extension-host / Job Object 隔离 SDK 插件 | 不是 DSH 官方插件模型，且 Marisa 不引第三方 SDK 插件 | 不抄 |
| unified market 的**临时 DSH_HOME 试装验证** | MyGO hub 已有部分试装语义 | 核对 MyGO 是否覆盖；不足则抄试装隔离（P1） |

---

## 3. 落地计划

### P0-1：MyGO 安装安全收紧（抄 alabs 安全链 + dsh-web CLI 纪律）

**落点**：`dsh-mygo/packages/loaders/mygo-loader-profile`、`mygo-panel`。

1. 关闭一键安装的 `autoFixPnpmPolicies` 自动放行（现 `face.ts` 会自动写 `allowBuilds` 并 rebuild）：
   - 含 `preinstall/install/postinstall` 的包直接拒绝；
   - `prepare` 类脚本逐条展示、显式确认后才执行；
   - git 源标记"未审查/手动模式"。
2. 安装前快照 4 个声明文件：`package.json / pnpm-lock.yaml / pnpm-workspace.yaml / cordis.patch.yml`（学 EAC `GUARD_FILES` 与 alabs 三文件校验点）；失败回滚，成功等下次启动健康验证通过再提交快照。
3. npm 源强制精确版本；registry 校验 deprecated / integrity / bundle patch 证据。
4. 安装执行保持 `dsh` CLI 为唯一写入者。

**验收**：
- `pnpm-policies.spec.ts` 增加带 `postinstall` 的恶意 tarball：必须被拦截且脚本未执行；
- 注入安装失败/损坏 fixture：四文件回滚到位、残留目录被清理；
- marisa-test profile 真机装/卸一轮 + 重启健康。

### P0-2：alabs 9 个官方修正按源码形态移植（同 baseline 红利）

**落点**：`harness/packages/*` 对应源码；`docs/upstream-diff.md` + `maintenance/upstreams.json` 记账。

Marisa 是 workspace 源码，所以**移植逻辑到 `src/*.ts`，不贴 JS patch**。逐个判定：

| alabs patch | Marisa 是否要 | 移植位置 |
|---|---|---|
| dsh-app-boot 空 patch 列表容忍 | 要 | 对应 `parsePatchList` 源码 |
| dsh-llm-deepseek 空 tool-call id/name | 要 | `translate` 流式翻译源码 |
| dsh-sandbox-windows-acl `STARTF_USESHOWWINDOW + SW_HIDE` | 要（MSI 下隐藏沙箱 PowerShell 窗口） | sandbox spawn 源码 |
| dsh-host-directory-picker-browse stat 探测 | 要（Windows 中文环境） | directoryRow 源码 |
| dsh-client-ui-directory-picker-browse 原生选择器 | 暂缓（Go 壳没有 Electron dialog；先确认 WebView2 是否走官方 browse） | 条件移植 |
| dsh-client-ui-workspace drop 挂点 | 暂缓（已有 dsh-drag-and-drop） | 条件移植 |
| dsh-client-ui-settings-models baseURL 放宽 | 要（第三方端点） | ModelsSection 源码 |
| dsh-client-ui-trajectory i18n | 可选（纯文案） | 低优先级 |
| dsh-web-app openBrowser | 已由 overlay/`--no-open` 覆盖 | 不移植 |

**验收**：每移植一项跑 `pnpm install --frozen-lockfile && pnpm test` + `go test -C desktop -tags installedbundle ./...` + `go test -C desktop -tags embeddedbundle ./...`；`upstream-diff.md` 里每项附基线行为/动机/测试证据。

### P0-3：插件保护中心 + 证据驱动恢复（抄 EAC 思想，Go + MyGO 重实现）

**落点**：`desktop/`（Go 侧 guard）+ `dsh-mygo`（触发与归因）+ AGENTS.md 硬规则。

1. **四声明文件快照**：MyGO 每次安装/卸载/启停前由 Go 或 Node 侧写快照目录（保留最近 N 份），回滚前先写 `pre-restore` 反悔快照；`change-ledger` 继续负责工作区文件恢复，不重复造。
2. **健康提交**：插件操作后标记 pending；下一次桌面启动 + 后端健康（现有 rescue_health 逻辑）通过才提交快照；失败自动回滚一次并保留 incident。
3. **证据驱动归因**：从后端 stderr 提取 `DSH entry failed / duplicate loader entry / slot 冲突 / cannot resolve bundle`，反查第三方插件；**只匹配 1 个才自动 disable/uninstall，否则只展示证据**。
4. incident 报告：`~/.dsh` 或日志目录下 Markdown 事故单（待处理→已解决），rescue 页可查看。

**验收**：
- 单测：合成日志命中 0/1/N 三种情形，断言只有单命中触发行动；
- 真机：注入坏插件 → 桌面自动降级并给出"嫌疑插件 X"证据，不误删正常插件。

### P1

| 项 | 抄什么 | 落点 |
|---|---|---|
| 日志脱敏 + 诊断导出 | alabs mask-secrets 的 sink 层思路 + diagnostic worker 的隐私清单 | Go `logging.go` + rescue 页导出按钮 |
| 清单单源 + 漂移门禁 | dsh-web `aggregate.yml → 生成 + --check` | 收敛根 `plugins.json` 与 `profiles/marisa/plugins.json`，`test:repository` 作 --check |
| turn/job 完成通知 | alabs notifications 的 `userInitiated` 过滤 | 现有 `toast_bridge` + bundle 事件监听 |
| 试装隔离 | EAC unified market 临时 `DSH_HOME` 试装 | MyGO 安装预检（若未覆盖） |
| row heal/dedup | EAC companion-sync 的 patch 行幂等修复 | profile 生成器 |

### P2（条件触发）

- 主题/皮肤中心：抄 dsh-web `skin.json` 资产模型 + 安全下载器，不抄 EAC 皮肤切肤需重启的交互。
- 人设热重载：抄 EAC `dsh-soul-md` 的 `fs.watch + 防抖 + section 撤旧注册`，但**配置字段必须有默认值**这条写进 Marisa 插件规范。
- 远程 catalog 安全：真要做远程插件目录，再抄 alabs 的 pinned-DNS / assetRef / preview-execute 双 verify。

---

## 4. 明确不抄（含理由）

1. **EAC `patch-deps.ts` + vendored node_modules 覆盖管线**：脚本直改 `node_modules` 不可审计、易与 npm 版本漂移，且 EAC 自己都要靠幂等标记 + staging 回填才安全。Marisa 的等价需求全部走"harness 源码移植 + upstream-diff"或"MyGO 安装门禁"。
2. **EAC `patch-session-manage.js` 启动时改 5 个官方包**：先核对官方 0.1.1-rc.2 的 session-search/archive 是否已覆盖需求；不覆盖也应作为上游反馈或 Marisa fork 插件实现，不做运行期源码注入。
3. **Electron 桌面壳 / RunAsNode**：Marisa Go/Wails 壳 + 随包 Node 更小，且已验收 MSI。
4. **alabs `dshmarket` patch**：MyGO 不用 dshmarket，兼容补丁无意义。
5. **dsh-web 17 个功能包**（task-board/ssh/remote/pet 等）：范围蔓延，与 Marisa 定位冲突。
6. **EAC extension-host / SDK 插件体系**：非官方 DSH 模型，引入后治理复杂度翻倍。
7. **账号/遥测/自建市场后台/静默自动更新**：与已有产品决策冲突。

---

## 5. 执行顺序

1. 跑完 AGENTS 四条验证命令，确认 0.1.1-rc.2 基线稳定；
2. P0-1 → P0-3 → P0-2（P0-2 每项独立 commit）；
3. P1 按"诊断导出 → 清单单源 → 通知"顺序；
4. P2 只在用户明确要主题/人设/远程时启动，先出 SPEC。

每个 P0 项建议按 Marisa 现有习惯先落 `docs/PLAN-*.md` 或 H 系列规格书，再开实现 PR；一项 PR 只解决一个可验证问题。
