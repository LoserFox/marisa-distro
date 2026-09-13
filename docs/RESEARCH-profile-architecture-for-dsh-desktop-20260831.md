# profile 架构：让 dsh-desktop 用上 marisa 整合包 — 归档研究

> 状态：**TODO / 待进一步研究（本轮不实施）**
> 日期：2026-08-31
> 调查方式：只读（read/grep/glob/git 历史）；外部事实仅用于版本核对，均标注来源 URL。
> 调查基线：本仓库分支 `feature/linux-support`（HEAD `8b20a481`），另有分支 `desktop-electron`（tip `2bcf08a6`）作为对照。

---

## 结论摘要（TL;DR）

1. **"仓库里有 `desktop-electron/src/...`" 需要按分支口径读。** 当前分支是 `feature/linux-support`，而：

   | 路径 | `feature/linux-support` | `main` | `desktop-electron` |
   |---|---|---|---|
   | `desktop-electron/`（48 个文件） | ❌ 无 | ❌ 无 | ✅ 有 |
   | `docs/desktop-electron.md` | ❌ 无 | ❌ 无 | ✅ 有 |
   | `docs/RESEARCH-absorb-community-desktops-20260825.md` | ❌ 无 | ✅ 有 | ✅ 有 |

   验证：`git cat-file -e <ref>:<path>`。即 **`desktop-electron/` 与 `docs/desktop-electron.md` 只在分支 `desktop-electron` 上（`main` 都没有，更不用说当前分支）**；而 absorb 文档已经在 `main` 上（`128f7ab1` 是其引入提交，`git merge-base --is-ancestor 128f7ab1 main` 成立），只是当前分支落后于 `main`。当前工作树直接 grep 这些路径会得出"文件不存在"的错误结论。
2. **marisa profile 本身没有"缺解析器"问题。** 权威解析器在 harness 内且完整：`harness/packages/boot/app-boot/src/profile.ts`（`loadProfile` 371-403、`resolveBundleDir` 344-355、`composeEntries` 413-420）。marisa 的 profile 与它完全兼容。
3. **真正的断点有三个（编号对应 §3 的小节），全部有代码证据：**
   - **(A) 启动层不在 profile 里。** marisa 的 `desktop.overlay.yml` / `standalone.overlay.yml` 是靠 launcher 命令行 `--patch` 传进去的（`desktop/bundle/launcher.cmd:28`），**不是 profile 自身的 patch 层**；`profiles/marisa/generate-profile.mjs:318` 还显式把 `cordis.patch.yml` 当 stale 删掉。任何"由壳自己进程内 boot profile"的桌面（anywhere 正是如此，见 `.dsh/tmp/research-repos/2026-08-25/dsh-desktop-alabs/dsh-plugin-desktop/src/profile.ts:698-1005`）**拿不到这两层**，其中 `standalone.overlay.yml` 的两行在任何地方都没有等价物。
   - **(D) 禁用状态两套机，互不可见。** marisa 用 profile 内 `.disabled-bundles.json`（`desktop/rescue_bundles.go:23`）；anywhere 用 profile **之外**的私有 state 文件、按 profileName 分键（`dsh-plugin-desktop/src/desktop-plugins.ts:72-73, 314-352`），禁用时**不改 package.json**、只在内存过滤 layer（同文件 `423-431`）。
   - **(E) 版本线已经拉开且会持续拉开。** marisa harness pin = `b150a551` = **0.1.1-rc.2**；anywhere HEAD = v2.0.9 = `63e160ab`，pin **0.1.5-rc.1**。anywhere 最后一个与 marisa 同线的版本是 **v2.0.3**（pin 0.1.1-rc.2）；从 v2.0.4 起跳到 `0.1.2-alpha.1`。
   - 另有两个**次要但确实是"残废"**的缺口：**(B) 两份 manifest 双源，根 `plugins.json` 是死文件**（§3.2）；**(C) `dsh.desktop` 只有 `icon` 有读者**（§3.3）。它们不阻塞 Electron 路线，但应当顺手清理。
   - **另有一处此前未记录、但很要紧的写冲突**：即使把 active profile 切到 `marisa`，anywhere **仍会无条件写**该 profile 的 `pnpm-workspace.yaml` 与 `cordis.yml`（§4.1）——marisa 生成的 workspace 文件会被重新序列化并新增 `autoInstallPeers: false`，profile 里会被新建一个空的 `cordis.yml`。
4. **`ClientPackageCompositionError` 不是 anywhere 的问题，是 npm 装法的问题。** 它定义在 harness（`harness/packages/client/modules/src/index.ts:100`，`:333-337` 抛出），anywhere 仓库里**零命中**——是 **boot 期组合**错误，不是安装错误。npm 上 `dsh-plugin-desktop` 只有 `0.0.1` 与 `2.0.0`（latest=2.0.0，pin 0.1.0-rc.6，**96/96 全部可解析**）。真正的坑是：这 96 个包名里有 **2 个从未发布 `0.1.1-rc.2`**（`@deepseek-ai/dsh-client-schema-form`、`@deepseek-ai/dsh-client-web-react`，都止于 `0.1.0-rc.7`）——所以"把 2.0.0 的图重钉到 rc.2 线"会撞上 2 个不可满足的**直接依赖**。但 **anywhere 源码 v2.0.3 的 99 个 `@deepseek-ai/dsh-*` 依赖全部是 `0.1.1-rc.2`，且逐个都能在 marisa 的 harness 工作区（238 个包）里解析到，零缺失**，源码里也没有任何对这两个消失包的引用。→ 走源码路径不受这条约束。
5. **一个正面结论（有证据）：marisa profile 满足 anywhere 的非默认 profile 判据。** `dsh.profile.bundles[0] = '@deepseek-ai/dsh-base'`、`[1] = '@deepseek-ai/dsh-web-app'`（`profiles/marisa/runtime/package.json:36-37`），且不含 `dsh-plugin-desktop` → `webCapable` 检查（`dsh-plugin-desktop/src/profile-manager.ts:137-155`）会通过。**"让 dsh-desktop 用 marisa 整合包"在 profile 协议层没有硬阻断**；阻断在 (A)(D)(E) 与 §4.1 的写冲突。
6. **两件必须先知道的事**：① anywhere 仓库里 **`marisa` 零命中、没有任何"第三方/发行版 profile"受支持场景的文档或 issue**，最接近的 Issue #463 / PR #801 都还 OPEN 且后者用的是内置 `desktop` profile 名（§4.6）；② anywhere 消费**已发布的运行时 tarball**（根 `resolutions` → `file:vendor/dsh-runtime/<ver>/*.tgz`），而 marisa 编译 **harness 源码树**——这层形态差异比版本号差异更根本（§5.3 第 6 条）。

---

## 1. marisa profile 现状（结构 + manifest 语义）

### 1.1 三层产物

| 层 | 路径 | 角色 |
|---|---|---|
| 手写清单 | `profiles/marisa/plugins.json` | 34 条插件条目，`schemaVersion: 1` |
| 生成器 | `profiles/marisa/generate-profile.mjs` | 由清单产出 ① `bundles/marisa-bundle/package.json` ② profile 目录 |
| 入库的 release 形态 | `profiles/marisa/runtime/` | `package.json` / `pnpm-workspace.yaml` / 两个 overlay；被 `pnpm-workspace.yaml:30` 收为 workspace 成员 |

另外根目录还有一份**不同 schema、不同内容**的 `plugins.json`（223 行，28 条，无 `schemaVersion`）——见 §3.3，它目前没有读者。

### 1.2 profile 的目录结构

生成器可产出两种形态，由 `MARISA_PROFILE_DIR` 决定（`generate-profile.mjs:56-60`）：

- **dev / live 形态** → `%USERPROFILE%\.dsh\profiles\marisa`（默认，`generate-profile.mjs:56-58`），`file:` 引用写成绝对路径
- **release runtime 形态** → `profiles/marisa/runtime`，`isReleaseRuntime` 时 `profileRef()` 输出相对路径（`generate-profile.mjs:60-64`）

部署后的目录（`make-bundle.ps1:353` stage、`72` 映射到 `.dsh/profiles/marisa`）内含：

| 条目 | 来源 | 证据 |
|---|---|---|
| `package.json` | 生成器写（`generate-profile.mjs:327`） | — |
| `pnpm-workspace.yaml` | 生成器写（`generate-profile.mjs:328`）；打包期追加 `minimumReleaseAge: 0`（`make-bundle.ps1:396-402`） | — |
| `desktop.overlay.yml` | 从模板 cp（`generate-profile.mjs:329`） | 内容 19 行，webserver host/port + web-runtime 四键 |
| `standalone.overlay.yml` | 从模板 cp（`generate-profile.mjs:330`） | 内容 8 行，只为启用 `ui-input-trigger` / `ui-commands` 两行 |
| `node_modules` | **一条 junction** → `marisa-distro/node_modules` | `make-bundle.ps1:871-877` |
| `cordis.patch.yml` | **不存在**（生成器把同名文件当 stale 删掉） | `generate-profile.mjs:318` |
| `pnpm-lock.yaml` | **不存在**（显式删） | `generate-profile.mjs:322-324`、`make-bundle.ps1:408` |

另有两个运行时才出现的文件：`.disabled-bundles.json`（§2）与 `package.json.bak-<ts>`（Electron 版快照，§2）。

### 1.3 manifest 格式：`dsh.profile.bundles` 的权威语义

**生产者**（`generate-profile.mjs:188-194`）：

```js
const bundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  'marisa-bundle',
  ...MYGO_PACKAGES,      // mygo / mygo-loader-hub / mygo-cli / mygo-ext-panel
  ...bundlePlugins,      // 清单里 bundle:true 的条目（npm 源 + internal 源）
]
```

**消费者**（`harness/packages/boot/app-boot/src/profile.ts`）：

