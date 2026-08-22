# dsh-llm-fallbacks fork

上游：`omdsh-dev/dsh-llm-fallbacks`，npm 版本 `0.3.2`（2026-08-20 同步，自 `0.1.0-alpha.1`）。当前因 rc6 客户端事件 API 不兼容而默认停用。

## 本地差异

- 移除 `prepare` 脚本。发布包只包含 `dist/`、`bundle/`、`scripts/`，而 `prepare: pnpm run build` 会引用不存在的 `tsconfig.build.json` 和源码。
- 运行时使用已发布的 `dist/`，不做安装期构建。

## 2026-08-20 同步（0.1.0-alpha.1 → 0.3.2）

- 上游 0.3.2（2026-08-20 发布）peer 依赖已全部 `^0.1.0-rc.8`，无 `dsh-client-web-react` 等死包引用——rc8 就绪。
- 重放本地差异：移除 `prepare` 脚本（同前）。
- 挂载决策：rc8 真机重测 conversationEvents/remote 事件契约（含 #2134 取消 finalize 路径）后再决定是否恢复组合启用。

## 同步动作

1. 从上游或 npm 更新目标版本，排除 `node_modules`、`.git` 与缓存。
2. 若仍带会失败的 `prepare`，按相同原因移除。
3. 重新启用前必须验证 conversationEvents/remote 事件契约。

## 2026-08-23 依赖区间迁移

0.1.1-rc.2 迁移收敛的一部分：`@deepseek-ai/*` 依赖区间从 `^0.1.0-rc.6`/`^0.1.0-rc.8` 统一改为 `workspace:^`（workspace 成员）或 `^0.1.1-rc.2`（registry 包）。机械替换，无代码改动；解析目标从 registry rc.8 副本树切换到 workspace rc.2 树。反馈上游：待同步窗口。
