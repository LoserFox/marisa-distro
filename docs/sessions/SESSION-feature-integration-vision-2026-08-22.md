# SESSION-功能整合与视觉切换-2026-08-22

主题：通知链路、升级迁移机制、急救模式、官方会话搜索、modlens 视觉切换 —— rc8 迁移前的功能整合日
日期：2026-08-22
来源：非 Claude Code JSONL（当日会话均不在 `~/.claude/projects` 源目录）；本纪要由提交史、仓库文档与工作记录整理，原始会话不存

## 背景与目标

rc8 迁移（`docs/RESEARCH-rc8-migration-20260820.md`，2026-08-20 定稿）之前，把 8 月以来分散在多个分支的功能全部整合收口，并完成视觉方案的最终切换（弃 Python 系 vision-toolkit）。当日产出五个功能集群，全部落地在独立分支、未 push，等待整合进 rc8 测试版。

## 功能集群

### 1. 原生通知链路（toast 桥接 + 点击跳转）

- **问题**：WebView2 `web Notification API` 默认显示 WebView2 自绘的 Edge 风格弹窗，不是 Windows 原生 toast（实证：操作中心 `wpndatabase.db` 无记录）；Wails 不暴露 controller，宿主接管 `NotificationReceived` 不可行。
- **方案（定案 2026-08-22）**：插件→宿主桥接——
  - `desktop/toast_bridge.go`：Wails 通知服务，`wintoast` 自注册 AUMID/CLSID activator（无需快捷方式）；`127.0.0.1` 随机端口 `POST /toast`，端口注入 `MARISA_TOAST_PORT`。
  - `dsh-web-ui-notify` fork host 半边开 `/plugins/dsh-web-ui-approval-notify/toast` 转发；client 半在壳内（`'_wails' in window`）POST 意图、失败回退 `new Notification`。
  - 浏览器半「离开」判定 `awayNow() = hidden || (壳内 !hasFocus)`——桌面壳切走不最小化时 `visibilityState` 仍 visible。
  - 端到端实证：操作中心出现 `primary=Marisa DSH`、`activationType=foreground` 的原生 toast。
- **点击跳转（同日追加）**：`sessionId` 随 `NotificationOptions.Data` 进 wintoast 激活载荷（实证：操作中心 launch base64 解码含 `data.sessionId`）；点击时 `OnNotificationResponse` 回传 `UserInfo["sessionId"]` → 桌面 Show+Focus + `ExecJS window.__dshWebUiNotifyOpen?.(sid)` → 客户端全局钩子 `sessions.open`（随 fiber 卸载删除）。
- **测试**：插件 vitest 36/36；desktop vet + installedbundle + embeddedbundle 全过；`toast_bridge_test.go`（Data 映射/400/405/500/openSessionJS 转义）。**注意**：主工作区 `toast_bridge_test.go` 存在 `markReady` nil panic（WIP 状态），全量 `go test ./...` 会 FAIL——非迁移机制引入。
- **状态**：主树 feature/upgrade-migration 分支工作区未提交（`desktop/toast_bridge.go`、notify 插件改动），未纳入 rc8 整合分支。

### 2. 升级迁移机制（MIGRATIONS.json 阶梯迁移）

- 分支 `feature/upgrade-migration`，commit `3e43ccf0`（未 push）。
- `desktop/migrate.go`：清单解析 / 阶梯选择 / backup 归档 / `state.json` / `MARISA_MIGRATIONS_FROM` 注入；`embedded.go` 两处钩子（解包 staging 后、删旧 backend 前跑迁移，失败保留旧目录）。
- 10 项单测，默认 / embeddedbundle / installedbundle 三形态全过。
- 方案：`docs/RESEARCH-upgrade-migration-mechanism-20260822.md`。

### 3. 急救模式（三级启动状态机）

- 分支 `feature/rescue-mode`，commit `23990f7b`（未 push），worktree `marisa-rescue-worktree`。
- 状态机：`normal`（完整 marisa）→ 连续 2 次失败 → `minimal`（`--profile web base+web-app` 零插件）→ 连续 2 次失败 → `rescue`（壳层急救页 + 127.0.0.1 随机端口 token 控制端点，不依赖后端）。
- 恢复动作（三勾选默认全开）：备份（整树 rename 原子快照到 `%LOCALAPPDATA%\marisa-distro\backups\<ts>\backend`）+ 初始化配置（清 .dsh 用户面）+ 初始化源码（复用 ensureBackend 重解包内嵌 tar.zst = 免费 B 槽）；installed/dev 形态禁用源码恢复。
- 17 项单测 + vet + 三形态 go test 全过；真实窗口验收待用户。
- 实现文档：`docs/RESEARCH-rescue-mode-implementation-20260822.md`。

### 4. 官方会话搜索启用