| 语义 | 位置 |
|---|---|
| 接口定义 `DshProfileManifest.bundles?: string[]` | `profile.ts:47-51` |
| 组合顺序：按 bundles 顺序逐层 apply patch → profile 自己的 `cordis.patch.yml` → launcher 层（`--patch` 文件与 flag 派生 patch） | `profile.ts:5-13`（模块注释）、`loadProfile` `371-403` |
| 解析锚点：**installation 优先，profile 目录次之**（`resolveBundleDir`） | `profile.ts:344-355` |
| 被列名的 bundle 若没声明 `dsh.bundle.patch` → **fail loud** | `profile.ts:391-394` |
| 组合实现（同一 `applyEntryPatches` 调用，与 boot include 同源） | `composeEntries` `413-420` |
| 未知 profile 名 → 报错指向 `dsh plugin --profile <name> add` | `profile.ts:376-384` |
| 内置模板 `web: [base, web-app]` / `headless` | `profile.ts:114-117` |
| 写入器 `writeProfileManifest`（2 空格 JSON + 结尾换行） | `profile.ts:284-286` |

**`dsh.desktop`**（生成器 `generate-profile.mjs:206-214`）声明 `id` / `window{width,height,minWidth,minHeight}` / `icon` / `dshHome: 'bundled'`。**实际只有 `icon` 有消费者**——见 §3.4。

### 1.4 桌面壳怎么消费它

| 壳 | 消费方式 | 证据 |
|---|---|---|
| Go/Wails（当前分支） | `launcher.cmd` 设 `DSH_HOME=%BUNDLE%.dsh`（`:18`）、默认 `BOOT_PROFILE=marisa`（`:20-21`），跑 `bin.js --profile marisa --patch <desktop.overlay.yml> --patch <standalone.overlay.yml>`（`:28`） | `desktop/bundle/launcher.cmd:16-29` |
| Electron（分支 `desktop-electron`） | **同一套**：spawn `launcher.cmd`（`src/main.ts:211`）、`MARISA_BOOT_PROFILE` 由 supervisor 注入（`src/backend-adapter.ts:25-26`、`src/supervisor.ts:111`）；**不读 `dsh.desktop`** | 分支文件 |
| 终端用户入口 | `desktop/bundle/run-profile.mjs` 复刻同一 boot 行（`:78-92`），并检查 profile/overlay 四件套存在（`:63-73`） | 同左 |
| 打包期 | `make-bundle.ps1` 把 profile stage 到 `.dsh/profiles/marisa`（`72`），把 `file:` 引用改写成 `../../../<stage-rel>`（`Resolve-ProfileRef` `130-135`、`Convert-ProfileRef` `139-152`、改写循环 `366-403`），并把 profile 的 `node_modules` 定为一条 junction（`874-877`） | 同左 |
| 打包期**硬门** | 每个 `dsh.profile.bundles` 行都必须能从 staged **root** `node_modules` 解析到 `package.json`，否则抛错 | `make-bundle.ps1:796-812` |
| 急救/恢复 | 见 §2 | — |

`make-bundle.ps1:796-812` 的注释记录了一次真实回归（2026-08-24）：成员内部 `node_modules` 里的行永远满足不了 boot 的解析，必须在 root 声明。

---

## 2. 现有 profile 读写实现清单

### 2.1 Go / Wails 侧（当前分支）

| 文件 | 行 | 符号 / 字段 | 语义 |
|---|---|---|---|
| `desktop/rescue_bundles.go` | 19 | `marisaProfileName = "marisa"` | 急救模式操作的 profile 名 |
| | 23 | `disabledBundlesFile = ".disabled-bundles.json"` | 禁用名单文件（profile 内） |
| | 26 | `bundleNamePattern` | npm 包名正则，防路径注入 |
| | 29-35 | `rescueProfileDir()` | → `<backend>/.dsh/profiles/marisa` |
| | 48-55 | `profileManifest` struct | 只读切片：`dsh.profile.bundles` |
| | 77-95 | `bundleRepo.list()` | 清单 + 禁用标记 |
| | 99-170 | `setDisabled(name, disable)` | **WAL 事务**：`begin`(127-137，保护 `package.json`) → `apply`(139-154) → 失败 `rollback`(156-159) → `seal`(161-163) |
| | 173-183 | `readProfileBundles()` | 缺失/损坏 → 报错（不静默） |
| | 186-199 | `readDisabledBundles()` | 缺失按空 |
| | 202-213 | `writeDisabledBundles()` | `tmp + rename` 原子写，0600 |
| | 217-245 | `writeProfileBundles()` | 用 `map[string]any` 解析，**只改 `dsh.profile.bundles`，保留其余字段**；缺 `dsh` / `dsh.profile` 段报错(229,233) |
| `desktop/rescue_server.go` | 206, 222 | `GET /api/bundles` | 返回 `{ok, profile: "marisa", bundles}` |
| `desktop/install_wal.go` | 201-205 | `defaultWalProtectedFiles()` | WAL 保护 `package.json` + `cordis.patch.yml` |
| `desktop/rescue.go` | 137-161 | `resetUserConfig()` | 只清 profile 的 `cordis.patch.yml`（用户层），不动出厂文件 |
| | 182-200 | 恢复时搬回同样的用户层 | — |
| `desktop/update_guard.go` | 33-41 | `dshHomeDirName = ".dsh"` / `dshHomePath()` | backend 内的 DSH_HOME |
| | 132 | 跳过 junction | `profiles/marisa/node_modules` 被显式跳过 |

### 2.2 Electron 侧（分支 `desktop-electron`）

| 文件 | 行 | 符号 | 语义 / 与 Go 版的差异 |
|---|---|---|---|
| `src/rescue-server.ts` | 19 | `DISABLED_BUNDLES_FILE` | 同名文件 |
| | 32-34 | `profileDir()` | → `<backendDir>/.dsh/profiles/marisa` |
| | 134-142 | `listBundles()` | 与 `rescue_bundles.go:77-95` 1:1 |
| | 144-151 / 153-155 | 读 / 写禁用名单 | 与 Go 版一致 |
| | 157-166 | `writeProfileBundles()` | 与 Go 版一致（map 解析保字段） |
| | 174-192 | `setBundleDisabled()` | ⚠️ **无 WAL**；`177-178` 只做 `package.json.bak-<ts>` 廉价快照，注释自陈是 `docs/desktop-electron.md` 记录的缺口 |
| `src/recovery-controller.ts` | 17 | `MARISA_PROFILE_NAME = 'marisa'` | 移植自 anywhere 的 `startup-recovery-controller.ts` |
| | 83-85 | `profileDir()` | 同上 |
| | 87-96 / 98-107 | 读 / 写 `dsh.profile.bundles` | 与 Go 版同语义 |
| | 109-118 / 120-127 | 读 / 写 `.disabled-bundles.json` | 与 Go 版同语义 |
| | 168-185 | `snapshot()` | 列出 bundles（`active`/`disabled`）+ 备份列表 |
| | 187-200 | `preview()` | 一次性 `prev_<43位>` ID + 5 分钟 TTL（`19-22`） |
| | 202-239 | `execute()` | 二次校验 ID，然后改两份文件 |

### 2.3 生产侧（生成器 / 打包期）

| 文件 | 行 | 说明 |
|---|---|---|
| `profiles/marisa/generate-profile.mjs` | 53 | 读 `profiles/marisa/plugins.json`（**唯一读者**） |
| | 70-71 | 断言 25 git+internal / 9 npm（我核对清单实际为 34 条 = 25 + 9，成立） |
| | 104-118 | 写 `bundles/marisa-bundle/package.json`（`dsh.bundle.patch = './cordis.patch.yml'`） |
| | 200-215 | 写 profile `package.json`（deps + `dsh.profile.bundles` + `dsh.desktop`） |
| | 262-310 | 写 profile `pnpm-workspace.yaml` |
| | 314-330 | materialize：删 stale（`cordis.patch.yml` 等）、写 manifest、cp 两个 overlay |
| `desktop/bundle/make-bundle.ps1` | 65-75 | `srcMap`（`$profile` → `.dsh/profiles/marisa`） |
| | 130-152 | `Resolve-ProfileRef` / `Convert-ProfileRef` |
| | 366-438 | 部署期规范化 + **解析硬门**（每个 `file:` 依赖与 workspace glob 必须在 stage 内命中） |
| | 796-812 | composition gate（每个 bundles 行必须从 root `node_modules` 解析） |
| | 871-877 | profile `node_modules` = 一条 junction |

### 2.4 校验侧

| 文件 | 行 | 说明 |
|---|---|---|
| `scripts/verify-repository.mjs` | 50-53 | 断言 `profiles/marisa/plugins.json` 存在且 `schemaVersion === 1` |
| | 95-107 | 断言它恰好描述每个 `plugins/*` 目录一次，且 `name`/`source`/`version` 与 `maintenance/upstreams.json` 一致 |
| `scripts/sync-npm-snapshot.mjs` | 115 | npm 快照同步时的写入端 |
| `package.json:15,17` | — | `test:profile` / `test:repository` 分别跑生成器测试与仓库校验 |

---

## 3. "残废"的具体缺口

### 3.0 先纠正一个前提：分支口径

```
$ git log --oneline main..refs/heads/desktop-electron
2bcf08a6 chore(desktop-electron): 提交 package-lock.json …
095766dd docs: Electron-as-Node 落地状态与验证证据（a359becb）
…
b43b6c9b feat(desktop-electron): Electron 壳 stage 1 —— 替换 Wails/WebView2 壳的运行时逻辑
```

`desktop-electron/`（48 个文件）、`docs/desktop-electron.md` 只在 `desktop-electron` 分支；`docs/RESEARCH-absorb-community-desktops-20260825.md` 在 `main` 与 `desktop-electron` 上、但**不在当前分支 `feature/linux-support`**（当前分支落后于 `main`）。本报告凡是引用这三者，均已用 `git show desktop-electron:<path>` 读取（行号对应分支内容）。

