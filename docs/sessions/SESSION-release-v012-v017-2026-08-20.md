# v0.1.2 → v0.1.7 发布工作流：update-check 插件、vision-toolkit 0.1.32、mnemon、CI 修复

> 来源会话：`c2b2e77c-9910-412b-899b-49da5861b757.jsonl`（2026-08-18 19:18 → 2026-08-20 11:32，约 69 条真实用户消息，6.2MB）
> 整理方式：会话记录结构化纪要

## 背景与目标

会话开始时用户要求：按 `docs/PLAN-update-check-plugin-20260819.md` 实现更新检查插件，然后出一个阶段性版本进行测试。但随后用户多次改变优先级：

1. 「更新插件先不要了，先出一个版本，asap，然后我做一次测试，我们这一个release就先这样了」→ 优先发布
2. 测试中发现 fflate 导致的 boot 崩溃、vision 设置页坏掉
3. 质疑 aigc-canvas / MinerU 插件「到底是什么鬼」→ 完全移除
4. 质疑 vision-toolkit 方案 → 评估 modlens / mnemon / dsh-web-ui / Bigfish
5. 最终：vision-toolkit fork 升级 0.1.32 + mnemon 集成 + update-check 插件 + CI 修复，一天内连发 v0.1.2→v0.1.7 共 6 个版本，v0.1.7 正式发布

会话结束时状态：**v0.1.7 已发布到 GitHub**（https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.7），提交 `39a31e46`。

## 关键决策与理由

| 决策 | 理由 | 出处 |
|---|---|---|
| 更新插件先不做，先出可测版本 | 用户明确「asap」「这一个release就先这样了」；工作树有 5060+ 未提交改动（rc7 sync + tar.zst 压缩改造），先冻结版本 | 8/18 19:36 后 |
| 修复 release 脚本缺 `CI=true` | `pnpm install --frozen-lockfile` 在无 TTY 下要清 modules 目录被拒（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）；build.ps1 早已有，release 脚本漏了 | v0.1.2 首次构建失败 |
| 根 lockfile 重生成（`--no-frozen-lockfile`） | 未提交的 `generate-profile.mjs` 把 runtime profile 的 MyGO 依赖改成 7 个 `file:` vendored 包，lockfile 还是旧的，frozen 安装拒绝 | v0.1.2 第二次构建失败 |
| 插件上游同步让位给当前 release | 检查出 4 个插件上游有新提交（dsh-a2a、dsh-sidechain、whale-girl mirror + dsh-track fork），但用户明确「这一个release就先这样了」→ release 先行，同步排后（本会话内也完成了） | 8/18 晚 |
| **fflate 单版本 override（`fflate: 0.8.3` 裸 override，删掉 scoped 例外）** | 见「遇到的问题」——pnpm hoisted 模式下 workspace 成员从根解析，`--prod` prune 后 hoist 赢家变成 univerjs 钉的 0.4.9（CJS），apiproxy 的 `import { Zip } from "fflate"` 崩。唯一稳健解是 graph 里只有一个 fflate | 8/19 凌晨深度诊断 |
| aigc-canvas + MinerU 完全移除 | 用户「到底是什么鬼」——都是 `@huanlin` 系插件，MinerU 需自备 `localhost:18000` 服务、aigc-canvas 默认是 `stub://` 假数据生成器，对无服务的用户就是两个占位卡片；插件数 28→26，全引用点清理 + 锁文件重解析 + 门禁全绿 | 8/18 晚 |
| vision-toolkit 方向：升级 fork 到上游 0.1.32 + 保留匿名 Zen 预设 | 四路评估后：modlens 无匿名开箱默认（硬阻塞，Marisa 零键姿态）、配置在 harness 外；toolkit 的真实问题只是设置页坏了（v0.1.5 已修）+ 要 Python（0.1.32 自动下载独立 Python 解决） | 8/18 21:13 用户拍板 |
| modlens 快照化后又被撤销 | 用户先同意「modlens 可选预置」，vendor 完又改口「modlens暂挂吧，不加了」→ 全部回退干净 | 8/18 晚 |
| mnemon 集成（dsh-mnemon@0.2.9 + Go 引擎 v0.2.3） | 评估结论：推荐；三层记忆（runtime memory/documents/spaces），引擎随包分发；4 个 blocker 全过（B1 分发 mnemon.exe、B2 file: 钉版本、B3 rc.7 验收 343 测试 + boot、B4 默认 storageScope=workspace / persistenceStrategy=local-only / remoteAccess=read-only） | 8/18 21:13 用户拍板 |
| update-check 注册为 first-party（`source: npm` + fork 语义） | 首方插件不是上游镜像；`check-upstreams` 要跳过它又要进 bundle 依赖 | 8/19 实施 |
| 提交「所有变动」（含 harness 行尾噪声，单一大提交） | 5317 个改动大多是 harness 镜像行尾/状态噪声（会话前就存在），但 **release tag 必须精确对应构建时的树**，否则无法复现 v0.1.7 二进制 | 8/19 03:38 |
| 用本地二进制发 release，linux/mac 不发 | 用户明确「二进制用我的，linux和mac的先不发」；release.yml 是 `workflow_dispatch` 手动触发，推 tag 不会自动重建 → `gh release create` 直接传本地产物 | 8/19 03:36 |
| 发布为 prerelease（Preview 惯例） | 与 release.yml 的 `--prerelease` 和过往 v0.1.1 一致；update-check 插件用 `/releases?per_page=5` 首个非 draft，兼容 prerelease | 8/19 03:41 |