- `bundles/marisa-bundle/cordis.patch.yml` 插入 `tool-session-query`（session_search / session_event_search / session_trace / session_event_trace / session_event_read 五工具，workspace-authorized，挂 profile 全局工具层）+ 覆写 `session-query-sqlite` 为 `path: dshHomePath('session-query.sqlite')` + `openAt: first-search`。
- 依赖已在根 package.json 登记 `workspace:^`，YAML 校验通过；待 build.ps1 重建发行版生效；首次搜索建索引可能偏慢。

### 5. modlens 视觉切换（vision-toolkit 退役）

- **决策链**：vision-toolkit 强制 Python（3.11+ 或 35MB 自举）不可接受 + 跨平台无法保证 → 评估 liustack/modlens 与 rc8 原生视觉（#2724）→ 用户定案：换 modlens，保留匿名 Zen MiMo 2.5 默认，不做本地 Ollama 探测；rc8 原生视觉（deepseek-official `inputModalities` 收图）定位互补通道。
- **落地**：分支 `feature/modlens-vision`（worktree `.claude/worktrees/modlens-vision`，基线 803b84dc），两 commit：
  - `43f1f27a`：vendored `@liustack/modlens@3.22.1`（npm 快照 fork，纯 JS 依赖 commander+undici，无安装期脚本）+ 移除 `plugins/dsh-vision-toolkit`（276 文件，Python runtime、UPSTREAM_MANIFEST 哈希快照，本次 `tests/test_vision_client.py` 缺失问题随移除根除）。
  - `5bbc8f01`：接线/登记/lockfile/docs（bundle patch、upstreams.json、profiles/marisa/plugins.json、generate-profile.mjs git21/npm9、pnpm-workspace exclude、verify-bundle-boot 探针换 `/modlens/config`）。
- **fork 补丁**：`dsh/index.js` 新增 `seedZenDefault`——首启时 `~/.modlens/config.json` 缺失则写入 `opencode.ai/zen/v1` + `mimo-v2.5-free` + 占位 key `public`（0600，用户配置绝不覆盖），零配置体验与 vision-toolkit 一致；4 项 node:test 通过；**Zen 握手实测**（Bearer public + 1×1 PNG → 200）。
- **验证**：verify-repository 过（30 插件 12 mirror 18 fork）；frozen-lockfile 一致性过（supply-chain 1720 项）；lockfile 变更语义最小（仅新增 commander@13.1.0，无版本漂移）。
- **阻塞记录**：全量 `pnpm install --frozen-lockfile` / `pnpm test` 受**既有** `plugins/dsh-a2a` prepare 类型面问题阻塞（嵌套 `@deepseek-ai/dsh-llm@0.1.0-rc.8` 与 rc7 harness 类型不兼容；提交版 lockfile 同样复现，非本改动引入）——属「rc8 时代依赖混入 rc7 树」家族问题，随 rc8 换树一并解决。
- 方案文档：`docs/RESEARCH-modlens-vision-switch-20260822.md`；`docs/plugins/modlens.md`（fork 文档）、`docs/plugins/dsh-vision-toolkit.md`（退役横幅）。

## 关键决策与理由

| 决策 | 理由 |
|---|---|
| 原生 toast 走插件→宿主桥接（wintoast + 回环端口） | WebView2 自绘弹窗非原生；Wails 无 controller；WinRT 仅 PowerShell 5.1 支持（pwsh 7 不可用） |
| 升级迁移用 MIGRATIONS.json 阶梯 + 失败保留旧目录 | 部署树不可逆操作必须原子化，回滚路径即旧目录 |
| 急救模式三级状态机 + 内嵌 tar.zst 重解包 | 部署后端 boot 失败要有不依赖后端的恢复入口；tar.zst = 免费 B 槽 |
| 视觉换 modlens（纯 JS） | 无 Python、跨平台、~608KB vs 8MB+35MB；Zen 匿名默认延续 |
| Antigravity CLI 复用不作默认 | Google 条款禁止第三方访问，合规红线 |
| rc8 原生视觉仅作互补通道 | 默认目录不公布 vision-exp；无工具化能力（OCR/坐标/像素对比） |

## 遇到的问题与解决

1. **worktree 全新安装 `pnpm install` 撞 minimumReleaseAge**（mermaid@11.17.0 等 08-19 发布包被年龄窗口过滤）→ 临时 `minimumReleaseAge: 0` 完成 lockfile 重解析后回滚；frozen install 不重校验年龄（CI 路径无碍）。lockfile 变更经「pkg@version 集合 diff」验证语义最小。
2. **dsh-a2a prepare 类型面失败**（rc8 dsh-llm 嵌套 vs rc7 harness）→ 确认提交版 lockfile 同样复现，非本改动；记录待 rc8 换树解决。
3. **Node v26 `node --test <dir>` 不 glob 目录** → `test:seed` 显式指向文件。
4. **npm 插件不属于 bundle 依赖**（generate-profile.mjs 只把 git 插件写进 bundleDeps）→ modlens 挂载走 marisa-bundle patch 行（同 dsh-bash-terminal 模式），npm 插件进 profileDeps。

