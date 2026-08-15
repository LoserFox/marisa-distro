# dsh-desktop

[English](README.md) | 中文

把 dsh 封装成不依赖外部浏览器的桌面**窗口**(Wails v3 壳 + WebView2)。普通开发构建从用户环境启动 `dsh web`；`embeddedbundle` 发行构建把 Node、harness 与 profile 内嵌进单文件 EXE，运行时不依赖系统 Node/pnpm/dsh。

## 架构

```
dsh-shell.exe        Wails shell (this Go program, the only executable)
  └─ spawns  dsh web --port 0     from user environment (dev) or embedded backend (release)
     └─ parses "dsh web: http://127.0.0.1:<port>" from the backend stdout
        └─ loads it in an embedded WebviewWindow
```

壳是唯一入口,同时是后端的守护进程:它启动 `dsh web --port 0`(端口由 OS 分配,避免冲突),从后端 stdout 解析实际监听地址,用 WebviewWindow 内嵌加载——全程不打开系统浏览器。后端异常退出(网络/加载失败等)时自动退避重启(1s 起、上限 30s)并重新指向新地址。

**托盘常驻后台**:关闭窗口时隐藏到系统托盘而不是退出——后端继续运行。托盘图标(左键单击切换窗口显隐)带菜单:打开 dsh(显示窗口)、开机自启(切换登录自启,勾选状态反映当前注册)、退出——只有从托盘退出才会终止后端(进程树:Windows 用 taskkill /T;POSIX 用 SIGTERM→SIGKILL 进程组),不留孤儿 node;main 会等守护协程收口后才真正退出。导航就绪护栏会等到 webview 存在后再 `SetURL`(WebView2 controller 是异步创建的,提前导航会在 Wails v3 beta 里 panic)。

## 后端要求

- PATH 上有 `dsh`——由 [dsh-win-port](https://github.com/dsh-external/dsh-win-port) 仓库的 `scripts/install-windows.ps1` 安装,或从补丁后检出运行。
- 检出已构建:`pnpm run build`(至少 `build:web`)。
- `DSH_WEB_CMD`——可选,后端整条命令行;`{port}` 会被替换为实际端口。默认:`dsh web --port {port}`。

## 环境变量(加载前读取,窗口/后端启动前生效)

- `DSH_WEB_CMD`——后端命令行(`{port}` 占位符),默认 `dsh web --port {port}`
- `DSH_APP_WORKSPACE`——工作目录(默认用户主目录;受限/测试环境可覆盖)
- `DSH_APP_PORT`——后端监听端口(默认 `0` 由 OS 分配随机端口,避免冲突;显式指定则固定复用该端口)

启动页面:窗口先显示内嵌的"正在启动 dsh…"HTML(非 Wails 默认空白页),后端就绪后自动切到真实地址。后端一直不就绪时,窗口停留在启动页,壳按退避策略持续重试。

## 下载(推荐——无需 Go)

GitHub Actions 在每次 push 时预编译,并在每个 `v*` 标签上附带产物:

- [Releases 页面](https://github.com/dsh-external/dsh-desktop/releases)——下载 `dsh-desktop-windows-amd64.zip`(内含 `dsh-shell.exe`),解压到任意位置即可运行。

运行时需要 WebView2(Windows 11 自带;Windows 10 需安装 Evergreen Runtime)。

## 安装

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop-windows.ps1
```

把 `dsh-shell.exe`(连同快捷方式用的 `icon.ico`)复制到 `%LOCALAPPDATA%\dsh-desktop\dsh-shell.exe`,并创建开始菜单与桌面快捷方式。若本地没有构建产物,安装器会**自动下载最新预编译二进制**——无需 Go 工具链。本仓库是 private,下载需要 GitHub 认证:安装器优先用 `gh` CLI(不可用时回退直连,仓库公开或 URL 带认证后可用)。

## 从源码构建(可选)

一个可执行文件,一条命令,在本仓库根执行(需要 Go 工具链):

```sh
go build -C . -o build/dsh-shell.exe .
```

运行:`run-windows.cmd`(Windows)或 `run.sh`(WSLg),或直接运行 `build/dsh-shell.exe`。

## 在生态中的位置

- harness 侧的 Windows 改动以补丁系列流转,存放在 [dsh-win-port](https://github.com/dsh-external/dsh-win-port) 仓库(`patches/windows-port`,9 个补丁)——本壳在运行时**不依赖**它们。
- Windows 平台插件(`dsh-pty-windows`、`dsh-shell-windows`)是独立 Marisa (dshx) 插件仓库,用 `dshx install` 挂进检出;窗口壳不挂载它们。
- 以上仓库均为 **private**。

用户环境(POSIX):启动后端前,壳按 `$SHELL` source 用户 shell 配置(bash → `~/.bashrc`,zsh → `~/.zshrc`),使后端继承用户终端里 export 的环境变量(如 API key)。source 输出重定向到 /dev/null,不污染后端 stdout;用 `exec` 保持同一进程(PID 不变),守护 wait 语义不受影响。Windows 直接继承用户/系统环境。
