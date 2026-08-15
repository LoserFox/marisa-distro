# dsh-better-sidebar fork

上游：`omdsh-dev/DSH-better-sidebar`，npm 版本 `0.10.3`。本仓库按发布 npm 包内容 vendored。

## 本地差异

- 移除 `prepare` 与 `prepublishOnly` 生命周期脚本。发布包只带已构建的 `lib/` 和部分源码；安装期执行会因缺少完整构建入口或 Unix 工具（如 `rm`）失败，运行时只需要 `lib/`。
- 其余代码保持上游一致。

## 同步动作

1. 从上游或 npm 更新目标版本，排除 `node_modules`、`.git` 与缓存。
2. 若发布包仍带会失败的 `prepare`/`prepublishOnly`，按相同原因移除。
3. 验证侧栏 client 模块、组合 patch 与 Windows 打包。
