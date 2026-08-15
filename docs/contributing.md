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

本地最低验证：

```powershell
pnpm install --frozen-lockfile
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
```

维护者可以要求补充真实桌面、安装器或特定插件组合验证。