值得注意：该分支 `git diff --name-status main refs/heads/desktop-electron` 显示它**只改了 `desktop/bundle/launcher.cmd`、`desktop/bundle/make-bundle.ps1`、新增 `desktop-electron/`、新增 `docs/desktop-electron.md`**——**没有触碰 `profiles/`、`plugins.json`、`pnpm-workspace.yaml`**。即两个壳共享同一套 profile + 同一份 `backend.tar.zst`，profile 架构是共用资产。

### 3.1 缺口 A：profile 的启动 patch 在 profile 之外（最关键，是本轮"用不上"的直接原因）

**证据链：**
1. `profiles/marisa/runtime/package.json` **没有** `cordis.patch.yml`；生成器把它列为 stale 并删除（`generate-profile.mjs:318`）。
2. 两个 overlay 是**独立文件**，由启动方用 `--patch` 传入：`launcher.cmd:28`。
3. harness 的层顺序定义里，`--patch` 属于**最外层**（`profile.ts:5-13`：bundles → profile 自己的 patch → launcher 层）。
4. anywhere 的桌面**不用 CLI `--patch`**：它在进程内 `boot()`，自建 patch 列表为 `[...bundle 层, ...market provider, ...profile 的 cordis.patch.yml, ...$DSH_HOME/cordis.patch.yml]`（`dsh-plugin-desktop/src/profile.ts:810-815`），随后再 push 自己的行（`:834-988`）。

**后果（逐行核对丢失内容）：**

| overlay 行 | 内容 | 丢失后果 |
|---|---|---|
| `desktop.overlay.yml:5-8` | `webserver.host=127.0.0.1, port=0` | 影响小：anywhere 反正会接管 `webserver` 行并强制 `{host:'127.0.0.1', port}`（`profile.ts:933-970`） |
| `desktop.overlay.yml:14-18` | `web-runtime` 四键（`printUrl:true` 等） | 影响中等：anywhere 自己的 bundle patch 会把 `web-runtime` 改成 `printUrl:false`（`dsh-plugin-desktop/cordis.patch.yml:23-28`）。marisa 的 Wails 壳靠这一行解析 URL，Electron 壳不需要——所以**恰好不冲突**，但语义已换主 |
| `standalone.overlay.yml:3-8` | 显式启用 `@deepseek-ai/dsh-client-ui-input-trigger` 与 `@deepseek-ai/dsh-client-ui-commands` | ⚠️ **唯一没有任何等价物的行**。这两行是为 WebView2 承载的 Web UI 做的断言；Electron 下是否需要、由谁提供，**未验证**（见 §7） |

**判定：**不是"缺 profile 解析器"，也不是"缺 bundle 装配"（`marisa-bundle/cordis.patch.yml` 在，composition gate 在），而是**缺一个把 launcher 层收敛进 profile 自身的步骤**（迁进一个 bundle，或写进 profile 的 `cordis.patch.yml`）。这是纯工程改动，不需要版本对齐。

### 3.2 缺口 B：两份 manifest 双源，其中一份是死文件

| | 根 `plugins.json` | `profiles/marisa/plugins.json` |
|---|---|---|
| 行数 / 条目 | 223 行 / 28 条 | 196 行 / 34 条 |
| 顶层字段 | `name` `version` `generated` `plugins[]` | `schemaVersion: 1` `plugins[]` |
| 条目字段 | `name` `source` `version` `dir` `repo` `needs-build` `has-lib` `patch-id` `bundle` `id` | `name` `source` `dir` `version?` `bundle?` |
| 读者 | **无**（`scripts/`、`profiles/` 全仓 grep 无命中） | `generate-profile.mjs:53`、`verify-repository.mjs:50-53,95-107`、`sync-npm-snapshot.mjs:115` |

两者内容已经漂移，例如根有 `@dsh-external/dsh-suggested-replies`（`plugins.json:86-94`），profile 清单没有；profile 有 `@dsh-external/dsh-auto-resume`（`profiles/marisa/plugins.json:190-194`），根没有。

**旁证：**团队自己已经把这件事记为待办——`docs/RESEARCH-absorb-community-desktops-20260825.md:135`（P1 表）：

> 清单单源 + 漂移门禁 | dsh-web `aggregate.yml → 生成 + --check` | 收敛根 `plugins.json` 与 `profiles/marisa/plugins.json`，`test:repository` 作 --check

**判定：**这是"残废"的确切实例——单源纪律未落地，两份清单里有一份是死文件，改动它不会有任何效果。

### 3.3 缺口 C：`dsh.desktop` 是半死元数据

全仓 grep `dsh\.desktop`（`*.go` `*.ts` `*.mjs` `*.ps1` `*.sh` `*.md` `*.yml`）共 10 处命中，全部集中在三类：

- 生成器注释与写入：`generate-profile.mjs:14, 196, 206-214`
- 文档描述：`docs/RESEARCH-desktop-and-router-integration-20260816.md:38`（"桌面元数据由 profile 的 `dsh.desktop` 生成"）、`docs/sessions/SESSION-architecture-fork-sea-msi-2026-08-14.md:33,35,80`
- **唯一的读取端**：`make-bundle.ps1:378-381` 与 `423-429`，**只读 `icon`**

`id` / `window` / `dshHome` 没有任何代码读者：Go 工作区 grep `dsh\.desktop` 在 `desktop/*.go` 零命中；Electron 分支 `src/main.ts`、`src/launcher.ts`、`src/command.ts`、`src/paths.ts` 对 `dsh.desktop` / `dshHome` 零命中（它走 `launcher.cmd` → `DSH_HOME=%BUNDLE%.dsh` 的固定约定）。

**判定：**文档声称的"桌面读 profile manifest 元数据"约定只兑现了 1/4 条链路。这不阻塞 anything，但说明 profile manifest 的"元数据面"尚未真正成为契约。

### 3.4 缺口 D：禁用状态两套机，互不可见

| | marisa | anywhere |
|---|---|---|
| 状态文件 | profile 内 `.disabled-bundles.json` | profile **之外**的私有 state（bootstrap 传入的 `statePath`） |
| 证据 | `desktop/rescue_bundles.go:23`、`desktop-electron/src/rescue-server.ts:19` | `dsh-plugin-desktop/src/desktop-plugins.ts:72-73, 314-352` |
| 分键 | 无（单 profile） | 按 `profileName` 分键，`MAX_PROFILES = 64`（`:29, 286-310`） |
| 生效方式 | **改写 `package.json` 的 `dsh.profile.bundles`**（`rescue_bundles.go:217-245`） | **不改清单**，只在组合时过滤 layer（`activeDesktopProfileLayers` `:423-431`） |
| 事务 | WAL 保护 `package.json`（`rescue_bundles.go:127-163`） | 文件锁 + 原子写（`:462-502`），两阶段 preview/execute |

**后果：**marisa 急救页/恢复窗做的禁用，anywhere 完全不认（反之亦然）。更糟的是两者语义不同：marisa 是持久改写清单，anywhere 是运行时过滤——同一次禁用在一侧是"改文件"，在另一侧是"改私有 state"。

**附带的判据冲突：**anywhere 的 `IMMUTABLE_BUNDLES`（`desktop-plugins.ts:38-43`）= `PROFILE_TEMPLATES.web`（即 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`）+ `@deepseek-ai/dsh-desktop-app` + `dsh-plugin-desktop` + `dsh-community-market`，这些**不可禁用**（`desktopPluginBundleMutable` `:417-420`，拒绝路径 `:459-461`）。而 marisa 的急救页对任何符合 `bundleNamePattern` 的名字都允许禁用（`rescue_bundles.go:26,100`）——**包括 `@deepseek-ai/dsh-base`**。两个壳对同一次操作的接受度不同。

### 3.5 缺口 E：版本线

见 §5（完整账）。摘要：marisa = `0.1.1-rc.2`，anywhere HEAD = `0.1.5-rc.1`，中间隔 `0.1.2-alpha.1` → `0.1.2-rc.1` → `0.1.5-rc.1`。

### 3.6 缺口 F：`ClientPackageCompositionError` 的真实适用面（把已知结论修正）

**报错点（harness 内，已核实）：**
- 类定义：`harness/packages/client/modules/src/index.ts:100`
- 抛出点：同文件 `:333-337`——`ClientModules` 构造期把 flush 失败聚合（`MissingClientBundleError` 等），**构造即抛**，也就是整个 web boot 中止
- 结构性含义：`dsh.client.inject` 声明的包名边如果解析不到，客户端模块图装配失败 → 整个前端起不来
- ⚠️ **它是 boot 期组合错误，不是 npm install 错误**：这个类**不存在于 anywhere 仓库**（在 `dsh-desktop` HEAD 上 `git grep ClientPackageCompositionError` = **0 命中**），它来自 `@deepseek-ai/dsh-client-modules` 的激活过程。既有结论把它与"装 2.0.0 装上就崩"连在一起，是**把两类失败混为一谈**。详见下表。

**文档既有结论**（`docs/desktop-electron.md:146-149`，分支文件）：

> npm 2.0.0 的 96 个 `@deepseek-ai/dsh-*` 依赖中 94 个可在 rc.2 线解析，缺 2 个：`dsh-client-schema-form`（rc7 并入别处）、`dsh-client-web-react`（rc8 并入 `dsh-client-web`）——但缺的就是 client inject 链成员，装上即 `ClientPackageCompositionError`。

**我独立复核（2026-08-31，registry.npmjs.org + 本地 harness 工作区）：**

| 断言 | 结果 | 证据 |
|---|---|---|
| npm 只有 0.0.1 与 2.0.0 | ✅ 成立 | `https://registry.npmjs.org/dsh-plugin-desktop` → versions `0.0.1, 2.0.0`；`dist-tags.latest = 2.0.0` |
| npm 2.0.0 pin 0.1.0-rc.6 线 | ✅ 成立 | 该 packument：`@deepseek-ai/dsh-*` **95 个**全部 `0.1.0-rc.6`；`@deepseek-ai/*` 合计 **102 个** |
| 那 2 个包在 rc.2 线不存在 | ✅ 成立 | `dsh-client-schema-form` / `dsh-client-web-react` 各 7 个版本，**有 `0.1.0-rc.6`、无 `0.1.1-rc.2`**；本地 harness 工作区 238 个包里也没有这两个名字 |
| 口径修正 | 部分 | 严格 glob `@deepseek-ai/dsh-*` = **95**；文档写 96 是因为把总括包 `@deepseek-ai/dsh` 也算进去了（它同样 pin `0.1.0-rc.6`）。**"缺 2 个"说的是"这 96 个包名里有 2 个没有 `0.1.1-rc.2` 这个版本"，不是"96 个依赖里有 2 个解析失败"**——按 npm 2.0.0 自己的 pin（`0.1.0-rc.6`）**96/96 全部可解析，0 缺失**。所以"装 2.0.0 会因为解析失败而崩"这个说法不准确；准确的说法是"把 2.0.0 的图重新钉到 rc.2 线会撞上 2 个不存在该版本的**直接依赖**" |
| "并入"的机制旁证 | 强（未解包） | `@deepseek-ai/dsh-client-web` 在 `0.1.0-rc.8`（2026-08-19）时**依赖列表从 9 项塌缩为 0 项**，而这两个包都止于 `0.1.0-rc.7`（2026-08-17）——与"合并进 `dsh-client-web`"一致。但**未解包核对 tarball 内容**，故标记为推断 |
| **但**源码 v2.0.3 也踩这个坑 | ❌ **不成立** | 本地克隆 `efc72d4`（version 2.0.3）：99 个 `@deepseek-ai/dsh-*` 依赖**全部** `0.1.1-rc.2`，且**逐个都能在 marisa harness 工作区解析到（0 缺失）**；源码中 grep `schema-form` / `web-react` **零命中** |

