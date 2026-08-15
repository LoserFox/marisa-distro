# dsh-track fork

上游：`dsh-external/dsh-track`。本地修正 TypeScript/Vitest/环境脚本的 checkout 路径。当前 rc6 已移除其依赖的 session-query、Context 和客户端契约，因此本发行版不默认挂载或构建 Track Bridge。同步时必须先验证这些契约、Track Bridge 注入和 Windows 打包，再恢复组合启用。
