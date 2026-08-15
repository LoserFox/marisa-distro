# dsh-diff-viewer fork

上游：`dsh-external/dsh-diff-viewer`。本地只维护 monorepo workspace 链接与 Vitest test-runtime 路径。当前 rc6 缺少其客户端所需的 UI primitives，并且 slot 选项不兼容，因此本发行版不默认挂载它，保留官方编辑/写入界面。上游若改用 peerDependencies 或正式 DSH SDK，应删除这些路径补丁并重新验证浏览器 bundle。