**结论修正（两层）：**

1. **机制层面**：既有结论把"版本不存在"与"解析失败"混为一谈。准确表述是——npm 2.0.0 按自己的 pin（`0.1.0-rc.6`）**96/96 全部可解析**；问题只出现在"把它的依赖图重新钉到 rc.2 线"时：那 96 个包名里有 2 个**从未发布过 `0.1.1-rc.2`**，而它们都是 2.0.0 的**直接依赖** → 重钉会撞上不可满足的依赖。
2. **适用面层面**："2 个缺包 → `ClientPackageCompositionError`"是 **npm 2.0.0 装法**的问题，不是 anywhere **源码**的问题。既然 marisa 现在走的正是源码路径（`docs/desktop-electron.md:152` 自陈"源码按模块抄（现状方案）"），这条**不构成源码路线的阻断**。

（口径提醒：`docs/desktop-electron.md:146` 写"96 个 `@deepseek-ai/dsh-*`"，实测严格 glob `dsh-*` 是 95 个；第 96 个应是总括包 `@deepseek-ai/dsh` 本身，它同样是 `0.1.0-rc.6`。两次独立检索在这一点上结论一致。）

### 3.7 缺口 G：三份文档三个壳立场，没有 supersede 标记

| 文档 | 日期 | 结论 | 位置 |
|---|---|---|---|
| `docs/RESEARCH-absorb-community-desktops-20260825.md` | 08-25 | **不抄** Electron 桌面壳 / RunAsNode："Marisa Go/Wails 壳 + 随包 Node 更小，且已验收 MSI" | `:152`（§4 明确不抄 第 3 条） |
| `docs/RESEARCH-desktop-packaging-routes-20260828.md` | 08-28 | **不换壳**："Go 壳 + tarball 已能出带安装验收的 MSI" | `:111`（§五 第 1 条） |
| 分支 `desktop-electron` + `docs/desktop-electron.md` | 08-31 | **换了**：Electron 43 壳，`desktop-electron.md:3-5` 自陈"基于 anywhere 架构思路…完整移植为 Electron 壳" | `docs/desktop-electron.md:1-5` |

三份文档三个立场，后者没有声明 supersede 前者。**这是"残废"在决策层的体现：当前权威不明，同一问题在不同文档里能得到相反答案。**

### 3.8 缺口 H：`docs/architecture.md` 已过期

`docs/architecture.md:19`：

> `harness/` 不是 submodule。Marisa 必须能在一次 clone 后构建，不能引用尚未推送的外部 commit。

与现状矛盾：
- `.gitmodules` 已登记 `[submodule "harness"]`
- `git submodule status` → `b150a551... harness (dsh-v0.1.1-rc.2)`
- `maintenance/upstreams.json:12-22` → `"mechanism": "submodule"`
- `docs/upstream-diff.md:10` → "（**git submodule**，2026-08-27 自 vendored 转换）"

同一个仓库里 `architecture.md` 与 `upstream-diff.md` 直接冲突，且 AGENTS.md 声明"冲突时以 docs/ 和 maintenance/ 为准"——两条都在 docs/ 下。

### 3.9 缺口的定性结论

| 假说 | 判定 | 证据 |
|---|---|---|
| 缺 profile 解析器 | ❌ 不是 | `harness/.../profile.ts` 完整（`loadProfile` / `resolveBundleDir` / `composeEntries`），marisa profile 完全被它消费 |
| 缺 bundle 装配 | ❌ 不是 | `bundles/marisa-bundle/package.json` + `cordis.patch.yml` 在；`make-bundle.ps1:796-812` 有组合硬门 |
| 缺兼容层（启动层归一） | ✅ **是** | §3.1：两个 overlay 在 profile 之外，anywhere 读不到 |
| 缺状态层归一 | ✅ **是** | §3.4：两套禁用状态机互不可见 |
| 版本不匹配 | ✅ **是（且是长期问题）** | §5：两边各自跟随上游，会持续错位 |
| 只有一半（"壳移植了、profile 集成没做"） | ✅ **是** | 分支只改壳，`git diff --name-status` 显示未触碰 `profiles/` |

---

## 4. 与 anywhere profile 概念的冲突分析

### 4.1 anywhere 的 profile 概念（源码证据，克隆 commit `efc72d4`，插件版本 2.0.3）

来源：本机克隆 `.dsh/tmp/research-repos/2026-08-25/dsh-desktop-alabs/dsh-plugin-desktop/`（该克隆是 2026-08-25 研究时留下的，HEAD = `efc72d4`）。

| 事实 | 位置 |
|---|---|
| `DESKTOP_PROFILE_NAME = 'desktop'` | `src/profile-manager.ts:29` |
| `WEB_PROFILE_NAME = 'web'` | `src/profile-manager.ts:30` |
| `BASE_BUNDLE_NAME = '@deepseek-ai/dsh-base'` / `WEB_BUNDLE_NAME = '@deepseek-ai/dsh-web-app'` | `src/profile-manager.ts:31-32` |
| `DESKTOP_BUNDLE_NAME = 'dsh-plugin-desktop'` | `src/profile-manager.ts:33` |
| **自有 profile 每次启动被重写**：`ensureDesktopProfile()` 把 `dsh.profile.bundles` 归一成 `[base, web-app, ...第三方(保序)]` | `src/profile.ts:260-265`（`desktopBundleList`）、`277-301`（写出）、`708-710`（**只有 `desktop` 这个名字会走这条**） |
| 选择态持久化在 `$DSH_HOME/profiles` **之外**："Private desktop selection state persisted outside `$DSH_HOME/profiles`"，字段 `{version, active, lastKnownGood}` | `src/profile-manager.ts:72-73`、`105-111` |
| 默认 profile 名可由 `DSH_DESKTOP_DEFAULT_PROFILE` 覆盖 | `src/desktop-cli.ts:16`、`withDefaultDesktopProfile` `:32-40` |
| **非默认 profile 的两条硬判据** | `src/profile-manager.ts:137-166` |
| ① `dsh.profile.bundles` 里不得含 `dsh-plugin-desktop`（"launcher-owned"） | `:141-144` |
| ② `webCapable` = base 存在 **且** web-app 下标 > base 下标 | `:145-153` |
| 创建新 profile 只用 `PROFILE_TEMPLATES.web`，且用 staging 目录 + 单次 rename 发布 | `createDesktopWebProfile` `:190-209`、`:206-208` |
| profile 名边界校验（路径分隔符、Windows 保留名、控制字符、结尾点/空格…） | `assertDesktopProfileName` `:114-124` |

**关键区分：anywhere 有自己的 profile 概念，但它的 profile 名是 `desktop`（+ `web`），而不是 `marisa`。** `prepareDesktopProfile` 收 `profileName` 参数（`src/profile.ts:698-707`），非 `desktop` 时走 `resolveProfileDir(profileName, home)`（`:708-710`）**且不调用 `ensureDesktopProfile`** → **不会创建 marisa profile，也不会重写它的 `dsh.profile.bundles`**。

⚠️ **但"非默认 profile 是只读的"不成立**（这是本轮调查的一处重要修正）。同一条代码路径在分支之后**无条件**执行两个写操作：