## 工作过程时间线

### 阶段 1：update-check 调研（8/18 19:18–19:36）
- 读 PLAN 文档 + 压缩文档，确认本阶段范围：**只做检查+通知**，不碰下载/安装/回滚
- 摸清全部集成点：`installForm` 三 build tag 文件（embedded.go / installed.go / embedded_dev.go）、VERSION 文件格式 `marisa-backend-<semver>[-dirty]`、settings namespace 注册、bundle 挂载（package.json + cordis.patch.yml + plugins.json + upstreams.json + generate-profile 计数 20→21）、GitHub `/releases/latest` 跳过 prerelease 的坑（要用 `/releases?per_page=5` 取首个非 draft）、Node fetch 不认代理环境变量（用 undici `EnvHttpProxyAgent`）、`$DSH_HOME/update-check/state.json` 缓存
- 用户两次打断催进度（「你为啥还是不开始写，你卡住了吗」），随后转向发版

### 阶段 2：v0.1.2 发布打通（8/18 19:36–20:30）
- 状态梳理：工作树 5060+ 未提交（rc7 sync、tar.zst 改造已完成，`backend.tar.zst` 264MB 已生成）、最近 tag v0.1.1、HEAD `2163641`、版本取 0.1.2
- 首次构建失败：CI=true 缺口 → 修 `scripts/build-release-windows.ps1`
- 二次构建失败：lockfile 与未提交 generator 不一致（MyGO 7 个 file: 依赖）→ 根 `pnpm install --no-frozen-lockfile` 重生成
- 上游检查：4 个插件落后（a2a/sidechain/whale-girl mirror、dsh-track fork）；本会话内完成同步（whale-girl 同步疑似删了角色 PNG——上游可能用 Git LFS，克隆核对后确认树真实状态），dsh-track 按 `docs/plugins/dsh-track.md` 重放路径修复

