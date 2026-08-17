# 贡献指南

## 先选正确入口

- 使用问题和想法：GitHub Discussions 或 QQ 群 `956471685`。
- 可复现的 Marisa 缺陷：Issue Form。
- 插件自身缺陷：优先到插件上游。

## 可以修改什么

- 欢迎修改 `desktop/`、CI、文档、测试、打包脚本和 Marisa 自有组件。
- `mirror` 插件只接受带 `upstream-sync` 标签的上游同步 PR；拒绝手工功能修改。
- `fork` 插件修改必须带测试、更新 `docs/plugins/<id>.md`，并链接上游反馈；明确只属于 Marisa 的能力可以说明不提交上游的理由。
- `harness/` 修改必须更新 `docs/upstream-diff.md`，拆成独立提交，并优先回馈 DSH 上游。

## PR 要求

1. 一个 PR 只解决一个可验证问题。
2. 写明基线、动机、测试证据和人工验收范围。
3. 不提交 `node_modules`、Release 二进制、下载缓存、凭据或嵌套 `.git`。
4. 插件新增网络、进程、文件写入或密钥访问能力时，必须在 PR 中说明权限影响。
5. 不把后端 HTTP 200 描述成完整桌面启动证明。

## 本地开发循环

开发入口要求 Node `^22.19.0 || >=24.0.0`，与 Harness 的运行时范围一致。

首次检出或依赖、profile 发生变化后，先完成一次构建：

```powershell
pnpm install --frozen-lockfile
pnpm build
```

之后可直接启动浏览器开发模式：

```powershell
pnpm dev
```

该命令先完成 Harness 客户端插件的首轮增量构建，再启动 Marisa profile 后端，并在后端就绪后打开浏览器。使用 `pnpm dev -- --no-open` 可禁止自动打开浏览器。按 `Ctrl+C` 会清理后端和 watcher 的子进程树。仓库禁止 `pnpm run` 隐式安装依赖；预检提示缺少产物时，应显式运行上面的 frozen install 和构建命令。

需要验证原生窗口时运行：

```powershell
pnpm dev:desktop
```

桌面模式使用同一个 `--dev` 后端和 HMR watcher，但由 Wails 壳启动、守护并加载后端。壳二进制缺失或落后于 `desktop/` 下的 Go 源码时会自动重建；壳的日志会转发到终端，并同时落在 `<repo>/.dev/logs/`。托盘提供「打开日志目录」「打开数据目录」「重启后端」「打开 DevTools」；`MARISA_DEVTOOLS=1` 可在窗口就绪后自动打开 DevTools，`MARISA_LOG_LEVEL=debug` 记录后端 stdout 逐行等高频事件。Harness 的 `dshClient` 源码会由 watcher 自动重建；vendored 插件沿用各自的构建约定，没有 `watch` 脚本的插件修改后仍需运行该插件的 `build`。profile、依赖图或服务端组合发生变化时，应重新运行 `pnpm build`。

本地最低验证：

```powershell
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
```

维护者可以要求补充真实桌面、安装器或特定插件组合验证。