| 写操作 | 2.0.3（本机克隆） | 2.0.9（HEAD） | 对 marisa profile 的实际影响 |
|---|---|---|---|
| `reconcileProfilePnpmWorkspace(profileDir)` —— 保证 `packages` / `nodeLinker: hoisted` / `autoInstallPeers: false` 三键存在且正确，`changed` 时**整文件重写为 `document.toString()`** | `src/profile.ts:711` → 实现 `:321-344` | `src/profile.ts:860` | marisa 生成的 `pnpm-workspace.yaml` 已含 `packages`（`generate-profile.mjs:263-276`）与 `nodeLinker: hoisted`（`:278`），但**没有 `autoInstallPeers`** → anywhere 会**新增该键并整文件重新序列化**（YAML 注释按解析器规则丢失/重排）。注意 `make-bundle.ps1:396-403` 还会在这份文件上追加 `minimumReleaseAge: 0`，两个写者叠加 |
| `writeFileSync(rootConfig, '[]\n')` —— `rootConfig = <profileDir>/cordis.yml`，注释自陈 "Empty include root rewritten before every profile boot" | `src/profile.ts:741` → 常量 `:60` | `src/profile.ts:881` → 常量 `:87` | marisa 的 profile **没有** `cordis.yml`（生成器不产出）→ anywhere 会**在 marisa profile 里新建一个空 include root 文件** |

anywhere 官方 README 的说法是（`dsh-plugin-desktop/README.md:15`，转引自子代理复核）：

> `desktop` is the only launcher-managed profile: its installation-owned prefix is repaired while third-party bundle order is preserved. **Every other selected profile keeps its manifest, user patch, and dependencies unchanged.**

这句话对它列举的三项（manifest / user patch / dependencies）**成立**，但**没有覆盖** `pnpm-workspace.yaml` 与 `cordis.yml` —— 这两个文件在非 `desktop` profile 里**确实被写**。写进 E1/E2 的验收口径里。

### 4.2 能否共存

**目录层：可以共存，互不覆盖。**

| | marisa | anywhere |
|---|---|---|
| profile 目录 | `<DSH_HOME>/profiles/marisa` | `<DSH_HOME>/profiles/desktop`、`<DSH_HOME>/profiles/web` |
| profile 内文件 | `package.json` / `pnpm-workspace.yaml` / 两个 overlay | 由 `initProfile` 生成（`package.json` + `cordis.patch.yml` + `pnpm-workspace.yaml`） |
| 状态 | profile 内 `.disabled-bundles.json` | profile 外私有 state（market 另有 `desktop-market/state.json`，`src/desktop-market.ts:18-20`） |

**语义层：不冲突但会被"接管"。** 让 dsh-desktop 选择 `marisa` 作为 active profile 后，`prepareDesktopProfile` 仍会在 marisa 的层栈上追加它自己的 6 类改动：

| # | anywhere 的动作 | 位置 | 对 marisa 的影响 |
|---|---|---|---|
| 1 | 把桌面层（`dsh-plugin-desktop/cordis.patch.yml`）插在 **`@deepseek-ai/dsh-web-app` 层之后** | `src/profile.ts:751-763` | 因为 `dsh.profile.bundles` = `[base, web-app, marisa-bundle, …]`（`runtime/package.json:36-49`），实际顺序变成 **base → web-app → dsh-plugin-desktop 层 → marisa-bundle → mygo×4 → 平台 bundle 插件**。桌面行先于 marisa 的插件行挂载 |
| 2 | 若 bundles 里没有 `@deepseek-ai/dsh-web-app` → **直接报错** | `:757-763` | marisa 满足（`[1]` 就是它） |
| 3 | 要求 `settings` 行必须是 `@deepseek-ai/dsh-settings-file`，否则报错 | `:823-826` | 由 base/web-app 层提供，未单独验证 |
| 4 | 要求存在 `desktop-shell` 行，否则报错 | `:974-977` | 由 ① 插入，成立 |
| 5 | win32：**禁用 `pwsh-sandbox` 行**并插入 `dsh-plugin-desktop/windows-pwsh-sandbox` | `:908-928` | marisa 的 pwsh lane 走的是 marisa-bundle 的 `@deepseek-ai/dsh-tool-pwsh`（`generate-profile.mjs:94-97`），**不是** `pwsh-sandbox` 行 → 大概率不撞，但**未验证** |
| 6 | **禁用 `webserver` 行**、换成 `dsh-plugin-desktop/webserver`，强制 `{host:'127.0.0.1', port}` | `:933-970` | marisa `desktop.overlay.yml:5-8` 的 host/port 配置随之失效（影响小） |
| 7 | 把 `agent-presets` 行的 `config.roots` **重写为它的 `shippedPresetRoot()`** | `:854-880` + `shippedPresetRoot` `:497-502` | ⚠️ **marisa 的 anchored-standard 预设（`overlays/harness/agent-presets/anchored-standard/`，`docs/upstream-diff.md:23`）会被挤掉** |
| 8 | 剥离任何非 provider 层里的 market provider 行（`dsh-community-market` / `dshmarket`），并断言最终图里只剩它选定的那一个 | `:597-643`、`670-686` | marisa 的 MyGO 市场（`@r05en1cu/dsh-mygo*`，`runtime/package.json:39-42`）**不在** anywhere 的 provider 名单里，所以不受影响；但意味着**两套市场会同时存在** |

### 4.3 装载优先级（代码推导，非实测）

anywhere 启动 marisa profile 时的有效顺序：

```
1. bundle 层：dsh.profile.bundles 顺序，其中 anywhere 的桌面层被插在 web-app 之后   [profile.ts:751-763]
2. anywhere 选定的 market provider 行                                            [profile.ts:788-808]
3. profile 自己的 cordis.patch.yml（marisa 没有这个文件）                          [profile.ts:771, 813]
4. $DSH_HOME/cordis.patch.yml（home 层）                                        [profile.ts:765-772, 814]
5. anywhere 追加的行（在 3/4 之后再改，故压过 profile 用户层）：
   settings 配置 → agent-presets roots → win32 picker/pwsh-sandbox
   → webserver 接管 → desktop-shell 配置                                        [profile.ts:834-988]
6. ✗ 没有 launcher --patch 层（anywhere 不消费 CLI 的 --patch）
```

**与 marisa 现有形态的差异（第 6 条最关键）：** marisa 的 Wails 路线里 `--patch` 是**最后**压过一切的层（`profile.ts:5-13`），而 anywhere 路线里这一层**不存在**、且 anywhere 自己的第 5 步反过来压过 profile 层。**优先级方向相反。**

### 4.4 权威归属与一个正面结论

| 维度 | 权威 | 证据 |
|---|---|---|
| profile 目录与内容 | **marisa 定义、anywhere 部分改写** ⚠️：`package.json` / user patch / deps 不动；`pnpm-workspace.yaml` 与 `cordis.yml` **被无条件写** | `profile.ts:708-710`、**`profile.ts:711, 741`（2.0.3）/ `:860, 881`（2.0.9）** |
| active profile 选择 | **anywhere**（私有 selection state） | `profile-manager.ts:72-73` |
| bundle 层的行内容 | **两者都改**：marisa 定义层，anywhere 在其上叠 patch | §4.2 |
| 禁用状态 | **双写、互不可见** ⚠️ | §3.4 |
| 市场实现 | **双市场并存**（MyGO vs anywhere 的 community-market/dshmarket） | §4.2 #8 |
| 更新 | **anywhere**（`src/updates.ts`、`update-lifecycle.ts`、`update-download.ts`） | 模块清单 |
| 预设根 | **anywhere 赢** ⚠️ | `profile.ts:854-880` |

**正面结论（有代码证据）：** marisa profile 通过 anywhere 的非默认 profile 判据 —— `dsh.profile.bundles[0] = '@deepseek-ai/dsh-base'`、`[1] = '@deepseek-ai/dsh-web-app'`（`profiles/marisa/runtime/package.json:36-37`），且不含 `dsh-plugin-desktop` → `profile-manager.ts:137-155` 的 `problem === undefined` 且 `webCapable === true`。

**即："让 dsh-desktop 用 marisa 整合包"在 profile 协议层没有硬阻断，`select('marisa')` 会被接受。** 阻断在 §3.1（启动层）、§3.4（状态层）、§4.1 的写冲突、§5（版本层）。

### 4.5 anywhere 是否"接管 profile / 市场 / 更新"

| 断言 | 判定 | 证据 |
|---|---|---|
| 接管 profile | ✅ 是（自有 `desktop` profile 的**创建/列表/选择/删除 + 每次启动重写 bundles**） | `profile.ts:277-301`、`profile-manager.ts:190-209, 316-331, 480-511`、`profile-service.ts`（`desktopProfiles` 服务）、`profiles.ts`（托盘菜单） |
| 接管市场 | ⚠️ **半接管**：桌面**自己不实现市场**，只决定"用哪个 provider"（`disabled` / `community-market` / `dsh-market`，fail-closed）；引擎是同仓的独立 workspace 包 `dsh-community-market`（`package.json` version `0.1.0-dev.0`，`private: true`，源码在 `src/install/{service,github,manual}.ts`、`src/catalog/service.ts`） | `desktop-market.ts:23-36`、`profile.ts:776-808`、`dsh-community-market/package.json:2-3,21` |
| 接管更新 | ✅ 是 —— **这是 Electron 应用自更新，不是插件更新**：端点 `https://www.dshdesktop.cn/api/desktop/version`，默认 60s 首查 / 6h 间隔（`enabled=true, initialDelayMs=60_000, intervalMs=6*3600*1000, requestTimeoutMs=15_000`），状态写 `<userData>/updates/state.json` | `src/updates.ts:13-38`、`update-checker.ts:10-16`、`update-download.ts`、`electron-runtime.ts:147` |
| 插件安装的写入路径 | **它 shell out 到打包好的 `dsh` CLI，而不是裸 pnpm**：argv = `[appExecutable, '--expose-internals', dshBootstrapPath, 'plugin', '--profile', <activeProfileName>, ...argv]`，子进程 env 含 `ELECTRON_RUN_AS_NODE=1` / `DSH_HOME` / `CI=true` / `npm_config_runtime=electron`；`run()` 才是裸 pnpm 逃生口 | `src/pnpm.ts:159-166`、`:168`、`:180-195`、`:206-225`；`desktop-cli.ts:31`；`pnpm-policy.ts:20` |
| 它是"整个桌面"而非可拆插件 | ✅ 是（95+ 源文件，急救/通知/材质/向导都缝在主进程里） | `docs/desktop-electron.md:150-152`；`src/` 下 80 个 `.ts` |
| 它是 Cordis 插件还是独立 App | **两者都是**：Cordis 侧 `index.ts:84 name='desktop-shell'`、`:88 inject=[...]`、`:214 apply(ctx, config)`，插件清单字段叫 **`dsh`**（`dsh.client.*` + `dsh.bundle.patch`，不是 `cordis`）；Electron 侧 `main: lib/main.js`。**进程模型：Electron 主进程 fork 一个 Electron `utilityProcess` 承载 DSH host**（`host-process.ts:23`），Cordis 树跑在这个子进程里 —— **既不在 `dsh` CLI 进程里，也不在 Electron 主进程里** | `src/index.ts:84,88,214`、`package.json`（`dsh` 段 + `main`）、`host-process.ts:1,23`、`host-process-entry.ts:26-42`、`telemetry/main.ts:1,4` |

