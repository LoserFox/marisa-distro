# dsh_workflow fork

上游：`dsh-external/dsh_workflow`。本地把 package/TypeScript/Vitest/辅助脚本中的旧 checkout 路径改为根 workspace 的 `../../harness`，并适配 rc6 已移动的 UI/commands 包。同步时必须重新检查仍悬空的 jobs 与 user-questions API，并运行插件构建和 profile 启动测试。
