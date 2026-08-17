# Marisa DSH Desktop

[English](README.md) | 中文

`desktop/` 是 Marisa DSH 发行版的 Wails v3 桌面壳，负责原生窗口、系统托盘、后端守护和 Windows 安装包。Marisa 的 harness 与默认插件均由同一个仓库维护；Windows Release 启动的是随包提供的 Marisa 运行时，而不是另一份需要单独安装的 DSH 检出。

## 运行方式

```
Marisa DSH desktop shell
  -> 启动 Marisa Web 后端
     -> 等待 "dsh web: http://127.0.0.1:<port>"
        -> 在内嵌 WebView 窗口中加载该地址
```

桌面壳是唯一的图形入口，不会打开系统浏览器。默认使用由操作系统分配的端口；后端异常退出时按有上限的退避策略重启。关闭窗口只会隐藏到系统托盘，选择托盘中的**退出**才会停止后端进程树并结束应用。托盘还提供显示或隐藏窗口和登录自启开关。

Windows 需要 WebView2。较新的 Windows 11 通常已经包含它；Windows 10 可能需要安装 [Evergreen WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

## Windows Release

请从 [Marisa DSH Releases 页面](https://github.com/LoserFox/marisa-distro/releases) 下载带 tag 的版本。Release 只能由维护者在确认真实窗口已渲染、MSI 已完成安装、启动和卸载验收后，手动启动带门禁的工作流生成。普通 push、PR 和定时检查都不会发布面向用户的二进制文件。

每个受支持的 Windows Release 有两种自包含格式：

- `Marisa-DSH-windows-x64.msi`：推荐的按用户安装包。安装时会安装桌面壳并准备随包后端，因此首次启动无需再解压后端。
- `Marisa-DSH-windows-x64-standalone.exe`：便携单文件版本。首次启动会把随包后端释放到当前用户的本地应用数据目录；之后会复用匹配版本。

两种格式都包含 Node、Marisa harness、发行 profile 和默认插件，不要求系统安装 Node、pnpm 或另一份 `dsh`。运行下载文件前请校验 Release 附带的 `SHA256SUMS.txt`。当前 Windows 产物尚未签名，SmartScreen 可能显示未知发布者警告。

## 实验性平台

Release 中若附带 Linux x64 或 macOS Apple Silicon 文件，均明确属于实验性构建。它们只是桌面壳，不等同于 Windows 的自包含发行版，仍使用用户环境中的兼容 `dsh`。Linux 还需要系统 GTK/WebKit 运行库；macOS 应用目前没有签名或 notarization。实验性构建失败不会阻止已经完成验收的 Windows Release 发布。

## 开发后端

普通开发构建不会内嵌后端。它会启动 `DSH_WEB_CMD` 指定的本地命令；未设置时使用 `dsh web --port {port}`。请先构建 Marisa harness 和 profile。Windows 贡献者通常从仓库根目录运行：

```powershell
pwsh -NoProfile -File build.ps1
```

该流程需要 Node 22.19 或更新的受支持版本（也支持 Node 24+）、pnpm 11 或更新版本、Go 和 `python3`。它会构建 harness 与所需插件、生成 Marisa profile、执行后端自检，并写出 `release/dsh-shell.exe` 开发壳。启动这个开发壳前，请准备本地已构建的 `dsh` 命令，或设置 `DSH_WEB_CMD`。

完成首次构建后，日常桌面开发直接从仓库根目录运行：

```powershell
pnpm dev:desktop
```

根开发启动器会设置指向当前检出与 Marisa profile 的 `DSH_WEB_CMD`，启用客户端 HMR，并在退出时清理桌面壳、后端和 watcher。壳二进制缺失或落后于 `desktop/` 的 Go 源码时会自动重建；壳日志转发到终端并落在 `<repo>/.dev/logs/`；DevTools 可从托盘菜单「打开 DevTools」打开（或 `MARISA_DEVTOOLS=1` 启动即开）。只需要浏览器界面时使用 `pnpm dev`；完整说明见[贡献指南](../docs/contributing.md#本地开发循环)。

桌面壳会在创建窗口和启动开发后端前读取以下变量：

- `DSH_WEB_CMD`：完整后端命令行，`{port}` 会替换为所选端口。默认值是 `dsh web --port {port}`。
- `DSH_APP_WORKSPACE`：后端工作目录，默认当前用户的主目录。
- `DSH_APP_PORT`：请求的后端端口，默认 `0`，由操作系统选择未占用端口。
- `MARISA_DEVTOOLS`：设为 `1` 时窗口就绪后自动打开 WebView2 DevTools（仅非 production 构建生效）。
- `MARISA_LOG_DIR`：持久日志目录，默认操作系统缓存目录（Windows 为 `%LOCALAPPDATA%\marisa-distro\logs`）。

Windows 打包版本会把 `DSH_WEB_CMD` 替换为随包 launcher。不要用这些变量把已发布的 Windows 包替换成任意外部后端。

## 验证

完整的仓库验证和打包规则见[打包说明](../docs/packaging.md)与[贡献说明](../CONTRIBUTING.md)。发版验收不能只看 HTTP 返回值；维护者必须观察真实窗口渲染，并验证 MSI 安装、启动和卸载。