### 阶段 3：fflate boot 崩溃攻坚（8/19 凌晨 04:09–04:27）
- v0.1.3 standalone 实测翻车：后端起不来（`Named export 'Zip' not found` in `apiproxy/lib/index.js`）+ landing 页缺中文进度
- 层层排查：runtime profile 无 fflate → 提取树是 **0.4.9**（旧 CJS、无 exports map）而 root/验证 profile 是 0.8.3（ESM）→ 0.4.9 来自 `@univerjs-pro/exchange-client` 嵌套依赖 → `--prod` 安装后 hoist 赢家变了
- 关键发现（写进了排查思路）：**verify-mygo-runtime 从仓库 cwd 跑 CLI，harness 包从仓库 node_modules 解析——「stage boot 通过」根本没测到 stage 里的 harness 代码**；真实 boot 必须用解包树自己的 node.exe + CLI + profile + 重建 2744 个 junction
- 修复：pnpm-workspace.yaml 里裸 `fflate: 0.8.3` override（scoped 例外会重新制造两个版本），锁文件 0.4.9 边清零 → v0.1.4，真实 boot HTTP 200 ✓
- 顺带：Go 中文解压进度条（`正在解压运行环境… N%` 原地刷新，非终端按 10% 步进写日志，完成显示 `解压完成：44663 个文件（耗时）`）

### 阶段 4：vision 问题爆发与四路评估（8/18 晚–8/19 凌晨）
- 用户：aigc 画布和 MinerU 到底是什么鬼 + 视觉工具设置页报 `Unexpected token '<'`（HTML 被当 JSON）——rc7 下 webServer 改名导致设置路由坏
- 修好 vision 设置页（rc7 webServer + remote-event 修复）；用户决定 **aigc-canvas + MinerU 完全移除**（28→26）
- 用户：vision toolkit 不是好方案，看 modlens；记忆系统看 mnemon → 四个并行评估代理：
  - **dsh-web-ui**（zhu1090093659/dsh-web-ui）：拒绝——大合集壳仓形态 + 与现有组件冲突
  - **Bigfish**（turtle2209）：纯壳 Electron 萌宠桌宠版，NSIS 安装包 276MB，rc6 原样（修不了上游 bug）；直接竞品但用户分层不同（消费级萌宠 vs 工程化发行版）；可借鉴新手向导 + 启动失败自愈
  - **modlens**（liustack/modlens@3.21.1）：条件性不推荐替换默认——无匿名开箱（硬阻塞）、配置在 harness 外、功能面窄；作为可选预置有价值
  - **mnemon**：推荐集成（见决策表）
- 用户拍板：vision 按推荐方案走（升级 fork 0.1.32 + modlens 可选预置）+ mnemon 开始集成；随后 modlens 改口撤销

### 阶段 5：vision 0.1.32 升级 + mnemon 集成（8/18 21:13–8/19 凌晨）
- vision-diff-0132 代理分析 0.1.2→0.1.32 差异：包名 `@anionex` → `@dsh-external` 改名、上游新增 `isBuiltInFreeVisionProvider` + `BUILT_IN_FREE_VISION_KEY`（bundled 公钥，接近匿名语义）、Windows CI、MAX_PATH 修复、paste-images
- vision-replay 代理在升级树上重放 authMode（`none | credential`）+ Zen/GLM/custom 预设 + 匿名 badge；manifest 从 mirror 改 fork（现在有真实本地改动）+ 新 baseline + 更新 diff 文档
- mnemon 集成：npm pack dsh-mnemon@0.2.9 + 下载 Go 引擎 v0.2.3（gh 直连超时 → HTTPS_PROXY 重试）→ 快照化 + `mnemon.exe` 进 bundle + 挂载行 + build.ps1 加固 + 门禁；v0.1.6 交付（302.8MB standalone / 308.2MB MSI）