**对 §3.1 的加强：** 由于 host 由 anywhere 自己 fork（`host-process.ts:23`），marisa 的 `launcher.cmd` / `DSH_WEB_CMD` / `--patch` 这条链路在 Electron 路线下**整条不参与**。这与 §3.1 的结论一致，且说明"把 `--patch` 层搬进 profile"是唯一可行方向。

### 4.6 anywhere 仓库里没有"外部发行版 profile"这个场景

子代理对 `anywhere-labs/dsh-desktop` 做了 6 种方式的检索，结论：

| 检索 | 结果 |
|---|---|
| `marisa` | **0 命中**（issues 0 / PRs 0 / discussions 0 / 代码检索 0 / 全量 1382 个 master 文件递归 grep 0 / 文件名 0） |
| `distro` | 4 命中，**全部是 Linux 打包**（AppImage/deb/rpm），与"发行版 profile"无关 |
| `"custom bundle"` / `"bring your own"` | 2 命中（措辞松散）/ 0 命中 |

**没有任何仓库文档、issue 或 release note 把"用第三方/发行版 profile 驱动桌面"写成受支持的场景。** 最接近的三件：

1. **Issue #463（OPEN）** "Test and document Host-only profile Bundles on Desktop" —— 正是 marisa 这类"在 `dsh.profile.bundles` 里放一个只插 Host 行、不带 Client UI 的第三方 bundle"的路径；**配套 PR #464 仍未合并**，即该路径**没有已合入的回归覆盖**。([#463](https://github.com/anywhere-labs/dsh-desktop/issues/463))
2. **PR #801（OPEN）** "test(desktop): add external plugin profile smoke" —— 新增 `verify:external-plugin`，"install a local plugin checkout through the regular `dsh plugin --profile desktop add` path in a disposable DSH home"。⚠️ **它用的仍是内置 `desktop` profile 名，不是自定义 profile。**
3. **Issue #778（CLOSED）** "oh-my-dsh implementation as a dedicated profile" —— 唯一一次"独立非默认 profile"的产品诉求，维护者回复"会考虑提供一个可选的专用 profile"，**无实现**。

另有一条**对本仓库 E1 建议直接相关**的历史证据：**PR #11（CLOSED，未合并）** "docs: clarify profile bundle patch ownership"，正文原文：

> Do not repeat a bundle's `insert` entries in the profile's own `cordis.patch.yml`: a package listed in `dsh.profile.bundles` already contributes its declared patch layer.

该澄清**从未落地**（它编辑的 `apps/cli/reference/README.md` 在 master 上已不存在）。→ **E1 把 overlay 搬进 profile 自己的 `cordis.patch.yml` 时，必须避开"重复 bundle 已声明的 `insert`"这一坑**：`webserver` / `web-runtime` 这些行来自 `dsh-web-app` 层，用 `id` 覆盖（overlay 现状的写法）是合法且必要的，但**新插入**同名行会重复。

---

## 5. 版本与依赖账

### 5.1 marisa 侧（本仓库，`feature/linux-support`）

