# dsh-stickers fork

上游：`dsh-external/dsh-stickers`。本地 package workspace 链接指向本仓库 harness。同步时验证客户端资源仍能进入 standalone bundle。

2026-08-24：`lib/client.js` 随主树重建（此前误用 `.claude/worktrees/rc8-test` 的产物——CSS 模块哈希与构建回归以主树为准；`make-bundle` 的 stickers PNG→WebP 转换基于该产物，重建后经独立验收包验证可进 bundle）。
