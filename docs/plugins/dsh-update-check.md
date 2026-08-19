# dsh-update-check

本地第一方插件（非上游 mirror）：为 Marisa 发行版提供"发现新版本"能力。只做**检查+通知**，不下载、不安装、不校验、不替换；操作按钮深链到 GitHub Release 对应资产（MSI / standalone EXE），dev 形态给 Release 页。

## 行为

- 启动 30 秒后首次检查，之后每 `checkIntervalHours`（默认 24h）一次；`autoCheck` 可关。
- 查询 `{apiBase}/repos/{repo}/releases?per_page=5`（默认 api.github.com / omdsh-dev/marisa-distro），取第一个非 draft 版本；semver 比对归一化 `v` 前缀。
- 结果缓存到 `$DSH_HOME/update-check/state.json`（`lastCheckAt` / `latest` / `dismissedVersion` / `changelog` / `assets`——changelog 与资产 URL 落盘，重启后横幅/卡片不丢下载面）；手动"立即检查"仍遵守 30 秒缓存窗口（GitHub 未认证限流 60 次/时/IP 的缓解）。
- 桌面壳注入 `MARISA_INSTALL_FORM`（standalone/msi/dev）与 `MARISA_VERSION`（backend VERSION 剥离 `marisa-backend-` 前缀与 `-dirty` 后缀）；`MARISA_VERSION` 为空（dev 形态）时插件自动隐身。
- 代理：存在 `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` 时经 undici `EnvHttpProxyAgent` 出站（继承自壳进程环境，插件不自行设置代理变量）。
- 路由：`GET /plugins/dsh-update-check/state`、`POST /plugins/dsh-update-check/check`、`POST /plugins/dsh-update-check/dismiss`、`POST /plugins/dsh-update-check/settings`（写 `autoCheck` 到 settings namespace）。
- 设置：注册 `update-check` settings namespace（`repo` / `apiBase` / `checkIntervalHours` / `autoCheck`），设置页可见可改；卡片只在 host 服务该 namespace 时渲染。

## 权限影响

- **新增网络出站**：`api.github.com`（或配置的 `apiBase`），仅读取 Release 元数据（版本、tag、body、资产名与 URL）；**不带任何凭据**（GitHub 公开 API，未认证），**不发遥测**、不携带用户数据。
- **写盘**：`$DSH_HOME/update-check/state.json`（检查时间、最新版本号、用户已忽略的版本号；无图片/对话/密钥内容）。
- 深链下载按钮仅打开系统浏览器跳转 GitHub Release 页面，插件自身不下载文件。

## 验证

- 单测：semver 比对（v 前缀/prerelease 后缀）、非 draft 过滤、缓存读写、同版本 dismiss 去重、代理 dispatcher 选择。
- 集成：`apiBase` 指向本地 mock server 跑通 检查→state→dismiss 全流程。
- 仓库门禁：`pnpm test`、`go test -C desktop ./...` 与双 tag。
