# PLAN — 集成 dsh-ego-browser（ego-lite 浏览器插件）进 marisa-distro

- 日期：2026-08-23
- 状态：方案评审中（未动工）
- 关联文档：`docs/RESEARCH-dsh-ego-browser-20260823.md`（已落地，47KB/412 行，调查基线 master HEAD `09b6fb3`，83 提交）
- 一手来源：`github.com/Fisfzy/dsh-ego-browser`（master，package.json 0.8.0，pushed 2026-08-21）、harness `apps/cli/reference/README.md`、本仓库 `plugins/dsh-better-sidebar`

## 1. 背景与目标

用户希望把 [Fisfzy/dsh-ego-browser](https://github.com/Fisfzy/dsh-ego-browser)（DSH 插件：把 [CitroLabs/ego-lite](https://github.com/CitroLabs/ego-lite) Chromium 接进 HARNESS，32 个结构化 `ego_*` 工具 + 实时观察窗）集成进 marisa-distro 发行版。

目标：让 marisa 用户能以受控、可审计的方式获得 ego-browser 能力，同时满足仓库铁律（权限影响写明、不 fork 分发、数据安全、Windows 可用性）。

## 2. 研究对象要点（已核实）

| 项 | 事实 | 来源 |
|---|---|---|
| 包名/版本 | `@dsh-external/ego-browser`，`private: true`，version **0.8.0**（README 亮点还写 v0.7.0，README 滞后于 package.json） | package.json / README |
| 安装契约 | `dshx install ego-browser <tgz>` 或 git URL；包内 `dsh.bundle.patch` = `cordis.patch.yml`（insert `ego-browser` 插件） | README / cordis.patch.yml |
| 构建形态 | `lib/`（host+client bundle）、`bin/ego-cast-worker.mjs`、`runtime/`（vendored ego-lite，MIT，含 Linux 移植 PR #234 + Windows 本地补丁，`runtime/PATCHES.md` 有记录）全部入库，**无 prepare/postinstall 脚本** | package.json files / PATCHES.md |
| 依赖 | dependencies 仅 `@deepseek-ai/schemastery: link:../dsh/vendor/schemastery`（编译期类型用）；peers 8 个 `@deepseek-ai/*` 全 **optional**、钉 **0.1.0-rc.8** | package.json |
| 浏览器启动 | LAUNCH_FLAGS **无任何 GPU 参数**；`--remote-debugging-port=0`、`--remote-allow-origins=*`、`--window-size=1280,900`、`--force-device-scale-factor=1`、`--no-startup-window`；无显示器时 `--headless=new`；用户 `chromeArgs` 设置可透传（黑名单只拦 user-data-dir/remote-debugging-port/headless/no-startup-window/proxy） | runtime/ego-linux/src/chrome.mjs |
| 数据位置（Windows） | ego 浏览器 profile：`%LOCALAPPDATA%\ego-lite-linux`（**backend 之外**）；FFmpeg 缓存：`~/.dsh/cache/ego-browser/ffmpeg/`（backend 内，可重下） | runtime/ego-linux/src/paths.mjs、README |
| 许可证 | package.json 声明 MIT；**仓库根无 LICENSE 文件**；内置 ego-lite 为 MIT；可选下载 FFmpeg 为 GPL-3.0-or-later（固定 SHA-256、只解主程序） | package.json / THIRD_PARTY_NOTICES.md |
| 分发约束 | 作者 README 声明：不发布 npm/公共 registry；**不要创建用于分发的公开 fork/镜像**；tarball 安装是官方认可方式 | README |
| WebGL | 桌面 headed 模式跟随系统 Chrome GPU 策略，WebGL 正常；headless/无 GPU 需 `chromeArgs` 加 `--enable-unsafe-swiftshader`（Chrome 137+ 移除自动回退）；观察窗 CDP 后端抓合成器帧（20 FPS JPEG），canvas 内容可见；agent 感知层 `ego_snapshot` 是 DOM 语义树，canvas 游戏只能截图+坐标点击 | 代码审查（详见研究文档） |

## 3. 集成依据

1. **官方机制现成**：harness CLI 参考明确——`dsh plugin --profile <name> add <package-or-git-spec>` 转发给 pnpm（以 profile 目录为 cwd），成功后把带 `dsh.bundle.patch` 声明的包并入 `dsh.profile.bundles` 层栈，重启生效。ego-browser 完全符合该契约，且预构建 + 无 prepare 脚本 = pnpm ≥10 的 allowBuilds 放行也免了。
2. **本仓库已有 UX 先例**：`plugins/dsh-better-sidebar` 的精选插件目录（`plugins-tabs.ts` / `plugins-viewers.ts`）就是「复制安装命令到终端」的形态（如 `cd ~/.dsh && dsh plugin --profile web add "github:fuhefei/dsh-sentinel#v0.7.0"`），带 `tests/plugin-list.spec.ts` 数据守卫。
3. **版本窗口正好**：插件 peers 钉 `0.1.0-rc.8` = marisa 当前基线（0.1.1-rc.2 换树进行中，见 `docs/RESEARCH-0.1.1-rc1-migration-20260822.md`）。
4. **数据安全铁律不冲突**：ego profile 在 backend 之外，MSI RemoveAll 不波及。

## 4. 决策前提（阶段 0，动工前完成）

- [ ] **版本固定**：取当前 master 最新 commit（HEAD `09b6fb3`，2026-08-21）打 tarball，SHA256 入库；升级只跟随 tag/明确 bump，不追 master。
- [ ] **上游 PR 状态跟踪**：5 个 open items 中 4 个 PR 未合并——#13 是仓库主自己的 **Windows 稳定性整合**（nav 路由/hasDisplay/gateway 缺 egoCliArgs·chromeArgs 键等，master 均缺）、#1 空间 Cookie 持久化、#2 headless 指纹、#5 `ref=@N` 文档与运行时 parseRef 不一致；#3 已被 master 其他途径修复。集成基线按 master 现状标记风险，阶段 1 对照 #13 内容验证 Windows 缺口，必要时与作者沟通合并节奏。
- [x] **分发授权确认**：已确认（2026-08-23，用户与作者沟通，作者答复「不是大问题」）。随私有 MSI 分发固定 commit tarball 属许可范围；出处/版本/SHA 记录仍按 §11 执行。
- [x] **无二进制需打包**（2026-08-23 核实）：ego-lite 为纯 JS Node CLI，整个运行时 vendored 在插件包 `runtime/`（解包 1.6MB，零原生二进制）；浏览器用系统 Chrome/Edge（Windows 自带 Edge）；唯一可选下载 = FFmpeg（观察窗 ffmpeg 后端，按需、SHA-256 固定、GPL 不内置）。发行包增量 ≈ 1.6MB。
- [ ] **许可证记录**：根无 LICENSE 但 package.json 声明 MIT——以 package.json + THIRD_PARTY_NOTICES.md 为准，在 vendor 记录中注明；FFmpeg GPL 绝不内置，保持按需下载。
- [ ] **peer 策略定案**：0.1.1-rc.2 换树后 peers（exact 0.1.0-rc.8）与 root（^0.1.1-rc.2）不匹配，pnpm 默认 autoInstallPeers 会装副本 → 双版本风险。预案：① 打包时重写 peer 范围为 `^0.1.1-rc.2`（vendor 修补，PATCHES 记录）② 与作者沟通升 peers ③ 实测确认副本解析不影响（`ctx.subprocess` 等 API 兼容）。以阶段 1 实测结果定。

## 5. 集成形态（三选一，推荐 A 起步）

| 形态 | 内容 | 成本 | 风险 | 建议 |
|---|---|---|---|---|
| **A · 精选目录条目** | `dsh-better-sidebar` 目录加一条 ego-browser 条目（install 命令 + 权限文案 + 测试用例） | 低 | 最低，不引入构建链路 | 可作 C 的补充入口（含卸载引导） |
| **B · 设置页一键安装** | 后端跑 `dsh plugin --profile web add <本地 tarball>`（tarball 随发行版带）+ 安装状态受管块 + junction（Windows 符号链接教训，见 dsh-mygo 文档） | 中 | 需处理 Windows 权限/链接 | 暂缓 |
| **C · 发行版预装** | ✅ **已拍板（2026-08-23）**：vendored 目录 + plugins.json + generate-profile.mjs 写进 profile，开箱即有 | 高 | 高权限插件预装，信任边界写清楚 | 实施路径见 §6A |

## 6. 分阶段计划

### 阶段 0 · 前置确认（见 §4）

### 阶段 1 · staging 实测（硬门槛，不过则止）

环境：staging profile 用 junction 指向桌面部署树 `%LOCALAPPDATA%\marisa-distro\backend\marisa-distro`（工作区 node_modules 是混合版本，不可用），基线 rc.8。

用例清单：
1. `dsh plugin --profile web add <ego-browser.tgz>`：pnpm 解析（重点看 `link:../dsh/vendor/schemastery` 行为——预期悬空/报错，预案：打包时 strip 该 dependency）；
2. 重启后插件挂载：`ego_help` 列全 32 工具、`ego_doctor` 环境体检、设置页出现 ego-browser 配置、观察窗 🌐 小球；
3. Windows 真机冒烟：Chrome/Edge 自动发现（`resolveEgoEnv`）、`ego_navigate` → `ego_snapshot` → `ego_click` 链路、观察窗 CDP 后端推流 + 监控窗鼠标回传、`ego_screenshot`、下载捕获；
4. **WebGL 冒烟**：`ego_navigate` 打开 three.js 官方示例 + `ego_js` 查 `webglcontextcreationerror` + 观察窗画面确认（桌面 headed 预期正常）；
5. 卸载链路：`dsh plugin remove` 后无残留（browser.json/worker 清理），FFmpeg 缓存可保留；
6. 登录态：`ego_auth_flush` 落盘 → 重启 DSH → 会话保持（README 声称仅优雅关闭落盘，验证）。
7. **Windows 稳定性专项**：对照未合并 PR #13 的内容清单（nav 路由/hasDisplay/gateway 缺键等）逐项验证 master 现状，确认哪些缺口会影响 marisa 桌面用户；复杂流程（多标签 + 观察窗 + 输入接管）30 分钟连续操作稳定性观察。

> 阶段 1 前置已实测（2026-08-23，隔离临时目录，pnpm v11.9.0）：`pnpm add dsh-external-ego-browser-0.8.0.tgz` 成功（exit 0，456ms），`link:../dsh/vendor/schemastery` 仅警告（指向不存在目录，编译期依赖无害），peers 警告在真实 profile 中会正常解析。**「能直接安装」已无技术疑点**。

### 阶段 1A · 预装实施路径（形态 C，用户 2026-08-23 拍板）

机制依据（已核对代码）：profile 由 `profiles/marisa/generate-profile.mjs` 生成——`plugins.json` 清单驱动：`source: 'git'` → marisa-bundle 的 `file:` 依赖；`source: 'npm'` + `bundle: true` → profile 直接依赖（`file:` 指向 vendored 目录）+ 进入 `dsh.profile.bundles`（插件自带 `dsh.bundle.patch` 生效，无需动 marisa-bundle 的组合 patch）。profile pnpm-workspace.yaml 已 glob `plugins/*`，vendored 目录自动成为 workspace 成员。

步骤：
1. **落位 vendored**：把固定 commit（`09b6fb3`，0.8.0）打出的 tarball 内容（`lib/`、`bin/`、`runtime/`、`cordis.patch.yml`、`package.json`、`README.md`，即 `files` 字段）解包进 `plugins/dsh-ego-browser/`（**不**带上游 node_modules；`files` 字段本来就排除）；
2. **VENDOR 记录**：目录内 `VENDOR.md`——上游 URL、固定 commit、版本 0.8.0、tarball SHA256、本地改动清单（初始 0）、许可证记录（MIT 声明、根无 LICENSE 文件、FFmpeg GPL 不内置）；
3. **清单登记**：`profiles/marisa/plugins.json` 加 `{ "name": "@dsh-external/ego-browser", "source": "npm", "dir": "dsh-ego-browser", "version": "0.8.0", "bundle": true }`（字母序插在 dsh-drag-and-drop 与 dsh-genui 之间）；
4. **生成器计数**：`generate-profile.mjs` 的 `npmPlugins.length !== 8` → 9；
5. **生成 + 安装**：`node profiles/marisa/generate-profile.mjs` → profile `pnpm install`（NODE_OPTIONS=8G）→ 启动 `dsh` 验证挂载（`ego_help`/`ego_doctor`/观察窗小球）；
6. **发行链**：plugins/ 随 backend 树自动进 MSI；构建机生成 profile（MARISA_PROFILE_DIR）时自动带上；用户装完 MSI 开箱即有；
7. **默认开关决策**：插件 bundle 默认激活（观察窗对用户可用）；`ego_*` 工具是否默认给 agent 预设需单独决策（建议默认不给 + 权限门控，见 §4）。

前置决策（§4）在本路径执行前仍需过：作者分发授权确认、Windows 稳定性实测（PR #13 对照）、0.1.1-rc.2 换树后 peers 复测。

### 阶段 2 · 换树复测

0.1.1-rc.2 换树完成后重跑阶段 1 关键项（peers 解析策略见 §4），结论记录进本计划。

### 阶段 3 · 形态 A 落地

1. `plugins/dsh-better-sidebar/src/client/plugins-tabs.ts`（或 viewer 目录）加条目：`cd ~/.dsh && dsh plugin --profile web add "<tarball 或 git spec>"`（参照 dsh-sentinel 条目格式）；
2. `locales.ts` 加 i18n 描述；权限影响文案随条目展示；
3. `tests/plugin-list.spec.ts` 补数据用例；
4. `docs/plugins/dsh-better-sidebar.md` 或独立文档补用户说明（安装、观察窗用法、登录态生命周期、WebGL 注意项）。

### 阶段 4 · 权限与安全（AGENTS.md 硬要求，随 PR 写明）

能力清单（插件会获得）：
- **进程**：spawn Chrome/Chromium/Edge/Brave（用户已登录上下文）、ego worker、可选 FFmpeg（按需下载，SHA-256 固定）；
- **任意代码**：`ego_js`/`ego_cdp`/`ego_cli` = 浏览器上下文任意 JS/CDP/CLI 执行；
- **数据**：登录态落盘（`ego_auth_flush`）、截图/上传/下载文件；
- **网络**：浏览器经 `EGO_LINUX_PROXY` 可选代理、`ego_http`、观察窗 localhost 推流、FFmpeg 托管下载。

风险点：
- CDP 随机端口绑 127.0.0.1 **无鉴权**（`--remote-allow-origins=*` 为 LAUNCH_FLAGS 自带；端口写在 profile 的 browser.json，本机任意进程可读并接管浏览器）——利用需本机恶意进程，标注为已知风险；
- 设置 gateway `/ego/api/*` 仅同源检查无鉴权（同源内任意网页上下文可调用）——观察窗服务仅注册在有 HTTP server 时；
- `ego_js`/`ego_cdp`/`ego_cli`/`ego_script` 是无沙箱 RCE 级工具（浏览器上下文任意代码 + CLI）；任务空间默认继承用户 Web 登录态并可落盘（`ego_auth_flush`、`--import-chrome-profile`）；root 场景 `--no-sandbox` wrapper；
- ego 浏览器是「你已登录」的浏览器——agent 能访问你的登录态站点，信任边界与 DSH 沙箱无关；
- 建议：`ego_*` 工具默认不给 agent 预设/加权限门控；观察窗是人在环控制点。
  - **⚠️ 用户已拍板（2026-08-23）：`ego_*` 工具默认全开**——本建议不生效，改为在用户文档与首次启用引导中显著提示权限边界（任意 JS/CDP/CLI 执行、继承用户 Web 登录态、`ego_auth_flush` 落盘）。

### 阶段 5 · 发行与文档

- vendor 记录：固定 commit + SHA256 + 本地 patch 清单（初始为 0），对齐 `maintenance/upstreams.json` 风格；
- 用户文档：安装、观察窗、登录态（重启需重登）、WebGL 注意项（headed 正常 / headless 需 `--enable-unsafe-swiftshader` / 20 FPS 观察级）；
- 升级：手动 bump + CHANGELOG 追踪，随新 tag 重打 tarball。

## 7. 开放问题

1. ~~`link:../dsh/vendor/schemastery` 在 tarball 安装时的解析行为~~ → **已实测（2026-08-23）**：pnpm v11.9.0 仅警告不报错，安装成功；作为 workspace 成员安装时预期同样为警告级（阶段 1A 安装时再确认一次）；
2. 0.1.1-rc.2 下 peers 双版本策略（§4 三预案）；
3. 作者对随发行版分发 tarball 的授权确认；
4. LICENSE 文件缺失的补强（建议向作者提议补文件）；
5. Windows 复杂流程稳定性（ego-lite 社区移植，README 自认弱于 macOS；且仓库主自己的 Windows 整合 PR #13 未合并）——阶段 1 验收以简单流程为准；
6. 作者 README 未提 git spec 安装的构建行为（无 prepare 脚本 → 直接用入库产物，理论成立，实测确认）；
7. 仓库无 CI（无 .github/）——质量保障依赖作者本地测试，集成前以阶段 1 实测兜底。

## 8. 验收标准

- M1：阶段 1 全部用例通过（含 Windows 真机 + WebGL 冒烟）；
- M2：阶段 2 换树复测通过，peer 策略定案记录；
- M3：形态 A 落地（目录条目 + 文案 + 测试 + 文档），PR 含完整权限影响说明；
- M4（可选）：形态 B 一键安装，桌面冒烟 + MSI 安装/卸载验证。

## 9. 决策记录

- 2026-08-23：用户选择「先把方案落成文档」，本计划进入评审；评审通过后从阶段 0 开始。
- 2026-08-23：用户拍板**直接预装（形态 C）**，实施路径见 §6A；形态 A 降级为可选补充（含卸载引导），形态 B 暂缓。
- 2026-08-23：隔离实测确认「直接安装」无技术障碍（pnpm 11.9.0，tarball 安装成功，`link:` 依赖仅警告），开放问题 #1 关闭。
- 2026-08-23：执行顺序定为**前置决策先做完再动工**（作者授权确认 + 真机冒烟全绿 → 才执行 §6A）；`ego_*` 工具**默认全开**（权限边界提示写进用户文档与引导）。
- 2026-08-23：作者 QQ 确认同意分发（授权前置 ✅）；用户指示**直接装进来**。§6A 已执行：`plugins/dsh-ego-browser/`（1.6MB vendored + VENDOR.md）、`plugins.json` 登记（npm/bundle/0.8.0）、`generate-profile.mjs` 8→9；生成器验证通过（temp profile：dep + bundles 均含 ego-browser，nameMismatches 空，bundle 生成物零漂移）。**未提交**（generate-profile.mjs 与 mygo devDeps 先行应用混改，提交需 hunk 级拆分或与该工作协调）。live 部署冒烟安装已就位，待重启验证挂载。

## 10. 真机冒烟记录（阶段 1 执行日志）

环境（2026-08-23 实测确认）：
- 运行中 GUI = 部署树 `%LOCALAPPDATA%\marisa-distro\backend\marisa-distro`（harness/dsh-tools 均 **0.1.0-rc.8**）+ live profile `backend\.dsh\profiles\marisa`；
- 部署形态：profile node_modules **junction** → 部署树 node_modules；桌面 launcher 按 `backend\LINKS.json` 物化各插件 junction（`node_modules/<name>` → `plugins/<dir>`）；live profile 无 lockfile——**此环境禁止 `dsh plugin add`（pnpm 全新解析会踩 vendored mygo 404 坑）**，安装走 mygo 同款「复制 + junction + 受管块」路径；
- 另注：`%USERPROFILE%\.dsh\profiles\marisa` 是**另一个 dev profile**（依赖指向 sync-011-rc1 worktree = 0.1.1-rc.2），与 live profile 无关。

已执行（冒烟安装，可回滚）：
1. tarball（0.8.0 / commit 09b6fb3）解包 → `backend\marisa-distro\plugins\dsh-ego-browser\`（bin/lib/runtime/cordis.patch.yml/package.json/README）；
2. junction `node_modules\@dsh-external\ego-browser` → `plugins\dsh-ego-browser`；`LINKS.json` 追加条目；
3. profile manifest：dependency `file:../../../plugins/dsh-ego-browser` + bundles 追加 `@dsh-external/ego-browser`；
4. 预检：`require.resolve` 从 profile 解析到 `lib/index.js` ✅；14 个顶层 import（@deepseek-ai/dsh-tools 0.1.0-rc.8 等）全部解析 ✅；
5. 备份：profile package.json / pnpm-workspace.yaml → `%TEMP%\ego-smoke-backup`。

待验证（重启 GUI 后）：插件挂载（设置页配置项 / 观察窗小球 / `ego_help`）、`ego_doctor`、导航-快照-点击链路、观察窗推流、WebGL 冒烟（three.js demo + `webglcontextcreationerror` 探针）、卸载回滚演练。

回滚步骤（如需）：删 junction `node_modules\@dsh-external\ego-browser` → 删 LINKS.json 条目 → 用备份还原 profile package.json → 删 `plugins\dsh-ego-browser`。

## 11. 附录 A · 作者授权确认信草稿（待用户在 Fisfzy/dsh-ego-browser 提交 issue）

标题：关于在私有发行版中随包分发安装 tarball 的授权确认

正文：
> 你好！我们是 marisa-distro（DeepSeek Harness 的 Windows 桌面发行版，私有仓库）的维护者，计划把 ego-browser 预装进我们的发行版。
>
> 我们确认了 README 的约束：不发布 npm/公共 registry、不创建用于分发的公开 fork/镜像。我们的做法是：**不改代码、不 fork、不发布到任何公共 registry**——仅把固定 commit（当前 09b6fb3 / 0.8.0）打出的 tarball 作为安装介质，随私有 MSI 分发，安装时按 README 的官方方式（`dsh plugin add <tarball>` / 等效链路）载入，并注明出处、版本与 SHA-256。
>
> 想确认这在你许可范围内。另外两个可选小建议：
> 1. 仓库根目录补一个 LICENSE 文件（package.json 已声明 MIT，但没有 LICENSE 文件，下游审计会卡）；
> 2. DSH 上游已到 0.1.1-rc.x，插件的 peers 仍钉 0.1.0-rc.8，后续可能需要跟进。
>
> 感谢这个优秀的插件！

回复记录：**2026-08-23 作者答复「不是大问题」——随私有 MSI 分发 tarball 获准**。
