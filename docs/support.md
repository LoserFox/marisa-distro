# 支持与 Issue 政策

## 使用交流

- GitHub Discussions：社区使用交流、想法和插件推荐。
- QQ 群：`956471685`。
- 维护者不承诺一对一使用支持或响应时限。

## Issues

Issues 只接收完整、可复现的 Marisa 发行版缺陷。提交者必须提供版本、平台、安装格式、复现步骤、预期/实际结果和去敏日志。

- 插件自身问题优先去插件上游。
- 使用咨询和闲聊会被关闭并引导到 Discussions/QQ群。
- 空白、无法复现或拒绝补充信息的 Issue 会被关闭。
- 重复灌水、骚扰、辱骂或恶意消耗维护资源的账号可能被锁定或封禁；删除 Issue 由管理员人工执行。

善意但发错位置的问题不会自动导致封禁。

## Windows 启动日志

桌面壳、随包后端的 stdout 和 stderr 会写入持久启动日志，每次启动独占一个文件：

```text
%LOCALAPPDATA%\marisa-distro\logs\marisa-desktop-YYYYMMDD-HHMMSS.log
```

`marisa-desktop.log` 是稳定入口，硬链接到最近一次启动的日志（硬链接不可用时退化为一行文本指针）。单个启动日志达到 5 MiB 后会在写入路径轮转为 `.1`；启动时只保留最近 20 次启动的日志。报告启动后持续停留在加载界面、后端反复重启或插件加载失败时，请从托盘退出 Marisa DSH，复现一次，再附上去敏后的最近一份启动日志（或整个日志目录）。日志可能包含本机路径、插件配置错误和后端诊断信息，提交前不得包含密钥。

MSI 安装或卸载后端失败时，安装目录还可能出现 `backend-maintenance-error.log`；它只覆盖安装维护阶段，成功时会自动删除，不能代替上述启动日志。

窗口已经打开、后端 URL 也正常，但界面一直停在「正在加载工作区」时，先查浏览器控制台是否反复出现 `[web-runtime] connection lost`。发行版 Web 客户端会把 `host.describe` 的 `canOpenPath` 当成必填字段；后端 200 响应缺这个字段时，握手校验失败，两条 WebSocket 会被主动关掉并无限重连，工作区状态永远不会离开 `pending`。这时 API key 引导和权限模式 UI 都不会出现。核对方式：

```powershell
Invoke-RestMethod http://127.0.0.1:<port>/api/host.describe -Method Post -ContentType 'application/json' -Body '{"rpcId":"diag-1","payload":{}}'
```

正常响应的 `result.value` 必须包含布尔字段 `canOpenPath`。桌面发行版应为 `true`；headless 或远程部署可以合法返回 `false`。缺少字段才表示 host/client 协议树不一致，不能用手工补字段替代统一使用 rc7 bundle。