### 阶段 6：update-check 实施 + CI 修复 + v0.1.7（8/18 21:23–8/19 03:43）
- 用户：「把更新插件也做一下吧，然后github ci的release发版是正常的吗，也改一下，asap」
- CI 审查结论：结构健全（manual dispatch + 验收门 + tag 校验 + prerelease），但三处脱节：pnpm 钉 11.7.0 而锁文件是 11.9.0 生成、windows job 超时 60 分钟太紧（本地构建都要 40–50 分钟）、验证 profile 安装无堆上限保护 → 修 release.yml（11.9.0、timeout 90）+ verify-repository 断言同步 + NODE_OPTIONS heap bump
- impl-update-check 代理实施插件（Go env 注入 + host + client + 挂载 + 文档 + 53 个测试）；用户催问「ci的问题你跑完了？」「我感觉更新的那个有点卡住了」——实际未卡，挂载步骤全部落地并验证
- v0.1.7 make-bundle → 解包 boot 验证（update-check state 路由 200 + vision 设置路由 200，均非 SPA 回退）→ standalone 308.7MB + MSI 314.1MB + checksums 实测一致
- 用户「让我们先测一下sa版本吧，我真的需要睡觉了」→ 先交付 v0.1.6 standalone；「重新打包啊」→ 等 update-check 挂载完成（不能半挂载就打包）后出 v0.1.7

### 阶段 7：提交 + 发版（8/19 03:36–03:43）
- 用户：「提交所有变动，然后发release，但是二进制用我的，linux和mac的先不发」
- `git add -A` 暂存 8232 文件 → 提交 `d5973a70` → 发现两个坑：**dsh-mygo 被录成 gitlink（mode 160000，CI 不带 submodule checkout 会挂）** + 杂散 `esb2.txt`/`esbuild_ctx.txt` 混入 → 移除嵌套 .git、464 文件按普通 vendored 源码提交、gitignore 补条目、amend 为 `39a31e46`（8695 文件）
- 推送 main（`67a7668..39a31e4`）→ tag v0.1.7 → `gh release create`（prerelease，本地二进制，仅 Windows 资产）

## 产物与影响

- **发布**：https://github.com/omdsh-dev/marisa-distro/releases/tag/v0.1.7（prerelease；standalone 308.7MB + MSI 314.1MB + SHA256SUMS；未发 linux/mac）
- **提交**：`39a31e46`（main，8695 文件，含 harness 行尾噪声——保证 tag == 构建树）
- **新插件** `plugins/dsh-update-check/`：检查+通知（无下载/安装）；Go 侧 `MARISA_INSTALL_FORM`/`MARISA_VERSION` 注入 + VERSION 解析；GitHub Releases 轮询（per_page=5 首个非 draft，undici EnvHttpProxyAgent 走代理）；`$DSH_HOME/update-check/state.json` 缓存；state/check/dismiss 路由；设置卡片 + 启动横幅；按安装形态深链（MSI/EXE，dev 形态链接 Release 页）；53 个测试
- **vision-toolkit**：mirror→fork，升级上游 0.1.32（Python 自举、Windows CI、MAX_PATH、paste-images），重放 authMode none + Zen/GLM 预设，rc7 webServer/remote-event 修复
- **mnemon**：dsh-mnemon@0.2.9 + Go 引擎 v0.2.3 随包分发（launcher PATH），默认 workspace 本地存储、remote 只读
- **移除**：aigc-canvas、MinerU（28→26 插件）
- **修复**：fflate 单版本 override（boot 崩溃）、vision 设置页 HTML/JSON、中文解压进度条、release 脚本 CI=true、CI 工作流（pnpm 11.9.0 / timeout 90 / heap guard）
- **同步**：dsh-a2a、dsh-sidechain、whale-girl mirror 同步 + dsh-track fork 重放
- **版本链**：v0.1.2（发布打通）→ v0.1.3（fflate 首次尝试，仍崩）→ v0.1.4（fflate 修复 + 中文进度，boot ✓）→ v0.1.5（vision 修复 + 移除 aigc/mineru）→ v0.1.6（+mnemon）→ v0.1.7（+update-check + vision 0.1.32 + CI 修复）→ 正式发布

## 遇到的问题与解决