| 项 | 值 | 证据 |
|---|---|---|
| harness pin | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` | `.gitmodules`；`git submodule status` → `(dsh-v0.1.1-rc.2)` |
| DSH 版本 | **`0.1.1-rc.2`** | `maintenance/upstreams.json:19`、`docs/upstream-diff.md:7` |
| 通道 | `next` | `maintenance/upstreams.json:20` |
| 机制 | submodule（2026-08-27 自 vendored 转换） | `upstreams.json:14`、`docs/upstream-diff.md:10` |
| 根注册表依赖 | `^0.1.1-rc.2`（38-96 行区间） | `package.json:38-96` |
| harness 工作区包数 | **238**（实测） | 遍历 `harness/packages/*/*` + `harness/vendor/*` + `harness/apps/*` 的 `package.json.name` |

### 5.2 anywhere 侧（实测，2026-08-31）

`@deepseek-ai/dsh-*` 依赖的 pin **每个 ref 都是单一精确版本**（无范围、无例外）：

| ref | 插件版本 | `@deepseek-ai/dsh-*` pin | 数量 | 采集方式 |
|---|---|---|---|---|
| npm `0.0.1` | 0.0.1 | —（占位，零依赖） | — | `registry.npmjs.org/dsh-plugin-desktop` |
| npm `2.0.0`（latest） | 2.0.0 | `0.1.0-rc.6` | 95（`@deepseek-ai/*` 共 102） | 同上，读 `versions.2.0.0.dependencies` |
| 本地克隆 `efc72d4` | 2.0.3 | **`0.1.1-rc.2`** | 99（`@deepseek-ai/*` 共 106） | `.dsh/tmp/research-repos/2026-08-25/dsh-desktop-alabs/dsh-plugin-desktop/package.json` |
| tag `v2.0.3`（`681ba66091`） | 2.0.3 | `0.1.1-rc.2` | 104 | `gh api …/contents/dsh-plugin-desktop/package.json?ref=v2.0.3` |
| commit `fe81811`（2026-08-25，在 v2.0.3..v2.0.9 内） | 2.0.3 | `0.1.1-rc.2` | 99 | 同上（按 SHA） |
| tag `v2.0.4`（`d29bf7a965`） | 2.0.4 | `0.1.2-alpha.1` | 130 | 同上 |
| tag `v2.0.5` | 2.0.5 | `0.1.2-rc.1` | 131 | 同上 |
| tag `v2.0.7` / HEAD `v2.0.9`（`63e160ab`，2026-09-10） | 2.0.9 | **`0.1.5-rc.1`** | 135 | 同上 |

仓库事实：
- 仓库名 `anywhere-labs/dsh-desktop`（旧名仍写在 `package.json` 的 `repository.url`：`git+.../deepseek-harness-desktop.git`）；**`anywhere-labs/dsh-plugin-desktop` 这个仓库不存在（404）**，插件是 `dsh-plugin-desktop/` 子目录。同仓还有 `dsh-plugin-desktop-beta/`、`dsh-community-market/`、`dsh-community-fabric/`、`vendor/`、`patches/`，以及一个 `deepseek-harness/` **submodule**（指向 `deepseek-ai/deepseek-harness`）。根是 **yarn** workspace（`yarn.lock` + `.yarnrc.yml`），不是 pnpm。
- 默认分支 `master`，最后 push `2026-09-10T14:54:10Z`，最新 tag `v2.0.9`；**`v2.0.6` / `v2.0.8` 无 tag 无 release**；仓内**没有 CHANGELOG 文件**（release note 即变更日志）。
- `upstream.json`（master）：`activeChannel: "beta"`，stable 与 beta 指向**同一** commit `183f08e9c6dde7e36cd2318eaee70b0da08fb35e` = `sourceVersion 0.1.5-rc.1`。
- ⚠️ **它不跑 harness 源码树，而是消费已发布的运行时 tarball**：仓根 `package.json` 用一张 `resolutions` 表把 `@deepseek-ai/dsh-*@npm:<ver>` 强制指向 `file:vendor/dsh-runtime/<ver>/<pkg>-<ver>.tgz`（部分再叠 `patch:…#./patches/<pkg>@<ver>.patch`），HEAD 指向 `0.1.5-rc.1`；根脚本 `check:vendored-runtime` 跑 `scripts/sync-vendored-runtime.mjs --check`。**这与 marisa 用 `workspace:^` 直接跑 harness 源码（`package.json:72-271`）是两条完全不同的形态**，也是 §3.9 "缺兼容层"的另一个侧面：任何"用 marisa 的 harness 源码树"的整合都要面对这层差异。

npm 上游发布时间线（实测）：
- `@deepseek-ai/dsh`：latest = `0.1.5-rc.1`，`next` = `0.1.5-rc.2`，共 20 个版本，包含 `0.1.1-rc.2`。`@deepseek-ai/dsh-core` **不存在（404）**，内核包就是 `@deepseek-ai/dsh`。
- ⚠️ **陷阱：`@deepseek-ai/dsh-*` 的 `dist-tags.latest` 普遍是陈旧的**（例：`dsh-client-web` 的 `latest` = `0.0.1-rc.1`，而最大已发布版本是 `0.1.5-rc.2`）。E4 里凡是按版本号取包，**必须用显式版本号或 `next`/`alpha` 标签，不要用 `latest`**。

### 5.3 结论：版本账

1. **唯一与 marisa pin 同线的 anywhere 版本是 v2.0.3（含）之前。** v2.0.3 是最后一个 pin `0.1.1-rc.2` 的 tag；从 v2.0.4 起跳到 `0.1.2-alpha.1`。
2. **任务描述里"anywhere 需要 rc 线或 alpha 线"实测更精确的表述是：anywhere 的 pin 一直跟着上游线走，所以"错位"是结构性的，不是偶发。** 轨迹：`0.1.0-rc.6`(2.0.0) → `0.1.1-rc.2`(2.0.3) → `0.1.2-alpha.1`(2.0.4) → `0.1.2-rc.1`(2.0.5) → `0.1.5-rc.1`(2.0.7+)。只要两边各自跟随上游，任何一次同步都会重新拉开。
3. **正向对齐成本高。** marisa 要从 `0.1.1-rc.2` 升到 `0.1.5-rc.1`，跨 `0.1.2` / `0.1.3-alpha` / `0.1.5-alpha` 多条线。参照 `docs/upstream-diff.md:12`：单次 rc8 → rc.1（35 提交）就已经要逐项判断"重放、迁移或删除"，且回滚了一处权限默认值（#2608）。**这是换基线的大工程，不是 pin bump。**
4. **反向对齐（把 anywhere 停在 v2.0.3）也不便宜。** npm 上**没有** 2.0.3（只有 0.0.1 与 2.0.0），git tag 也只到 2.0.3 为止的源码；要拿它就得自己构建 Electron 产物。参照 `docs/desktop-electron.md:97-139`：Electron 壳 deb 88 MB / unpacked 270 MB，back end payload 另需 `make-bundle.ps1`（内含 pnpm install + junction + prune，**必须在 Windows 主机跑**）。
5. **周边依赖也不齐：**
   - `dsh-plugin-desktop-beta`：npm **不存在**（registry 返回空 versions），尽管 `upstream.json` 的 beta 通道指向它。
   - `dsh-community-market`：npm 只有 `0.0.1`；仓库里是 `0.1.0-dev.0`（`private: true`）→ 社区市场只能源码构建。
   - `dshmarket`：npm latest `1.46.0`，anywhere 2.0.3 pin `1.17.1` → 市场实现自己也钉在老版本上，与新版市场生态不同步。
   - Electron：2.0.3 peerDep `electron 43.4.0`；master 降到 `43.3.0`。
6. **形态差异比版本差更根本：anywhere 消费已发布的运行时 tarball，marisa 编译 harness 源码。** anywhere 根 `package.json` 的 `resolutions` 表把每个 `@deepseek-ai/dsh-*` 钉到 `file:vendor/dsh-runtime/<ver>/<pkg>-<ver>.tgz`（部分再叠 `patch:`）；marisa 则通过 `workspace:^` 直接跑 `harness/` 源码树并在其上做 overlay（`package.json:72-271`、`scripts/apply-harness-overlays.mjs`）。**即便版本号对上，这两条形态也不能直接互换**——anywhere 要的是"发布闭包 + 它对官方包打的 patch"，marisa 要的是"源码树 + 自己的 overlay"。这一条应当写进任何整合方案的可行性前提。

---

## 6. 后续研究实验清单（本轮不实施）

> 排序原则：先做便宜且能一票否决的，再做贵的。

### E1 — profile 启动层归一（判定 §3.1，**最便宜、最该先做**）

- **目的**：确认 `standalone.overlay.yml` 的两行在 Electron 承载下是否真的需要。
- **步骤**：
  1. 在**不修改**现有文件的前提下，做一个临时 profile 副本（例如 `%TEMP%\p1\.dsh\profiles\marisa`），把 `desktop.overlay.yml` + `standalone.overlay.yml` 的内容**合并**进 profile 自己的 `cordis.patch.yml`；
  2. 用当前 Wails/Go 壳以 `--profile marisa`（**不带 `--patch`**）启动该临时 profile，验证功能面等价；
  3. 若等价，则证明这两层可以"profile 化"，§3.1 的缺口是纯机械改动。
- **预期产出**：一份"启动层归一前后行为差异表"（rows 数量、`--dump-config` 条目数对比），以及归一后的 `cordis.patch.yml` 草案。
- ⚠️ **必须避开的坑（来自 anywhere PR #11，未合并的澄清）**："Do not repeat a bundle's `insert` entries in the profile's own `cordis.patch.yml`: a package listed in `dsh.profile.bundles` already contributes its declared patch layer." 即 `webserver` / `web-runtime` 这些行**已经由 `dsh-web-app` 层插入**，overlay 现状用 `id:` 覆盖是合法的；**但重新 `insert` 同名行会重复**（重复 entry id 会让 anywhere 直接抛错：`assertUniqueEntryIds`，`src/profile.ts:526-539`）。归一后的 `cordis.patch.yml` 必须**只用 id 覆盖 + 只插入 marisa 自己新增的行**。
- **失败退路**：若第 2 步不等价（例如某行必须在最外层才能覆盖 bundle 层），则说明 marisa 的 launcher 层语义**不可**收敛进 profile；此时改问"anywhere 能不能接受一个 launcher 层"——需要给 `prepareDesktopProfile` 加参数（上游 PR）或走 fork。**先例不利**：Issue #778（"oh-my-dsh as a dedicated profile"）是唯一一次"独立非默认 profile"诉求，维护者只说"会考虑"，无实现（§4.6）。

### E2 — anywhere 选 `marisa` profile 的最小可行实验（判定 §4.4 的正结论是否真成立）

- **目的**：验证 `select('marisa')` 真的被接受，以及 §4.2 的 6 类接管动作实际发生什么。
- **步骤**：
  1. 在隔离的 `DSH_HOME`（`%TEMP%\p2`）里放一份 marisa profile 与 `desktop`/`web` profile；
  2. 用 anywhere 2.0.3 源码构建的桌面（或任一可用的 2.0.x 产物）以 `DSH_DESKTOP_DEFAULT_PROFILE=marisa` 启动；
  3. 抓启动日志中的 composition 结果，确认：`webCapable` 判据通过、`desktop-shell` 行被插入、`webserver` 行被替换、`agent-presets.roots` 被重写；
  4. 用 `--dump-config` 等价手段导出最终 rows，与 marisa 期望的顺序逐条 diff；
  5. ⚠️ **比对启动前后的 profile 目录快照**（`git`-less 的文件哈希即可），确认 §4.1 预测的两个无条件写确实发生：`pnpm-workspace.yaml` 被重新序列化并新增 `autoInstallPeers: false`、`cordis.yml` 被新建为空 include root；并检查 `package.json` / `desktop.overlay.yml` / `standalone.overlay.yml` **未被改动**。
- **预期产出**：最终 row 清单 diff + 一份"§4.2 表中每一行：实际发生 / 未发生"的核对表 + profile 目录写入 diff（哪些文件被谁改了）。
- **失败退路**：若 `webCapable` 被判 false（说明我对 `profile-manager.ts:152-153` 的读法有误），退到 E1 归一后再验；若 composition 直接失败，把失败点归类到具体行（任何一行的解析失败都是可用信息）。

### E3 — 禁用状态双写（判定 §3.4）

- **目的**：确认两套状态机是否真的互不可见，以及语义差异会不会造成"禁用后又被启用"。
- **步骤**：
  1. 在 E2 的实验 home 里，用 marisa 的急救页禁用某个 bundle（写入 `.disabled-bundles.json` 并改写 `package.json`）；
  2. 用 anywhere 启动同一 home，观察它是否仍加载该 bundle；
  3. 反向：用 anywhere 的恢复窗禁用某个 bundle（写它自己的私有 state），再用 Wails 壳启动，观察是否仍加载。
- **预期产出**：双向可见性矩阵 + 一份"需要谁做适配"的判断（是 anywhere 读 `.disabled-bundles.json`，还是 marisa 改用统一的私有 state）。
- **失败退路**：若双向都不可见（最可能的结果），则该实验直接产出结论——需要上游 PR 或接受"两壳各自维护自己的禁用集"。后者要写进用户文档，否则用户会困惑。

### E4 — 版本差实测：`0.1.5-rc.1` 线跑 marisa bundle（判定 §5）

- **目的**：量化"升级 harness 到 anywhere 的 pin 线"到底要改多少东西。
- **步骤**（**只做调研，不改主线**）：
  1. 在临时 worktree 里把 harness submodule 换到 `183f08e9`（anywhere `upstream.json` 的 commit）；
  2. 跑 `docs/upstream-diff.md` 的换树流程（重放/迁移/删除三项逐条判断）；
  3. 跑 `pnpm test:repository` + `pnpm test:profile` + 双 tag Go 测试，记录失败面；
  4. 对 `profiles/marisa/plugins.json` 的 34 个插件逐项判定 client inject 链是否还成立（重点是 §3.6 那两个消失包的**后继者**）。
- **预期产出**：换树工作量清单（每项：重放 / 迁移 / 删除）+ 预测的阻塞项数量。
- **失败退路**：若换树成本远超预期，退路是**反向绑版本**——让 marisa 与 anywhere 都停在 `0.1.1-rc.2`（anywhere 用 v2.0.3 源码自建产物，成本见 §5.3 第 4 条），并把这条写进双方的治理文档。

### E5 — `ClientPackageCompositionError` 适用面（判定 §3.6，低成本）

- **目的**：把"哪条路径会崩"钉死。
- **步骤**：
  1. 在隔离目录 `npm install dsh-plugin-desktop@2.0.0`（不要装进仓库树），检查 96 个依赖里哪两个在 `0.1.1-rc.2` 线不可得；
  2. 若可行，构造一个只装 client inject 链的最小 profile，观察 `harness/packages/client/modules/src/index.ts:335-337` 的抛出；
  3. 对照 anywhere 源码 v2.0.3 的同名断言——验证源码路径确实不触发。
- **预期产出**：一张"装法 × 版本线 → 是否抛 `ClientPackageCompositionError`"的判定表。
- **失败退路**：若第 2 步构造成本过高，本项可只做静态核对（我已经完成 1 与 3 的部分，见 §3.6 表格）——静态结论已足以支撑"源码路径不踩坑"。

### E6 — 预设根冲突（判定 §4.2 #7）

- **目的**：确认 marisa 的 anchored-standard 预设会不会被 anywhere 挤掉。
- **步骤**：
  1. 读 anywhere `shippedPresetRoot()`（`src/profile.ts:497-502`）解析出的实际路径（它指向 `@deepseek-ai/dsh/package.json` 同级的 `config/agent-presets`）；
  2. 对比 marisa 的 `overlays/harness/agent-presets/anchored-standard/`（`docs/upstream-diff.md:23`）在部署树里的落点；
  3. 在 E2 的 home 上实际启动，检查 agent preset 列表里还有没有 anchored-standard。
- **预期产出**：冲突确认 + 两条候选修法（改 anywhere 的 roots 为可配置 / 把 marisa 预设放进 anywhere 认的目录）。
- **失败退路**：若确认被挤掉且上游不改，则接受"Electron 路线放弃 anchored-standard"，并在 `docs/upstream-diff.md` 记录该差异。

### E7 — 清单单源（判定 §3.2，**独立于 Electron 议题，可先行**）

- **目的**：消除一份死清单。
- **步骤**：
  1. 逐条 diff 根 `plugins.json`（28 条）与 `profiles/marisa/plugins.json`（34 条），列出仅存于一方的条目；
  2. 判定根清单里独有字段（`repo` / `needs-build` / `has-lib` / `patch-id`）是否仍被任何流程需要；
  3. 把 `verify-repository.mjs` 扩成"根清单必须与 profile 清单一致（或根清单被删除）"的 `--check` 门。
- **预期产出**：单源化方案（保留哪一份、另一份删除还是生成）。
- **失败退路**：若根清单确实有未知的消费者（本轮 grep 未发现，但可能有外部脚本），则退到"生成 + `--check` 漂移门禁"——即保留两份但保证机械一致。

### E8 — Wails 壳与 Electron 壳的并行收口

- **目的**：`docs/desktop-electron.md` 自陈"`desktop/` Go 壳保留不删，两条路线并存，由 release workflow 选择打包哪个"（`:211`），需要确认这不会让 profile 契约分成两套。
- **步骤**：核对 release workflow 是否真的能二选一，以及 profile / `backend.tar.zst` 是否**同一份**（分支 diff 已显示是同一份，见 §3.0）。
- **预期产出**：双壳共存的成本清单（CI 时长、验收矩阵翻倍）。
- **失败退路**：若成本不可接受，需要在 §3.7 的三份文档里明确"哪一条是当前主线"，并给另两条加 supersede 标记。

---

## 7. 未查清 / 待确认

1. **anywhere v2.0.9 的 Release 资产清单未查。** 我只确认了仓库/tag/npm 版本线，没有拉取 Release assets 清单，因此"是否已有可直接使用的 2.0.9 安装包"未知。
2. **GitHub issue 搜索的覆盖有限。** 我的直接 `gh api search/issues` 对本仓库返回 422（"resources do not exist or you do not have permission"）；委托的第二次检索用 GitHub 检索（title+body+comments）拿到了结论性的"`marisa` 零命中"，但**已关闭 PR 的评论区未逐条读完**，且检索一度被平台的 30 req/min 限制挡回（HTTP 403，非代理问题）。§4.6 的结论按"检索到的事实"表述，不宣称穷尽。
3. **我逐行读的是 anywhere 2.0.3（`efc72d4`）的源码；2.0.9 的结构由第二次独立检索在 `63e160ab` 上复核过关键点**（profile 名常量 `profile.ts:81`、`ensureDesktopProfile` `:345-371`、`reconcileProfilePnpmWorkspace` `:394-415`、`cordis.yml` 写 `:879-881`、`profile-manager.ts:33/132-135`、`desktop-plugins.ts:42-47/472/550/633`、`index.ts:84/88/214`、`host-process.ts:23`），两版结论一致。但**我没有自己逐行读完 2.0.9**，因此"2.0.9 与 2.0.3 在 profile 契约上完全等价"仍是**推断**，不是全量核对。要做整合决策前应重新克隆 2.0.9。
4. **§4.2 #5（pwsh-sandbox 行替换是否与 marisa 的 pwsh lane 撞车）未验证。** marisa 的 pwsh lane 由 `marisa-bundle` 的 `@deepseek-ai/dsh-tool-pwsh` 行实现（`generate-profile.mjs:94-97`），与 anywhere 替换的 `pwsh-sandbox` **行**不同名，但两行是否会争同一个 `ctx.shell` 服务未验证。
5. **§4.3 的装载优先级是代码推导，不是实测。** 需要 E2 的实测确认。
6. **§4.1 的两个"无条件写"我是从代码读出的，没有实跑。** 需要 E2 第 5 步的 profile 目录快照比对来确认（并确认 `package.json` / 两个 overlay 确实不被改）。
7. **`desktop-electron` 分支的 Windows 真机 / MSI 验收未完成**（文档自陈：`docs/desktop-electron.md:173` "**Windows 真机 + MSI 安装/启动/卸载验证：❌ 未完成（需 Windows 主机）**"）。该分支的 `npx tsc --noEmit` 与 31 个 vitest 全绿，但那是单元测试，不等于发行验收。
8. **`make-bundle.ps1` 在 Electron 模式下的实际产物未构建验证。** 分支加了 `-RuntimeMode electron`（不拷 `node.exe`，改 pnpm shim 指向桌面 exe），`docs/desktop-electron.md:139` 自陈体积数字是"Linux 侧按脚本语义复算"，**真实数字只能在 Windows 主机跑出来**。
9. **anywhere 侧对"第三方 bundle"这条路径没有已合入的回归覆盖。** Issue #463 配套的 PR #464 仍 OPEN，PR #801（`verify:external-plugin`）也仍 OPEN 且用的是内置 `desktop` profile 名（§4.6）。也就是说，**marisa 会成为这条路径的第一批真实用户之一**，这既是机会（上游缺覆盖，我们的实测有反馈价值）也是风险（无既有保障）。
10. **`docs/RESEARCH-desktop-packaging-routes-20260828.md` 与其姊妹篇为未跟踪文件**（`git status` 显示 `??`）。它们未纳入版本控制，因此"仓库文档"的权威性存疑。
11. **`.dsh/tmp/research-repos/2026-08-25/dsh-desktop-alabs` 是一份未跟踪的本地克隆**（在 `.dsh/tmp/` 下，被 gitignore）。本报告 §4 的源码引用都指向它；它不是仓库资产，`git clean` 或换机器后会消失。若要长期引用，应把关键结论抄进仓库文档（本文件即为此）。
12. **§3.3 的结论"`dsh.desktop` 无读者"基于 grep 的静态证据。** 我没有排除"某个插件在运行时动态读 profile `package.json` 的 `dsh.desktop` 段"这种情形（这需要跑起来抓，或对 28 个 vendored 插件做全量 grep——本轮 grep 覆盖了 `*.go/*.ts/*.mjs/*.ps1/*.sh/*.md/*.yml`，未覆盖插件内的 `.js`/`.tsx` 产物）。
13. **"`dsh-client-schema-form` / `dsh-client-web-react` 在 rc8 合并进 `dsh-client-web`"这个机制是推断**：registry 元数据强支持（两者都止于 `0.1.0-rc.7`；`dsh-client-web` 在 `0.1.0-rc.8` 时依赖列表从 9 项塌缩为 **0 项**），但**没有解包核对 tarball 内容**。

---

## 附：本报告的关键外部来源

- `https://registry.npmjs.org/dsh-plugin-desktop`（版本清单与 `2.0.0` 的依赖树）
- `https://registry.npmjs.org/@deepseek-ai/dsh-client-schema-form`、`.../dsh-client-web-react`（确认两者止于 `0.1.0-rc.7`，且都无 `0.1.1-rc.*` / `0.1.2-*`）
- `https://registry.npmjs.org/@deepseek-ai/dsh-client-web`（`0.1.0-rc.8` 起依赖列表塌缩为 0，支撑"并入"推断）
- `https://api.github.com/repos/anywhere-labs/dsh-desktop/contents/dsh-plugin-desktop/package.json?ref=<tag>`（各 tag 的 pin）
- `https://api.github.com/repos/anywhere-labs/dsh-desktop/contents/upstream.json`（`183f08e9…` = 0.1.5-rc.1，channel beta）
- `https://api.github.com/repos/anywhere-labs/dsh-desktop/tags`（最新 v2.0.9）
- 任何地方仓库中与"第三方/自定义 profile"相关的条目：
  - `https://github.com/anywhere-labs/dsh-desktop/issues/463`（OPEN：Test and document Host-only profile Bundles on Desktop）
  - `https://github.com/anywhere-labs/dsh-desktop/pull/464`（OPEN：配套回归）
  - `https://github.com/anywhere-labs/dsh-desktop/pull/801`（OPEN：`verify:external-plugin`，用内置 `desktop` profile）
  - `https://github.com/anywhere-labs/dsh-desktop/issues/778`（CLOSED：oh-my-dsh as a dedicated profile，未实现）
  - `https://github.com/anywhere-labs/dsh-desktop/pull/11`（CLOSED 未合并：profile bundle patch ownership 澄清）
  - `https://github.com/anywhere-labs/dsh-desktop/issues/947`（OPEN：`dsh-desktop.*` 设置被 `profile-preferences` 覆盖）
  - `https://github.com/anywhere-labs/dsh-desktop/issues/763`（`<profile>/cordis.patch.yml` 改动需整机重启，`main.ts` 从不调用 `watchUserPatches()`）
- 本地克隆（未跟踪）：`.dsh/tmp/research-repos/2026-08-25/dsh-desktop-alabs` @ `efc72d4`
- 上游代码引用（`**[LOCAL HARNESS]**` 标记处）：`harness/packages/boot/app-boot/src/profile.ts`、`harness/packages/client/modules/src/index.ts`