## 产物与影响

- 新分支：`feature/upgrade-migration`（3e43ccf0）、`feature/rescue-mode`（23990f7b）、`feature/modlens-vision`（43f1f27a + 5bbc8f01）、`feature/shell-switcher`（087226a8，junction repair）
- 既有分支：`fix/desktop-ime-wails-dpi`（2dde92ba，IME）、`sync/rc8-migration`（803b84dc，托盘/图标/控制台/侧栏/自动续跑）
- 新文档：RESEARCH-upgrade-migration-mechanism / RESEARCH-rescue-mode-implementation / RESEARCH-modlens-vision-switch（2026-08-22）
- 未提交：主树 toast 桥接 WIP（toast_bridge.go、notify 插件）

## 下一步

整合以上分支 → rc8 harness 换树（141eb6fe）→ 根 workspace 依赖升 rc.8 + 去死包 → 本地构建 rc8 测试版供 debug（见 `docs/RESEARCH-rc8-migration-20260820.md` 第 4-5 节必验清单）。

## rc8 测试版整合（当日追加，feature/rc8-test）

- worktree `.claude/worktrees/rc8-test`，基线 803b84dc，合并 upgrade-migration（3e43ccf0）+ rescue-mode（23990f7b）+ modlens-vision（43f1f27a+5bbc8f01）——三合并零冲突。
- harness 换树：上游 rc8（141eb6fe，7807 文件）整体替换；仅重放 anchored-standard 预设（其余本地差异为 agent notes 弃置）；`maintenance/upstreams.json` baseline→141eb6fe、dshVersion→0.1.0-rc.8；`docs/upstream-diff.md` 基线更新。
- 根 workspace：58 个 `@deepseek-ai/dsh-*` 依赖 `^0.1.0-rc.6→^0.1.0-rc.8`；移除死包 `dsh-client-web-react`/`dsh-client-schema-form`；`minimumReleaseAgeExclude` 派生 84 条 rc.8 白名单。
- 桌面适配：`desktop/command.go` 默认命令加 `--no-open`（rc8 #2410）；`desktop.overlay.yml` 补 `web-runtime` 行 `openBrowser: false`（launcher 路径无法传 flag）。
- 验证：rc8 全量 `pnpm install` 成功（**dsh-a2a 的 rc8/rc7 类型面 prepare 问题随换树自动消解**）；`verify-repository` 通过；harness `pnpm run build`（tsx scripts/build.ts 新管线）成功，200 个 client artifact。
- 踩坑：harness `postinstall`（install-lefthook.mjs）在非 CI 环境用 `git rev-parse --show-toplevel` 探测 merge 驱动，Marisa 布局下解析到仓库根而失败——build.ps1 以 `CI=true` 运行（第 47 行）本就跳过，非 rc8 回归。
- 踩坑链（按出现顺序解决）：①dsh-compact 404 = mygo-panel devDep `dsh-client-runtime@^0.0.1-rc.1` 远古范围（根 workspace 靠临时 age-0 解析到 rc.7 才绕过，profile workspace 有年龄窗口回落 rc.1）→ dsh-mygo 4 包 devDeps 改写 `workspace:^`（dsh-compact 教训重演）；②dsh-sidechain prepare 在 profile 环境 rolldown 1.2.5（08-19）崩溃（掩蔽式 binding error）→ 根 + profile 生成器 override 固定 rolldown 1.2.4；③rc8 loader 严格化：`dsh-auto-resume` 纯 client 插件无 host 入口 → 补 `src/index.js`（空 apply）+ exports 根条目；④make-bundle.ps1 的 `-replace '\', '/'` 非法正则（rc7 时代插件拷贝均为 junction 未触发，rc8 全新安装产生实体拷贝后命中）→ 改 `.Replace('\','/')` 三处。
- **验证全绿**：`pnpm test` 通过；rc8 后端 boot 成功（`dsh web: http://127.0.0.1:<port>`）；`verify-mygo-runtime.mjs` ok:true（__DSH_BOOT__ 清单 + client bundle 图 + MyGO 面板/API）；make-bundle 产出 `backend.tar.zst` 141.1MB（40456 文件）；standalone exe 147.2MB。
- 分支 commits：41953ad2（换树+登记）、9a950799（组合适配）、08fe929c（make-bundle 正则修复）。
- 产物：`release/Marisa-DSH-windows-x64-standalone.exe`、`Marisa-DSH-windows-x64-0.1.8-rc8test.msi`（构建中）。
- **交付待用户**：本地运行 exe debug（注意：会替换 %LOCALAPPDATA%\marisa-distro\backend 部署，当前 GUI 由旧部署运行）。验收项：真实窗口渲染、IME、托盘、toast、粘贴接管、modlens 设置卡、locale（rc8 默认 en 回退）。