| 问题 | 根因 | 解决 |
|---|---|---|
| release 构建秒挂 exit 1 | release 脚本没设 CI=true，pnpm 清 modules 目录无 TTY 被拒 | 脚本补 `$env:CI = 'true'`（build.ps1 早有，脚本漏了） |
| frozen install 报 specifier 不匹配 | 未提交 generator 把 MyGO 依赖改成 7 个 file: 包，lockfile 旧 | 根 `pnpm install --no-frozen-lockfile` 重生成 lockfile |
| standalone boot 崩 `Named export 'Zip' not found` | pnpm hoisted 模式：workspace 成员依赖从根解析、不嵌套；`--prod` prune 后 hoist 赢家变成 univerjs 钉的 fflate 0.4.9（CJS 无 lexer 可识别具名导出） | 裸 override `fflate: 0.8.3` 单版本；scoped 例外会制造双版本必须删 |
| 「stage boot 通过」是假阳性 | verify-mygo-runtime 从仓库 cwd 跑 CLI，解析的是仓库 node_modules | 真实 boot：解包树自己的 node.exe + CLI + profile + junction 重建，与 Go 壳同路径 |
| 同版本号跳过重新解包 | VERSION 标记 `0.1.3-dirty` 已存在于用户机器 | 版本必须递增（0.1.4） |
| vision 设置页 `Unexpected token '<'` | rc7 下 httpServer→webServer 改名，设置路由回退到 SPA HTML | 修 webServer 注册 + 路由探活验证非 SPA 回退 |
| `git add -A` 后 dsh-mygo 变 gitlink | 嵌套 git 仓库被录成 mode 160000，实际文件没进提交 | 移除嵌套 .git，464 文件按普通文件提交，gitignore 补 `dsh-mygo/.git/` 惯例 |
| gh 直连 GitHub API 超时 | gh CLI 不走 git 的代理 | 显式 HTTPS_PROXY 重试 |
| 用户连续催促 | 「你为啥还是不开始写」「asap」「重新打包啊」 | 研究阶段过长；后续改为先交付可测版本再补功能；打包等挂载完成（不能半挂载） |

## 要点摘录

- 用户定调（8/18 19:36）：「更新插件先不要了，先出一个版本，asap，然后我做一次测试，我们这一个release就先这样了」
- 用户（8/18 晚）：「这个aigc画布和MinerU 到底是什么鬼？而且为什么我打开视觉工具的设置显示Unexpected token '<'」
- 用户（8/18 21:13）：「vision：按上面方案走（升级 fork 到 0.1.32 + modlens 可选预置）mnemon现在开始集成」
- 用户改口（8/18 晚）：「modlens暂挂吧，不加了」
- 用户（8/18 21:23）：「把更新插件也做一下吧，然后github ci的release发版是正常的吗，也改一下，asap」
- 用户（8/18 深夜）：「让我们先测一下sa版本吧，我真的需要睡觉了」；「重新打包啊」
- 用户（8/19 03:36）：「提交所有变动，然后发release，但是二进制用我的，linux和mac的先不发」
- 关键判断（agent）：「release tag 必须精确对应构建时的树，否则无法复现」——决定连 harness 噪声一起提交
- fflate 教训（agent）：「pnpm hoisted 模式下 workspace 成员（apiproxy 是 workspace 包）的依赖不会嵌套到自己的 node_modules，一律从 workspace 根解析——所以顶层 hoist 赢家是谁，谁就决定 apiproxy 实际拿到哪个 fflate」

## 关联文档

- `docs/PLAN-update-check-plugin-20260819.md`（本会话实施的计划）
- `docs/PLAN-bundle-size-100mb-20260819.md`、`docs/RESEARCH-package-size-and-update-plugin-20260816.md`（压缩后续阶段，本会话未做）
- `docs/plugins/dsh-update-check.md`、`docs/plugins/dsh-vision-toolkit.md`（fork 差异文档）
- `docs/plugins.md`（28→26 计数、modlens 行曾加入又移除）
- `docs/upstream-sync.md`（4 插件同步规程）
- 其他纪要：`SESSION-architecture-fork-sea-msi-2026-08-14.md`（fork 路线源头）、`SESSION-size-reduction-prebundle-2026-08-17.md`、`SESSION-install-speed-compression-2026-08-18.md`（压缩/安装速度背景）
