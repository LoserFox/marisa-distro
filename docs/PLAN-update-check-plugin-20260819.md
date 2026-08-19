# 计划：Marisa 检查更新插件(dsh-update-check)

日期：2026-08-19
状态：已确认方案，待实施
用户拍板：**只做检查+通知**(不下载不安装，按钮跳 Release 页);**设置卡片+启动横幅**形态。

## 目标与边界

为 Marisa 发行版提供"发现新版本"能力：插件定期检查 GitHub Releases，发现新版后在设置页卡片展示 changelog 并在启动时弹一次横幅，按钮按安装形态深链到对应 Release 资产(MSI / 便携 EXE)。

明确不做(与 [RESEARCH-package-size-and-update-plugin-20260816.md](RESEARCH-package-size-and-update-plugin-20260816.md) 的终态区分)：下载、SHA256 校验、替换、安装、回滚——那些属于未来"桌面宿主窄接口"阶段，本计划不建。

## 关键代码事实(实施依据)

- Go 壳不监听任何端口、无 Wails binding，插件→Go 无现存桥；后端子进程**整体继承壳进程环境**(`desktop/server_windows.go:16-19`)。
- Go 二进制不嵌版本；后端 bundle 根有 `VERSION` 文件(`desktop/bundle/make-bundle.ps1:188,221`,内容 `marisa-backend-<version>[-dirty]`)。
- 安装形态是纯编译期 build tag:`embeddedbundle`=便携(`desktop/embedded.go:9`),`installedbundle`=MSI(`desktop/installed.go:1`),dev 无 tag(`desktop/embedded_dev.go`);无运行期判定。
- 插件常规形态：host 侧 `inject` + `ctx.webServer.register` 同源路由(先例 `plugins/dsh-drag-and-drop/src/index.ts:6,32-47`);client 侧设置卡片 `ctx.slots.inject('settings.plugin.item', ...)`(先例 `plugins/interpreters/lib/client.js:446-448`)。
- bundle 挂载:`bundles/marisa-bundle/package.json` 加 `file:../../plugins/<dir>` 依赖 + `cordis.patch.yml` 加 insert 行。
- 代理:Node fetch 默认不走 HTTP_PROXY; harness 规定代理只能来自继承环境(`harness/packages/boot/app-boot/src/index.ts:108-113`)。
- **GitHub API 陷阱**:`/releases/latest` 会跳过 prerelease,而 Marisa v0.x 全部标预发布——必须用 `/releases?per_page=5` 列表端点取最新非 draft。

## 实施步骤

### 1. Go 壳：注入两个环境变量(约 10 行)

- `desktop/embedded.go` / `installed.go` / `embedded_dev.go`：各加 `const installForm = "standalone" | "msi" | "dev"`。
- 子进程 env 组装处(`desktop/command.go:15-20` / `server_windows.go:20-27`）追加：
  - `MARISA_INSTALL_FORM` ← build tag 常量
  - `MARISA_VERSION` ← 读 backend `VERSION` 文件并剥离 `marisa-backend-` 前缀与 `-dirty` 后缀(embedded 形态已有解析逻辑 `embedded.go:49-74` 可复用;installed 形态读 EXE 旁 `backend\VERSION`;dev 形态留空)
- Go 表驱动测试：VERSION 解析、env 注入。

### 2. 插件 server 侧 `plugins/dsh-update-check/src/plugin/`

- cordis 函数插件,`inject = ['webServer']`(参照 drag-and-drop)。
- Config(`Config` schema 校验，全部可调):`repo`(默认 `omdsh-dev/marisa-distro`)、`apiBase`(默认 `https://api.github.com`,供 mock 测试/镜像)、`checkIntervalHours`(默认 24)、`autoCheck`(默认 true)。
- 启动时若 `MARISA_VERSION` 为空 → 记录一次日志并自动隐身(不注册路由以外的任何行为)。
- 检查流程：启动后 30s 首次检查 + 每 `checkIntervalHours` 周期;GET `{apiBase}/repos/{repo}/releases?per_page=5`,取第一个非 draft;semver 比对(归一化 `v` 前缀);结果缓存到 `$DSH_HOME/update-check/state.json`(`lastCheckAt`/`latest`/`dismissedVersion`)。
- 代理：存在 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` 时用 undici `EnvHttpProxyAgent` 作 dispatcher(undici 声明为运行依赖)。
- 同源路由:
  - `GET /plugins/dsh-update-check/state` → 当前版本、最新版本、是否有更新、changelog(release body)、资产链接(按 `MARISA_INSTALL_FORM` 选 MSI 或 standalone,dev 形态给 Release 页)、检查时间
  - `POST /plugins/dsh-update-check/check` → 立即检查(前端"立即检查"按钮)
  - `POST /plugins/dsh-update-check/dismiss` → 记录 dismissedVersion

### 3. 插件 client 侧 `plugins/dsh-update-check/src/client/`

- 设置页卡片(`settings.plugin.item`):当前版本/最新版本、changelog 渲染、"立即检查"按钮、自动检查开关、按形态深链的下载按钮。
- 启动横幅:client 加载时拉 state,有新版本且 `dismissedVersion != latest` → 顶部固定定位横幅(最小 DOM 注入,参照连接横幅类插件做法),含"查看/下载/关闭";关闭调 dismiss 路由。
- 中英 i18n 文案。

### 4. 挂进发行版

- `bundles/marisa-bundle/package.json` 加 `"dsh-update-check": "file:../../plugins/dsh-update-check"`。
- `bundles/marisa-bundle/cordis.patch.yml` 加 insert 行(默认启用——轻量插件按发行标准默认开)。
- 若需 profile 清单同步，检查 `profiles/marisa/plugins.json` 是否需要登记。

### 5. 文档(仓库规则硬性要求)

- `docs/plugins.md` 插件清单加行。
- 新建 `docs/plugins/dsh-update-check.md`:**写明权限影响**——新增网络出站能力(api.github.com;仅读 Release 元数据,不带凭据、不发遥测)、写盘范围(`$DSH_HOME/update-check/state.json`)。

## 测试策略

- 单测(node:test):semver 比对(含 v 前缀/prerelease 后缀)、非 draft 过滤、缓存读写、同版本 dismiss 去重、代理 dispatcher 选择逻辑。
- 集成:`apiBase` 指向本地 mock server,跑通检查→state 路由→dismiss 全流程。
- 冒烟:真实窗口验证设置卡片与启动横幅;dev 形态验证自动隐身。
- 仓库验收门:`pnpm install --frozen-lockfile && pnpm test`;`go test -C desktop -tags installedbundle ./...` 与 `-tags embeddedbundle ./...`;`git diff --name-only origin/main...HEAD | node scripts/verify-pr-boundaries.mjs`。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| GitHub 未认证限流 60 次/时/IP | 24h 间隔 + state.json 缓存 + 手动检查也走缓存窗口 |
| 所有 Release 是 prerelease,`/latest` 端点漏报 | 用列表端点取最新非 draft(已列为实施要点) |
| 代理环境(如 127.0.0.1:10808)fetch 不通 | undici EnvHttpProxyAgent 显式支持 |
| 横幅 DOM 注入对 DSH 改版敏感 | 最小 fixed 定位元素,失败仅不显示,不影响主流程 |
| VERSION 与 Release tag 漂移 | 两侧都归一化 v 前缀;readme 记录版本闸门关系 |
